# Direct Api Consumption Specification

## Purpose

One official backend, consumed directly by the frontend rather than through a second layer.

## Requirements

### Requirement: Unified Official Backend
The system SHALL consolidate all mock, credentials, and API routes previously in `api-gateway` into the official `apps/backend`, removing the `api-gateway` entirely.

#### Scenario: Application startup
- **WHEN** the user starts the backend environment
- **THEN** only a single Node.js process (`apps/backend`) handles all endpoint logic

### Requirement: Direct Frontend Connections
The frontend SPA SHALL NOT rely on a Node.js proxy middleware in production, utilizing `VITE_API_URL` to route `fetch` and SSE requests directly to the target backend.

#### Scenario: Frontend builds for production
- **WHEN** the frontend is compiled for deployment
- **THEN** it can be served statically via Nginx, communicating directly with the backend specified by the environment variable without CORS or proxy errors
