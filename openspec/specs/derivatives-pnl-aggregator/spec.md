## ADDED Requirements

### Requirement: Derivatives Profit and Loss Aggregation
The system SHALL calculate performance metrics for Futures and Derivatives directly by summing `realizedPnl`, `funding`, and `fees` grouped by contract/asset, entirely bypassing the Spot FIFO matching logic.

#### Scenario: Closing a long perpetual position
- **WHEN** the engine encounters a Futures transaction type with €500 profit, €10 funding paid, and €5 fee
- **THEN** it aggregates a Net PnL of €485 for that specific contract
- **THEN** the Spot FIFO tracking for the underlying asset (e.g., BTC) remains completely unaffected
