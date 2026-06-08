## ADDED Requirements

### Requirement: Dynamic Environment Modes
The BFF SHALL support executing in different modes based on an environment variable, explicitly supporting a "DEMO/MOCK MODE" and a "PROD MODE".

#### Scenario: BFF boots in MOCK mode
- **WHEN** the environment variable `MODE` is set to `mock`
- **THEN** the BFF routes return static JSON mock data for all API endpoints

#### Scenario: BFF boots in PROD mode
- **WHEN** the environment variable `MODE` is set to `prod` (or not `mock`)
- **THEN** the BFF uses an internal fetch proxy to securely route requests to the real API backend

### Requirement: Secure Secret Injection
The BFF SHALL securely inject API keys or authorization tokens into outgoing proxy requests when operating in PROD mode, ensuring these secrets are never exposed to the frontend.

#### Scenario: Proxying a request
- **WHEN** the frontend requests data through the BFF in PROD mode
- **THEN** the BFF intercepts the request, appends the secure `Authorization` header utilizing backend environment variables, and forwards the request to the real API
