# Tax Composables Specification

## Purpose

Tax composables: async queries, async mutations, business logic decoupled from side effects, and the upload mutation.

## Requirements

### Requirement: Tax Data Composables manage async queries
The system SHALL provide `useTaxTransactionsQuery` and `useTaxReportQuery` to fetch and cache data using Pinia Colada.

#### Scenario: Fetch transactions returns reactive state
- **WHEN** `useTaxTransactionsQuery()` is called
- **THEN** it SHALL return reactive `data`, `isLoading`, and `error` properties
- **AND** it SHALL automatically fetch data from `ITaxService.getTransactions()` if not cached or if it's stale

### Requirement: Tax Mutation Composables manage async updates
The system SHALL provide mutation composables such as `useUploadTaxFileMutation`, `useImportWalletMutation`, `useSyncWeb3Mutation`, and `useDeleteTransactionsMutation`.

#### Scenario: Upload mutation invalidates transactions query
- **WHEN** `useUploadTaxFileMutation().mutate(file)` completes successfully
- **THEN** it SHALL invalidate the query cache for `tax-transactions`
- **AND** the UI SHALL automatically reflect the new transactions without a manual refetch call

### Requirement: Tax Business Logic is decoupled from side effects
The system SHALL provide pure composables for pagination and smart year deduction, independent of data fetching.

#### Scenario: Smart year logic is derived from data
- **WHEN** `useSmartYearLogic(transactions)` is used
- **THEN** it SHALL return a computed property representing the deduced fiscal year based solely on the provided data array

### Requirement: Upload Tax File Mutation
The system SHALL provide a Pinia Colada mutation to upload tax transactions and automatically invalidate the `TAX_TRANSACTIONS_KEY` query cache upon success.

#### Scenario: Submitting pre-parsed JSON rows via mutation
- **WHEN** the application calls the new `useSubmitIngestionMutation` with a JSON payload of rows and market type
- **THEN** the mutation executes the `ImportTransactionsUseCase`
- **AND THEN** upon success, it invalidates the corresponding `TAX_TRANSACTIONS_KEY` cache for the specified market.
