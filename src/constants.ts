import { Token } from "@morpho-org/blue-sdk";

export const USDC_TOKEN_MAINNET = new Token({
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  decimals: 6,
  symbol: "USDC",
  name: "USD//C",
});

export const MORPHO_CONTRACT_ADDRESSES = {
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", // mainnet
  11155111: "0xd011EE229E7459ba1ddd22631eF7bF528d424A14", // sepolia
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", // base
};

export const FLASHHBOTS_RELAY_URLS = {
  1: "https://relay-mainnet.flashbots.net",
  11155111: "https://relay-sepolia.flashbots.net",
  8453: "https://relay-base.flashbots.net",
};

export const RPC_URLS = {
  1: process.env.ETH_RPC_URL!,
  11155111: process.env.SEPOLIA_RPC_URL!,
  8453: process.env.BASE_RPC_URL!,
};

export const WAD = BigInt(1e18);
