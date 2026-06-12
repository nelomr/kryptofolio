## Context

The application needs its logos and favicon updated to match the latest branding provided by the design team (`screen-tp.png` and `favicon.png`).

## Goals / Non-Goals

**Goals:**
- Replace the existing favicon with `favicon.png` across the application so that it appears in browser tabs.
- Replace the existing logo assets with `screen-tp.png` so that the new logo is displayed in the UI.
- Ensure the assets are bundled correctly when compiling the frontend.

**Non-Goals:**
- Redesigning the entire UI layout.
- Changing colors beyond the image replacements.

## Decisions

- **Asset Replacement**: The new `favicon.png` will be copied to `apps/frontend/public/` (or `apps/frontend/src/assets/`), and `index.html` will be updated to point to the correct `.png` file with the correct MIME type. 
- **Logo Updates**: The new `screen-tp.png` will replace the existing logo image used in UI components. We will update references in components that import the old logo.

## Risks / Trade-offs

- **[Caching]** → Browsers might aggressively cache the old favicon. Mitigation: We might need to implement cache busting (e.g., adding a query string like `?v=2` to the favicon URL in `index.html` or letting Vite handle hash generation) to ensure users see the new favicon immediately.

## Migration Plan

- Copy the new image assets to the repository.
- Remove old image assets if no longer used.
- Update references in `index.html` and UI components.
- Verify locally that the new branding appears.

## Open Questions

- None at the moment.
