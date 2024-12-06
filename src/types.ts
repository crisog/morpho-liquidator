import { Token } from "@morpho-org/blue-sdk";

export interface MarketPosition {
  user: {
    address: string;
  };
  market: {
    oracleAddress: string;
    irmAddress: string;
    lltv: bigint;
    collateralAsset: {
      address: string;
      decimals: number;
      symbol: string;
      priceUsd: number | null;
      spotPriceEth: number | null;
    } | null;
    loanAsset: {
      address: string;
      decimals: number;
      symbol: string;
      priceUsd: number | null;
      spotPriceEth: number | null;
    };
  };
}

export interface PositionResult {
  position: MarketPosition;
  status: "NOT_PROFITABLE" | "PROFITABLE" | "LIQUIDATED" | "FAILED";
  reason?: string;
}

export interface BotConfig {
  chainId: number;
  cronSchedule: string;
  timeZone: string;
  maxSlippage: number;
  maxImpact: number;
  swapFromToken: Token;
  swapToToken: Token;
  minProfit: number;
}
