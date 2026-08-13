# Bff Mock Routes Specification

## Purpose

The mock routes that serve summary, wallet, transaction and tax data for offline development.

## Requirements

### Requirement: Serve Mock Summary Data
The BFF SHALL expose a `GET /api/summary` endpoint returning a mock summary of the portfolio.

#### Scenario: Fetch Summary
- **WHEN** a client makes a GET request to `/api/summary`
- **THEN** the API Gateway returns a 200 OK with the mock summary payload

### Requirement: Serve Mock Wallet Data
The BFF SHALL expose a `GET /api/wallets` endpoint returning the mock wallets.

#### Scenario: Fetch Wallets
- **WHEN** a client makes a GET request to `/api/wallets`
- **THEN** the API Gateway returns a 200 OK with the mock wallets payload

### Requirement: Serve Mock Transactions Data
The BFF SHALL expose a `GET /api/transactions` endpoint returning mock transactions.

#### Scenario: Fetch Transactions
- **WHEN** a client makes a GET request to `/api/transactions`
- **THEN** the API Gateway returns a 200 OK with the mock transactions payload

### Requirement: Serve Mock Tax Data
The BFF SHALL expose a `GET /api/tax` endpoint returning mock tax reports.

#### Scenario: Fetch Tax Data
- **WHEN** a client makes a GET request to `/api/tax`
- **THEN** the API Gateway returns a 200 OK with the mock tax payload
