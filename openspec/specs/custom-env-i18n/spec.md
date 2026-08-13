# Custom Env I18N Specification

## Purpose

Translation by text key, and selecting the language from the environment.

## Requirements

### Requirement: Text Key Translation
The system MUST provide an interface (I18nPort) to translate text keys (e.g., "dashboard.title") to their corresponding string in the configured language, supporting basic interpolation.

#### Scenario: Successful Translation without Parameters
- **WHEN** a Vue component calls `t('dashboard.title')` and it exists in the dictionary.
- **THEN** the system returns the corresponding translated string, for example, "Dashboard".

#### Scenario: Translation with Interpolated Parameters
- **WHEN** a Vue component calls `t('greeting.user', { name: 'Nelo' })` and the dictionary has `"greeting.user": "Hello {name}"`
- **THEN** the system returns "Hello Nelo".

#### Scenario: Missing Key (Missing Translation)
- **WHEN** a component calls `t('key.does.not.exist')` and it is not in the loaded dictionary.
- **THEN** the system returns the same key "key.does.not.exist" and may log an internal warning (does not break the application).

### Requirement: Environment-Based Language Selection
The system MUST inject and use the language defined in the build environment variable `VITE_APP_LANG` (or similar) at bootstrap time, so that the entire client application is rendered in that single configured language without requiring dynamic user selection.

#### Scenario: Application Initialization in Spanish
- **WHEN** the project is built/run with `VITE_APP_LANG=es`
- **THEN** the `EnvI18nAdapter` adapter loads the `es.ts` dictionary and injects it as a dependency for the global translation function.

#### Scenario: Fallback to a Default Language
- **WHEN** the `VITE_APP_LANG` variable is not defined or contains an unsupported code (e.g., `fr`)
- **THEN** the `EnvI18nAdapter` adapter will load the default language (e.g., `en.ts`).
