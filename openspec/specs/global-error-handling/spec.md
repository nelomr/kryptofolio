# global-error-handling Specification

## Purpose
TBD - created by archiving change hex-arch-zod-refactor. Update Purpose after archive.
## Requirements
### Requirement: Global error notification for validation failures
The system SHALL intercept Zod `safeParse` failures in the adapters and trigger a global error notification (e.g., a Toast) to inform the user of the data corruption. The Toast SHALL render as a fixed-position overlay above page content, outside the normal document flow, so it neither adds to document height nor causes page scroll.

#### Scenario: Malformed external data received
- **WHEN** the external API returns data that fails the Zod schema validation
- **THEN** the `RestCryptoAdapter` logs the specific validation errors to the console
- **AND** a global Toast notification (built strictly following `shadcn-vue` guidelines) is displayed indicating that external data was malformed
- **AND** the application state does not crash, returning a safe fallback or throwing a controlled domain error that the store catches

#### Scenario: Toast renders as a floating overlay, not in document flow
- **WHEN** a global Toast notification is triggered, whether for a validation failure or any other event that raises one (e.g. a settings save confirmation)
- **THEN** the Toast container is rendered with fixed positioning above the page's visible content
- **AND** the Toast container does not occupy space in the normal document flow
- **AND** the page's total document height and scroll state are unaffected by the Toast being shown, dismissed, or stacked with other Toasts

