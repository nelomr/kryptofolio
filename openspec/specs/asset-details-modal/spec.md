# Asset Details Modal Specification

## Purpose

The per-asset modal: its rendering, and the active lots and sales history it shows.

## Requirements

### Requirement: Render Asset Details Modal
The system SHALL display a modal detailing the full FIFO heritage of a specific asset when requested.

#### Scenario: Open modal for asset
- **WHEN** the user clicks to view full details for an asset like "BTC"
- **THEN** the modal opens with a glassmorphism overlay and displays the asset symbol, icon, and summary metrics (Total Balance, Cost Basis, Market Value, Unrealized P&L).

### Requirement: Display Active Lots and Sales History
The modal SHALL contain separate sections for Active FIFO Lots and Sales History.

#### Scenario: View active lots
- **WHEN** the modal is open
- **THEN** a table showing Acquisition Date, Remaining Amount, Price Paid, Remaining Cost, and Status is visible.

#### Scenario: View sales history
- **WHEN** the modal is open and the asset has past sales
- **THEN** a table showing Disposal Date, Amount Sold, Sale Price, and Gain/Loss is visible.
