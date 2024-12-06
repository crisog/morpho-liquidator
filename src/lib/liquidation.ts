import { ethers, formatUnits, MaxUint256 } from "ethers";
import { LiquidationEncoder } from "@morpho-org/blue-sdk-ethers-liquidation";
import {
  Token,
  UnknownTokenPriceError,
  getChainAddresses,
} from "@morpho-org/blue-sdk";
import { constructSimpleSDK, SimpleSDK } from "@paraswap/sdk";
import { MarketPosition, PositionResult } from "../types";
import { ERC20_ABI } from "../constants";
import { BundleState, ProviderService } from "./provider";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import { Time } from "@morpho-org/morpho-ts";
import {
  fetchAccrualPositionFromConfig,
  safeParseNumber,
} from "@morpho-org/blue-sdk-ethers";

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

    this.paraSwapMin = constructSimpleSDK(
      { chainId: this.chainId, fetch },
      {
        ethersV6ProviderOrSigner: provider,
        account: walletAddress,
        EthersV6Contract: ethers.Contract,
      }
    );
  }

  async processPosition(
    position: MarketPosition,
    wethPriceUsd: number
  ): Promise<PositionResult> {
    if (position.market.collateralAsset == null) return;

    const marketConfig = this.converter.getMarketConfig(position.market);

    const accrualPosition = await fetchAccrualPositionFromConfig(
      position.user.address as `0x${string}`,
      marketConfig,
      { provider: this.provider }
    );

    const {
      user: userAddress,
      market,
      seizableCollateral,
    } = accrualPosition.accrueInterest(Time.timestamp());

    const positionData: MarketPosition = {
      user: {
        address: userAddress,
      },
      market: position.market,
    };

    try {
      const collateralToken = this.converter.getTokenWithPrice(
        position.market.collateralAsset,
        wethPriceUsd
      );
      if (collateralToken.price == null)
        throw new UnknownTokenPriceError(collateralToken.address);

      console.info("collateralToken", collateralToken);

      const loanToken = this.converter.getTokenWithPrice(
        position.market.loanAsset,
        wethPriceUsd
      );
      if (loanToken.price == null)
        throw new UnknownTokenPriceError(loanToken.address);

      console.info("loanToken", loanToken);

      // Calculate the actual amount of loan tokens needed
      const repaidAssets = market.toBorrowAssets(
        market.getLiquidationRepaidShares(seizableCollateral)
      );

      const loanTokenContract = new ethers.Contract(
        marketConfig.loanToken,
        ERC20_ABI,
        this.signer
      );
      const loanTokenBalance = await loanTokenContract.balanceOf(
        this.walletAddress
      );

      const encoder = new LiquidationEncoder(this.walletAddress, this.signer);

      // If we don't have enough loan tokens, prepare the swap
      if (loanTokenBalance < repaidAssets) {
        const amountNeeded = repaidAssets - loanTokenBalance;
        console.log(
          "Need to swap USDC for loan tokens. Amount needed: ",
          formatUnits(amountNeeded, loanToken.decimals),
          loanToken.symbol
        );

        const swapRoute = await this.paraSwapMin.swap.getRate({
          srcToken: this.swapFromToken.address,
          srcDecimals: this.swapFromToken.decimals,
          destToken: marketConfig.loanToken,
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
          destToken: marketConfig.loanToken,
          slippage: this.maxSlippage,
          priceRoute: swapRoute,
          userAddress: this.walletAddress,
        });

        const swapFromTokenContract = new ethers.Contract(
          this.swapFromToken.address,
          ERC20_ABI,
          this.provider
        );

        const currentAllowance = await swapFromTokenContract.allowance(
          this.walletAddress,
          swapTxParams.to
        );

        if (currentAllowance < amountNeeded) {
          encoder.erc20Approve(
            this.swapFromToken.address,
            swapTxParams.to,
            MaxUint256
          );
        }

        encoder.pushCall(
          swapTxParams.to,
          swapTxParams.value,
          swapTxParams.data
        );
      }

      // Get expected profit after collateral sale
      const priceRoute = await this.paraSwapMin.swap.getRate({
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

      const { morpho } = getChainAddresses(this.chainId);

      const currentAllowance = await loanTokenContract.allowance(
        this.walletAddress,
        morpho
      );

      if (currentAllowance < repaidAssets) {
        encoder.erc20Approve(marketConfig.loanToken, morpho, MaxUint256);
      }

      encoder.morphoBlueLiquidate(
        morpho,
        marketConfig,
        userAddress,
        seizableCollateral,
        BigInt(0),
        encoder.flush()
      );

      const liquidationTx = await encoder.populateExec();

      const [gasLimit, block, nonce] = await Promise.all([
        this.signer.estimateGas(liquidationTx),
        this.signer.provider.getBlock("latest", false),
        this.signer.getNonce(),
      ]);

      if (block == null) throw Error("could not fetch latest block");

      const { baseFeePerGas } = block;
      if (baseFeePerGas == null) throw Error("could not fetch base fee");

      const maxFeePerGas = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(
        baseFeePerGas,
        1
      );

      const ethPriceUsd = safeParseNumber(wethPriceUsd, 18);

      const gasLimitUsd = ethPriceUsd.wadMulDown(gasLimit * maxFeePerGas);
      const profitUsd = loanToken.toUsd(
        BigInt(priceRoute.destAmount) - repaidAssets
      )!;

      const netProfitUsd = profitUsd - gasLimitUsd;
      const minProfitUsd = BigInt(this.minProfit);

      if (netProfitUsd < minProfitUsd) {
        console.log(
          `Net profit ${netProfitUsd} (profit: ${profitUsd}, gas: ${gasLimitUsd}) is less than minimum profit ${minProfitUsd}`
        );
        return {
          position: positionData,
          status: "NOT_PROFITABLE",
          reason: "Insufficient profit after gas costs",
        };
      }

      const providerService = ProviderService.getInstance();

      const bundleResponse = await providerService.sendBundle({
        ...liquidationTx,
        chainId: this.chainId,
        nonce,
        maxFeePerGas,
        gasLimit,
      });

      switch (bundleResponse) {
        case BundleState.Sent:
          console.log("Bundle sent");
          return {
            position: positionData,
            status: "LIQUIDATED",
          };
        case BundleState.Failed:
          console.error("Bundle failed");
          return {
            position: positionData,
            status: "FAILED",
            reason: "Bundle failed",
          };
      }
    } catch (error) {
      console.error(error);
      return {
        position: positionData,
        status: "FAILED",
        reason: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
