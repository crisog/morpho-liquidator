import { Token } from "@morpho-org/blue-sdk";

// Currencies and Tokens

export const USDC_TOKEN = new Token({
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  decimals: 6,
  symbol: "USDC",
  name: "USD//C",
});

// ABI's

export const ERC20_ABI = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",

  // Authenticated Functions
  "function approve(address _spender, uint256 _value) returns (bool)",
];
