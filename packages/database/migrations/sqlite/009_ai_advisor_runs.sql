-- Audit trail for AI advisor runs. Records provenance only — which model and tools a
-- run used, and at what token/step cost — never conversation content. Conversation content lives
-- exclusively in the disposable ai-advisor.db (Mastra Memory store).
CREATE TABLE IF NOT EXISTS ai_advisor_runs (
    id                TEXT PRIMARY KEY,
    thread_id         TEXT NOT NULL,
    started_at        TEXT NOT NULL,
    finished_at       TEXT,
    outcome           TEXT NOT NULL CHECK (outcome IN ('completed','refused','failed','aborted')),
    provider_id       TEXT,
    model_id          TEXT,
    tools_called      TEXT NOT NULL DEFAULT '[]',
    input_tokens      INTEGER,
    output_tokens     INTEGER,
    failure_code      TEXT,
    execution_profile TEXT NOT NULL CHECK (execution_profile IN ('local','metered','mixed')),
    steps_used        INTEGER,
    max_steps         INTEGER
) STRICT;
