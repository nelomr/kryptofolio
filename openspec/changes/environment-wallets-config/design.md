# Design: Environment and Wallets Configuration

## Architecture
1. **Environment Config**: Use `import.meta.env.VITE_KNOWN_WALLETS` to inject a JSON array of wallets at build time.
2. **Infrastructure Layer**: `src/core/infrastructure/config/WalletConfig.ts` acts as the Anti-Corruption Layer for environment variables.
3. **Validation**: Use Zod to define schemas for `ChainAddress` and `LogicalWallet`. If `import.meta.env` parsing fails, fallback to an empty array and log a warning.
4. **Domain Entities**: Define `LogicalWalletEntity` and `ChainAddressEntity` in `src/core/domain/models/PortfolioEntities.ts` (or similar) to maintain Hexagonal Architecture purity. The Zod output should be mapped to this domain entity.
5. **UI Layer**: The UI components will read the parsed array from `WalletConfig` and populate the Dropdown menus. Actions like "Sync" will be set to a disabled state.

## Schemas
```typescript
import { z } from 'zod';

export const ChainAddressSchema = z.object({
  blockchain: z.string(),
  address: z.string()
});

export const LogicalWalletSchema = z.object({
  name: z.string(),
  type: z.enum(['COLD_WALLET', 'HOT_WALLET']),
  chain_addresses: z.array(ChainAddressSchema)
});

// Domain mapping
export const parseKnownWallets = (envString: string) => {
    // ... try/catch JSON.parse and safeParse with Zod
}
```
