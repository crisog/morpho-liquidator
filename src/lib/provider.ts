import { ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { ethers as ethersv5 } from "ethersv5";

export enum BundleState {
  Failed = "Failed",
  Sent = "Sent",
}

export class ProviderService {
  private static instance: ProviderService;
  private mainnetProvider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private flashbotsSigner: ethers.Wallet;

  private constructor() {
    this.mainnetProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
    this.wallet = this.createWallet();
    this.flashbotsSigner = this.createWallet();
  }

  public static getInstance(): ProviderService {
    if (!ProviderService.instance) {
      ProviderService.instance = new ProviderService();
    }
    return ProviderService.instance;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.mainnetProvider;
  }

  // Uniswap's smart-order-router only supports ethers v5
  // Despite doing a work around to import both, it results in conflicts with other libraries so we cannot use it.
  getProviderV5(): ethersv5.providers.JsonRpcProvider {
    return new ethersv5.providers.JsonRpcProvider(process.env.ETH_RPC_URL);
  }

  getSigner(): ethers.Signer {
    return this.wallet;
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  private async getFlashbotsProvider(): Promise<FlashbotsBundleProvider> {
    return await FlashbotsBundleProvider.create(
      this.mainnetProvider,
      this.flashbotsSigner
    );
  }

  private createWallet(): ethers.Wallet {
    // TODO: Support AWS Secrets Manager to pull private key from there
    return new ethers.Wallet(
      process.env.ETH_WALLET_PRIVATE_KEY,
      this.mainnetProvider
    );
  }

  async sendBundle(
    transaction: ethers.TransactionRequest
  ): Promise<BundleState> {
    const provider = this.mainnetProvider;
    const flashbotsProvider = await this.getFlashbotsProvider();

    if (!provider || !flashbotsProvider) {
      return BundleState.Failed;
    }

    if (transaction.value) {
      transaction.value = BigInt(transaction.value);
    }

    const signedBundle = await flashbotsProvider.signBundle([
      { transaction, signer: this.getSigner() },
    ]);

    const block = await provider.getBlock("latest", false);

    const sendBunleRes = await flashbotsProvider.sendRawBundle(
      signedBundle,
      block.number + 1
    );

    if ("error" in sendBunleRes) {
      console.log(`Relay response error: ${sendBunleRes.error.message}`);
      return BundleState.Failed;
    }

    let receipts = [];

    while (receipts.length === 0) {
      try {
        receipts = await sendBunleRes.receipts();

        if (receipts.length > 0) {
          continue;
        }
      } catch (e) {
        console.log(`Receipt error:`, e);
        break;
      }
    }

    if (receipts.length > 0) {
      return BundleState.Sent;
    } else {
      return BundleState.Failed;
    }
  }
}
