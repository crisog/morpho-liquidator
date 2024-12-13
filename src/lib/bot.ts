import { CronJob } from "cron";
import { BotConfig, LiquidatableAPIResponse } from "../types";
import { LiquidationService } from "./liquidation";
import { ProviderService } from "./provider";
import { BlueSdkConverter } from "@morpho-org/blue-api-sdk";
import { safeGetAddress, safeParseNumber } from "@morpho-org/blue-sdk-ethers";

export class LiquidatorBot {
  private config: BotConfig;
  private liquidationService: LiquidationService;
  private converter: BlueSdkConverter;

  constructor(config: BotConfig) {
    this.config = config;

    this.converter = new BlueSdkConverter({
      parseAddress: safeGetAddress,
      parseNumber: safeParseNumber,
    });

    const providerService = ProviderService.getInstance(this.config.chainId);

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
    if (!process.env.LIQUIDATABLE_API_ENDPOINT) {
      throw new Error("LIQUIDATABLE_API_ENDPOINT is not set");
    }

    const response = await fetch(process.env.LIQUIDATABLE_API_ENDPOINT);

    const liquidatableResponse =
      (await response.json()) as LiquidatableAPIResponse;
    if (
      !liquidatableResponse.timestamp ||
      !liquidatableResponse.wethPriceUsd ||
      !Array.isArray(liquidatableResponse.positions)
    ) {
      throw new Error(
        `Invalid API response format: ${JSON.stringify(liquidatableResponse)}`
      );
    }
    console.info(
      "liquidatableResponse:",
      JSON.stringify(liquidatableResponse, null, 2)
    );

    await Promise.all(
      liquidatableResponse.positions.map((position) => {
        return this.liquidationService.processPosition(
          position,
          liquidatableResponse.wethPriceUsd
        );
      })
    );
  }
}
