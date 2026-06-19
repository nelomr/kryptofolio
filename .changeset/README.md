# Kryptofolio Changesets & Release Management

This directory contains `changeset` files which dictate how the packages in the Kryptofolio monorepo are versioned and released.

We use [@changesets/cli](https://github.com/changesets/changesets) combined with GitHub Actions to automate versioning, changelog generation, and tagging releases directly to `main`.

## 🎯 "Frontend is King" Philosophy

To prevent an uncontrolled explosion of semantic versions and maintain a clear product timeline, Kryptofolio strictly adheres to the **"Frontend is King"** philosophy:
- The `@kryptofolio/frontend` version acts as the *de facto* global application version.
- **Maintain Low Version Velocity**: We strictly prefer `patch` bumps over `minor` bumps for standard features unless they are critical, breaking, or introduce major architectural shifts.

## 📝 How to Create a Changeset

When you implement a `feat` or a `fix`, you must include a changeset file alongside your code changes so the CI/CD pipeline knows how to bump the version during the next automated release.

You can create a changeset by either:

1. **Interactive CLI:** Running `pnpm changeset` at the root of the project and following the prompts.
2. **Manual File:** Creating a Markdown file (e.g., `feature-name.md`) directly in the `.changeset/` folder.

**Manual File Example:**
```markdown
---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
---

Added real-time currency converter to the settings view.
```

## 🚫 When NOT to use a Changeset (Silent Changes)

Do NOT create a changeset if your commit does not affect the final product features or fix bugs. Changes that don't warrant a release bump include:

- `docs:` (Documentation, READMEs, architecture files)
- `refactor:` (Code restructuring without altering business logic)
- `test:` (Adding or fixing unit/E2E tests)
- `chore:` (Tooling, build pipelines, package updates)
- `style:` (Linting, formatting)
- `perf:` (Performance optimizations, unless they fix a user-facing issue)

Always ensure your commit prefix aligns with your changeset decision.
