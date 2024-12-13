import { ethers } from "ethers";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} from "@flashbots/ethers-provider-bundle";
import { FLASHHBOTS_RELAY_URLS, RPC_URLS } from "../constants";

export enum BundleState {
  Failed = "Failed",
  Sent = "Sent",
}

export class ProviderService {
  private static instance: ProviderService;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private flashbotsSigner: ethers.Wallet;
  private chainId: number;

  private constructor(chainId: number) {
    this.chainId = chainId;
    this.provider = new ethers.JsonRpcProvider(RPC_URLS[this.chainId]);
    this.wallet = this.createWallet();
    this.flashbotsSigner = this.createWallet();
  }

  public static getInstance(chainId: number): ProviderService {
    if (!ProviderService.instance) {
      ProviderService.instance = new ProviderService(chainId);
    }
    return ProviderService.instance;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Signer {
    return this.wallet;
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  private async getFlashbotsProvider(): Promise<FlashbotsBundleProvider> {
    return await FlashbotsBundleProvider.create(
      this.provider,
      this.flashbotsSigner,
      FLASHHBOTS_RELAY_URLS[this.chainId]
    );
  }

  private createWallet(): ethers.Wallet {
    if (!process.env.ETH_WALLET_PRIVATE_KEY) {
      throw new Error("ETH_WALLET_PRIVATE_KEY is not set");
    }

    // TODO: Support AWS Secrets Manager to pull private key from there
    return new ethers.Wallet(process.env.ETH_WALLET_PRIVATE_KEY, this.provider);
  }

  async sendBundle(signedTransactions: string[]): Promise<BundleState> {
    console.info("Starting bundle submission process");
    const provider = this.provider;
    const flashbotsProvider = await this.getFlashbotsProvider();

    if (!provider || !flashbotsProvider) {
      console.error("Provider initialization failed", {
        hasProvider: !!provider,
        hasFlashbotsProvider: !!flashbotsProvider,
      });
      return BundleState.Failed;
    }

    try {
      const block = await provider.getBlock("latest", false);
      if (!block || !block.baseFeePerGas) {
        console.error("Failed to fetch latest block or base fee");
        return BundleState.Failed;
      }

      const preparedBundle = signedTransactions.map((signedTransaction) => ({
        signedTransaction,
      }));

      const signedBundle = await flashbotsProvider.signBundle(preparedBundle);

      const simulation = await flashbotsProvider.simulate(
        signedBundle,
        block.number + 1
      );

      if ("error" in simulation) {
        console.error("Simulation failed", {
          error: simulation.error.message,
          targetBlock: block.number + 1,
        });
        return BundleState.Failed;
      }

      console.log("Simulation successful", simulation);

      const blockSpacing = [1, 2, 3, 5, 8, 13, 21];
      console.info("Starting bundle submissions for multiple blocks");

      const submissionPromises = [];
      const targetBlocks = [];

      for (const spacing of blockSpacing) {
        const targetBlockNumber = block.number + spacing;
        console.info(`Submitting bundle for block ${targetBlockNumber}`);
        targetBlocks.push(targetBlockNumber);

        const bundleSubmission = flashbotsProvider.sendRawBundle(
          signedBundle,
          targetBlockNumber
        );
        submissionPromises.push(bundleSubmission);
      }

      const submissions = await Promise.all(submissionPromises);
      console.info("All bundle submissions completed");

      submissions.forEach((submission, index) => {
        if ("error" in submission) {
          console.error(`Bundle submission ${index} failed`, {
            targetBlock: targetBlocks[index],
            error: submission.error,
          });
        } else {
          console.info(`Bundle submission ${index} succeeded`, {
            targetBlock: targetBlocks[index],
          });
        }
      });

      const validSubmissions = submissions
        .map((submission, index) => ({
          submission,
          targetBlock: targetBlocks[index],
        }))
        .filter(({ submission }) => !("error" in submission));

      if (validSubmissions.length === 0) {
        console.error("All bundle submissions failed initially");
        return BundleState.Failed;
      }

      console.info(
        `${validSubmissions.length} valid submissions, waiting for inclusion`
      );

      const bundleWaitPromises = validSubmissions.map(
        ({ submission, targetBlock }) => ({
          promise: submission.wait(),
          targetBlock,
        })
      );

      const resolutions = await Promise.allSettled(
        bundleWaitPromises.map(({ promise }) => promise)
      );

      for (let i = 0; i < resolutions.length; i++) {
        const result = resolutions[i];
        const targetBlock = bundleWaitPromises[i].targetBlock;

        if (
          result.status === "fulfilled" &&
          result.value === FlashbotsBundleResolution.BundleIncluded
        ) {
          console.info(`Bundle included in block ${targetBlock}`);
          return BundleState.Sent;
        }
      }
    } catch (error) {
      console.error("Unexpected error during bundle submission", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return BundleState.Failed;
    }
  }
}
