import { apiSdk } from "@morpho-org/blue-sdk-ethers-liquidation";
import NodeCache from "node-cache";

export class MarketService {
  private chainId: number;
  private cache: NodeCache;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.cache = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      useClones: false,
    });
  }

  async getWhitelistedMarkets(): Promise<string[]> {
    const CACHE_KEY = "whitelisted_markets";
    const cachedMarkets = this.cache.get<string[]>(CACHE_KEY);
    if (cachedMarkets) {
      return cachedMarkets;
    }

    const {
      markets: { items },
    } = await apiSdk.getWhitelistedMarketIds({
      chainId: this.chainId,
    });

    const marketIds = items?.map(({ uniqueKey }) => uniqueKey) ?? [];
    this.cache.set(CACHE_KEY, marketIds);

    return marketIds;
  }
}
