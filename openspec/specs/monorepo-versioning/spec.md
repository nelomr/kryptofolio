## ADDED Requirements

### Requirement: Independent Package Versioning
The system SHALL support versioning each workspace package independently, rather than keeping them in sync automatically.

#### Scenario: Backend changes only
- **WHEN** a developer merges a PR that only modifies `apps/backend` and includes a `minor` changeset for the backend
- **THEN** the CI action bumps the backend version and publishes it, leaving the frontend version untouched.

### Requirement: Automatic Changesets Release
The system SHALL automatically version, commit to `main`, and publish the packages when a changeset is merged into `main`, without requiring manual PR approval.

#### Scenario: Merging a feature with changeset
- **WHEN** a developer merges a feature PR to `main` containing a `.changeset/*.md` file
- **THEN** the `release.yml` GitHub Action consumes the changeset, updates `package.json` files, creates a direct commit to `main` with the version bumps, and publishes the packages.

### Requirement: Frontend Version as Global Version
The system SHALL consider the `@kryptofolio/frontend` version as the de facto global application version.

#### Scenario: Releasing a new frontend version
- **WHEN** the frontend package version is bumped
- **THEN** the version number should reflect the current overall stage of the application (e.g., growing slowly during initial phases using `patch` and `minor` bumps).

### Requirement: AI Agent Workflow Automation
The AI Agent SHALL automatically generate a changeset whenever requested to "add to git and create a professional commit" if packages were modified.

#### Scenario: User requests a commit
- **WHEN** the user asks the agent to create a commit and changes were made to workspace packages
- **THEN** the agent automatically creates a `.changeset` markdown file detailing the change (patch/minor/major) BEFORE creating the git commit, ensuring the changeset is included in the commit.

### Requirement: Documentation Truthfulness
The system's documentation (e.g. `README.md`) SHALL accurately reflect the current versioning strategy, with zero references to the deprecated `semantic-release` tool.

#### Scenario: Onboarding a new developer
- **WHEN** a new developer reads the main `README.md` to understand how to release
- **THEN** they see explicit instructions that explain the "Frontend is King" versioning philosophy and how to use `pnpm changeset`.
