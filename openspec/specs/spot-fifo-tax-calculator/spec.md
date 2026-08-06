## MODIFIED Requirements

### Requirement: Spot FIFO Lots Resolution
The system SHALL use SQL Window Functions (`SUM() OVER`) and/or `WITH RECURSIVE` queries in DuckDB to chronologically match disposal transactions (Sells, Swaps) against acquisition transactions (Buys) using the First-In, First-Out rule. Every cost basis and every disposal value the matching produces SHALL be stated in the transaction's reporting currency, converting a price series denominated otherwise per the `fifo-fx-conversion` capability.

#### Scenario: Standard Sell Matching
- **WHEN** a user sells 2 BTC and previously bought 1 BTC at €10k and 1 BTC at €20k
- **THEN** the Spot FIFO calculation returns a cost basis of €30k for that disposal

#### Scenario: A lot valued from a foreign-currency series matches in the reporting currency
- **WHEN** a lot's basis was derived from a USD price series, the reporting currency is EUR, and the lot is later matched against a disposal
- **THEN** both the basis and the proceeds MUST be euro figures
- **AND** the resulting gain MUST NOT mix denominations

### Requirement: Crypto-Fee Disposal Generation
When a transaction fee is paid in a crypto asset (e.g., BNB on Binance), the system SHALL treat that fee payment as a distinct disposal (sell) of that specific asset, triggering its own capital gain/loss calculation before the primary transaction evaluates. The fee's value SHALL be stated in the transaction's reporting currency, converted from the fee asset's price series where that series is denominated otherwise.

#### Scenario: BNB Fee on a BTC Buy
- **WHEN** a user buys 1 BTC and pays 0.1 BNB as a fee (BNB previously acquired at €10, current value €30)
- **THEN** the engine calculates a capital gain of +€2 for the 0.1 BNB disposed
- **THEN** the 1 BTC acquisition cost basis correctly reflects the fiat equivalent cost including the fee expenditure

#### Scenario: A fee priced in USD against a euro-reporting transaction
- **WHEN** a fee of `0.204766 XRP` is charged on a transaction reporting in EUR and the XRP series is denominated in USD
- **THEN** the fee component added to the acquisition basis and the value of the fee disposal MUST both be euro figures
- **AND** both MUST be derived from the same resolved rate
