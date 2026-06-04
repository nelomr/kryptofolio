# Tasks: Environment and Wallets Configuration

- [ ] **Task 1: Setup Environment Files**
  - Create `.env.example` with the mock `VITE_KNOWN_WALLETS` JSON array.
  - Verify `.env` is added to `.gitignore`.

- [ ] **Task 2: Domain Entities Definition**
  - Update `src/core/domain/models/PortfolioEntities.ts` (or create a new domain file) to include `LogicalWalletEntity` types so the domain is untainted by Zod/Infra code.

- [ ] **Task 3: Implement Configuration Service**
  - Create `src/core/infrastructure/config/WalletConfig.ts`.
  - Implement Zod validation (`LogicalWalletSchema`, `ChainAddressSchema`).
  - Add logic to parse `import.meta.env.VITE_KNOWN_WALLETS`, validate it, and return domain entities.

- [ ] **Task 4: UI Integration & Disabled States**
  - Update the Wallet Selection dropdown (e.g. inside `TaxReportHeader.vue` or Global Layout Header) to populate from `WalletConfig.ts`.
  - Ensure the "Sync" action/button reflects a disabled state, since backend syncing is deferred.
