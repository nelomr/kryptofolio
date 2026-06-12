## Why

We need to update the application's visual branding to match the latest design assets provided by the design team. Replacing the current logos and favicons with the new assets (`screen-tp.png` and `favicon.png`) ensures brand consistency across the user interface and browser tabs.

## What Changes

- Replace the main application logo with the new `screen-tp.png`.
- Replace the application favicon with the new `favicon.png`.
- Update the build and public assets configuration to correctly serve and bundle the new favicon and logos for production.

## Capabilities

### New Capabilities

### Modified Capabilities
- `project-branding`: Update the application logos and favicon to match new visual identity.

## Impact

- `apps/frontend/public/` and `apps/frontend/src/assets/` directories where image assets reside.
- `index.html` referencing the favicon.
- Any UI components (like headers or sidebars) that display the application logo.
