## ADDED Requirements

### Requirement: PiniaCustomProperties type augmentation
The system SHALL provide a TypeScript module augmentation file that extends Pinia's `PiniaCustomProperties` interface to declare `$portfolioRepo` as `ICryptoPortfolioRepository` and `$taxRepo` as `ITaxRepository`.

#### Scenario: TypeScript recognizes DI properties in Pinia stores
- **WHEN** a developer accesses `this.$portfolioRepo` or `this.$taxRepo` inside a Pinia Options store
- **THEN** TypeScript SHALL resolve the correct domain interface type without explicit casting

#### Scenario: TypeScript recognizes DI properties in Pinia setup stores
- **WHEN** a developer uses `const store = useSomeStore(); store.$portfolioRepo` in component code
- **THEN** TypeScript SHALL autocomplete methods from `ICryptoPortfolioRepository` or `ITaxRepository`

#### Scenario: Augmentation file is included in compilation
- **WHEN** the project compiles with `npx vue-tsc --noEmit`
- **THEN** the `pinia.d.ts` augmentation SHALL be discovered automatically via the `include` glob in `tsconfig.app.json`

### Requirement: Runtime injection validation
The `setupDependencyInjection` function SHALL validate that all `inject()` calls return defined values. If any injection returns `undefined`, it SHALL throw a descriptive `Error` identifying which key failed.

#### Scenario: All providers registered before DI setup
- **WHEN** `setupDependencyInjection(app, pinia)` is called after `app.provide()` has been called for all keys
- **THEN** the Pinia plugin SHALL receive properly typed, non-undefined repository instances

#### Scenario: Missing provider causes clear error
- **WHEN** `inject(PORTFOLIO_REPO_KEY)` returns `undefined` because `app.provide()` was not called
- **THEN** the system SHALL throw an `Error` with a message containing the string `"PORTFOLIO_REPO_KEY"` and the word `"undefined"`

#### Scenario: Missing tax provider causes clear error
- **WHEN** `inject(TAX_REPO_KEY)` returns `undefined`
- **THEN** the system SHALL throw an `Error` with a message containing the string `"TAX_REPO_KEY"` and the word `"undefined"`
