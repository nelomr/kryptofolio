# Monorepo Workspace Specification

## Purpose

Workspace initialisation, relocating the frontend into it, and the shared TypeScript configuration.

## Requirements

### Requirement: Workspace Initialization
The repository SHALL be configured as a pnpm workspace with an `apps/` and `packages/` directory structure.

#### Scenario: Running workspace install
- **WHEN** a developer runs `pnpm install` at the root
- **THEN** dependencies for all workspace projects (including `apps/frontend`) are successfully installed.

### Requirement: Frontend Relocation
The existing Vue+Vite frontend application SHALL reside entirely within the `apps/frontend/` directory.

#### Scenario: Running the frontend app
- **WHEN** a developer runs `pnpm run dev` inside `apps/frontend/`
- **THEN** the Vite development server starts without errors and serves the existing application.

### Requirement: Shared TypeScript Configuration
The repository SHALL provide a root-level `tsconfig.base.json` that defines common compiler options.

#### Scenario: Extending the base config
- **WHEN** a sub-package (like `apps/frontend`) extends the `tsconfig.base.json`
- **THEN** it inherits the base compiler options without needing to duplicate them.
