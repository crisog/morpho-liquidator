import { LiquidatorBot } from "./lib/bot";
import { BotConfig } from "./types";
import { USDC_TOKEN_MAINNET } from "./constants";

const config: BotConfig = {
  chainId: 1, // Ethereum Mainnet
  cronSchedule: "*/10 * * * * *", // Runs every 10 seconds
  timeZone: "America/Los_Angeles",
  maxSlippage: 50, // this is scaled by 10000, so 50 is 0.5%
  maxImpact: 2, // this is scaled by 100, so 2 is 2%
  swapFromToken: USDC_TOKEN_MAINNET,
  swapToToken: USDC_TOKEN_MAINNET,
  minProfit: 50, // in USD
};

const liquidator = new LiquidatorBot(config);
liquidator.start();
