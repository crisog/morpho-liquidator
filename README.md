<div align="center">
    <img src=".github/morpho.png" alt="Morpho logo" width="600"/>
    <h1>Morpho Liquidator 🤖</h1>
    <big>Liquidation Bot designed for Morpho Blue</big>
    <div>
    <br/>
        <a href="https://github.com/crisog/morpho-liquidator/pulse"><img src="https://img.shields.io/github/last-commit/crisog/morpho-liquidator.svg"/></a>
        <a href="https://github.com/crisog/morpho-liquidator/pulls"><img src="https://img.shields.io/github/issues-pr/crisog/morpho-liquidator.svg"/></a>
        <a href="https://github.com/crisog/morpho-liquidator/issues"><img src="https://img.shields.io/github/issues-closed/crisog/morpho-liquidator.svg"/></a>
    </div>
</div>
<br/>

## Getting Started

1. Install the dependencies

```bash
yarn install
```

For CI:

```bash
yarn install --frozen-lockfile
```

2. Configure the environment variables

```bash
ETH_RPC_URL=https://ethereum-public.nodies.app
BASE_RPC_URL=https://base-public.nodies.app

ETH_WALLET_PRIVATE_KEY=<YOUR_NON_PRODUCTION_PRIVATE_KEY>
```

❗❗❗ IMPORTANT: Do not use production/mainnet private keys in your .env ❗❗❗

3. Configure the bot's settings on our index file.

```ts
const config: BotConfig = {
  chainId: 1, // Ethereum Mainnet
  cronSchedule: "*/10 * * * * *", // Runs every 10 seconds
  timeZone: "America/Los_Angeles",
  maxSlippage: 50, // this is scaled by 10000, so 50 is 0.5%
  maxImpact: 2, // this is scaled by 100, so 2 is 2%
  swapFromToken: USDC_TOKEN,
  swapToToken: USDC_TOKEN,
  minProfit: 500, // in USD
};
```

4. Run the bot 🤖

```bash
yarn start
```

## Features

- [x] Fetches whitelisted markets from Morpho API
- [x] Fetches liquidatable positions from Morpho API
- [x] Swaps configurable asset to obtain loan tokens
- [x] Checks existing allowances before approving tokens
- [x] Liquidates profitable positions in Morpho Blue
- [x] Swaps liquidated collateral tokens for configurable asset
- [x] Flashbots Provider integration ⚡️🤖
- [x] Periodical execution via cron job
- [x] Chain, swap slippage and swap max impact are configurable

## Roadmap

- [] Support multiple sources of liquidatable positions (+ chance for opportunities)
- [] Integrate a new indexer for positions - still work in progress [morpho-markets](https://github.com/crisog/morpho-markets)
- [] Add support for AWS Secrets Manager to pull private keys from it
- [] Listen to new blocks notifications via WebSockets for real-time opportunity discovery
- [] [Reth Extension](https://reth.rs/developers/exex/exex.html) (ExEx) for live tracking of liquidatable positions
