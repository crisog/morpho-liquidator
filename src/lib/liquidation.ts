import { ethers, MaxUint256 } from "ethers";
import {
  AccrualPosition,
  Market,
  MarketConfig,
  MarketId,
  Position,
  Token,
  UnknownTokenPriceError,
} from "@morpho-org/blue-sdk";
import { constructSimpleSDK, OptimalRate, SimpleSDK } from "@paraswap/sdk";
import { LiquidatablePosition, PositionResult } from "../types";
import { BundleState, ProviderService } from "./provider";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { MorphoAbi } from "../../abis/Morpho";
import { AdaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm";
import { ERC20Abi } from "../../abis/ERC20";
import { MORPHO_CONTRACT_ADDRESSES, WAD } from "../constants";
import { safeParseNumber } from "@morpho-org/blue-sdk-ethers";

export class LiquidationService {
  private chainId: number;
  private walletAddress: string;
  private signer: ethers.Signer;
  private provider: ethers.Provider;
  private converter: BlueSdkConverter;
  private paraSwapMin: SimpleSDK;
  private maxSlippage: number;
  private maxImpact: number;
  private swapFromToken: Token;
  private swapToToken: Token;
  private minProfit: number;

  constructor({
    chainId,
    walletAddress,
    signer,
    provider,
    converter,
    maxSlippage = 50,
    maxImpact = 2,
    swapFromToken,
    swapToToken,
    minProfit = 100,
  }: {
    chainId: number;
    walletAddress: string;
    signer: ethers.Signer;
    provider: ethers.Provider;
    converter: BlueSdkConverter;
    maxSlippage?: number;
    maxImpact?: number;
    swapFromToken: Token;
    swapToToken: Token;
    minProfit?: number;
  }) {
    this.chainId = chainId;
    this.walletAddress = walletAddress;
    this.signer = signer;
    this.provider = provider;
    this.converter = converter;
    this.maxSlippage = maxSlippage;
    this.maxImpact = maxImpact;
    this.swapFromToken = swapFromToken;
    this.swapToToken = swapToToken;
    this.minProfit = minProfit;

    // Does not support Sepolia
    if (this.chainId !== 11155111) {
      this.paraSwapMin = constructSimpleSDK(
        { chainId: this.chainId, fetch },
        {
          ethersV6ProviderOrSigner: provider,
          account: walletAddress,
          EthersV6Contract: ethers.Contract,
        }
      );
    }
  }

  async processPosition(
    position: LiquidatablePosition,
    wethPriceUsd: number
  ): Promise<PositionResult> {
    if (position.market.collateralAsset == null) return;

    // Morpho's SDK is not compatible with Sepolia, so we need to fetch markets/positions directly
    const morphoContract = new ethers.Contract(
      MORPHO_CONTRACT_ADDRESSES[this.chainId],
      MorphoAbi,
      this.provider
    );

    const [supplyShares, borrowShares, collateral] =
      await morphoContract.position(
        position.market.id as MarketId,
        position.user.address as `0x${string}`,
        {}
      );

    const inputAccrualPosition = new Position({
      user: position.user.address as `0x${string}`,
      marketId: position.market.id as MarketId,
      supplyShares,
      borrowShares,
      collateral,
    });

    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowShares,
      totalBorrowAssets,
      lastUpdate,
      fee,
    ] = await morphoContract.market(position.market.id as MarketId);

    const marketConfig = new MarketConfig({
      collateralToken: position.market.collateralAsset.address,
      loanToken: position.market.loanAsset.address,
      oracle: position.market.oracleAddress,
      irm: position.market.irmAddress,
      lltv: position.market.lltv,
    });

    const irmContract = new ethers.Contract(
      position.market.irmAddress,
      AdaptiveCurveIrmAbi,
      this.provider
    );

    const rateAtTarget = await irmContract.rateAtTarget(
      position.market.id as MarketId
    );

    const inputMarket = new Market({
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
      price: BigInt(position.market.oraclePrice),
      rateAtTarget,
      config: marketConfig,
    });

    const accrualPosition = new AccrualPosition(
      inputAccrualPosition,
      inputMarket
    );

    const {
      user: userAddress,
      market,
      seizableCollateral,
    } = accrualPosition.accrueInterest(Time.timestamp());

    try {
      const collateralToken = this.converter.getTokenWithPrice(
        {
          ...position.market.collateralAsset,
          symbol: position.market.collateralAsset.symbol || "",
          decimals: position.market.collateralAsset.decimals || 18,
        },
        wethPriceUsd
      );
      if (collateralToken.price == null)
        if (this.chainId !== 11155111)
          throw new UnknownTokenPriceError(collateralToken.address);

      const loanToken = this.converter.getTokenWithPrice(
        {
          ...position.market.loanAsset,
          symbol: position.market.loanAsset.symbol || "",
          decimals: position.market.loanAsset.decimals || 18,
        },
        wethPriceUsd
      );
      if (loanToken.price == null)
        if (this.chainId !== 11155111)
          throw new UnknownTokenPriceError(loanToken.address);

      const repaidShares =
        market.getLiquidationRepaidShares(seizableCollateral);
      const repaidAssets = market.toBorrowAssets(repaidShares);

      const loanTokenContract = new ethers.Contract(
        position.market.loanAsset.address,
        ERC20Abi,
        this.signer
      );
      const loanTokenBalance = await loanTokenContract.balanceOf(
        this.walletAddress
      );

      const transactions: ethers.TransactionRequest[] = [];

      // If we don't have enough loan tokens, we need to get some using swapFromToken
      if (
        loanTokenBalance < repaidAssets &&
        this.chainId !== 11155111 // ParaSwap is not supported on Sepolia
      ) {
        const amountNeeded = repaidAssets - loanTokenBalance;

        // Get the swap rate from swapFromToken to loanToken
        const swapRoute = await this.paraSwapMin.swap.getRate({
          srcToken: this.swapFromToken.address,
          srcDecimals: this.swapFromToken.decimals,
          destToken: position.market.loanAsset.address,
          destDecimals: loanToken.decimals,
          amount: amountNeeded.toString(),
          userAddress: this.walletAddress,
          side: "SELL",
          options: {
            maxImpact: this.maxImpact,
          },
        });

        const swapTxParams = await this.paraSwapMin.swap.buildTx({
          srcToken: this.swapFromToken.address,
          srcAmount: amountNeeded.toString(),
          destToken: position.market.loanAsset.address,
          slippage: this.maxSlippage,
          priceRoute: swapRoute,
          userAddress: this.walletAddress,
        });

        const swapFromTokenContract = new ethers.Contract(
          this.swapFromToken.address,
          ERC20Abi,
          this.provider
        );

        const currentAllowance = await swapFromTokenContract.allowance(
          this.walletAddress,
          swapTxParams.to
        );

        if (currentAllowance < amountNeeded) {
          const approveTx =
            await swapFromTokenContract.approve.populateTransaction(
              swapTxParams.to,
              MaxUint256
            );

          const approveTxResponse = await this.signer.sendTransaction(
            approveTx
          );
          console.info("Approve transaction sent", approveTxResponse.hash);

          await approveTxResponse.wait();

          console.info("Approve transaction confirmed");
        }

        const swapTx = await this.signer.populateTransaction(swapTxParams);

        transactions.push(swapTx);
      }

      const morpho = MORPHO_CONTRACT_ADDRESSES[this.chainId];

      const currentAllowance = await loanTokenContract.allowance(
        this.walletAddress,
        morpho
      );

      if (currentAllowance < repaidAssets) {
        const approveTx = await loanTokenContract.approve.populateTransaction(
          morpho,
          MaxUint256
        );

        const approveTxResponse = await this.signer.sendTransaction(approveTx);
        console.info("Approve transaction sent:", approveTxResponse.hash);

        await approveTxResponse.wait();

        console.info("Approve transaction confirmed");
      }

      const morphoContract = new ethers.Contract(
        morpho,
        MorphoAbi,
        this.provider
      );

      const liquidationTx = await morphoContract.liquidate.populateTransaction(
        {
          loanToken: position.market.loanAsset.address,
          collateralToken: position.market.collateralAsset.address,
          oracle: position.market.oracleAddress,
          irm: position.market.irmAddress,
          lltv: position.market.lltv,
        },
        userAddress,
        // using the seizable collateral amount results in an overflow at the morpho contract,
        // so we are using the repaid shares instead
        BigInt(0),
        // for some reason, calculating the repaid shares from total seizable collateral doesn't result in a full liquidation
        // i.e. const repaidShares = market.getLiquidationRepaidShares(seizableCollateral);
        borrowShares, // using `borrowShares` liquidates entire position
        "0x"
      );

      transactions.push(liquidationTx);

      // ParaSwap is not supported on Sepolia
      let collateralTokenToSwapToken: OptimalRate | null = null;
      if (this.chainId !== 11155111) {
        // Get the swap rate from collateralToken to swapToToken
        collateralTokenToSwapToken = await this.paraSwapMin.swap.getRate({
          srcToken: collateralToken.address,
          srcDecimals: collateralToken.decimals,
          destToken: this.swapToToken.address,
          destDecimals: this.swapToToken.decimals,
          amount: seizableCollateral.toString(),
          userAddress: this.walletAddress,
          side: "SELL",
          options: {
            maxImpact: this.maxImpact,
          },
        });

        const swapTxParams = await this.paraSwapMin.swap.buildTx({
          srcToken: collateralToken.address,
          srcAmount: seizableCollateral.toString(),
          destToken: this.swapToToken.address,
          slippage: this.maxSlippage,
          priceRoute: collateralTokenToSwapToken,
          userAddress: this.walletAddress,
        });

        const swapFromTokenContract = new ethers.Contract(
          this.swapFromToken.address,
          ERC20Abi,
          this.provider
        );

        const swapToTokenAllowance = await swapFromTokenContract.allowance(
          this.walletAddress,
          swapTxParams.to
        );

        if (swapToTokenAllowance < seizableCollateral) {
          const approveTx =
            await swapFromTokenContract.approve.populateTransaction(
              swapTxParams.to,
              MaxUint256
            );

          const approveTxResponse = await this.signer.sendTransaction(
            approveTx
          );
          console.info("Approve transaction sent:", approveTxResponse.hash);

          await approveTxResponse.wait();

          console.info("Approve transaction confirmed");

          const swapTx = await this.signer.populateTransaction(swapTxParams);

          transactions.push(swapTx);
        }
      }

      const priorityFee = BigInt(2) ** BigInt(9);

      // Get the base nonce once before the loop
      const baseNonce = await this.signer.getNonce();
      const block = await this.signer.provider.getBlock("latest", false);

      if (block == null) throw Error("could not fetch latest block");

      const { baseFeePerGas } = block;
      if (baseFeePerGas == null) throw Error("could not fetch base fee");

      const maxBaseFeeInFutureBlock =
        FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(baseFeePerGas, 1);

      const ethPriceUsd = safeParseNumber(wethPriceUsd, 18);

      const signedTransactions = await Promise.all(
        transactions.map(async (transaction) => {
          const gasLimit = await this.signer.estimateGas(transaction);

          const txParams = {
            ...transaction,
            gasLimit,
            maxFeePerGas: maxBaseFeeInFutureBlock + priorityFee,
            maxPriorityFeePerGas: priorityFee,
            nonce: baseNonce,
            type: 2,
            chainId: this.chainId,
          };

          // No profit calculation on Sepolia
          if (this.chainId !== 11155111) {
            const gasLimitUsd =
              (ethPriceUsd * (gasLimit * txParams.maxFeePerGas)) / WAD;

            const profitUsd = loanToken.toUsd(
              BigInt(collateralTokenToSwapToken.destAmount) - repaidAssets
            )!;

            const netProfitUsd = profitUsd - gasLimitUsd;
            const minProfitUsd = BigInt(this.minProfit);

            if (netProfitUsd < minProfitUsd) {
              console.info(
                "Skipping liquidation due to insufficient profit. Net profit:",
                netProfitUsd,
                "Min profit:",
                minProfitUsd
              );
              return;
            }
          }

          return await this.signer.signTransaction(txParams);
        })
      );

      const providerService = ProviderService.getInstance(this.chainId);

      const bundleResponse = await providerService.sendBundle(
        signedTransactions
      );

      switch (bundleResponse) {
        case BundleState.Sent:
          return {
            position: position,
            status: "LIQUIDATED",
          };
        case BundleState.Failed:
          console.error("Bundle failed");
          return {
            position: position,
            status: "FAILED",
            reason: "Bundle failed",
          };
      }
    } catch (error) {
      console.error(error);
      return {
        position: position,
        status: "FAILED",
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
