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
SEPOLIA_RPC_URL=https://sepolia-public.nodies.app

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
  swapFromToken: USDC_TOKEN_MAINNET,
  swapToToken: USDC_TOKEN_MAINNET,
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

### Considerations

- This bot supports the following networks: Ethereum Mainnet, Ethereum Sepolia and Base Mainnet
- This bot has been tested on Sepolia, you can track the bot interactions [here](https://sepolia.etherscan.io/address/0xCF6D79F936f50B6a8257733047308664151B2510).
- This bot only executes full liquidations, but it can be modified to use a different strategy (i.e. partial liquidations)
- This bot can run in Sepolia, however, the swaps won't be executed because ParaSwap is not available on Sepolia. It will only fully liquidate the position; and it will not sell the seized collateral or calculate profits.
- The scripts used to deploy the contracts (oracle, tokens) and send the supply collateral/borrow transactions can be found [here](https://github.com/crisog/morpho-test).

## Roadmap

- [x] Integrate a new indexer for positions [morpho-markets](https://github.com/crisog/morpho-markets)
- [ ] Smart contracts executed liquidation w/ flash loans
- [ ] Add support for AWS Secrets Manager to pull private keys from it
- [ ] [Reth Extension](https://reth.rs/developers/exex/exex.html) (ExEx) for live tracking of liquidatable positions as indexer

## Credits

Morpho's [liquidation bot example](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk-ethers-liquidation/examples/whitelisted-erc4626-1inch.ts) was a valuable reference for developing this bot, along with Morpho's [docs](https://docs.morpho.org/).
