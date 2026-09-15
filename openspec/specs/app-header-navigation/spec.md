# app-header-navigation Specification

## Purpose

Defines the top navigation bar layout, brand identity presentation, primary workspace navigation tabs, and decoupled utility actions for the Kryptofolio institutional terminal.
## Requirements
### Requirement: Minimalist Institutional Header Layout
The system SHALL render `AppHeader.vue` with a compact fixed height of 56px (`h-14`), pinned to the top of the viewport with a blurred translucent background and subtle hairline bottom border.

#### Scenario: Sticky Header Rendering
- **WHEN** any page within the dashboard is rendered
- **THEN** the header is fixed at the top with `sticky top-0 z-50`
- **AND** the background displays `bg-background/80 backdrop-blur-md border-b border-border-soft`
- **AND** the internal container is horizontally centered with `max-w-[1600px]` and vertical height `h-14`

### Requirement: Brand Identity Presentation
The system SHALL display the application brand identity on the left side of the header, featuring the geometric dragon mark and high-contrast wordmark without extraneous badges or subtitles.

#### Scenario: Brand Element Layout
- **WHEN** the header is viewed
- **THEN** the dragon logo from `favicon.svg` or `favicon.png` renders at 28px (`h-7 w-7`) without drop shadows
- **AND** the wordmark "Kryptofolio" renders immediately adjacent in `font-sans font-semibold text-[15px] tracking-tight text-foreground`
- **AND** no secondary subtitles, kicker badges, or monospace fonts are applied to the brand title

### Requirement: Primary View Navigation
The system SHALL display top-level workspace navigation tabs for Portfolio (`/`) and Tax Report (`/tax`) adjacent to the brand identity.

#### Scenario: Navigation Tab Presentation and Active State
- **WHEN** the user navigates between views
- **THEN** the active tab displays a subtle solid background (`bg-surface-3 border border-border-soft/80 shadow-sm text-foreground font-semibold`)
- **AND** the Portfolio tab (`/`) matches via `exact-active-class` while the Tax Report tab (`/tax`) matches via `active-class`
- **AND** inactive tabs display muted text (`text-muted`) with hover highlight (`hover:text-foreground hover:bg-surface-2`)
- **AND** each tab renders its corresponding Lucide icon (`PieChart` for Portfolio, `Landmark` for Tax) and localized title from `useI18n`

### Requirement: Decoupled Utility Actions
The system SHALL provide a dedicated utility action zone on the right side of the header, isolating the Settings navigation link from the primary analytical tabs.

#### Scenario: Settings Action Rendering
- **WHEN** viewing the right utility zone of the header
- **THEN** a standalone icon button renders containing the Lucide `Settings` icon
- **AND** clicking the button navigates to the `/settings` route
- **AND** hovering over the button highlights with `hover:bg-surface-2 hover:text-foreground`

