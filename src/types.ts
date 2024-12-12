import { Token } from "@morpho-org/blue-sdk";

interface Asset {
  address: string;
  decimals?: number;
  symbol?: string;
  priceUsd?: number;
}

interface UserData {
  address: string;
}

interface MarketData {
  id: string;
  irmAddress: string;
  lltv: string;
  oracleAddress: string;
  oraclePrice: string;
  collateralAsset: Asset;
  loanAsset: Asset;
  totalBorrowAssets: string;
  totalBorrowShares: string;
}

interface PositionData {
  collateral: string;
  borrowShares: string;
  currentLtv: string;
}

export interface LiquidatablePosition {
  user: UserData;
  market: MarketData;
  position: PositionData;
}

export interface LiquidatableAPIResponse {
  timestamp: number;
  wethPriceUsd: number;
  positions: LiquidatablePosition[];
}

export interface PositionResult {
  position: LiquidatablePosition;
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
