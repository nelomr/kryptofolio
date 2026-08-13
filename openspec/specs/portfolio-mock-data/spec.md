# Portfolio Mock Data Specification

## Purpose

The portfolio fixture: all three hierarchy levels, edge cases as named exports, and injectable without transformation.

## Requirements

### Requirement: Mock file exports a PortfolioData fixture
**Reason**: Replaced by BFF-served mock data to allow realistic network latency and centralize mock data in the backend.
**Migration**: Use the BFF `/api/summary` endpoint instead of importing from `src/data/mockPortfolio.ts`.

### Requirement: Mock covers all three data hierarchy levels
**Reason**: Replaced by BFF endpoints returning the same structure.
**Migration**: Query the respective endpoints on the BFF.

### Requirement: Mock covers edge case fixtures via named exports
**Reason**: Replaced by specific mock scenarios requested from the BFF or provided by test utilities.
**Migration**: Update tests to use MSW or mock the BFF client directly.

### Requirement: Mock is injectable into Pinia store without transformation
**Reason**: Pinia store now fetches data asynchronously from the BFF.
**Migration**: Use asynchronous actions in Pinia to fetch and populate state.
