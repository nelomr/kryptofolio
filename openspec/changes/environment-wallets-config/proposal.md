# Proposal: Environment and Wallets Configuration

## Intent
Adapt the legacy backend-coupled wallet configuration into a secure, frontend-first, and backend-agnostic environment configuration.

## Context
Currently, wallet configuration was handled by the backend reading a `my_wallets.yaml` file. This tightly coupled the UI to the backend for simple config data like knowing which wallets (cold/hot) exist. To make the frontend completely independent, we want to provide this configuration via environment variables that the frontend can read natively.

## Scope
- Create `.env.example` with dummy wallet data.
- Ensure `.env` is ignored from git.
- Create `WalletConfig.ts` to read `VITE_KNOWN_WALLETS`, parse it as JSON, and validate via Zod.
- Expose this data to the UI (e.g. Header Wallet selection dropdown).
- Disable sync/import buttons temporarily.
