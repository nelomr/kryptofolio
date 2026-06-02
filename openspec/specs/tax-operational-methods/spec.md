## ADDED Requirements

### Requirement: Operational logic executed via mutations
All operational actions (e.g. syncing Web3, deleting transactions, importing wallets) SHALL be executed through their respective Pinia Colada mutation composables rather than direct store actions.

#### Scenario: Delete transactions invalidates queries
- **WHEN** `useDeleteTransactionsMutation().mutate()` is called and succeeds
- **THEN** the mutation SHALL invalidate the query cache for both transactions and tax reports
- **AND** the UI SHALL clear the visible data without requiring a page reload
