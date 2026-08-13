# Ci Cd Pipelines Specification

## Purpose

CI path adaptation for the monorepo layout, and the CD deployment step.

## Requirements

### Requirement: CI Pipeline Path Adaptation
The continuous integration pipeline SHALL target the new `apps/frontend/` directory for all build, lint, and test steps.

#### Scenario: CI test execution
- **WHEN** the CI pipeline triggers on a pull request
- **THEN** it navigates to `apps/frontend/` to run `vitest` and `eslint`/`vue-tsc` checks successfully.

### Requirement: CD Pipeline Deployment
The continuous deployment pipeline SHALL build the frontend application from its new location and deploy the resulting artifacts.

#### Scenario: Production build and deploy
- **WHEN** a release is triggered
- **THEN** the pipeline runs `pnpm build` within `apps/frontend/` and deploys the generated `dist/` directory correctly.
