## ADDED Requirements

### Requirement: Consistent Aggregation
The mock data provided by the BFF SHALL have referential consistency, meaning that the sum of the transaction balances equals the reported wallet balances.

#### Scenario: Verify Balances
- **WHEN** the mock data is verified
- **THEN** transactions for a given wallet and asset match the total quantity of that asset in the wallet
