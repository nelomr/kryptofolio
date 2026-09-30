---
"@kryptofolio/frontend": patch
"@kryptofolio/backend": patch
"@kryptofolio/database": patch
"@kryptofolio/shared-types": patch
"@kryptofolio/core-domain": patch
---

Begin the AI portfolio advisor (Phase 0): install the Mastra/Ollama dependencies behind the backend-only AI subtree, widen the vault provider registry with a discriminated exchange/market-data/ai-model category so AI providers can register through the existing encrypted credentials path, and add the `ai_advisor_runs` audit-trail migration that records which model and tools a run used without ever storing conversation content.
