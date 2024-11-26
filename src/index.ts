import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({
  chain: mainnet,
  transport: http(
    process.env.ETH_RPC_URL ?? "https://ethereum-public.nodies.app"
  ),
});

(async () => {
  console.log(
    "Morpho Liquidator 🤖 started at block",
    await client.getBlockNumber()
  );
})();
