# @kryptofolio/frontend

## 1.15.11

### Patch Changes

- [`e53e978`](https://github.com/nelomr/kryptofolio/commit/e53e9783a8e9224dedd02654ae7ff80001bae348) Thanks [@nelomr](https://github.com/nelomr)! - chore: align frontend package version with historical global tag

## 1.14.4

### Patch Changes

- [`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a) Thanks [@nelomr](https://github.com/nelomr)! - ci: unified vitest workspace to fix test report summary logs

- Updated dependencies [[`2775b42`](https://github.com/nelomr/kryptofolio/commit/2775b4230e3cd2ed64da627bf152617dcd7d428a)]:
  - @kryptofolio/core-domain@1.0.3
  - @kryptofolio/shared-types@1.0.3

## 1.14.3

### Patch Changes

- [`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa) Thanks [@nelomr](https://github.com/nelomr)! - feat: implement real-time market data providers orchestration

  - Added SSE and REST endpoints for live market data and historical prices
  - Added CoinGecko, Kraken, Binance, Coinbase, and Bit2Me provider adapters
  - Implemented DuckDB and InMemory price history caching
  - Integrated Vue composables and UI elements to switch active market providers from the Vault

- Updated dependencies [[`18e7028`](https://github.com/nelomr/kryptofolio/commit/18e70285a5b89a564ef31578a537f90afc6589aa)]:
  - @kryptofolio/shared-types@1.0.2
  - @kryptofolio/core-domain@1.0.2

## 1.14.2

### Patch Changes

- [`bf6dae7`](https://github.com/nelomr/kryptofolio/commit/bf6dae7ff782928b2035649d7b5c53c92ea8dfdd) Thanks [@nelomr](https://github.com/nelomr)! - Implement backend consolidation: decouple database logic into packages/database, implement DuckDB adapter, and configure Hono RPC with unified environment variables. Update configuration and documentation across the workspace.

## 1.14.1

### Patch Changes

- 5005c43: Refactor: Migration to PNPM Workspaces monorepo architecture with decoupled packages, PNPM Catalogs, and strict architectural boundaries.
- Updated dependencies [5005c43]
  - @kryptofolio/core-domain@1.0.1
  - @kryptofolio/shared-types@1.0.1
