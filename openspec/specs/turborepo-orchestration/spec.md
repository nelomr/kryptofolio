## ADDED Requirements

### Requirement: Workspace DAG Orchestration
The monorepo SHALL utilize Turborepo to define the task dependency graph (DAG), ensuring that internal packages (e.g., `@kryptofolio/database`, `@kryptofolio/core-domain`) are built before the applications that consume them.

#### Scenario: Running workspace build
- **WHEN** the `turbo run build` command is executed
- **THEN** it must compile dependencies first (`^build`), followed by the frontend and backend applications, in parallel where possible.

### Requirement: CI/CD Caching
The continuous integration pipeline SHALL cache Turborepo artifacts between runs to minimize execution time on unchanged modules.

#### Scenario: Pull Request verification
- **GIVEN** a previous successful CI run on the `main` branch
- **WHEN** a new commit only modifies the `apps/frontend` package
- **THEN** the CI pipeline restores the `.turbo` cache, instantly skips the build and test tasks for `packages/core-domain` and `apps/backend`, and only executes checks for the frontend.
