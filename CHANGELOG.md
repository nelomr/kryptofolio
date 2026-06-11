# Changelog

All notable changes to **Kriptofolio** are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org) and [Semantic Versioning](https://semver.org).

## [1.15.7](https://github.com/nelomr/kryptofolio/compare/v1.15.6...v1.15.7) (2026-06-11)

### ✨ Features

* implement cryptographic vault verification and modularize settings UI ([5a733ee](https://github.com/nelomr/kryptofolio/commit/5a733ee06be99a4aa3424e326627608ccad05ac6))

## [1.15.6](https://github.com/nelomr/kryptofolio/compare/v1.15.5...v1.15.6) (2026-06-11)

### ✨ Features

* integrate Local Secrets Vault, dynamic registry, and Hexagonal Architecture ([832238d](https://github.com/nelomr/kryptofolio/commit/832238dcab3fc83bac6f5fe1cea8be207ba9fdd2))

## [1.15.5](https://github.com/nelomr/kryptofolio/compare/v1.15.4...v1.15.5) (2026-06-10)

### ✨ Features

* add portfolio risk metrics widget with rolling sharpe ratio ([5cc8bad](https://github.com/nelomr/kryptofolio/commit/5cc8bad82036e6b19ab866d55339797a2ecd3a49))

## [1.15.4](https://github.com/nelomr/kryptofolio/compare/v1.15.3...v1.15.4) (2026-06-09)

### ✨ Features

* implement volatility heatmap and isolate domain logic ([a465611](https://github.com/nelomr/kryptofolio/commit/a46561179a7c77ea46a827a7bcb6928b878b7ffb))

## [1.15.3](https://github.com/nelomr/kryptofolio/compare/v1.15.2...v1.15.3) (2026-06-09)

### ✨ Features

* implement asset allocation donut chart and metrics ([3ed4479](https://github.com/nelomr/kryptofolio/commit/3ed447968b7d111ba139b93bba054de49c9c4ede))

### ♻️  Refactors

* enforce strict hexagonal architecture and application layer ([6ee5257](https://github.com/nelomr/kryptofolio/commit/6ee525774166f91af499839143f53f34652c93fd))

## [1.15.2](https://github.com/nelomr/kryptofolio/compare/v1.15.1...v1.15.2) (2026-06-08)

### ✨ Features

* migrate frontend to Hono RPC with dynamic BFF proxy ([05a179a](https://github.com/nelomr/kryptofolio/commit/05a179a65a3565e7c08d5544dcd2c5ed776a814c))

## [1.15.1](https://github.com/nelomr/kryptofolio/compare/v1.15.0...v1.15.1) (2026-06-08)

### ✨ Features

* migrate adapters to BFF and adjust release pacing ([c77a22e](https://github.com/nelomr/kryptofolio/commit/c77a22ef366d7d02fb7577df51a1657a83df6781))

### 📝 Documentation

* **specs:** sync phase-2-bff-docs specs to main library ([d508278](https://github.com/nelomr/kryptofolio/commit/d508278e15414778d47bebbcd78b066759059dff))

## [1.15.0](https://github.com/nelomr/kryptofolio/compare/v1.14.1...v1.15.0) (2026-06-06)

### ✨ Features

* **architecture:** migrate project to pnpm monorepo workspace ([9accea3](https://github.com/nelomr/kryptofolio/commit/9accea36701616f4456ecdc5e0d73da32fea8c7a))

## [1.14.1](https://github.com/nelomr/kryptofolio/compare/v1.14.0...v1.14.1) (2026-06-06)

### 🐛 Bug Fixes

* **ui:** update portfolio banner and header titles ([7d7a5e3](https://github.com/nelomr/kryptofolio/commit/7d7a5e3ccdfc111b3fa1beede7afa6cc0fb5fbf8))

## [1.14.0](https://github.com/nelomr/kryptofolio/compare/v1.13.0...v1.14.0) (2026-06-06)

### ✨ Features

* add interactive portfolio performance history chart ([f85a38d](https://github.com/nelomr/kryptofolio/commit/f85a38d4779ea2d56d035e72f35d613585b8c696))

## [1.13.0](https://github.com/nelomr/kryptofolio/compare/v1.12.0...v1.13.0) (2026-06-05)

### ✨ Features

* implement crypto kpi dashboard cards ([e4755c1](https://github.com/nelomr/kryptofolio/commit/e4755c18d733dca698b00ad470b623a8b5826b7d))

### ♻️  Refactors

* **ui:** integrate robust css-first design system and native shadcn tokens ([a452739](https://github.com/nelomr/kryptofolio/commit/a4527397dd8bada70b1252b3a570cda0f728c04e))

## [1.12.0](https://github.com/nelomr/kryptofolio/compare/v1.11.0...v1.12.0) (2026-06-04)

### ✨ Features

* **portfolio:** redesign charts with light theme and interactive legends ([7bb7766](https://github.com/nelomr/kryptofolio/commit/7bb7766e3d175fa9729e0be4701e6bfa23f4e673))

## [1.11.0](https://github.com/nelomr/kryptofolio/compare/v1.10.0...v1.11.0) (2026-06-04)

### ✨ Features

* add manual wallet configuration and CSV ingestion ([4ac6e19](https://github.com/nelomr/kryptofolio/commit/4ac6e192ce659337e7e2327372fdb3b512dbe88a))

## [1.10.0](https://github.com/nelomr/kryptofolio/compare/v1.9.0...v1.10.0) (2026-06-04)

### ✨ Features

* separate futures tax derivatives into dedicated table and standardize error i18n ([ce2637c](https://github.com/nelomr/kryptofolio/commit/ce2637ce601fbb807595fc1fd36ed2d4785ec526))

### ♻️  Refactors

* **core:** enforce strict Hexagonal Architecture and Zod ACL ([eb9574a](https://github.com/nelomr/kryptofolio/commit/eb9574ab1a7d44818ddbd505b689ec201128b5c7))

## [1.9.0](https://github.com/nelomr/kryptofolio/compare/v1.8.1...v1.9.0) (2026-06-03)

### ✨ Features

* complete tax audit and report dashboard with dynamic year filtering and enriched UI ([c4f51e6](https://github.com/nelomr/kryptofolio/commit/c4f51e636563717219dfee0f50f5cebf3cd73b6b))

## [1.8.1](https://github.com/nelomr/kryptofolio/compare/v1.8.0...v1.8.1) (2026-06-02)

### 🐛 Bug Fixes

* finalize tax report view implementation ([acf80c9](https://github.com/nelomr/kryptofolio/commit/acf80c9b072f435c961d647f7ffb275d344954d7))

## [1.8.0](https://github.com/nelomr/kryptofolio/compare/v1.7.0...v1.8.0) (2026-06-02)

### ✨ Features

* implement Tax Domain state and UI components ([c640d2a](https://github.com/nelomr/kryptofolio/commit/c640d2ac7a916c88ffbfa4496421735fe4a1c098))

## [1.7.0](https://github.com/nelomr/kryptofolio/compare/v1.6.0...v1.7.0) (2026-06-01)

### ✨ Features

* **tax-adapters:** implement CSV parsers and MockTaxAdapter with robust validation ([31b053a](https://github.com/nelomr/kryptofolio/commit/31b053a28a14d114895a8240dcacc8e20b536ee4))

## [1.6.0](https://github.com/nelomr/kryptofolio/compare/v1.5.0...v1.6.0) (2026-05-28)

### ✨ Features

* **i18n:** implement environment-based translated strings functionality ([e21359a](https://github.com/nelomr/kryptofolio/commit/e21359ab2f85a21b42d4b8fd5576b08293f36575))

## [1.5.0](https://github.com/nelomr/kryptofolio/compare/v1.4.1...v1.5.0) (2026-05-28)

### ✨ Features

* rebrand project to Kriptofolio and enhance documentation ([2cdc620](https://github.com/nelomr/kryptofolio/commit/2cdc62021730a59507f461bcf8a4d9ffdf4a3197))

### 🐛 Bug Fixes

* correct github repository url to kryptofolio ([d68ea6c](https://github.com/nelomr/kryptofolio/commit/d68ea6c27b2fb8adf3061db9c5b9bc13ef446db6))

### 📝 Documentation

* move badges to top and update repo urls ([c93ffc7](https://github.com/nelomr/kryptofolio/commit/c93ffc775a91d03e41d06ed6e9d3de77977a2fb4))

# Changelog

All notable changes to **Portfolio Dashboard** are documented here.
Format follows [Conventional Commits](https://www.conventionalcommits.org) and [Semantic Versioning](https://semver.org).

## [1.4.1](https://github.com/nelomr/portfolio-dashboard/compare/v1.4.0...v1.4.1) (2026-05-28)

### 📝 Documentation

* implement DESIGN.md and configure AI agent UI skill ([17be785](https://github.com/nelomr/portfolio-dashboard/commit/17be785fad7d4bf54ae368e1251f921284c42050))

## [1.4.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.6...v1.4.0) (2026-05-28)

### ✨ Features

* **ui:** implement delegated skeleton pattern and SFC columns refactor ([cd6b9c2](https://github.com/nelomr/portfolio-dashboard/commit/cd6b9c2dfef4ab40a29db84f4576c78487ead66d))

## [1.3.6](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.5...v1.3.6) (2026-05-27)

### 📝 Documentation

* **readme:** enhance local development and testing instructions ([cecb121](https://github.com/nelomr/portfolio-dashboard/commit/cecb12105aaf30171df64c70456f2827e3534f06))

## [1.3.5](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.4...v1.3.5) (2026-05-27)

### 📝 Documentation

* **readme:** update project description ([4f535c0](https://github.com/nelomr/portfolio-dashboard/commit/4f535c0073f057b9ba480e652fae47286fc44a03))

## [1.3.4](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.3...v1.3.4) (2026-05-27)

### 📝 Documentation

* **openspec:** archive hex-arch-zod-refactor and sync all delta specs ([e1a3f94](https://github.com/nelomr/portfolio-dashboard/commit/e1a3f945346184d50a8c1d443955a2d959bf2dde))

## [1.3.3](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.2...v1.3.3) (2026-05-27)

### 📝 Documentation

* **openspec:** remove deprecated portfolio-state-management spec ([2d0bb22](https://github.com/nelomr/portfolio-dashboard/commit/2d0bb22f634505874361660c48b36fcabe265fa9))

## [1.3.2](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.1...v1.3.2) (2026-05-27)

### 📝 Documentation

* **openspec:** sync pinia-colada specs and archive change ([39234a8](https://github.com/nelomr/portfolio-dashboard/commit/39234a80d200c5653ab77f8d05fda11bf1c1471a))

## [1.3.1](https://github.com/nelomr/portfolio-dashboard/compare/v1.3.0...v1.3.1) (2026-05-27)

### ♻️  Refactors

* **portfolio:** implement clean architecture with zod and migrate to pinia colada ([47422b0](https://github.com/nelomr/portfolio-dashboard/commit/47422b0031560de0bb5491a5549a06727ea85fff))

## [1.3.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.2.0...v1.3.0) (2026-05-26)

### ✨ Features

* **portfolio:** integrate interactive charts and refactor layout ([37d1102](https://github.com/nelomr/portfolio-dashboard/commit/37d11027d8cee5575b548573fbcd60bc0cc2be0e))

## [1.2.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.1.0...v1.2.0) (2026-05-26)

### ✨ Features

* **portfolio:** implement core layout and shadcn-vue architecture ([6752ac7](https://github.com/nelomr/portfolio-dashboard/commit/6752ac77f2c90e58c60942a685f48d0bb29ae148))

## [1.1.0](https://github.com/nelomr/portfolio-dashboard/compare/v1.0.0...v1.1.0) (2026-05-26)

### ✨ Features

* **portfolio:** implement state management and composables ([836d7c4](https://github.com/nelomr/portfolio-dashboard/commit/836d7c4375e084b7dc7d3ac75e47b22072af229f))

## 1.0.0 (2026-05-26)

### ✨ Features

* add portfolio data contracts and agnostic mock fixtures ([1d18478](https://github.com/nelomr/portfolio-dashboard/commit/1d1847851aeb1be8cdf31bbc65673787520d8e24))
* initial project skeleton with Vue 3, Pinia, and TailwindCSS ([f6fbdf5](https://github.com/nelomr/portfolio-dashboard/commit/f6fbdf5f2b4b4c8812876823e4cca60a335f08fe))

### 🐛 Bug Fixes

* update CI workflow to use Node 24 and fix token syntax ([960a0d1](https://github.com/nelomr/portfolio-dashboard/commit/960a0d1e396822d076ecc805665bcfaf1b7182de))

<!-- semantic-release will prepend new entries above this line -->
