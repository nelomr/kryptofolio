# Vault Architecture Spec

## Requirements

1. **Behavioral Parity**:
   - The UI and the user experience must remain completely unchanged.
   - All components consuming `useVaultQueries` and `useVaultMutations` must continue to function normally.
   - The API payloads must match the existing structure exactly.

2. **Architectural Compliance**:
   - The UI layer (`.vue` components and composables) must NOT contain any imports of `bffClient` for the Vault domain.
   - All network and data-fetching logic for the Vault MUST reside in the Infrastructure layer (`RestVaultAdapter.ts`).
   - The Domain logic MUST be orchestrated through Use Cases inside `core/application/use-cases/`.
   - The Domain layer MUST define a contract (`IVaultPort.ts`) that the adapter implements.

3. **Dependency Injection**:
   - Vue components/composables must retrieve the `IVaultPort` via standard Vue dependency injection (`inject`).
   - A new injection key `VAULT_PORT_KEY` must be added and provided in the app configuration (`di/index.ts`).

## Acceptance Criteria

- [ ] All `useQuery` and `useMutation` functions inside `composables/queries/` for Vault delegate strictly to use cases or injected ports.
- [ ] No `bffClient` imports exist inside `composables/queries/useVaultMutations.ts` or `composables/queries/useVaultQueries.ts`.
- [ ] `RestVaultAdapter` is registered and provided in the root component via `di/index.ts`.
- [ ] TypeScript compiles successfully with no missing types or interface mismatches in the Vault domain.
