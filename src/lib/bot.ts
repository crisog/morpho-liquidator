import { CronJob } from "cron";
import { BotConfig } from "../types";
import { MarketService } from "./markets";
import { LiquidationService } from "./liquidation";
import { ProviderService } from "./provider";
import { getChainAddresses } from "@morpho-org/blue-sdk";
import { apiSdk } from "@morpho-org/blue-sdk-ethers-liquidation";
import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import { safeGetAddress, safeParseNumber } from "@morpho-org/blue-sdk-ethers";

export class LiquidatorBot {
  private config: BotConfig;
  private marketService: MarketService;
  private liquidationService: LiquidationService;
  private converter: BlueSdkConverter;

  constructor(config: BotConfig) {
    this.config = config;
    this.marketService = new MarketService(config.chainId);

    this.converter = new BlueSdkConverter({
      parseAddress: safeGetAddress,
      parseNumber: safeParseNumber,
    });

    const providerService = ProviderService.getInstance();

    const provider = providerService.getProvider();
    const walletAddress = providerService.getWalletAddress();
    const signer = providerService.getSigner();

    this.liquidationService = new LiquidationService({
      ...config,
      walletAddress,
      signer,
      provider,
      converter: this.converter,
    });
  }

  start(): void {
    console.log("Morpho Liquidator 🤖 started at", new Date().toISOString());

    CronJob.from({
      cronTime: this.config.cronSchedule,
      onTick: () => this.execute(),
      start: true,
      timeZone: this.config.timeZone,
    });
  }

  private async execute(): Promise<void> {
    const { wNative } = getChainAddresses(this.config.chainId);
    const marketIds = await this.marketService.getWhitelistedMarkets();

    const {
      assetByAddress: { priceUsd: wethPriceUsd },
      marketPositions: { items: positions },
    } = await apiSdk.getLiquidatablePositions({
      chainId: this.config.chainId,
      wNative,
      marketIds,
    });

    if (wethPriceUsd == null) return;

    const positionResults = await Promise.all(
      positions.map((position) => {
        return this.liquidationService.processPosition(position, wethPriceUsd);
      })
    );

    console.log("positionResults", positionResults);
  }
}
