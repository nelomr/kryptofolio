-- Migration: 010_nullable_advisor_execution_profile.sql
--
-- Makes `ai_advisor_runs.execution_profile` nullable. 009 declared it NOT NULL on the assumption
-- that a resolved profile always exists before a row is ever written — true for every terminal
-- outcome (`completed`/`refused`/`failed`), but not for `aborted`: that row is written by the
-- caller's own cleanup path around an iteration that never produced a terminal event, so it never
-- learns which profile (if any) was resolved for the run it is closing out. Recording a guessed
-- value here would misstate the audit trail the same way an invented provider or model id would —
-- 009's own `provider_id`/`model_id` are already nullable for exactly that reason.
--
-- SQLite cannot drop a NOT NULL via ALTER, so the table is rebuilt exactly as `005` rebuilt its own
-- predecessor to loosen a constraint. CLEAN SLATE for the same reason `005` was: the project has no
-- production deployment yet, and this table currently holds no rows worth preserving.

DROP TABLE IF EXISTS ai_advisor_runs;

CREATE TABLE ai_advisor_runs (
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
    execution_profile TEXT CHECK (execution_profile IS NULL OR execution_profile IN ('local','metered','mixed')),
    steps_used        INTEGER,
    max_steps         INTEGER
) STRICT;
