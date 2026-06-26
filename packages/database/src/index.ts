// Public API for @kryptofolio/database
// Re-exports the generic Port interface so apps/backend can depend on it
// without knowing the concrete implementations.
export type { IDatabasePort } from "./ports/IDatabasePort.js";
export { NodeSqliteAdapter } from "./adapters/NodeSqliteAdapter.js";
export { DuckDbAdapter } from "./adapters/DuckDbAdapter.js";
export { getLedgerDb, closeLedgerDb } from "./sqlite/connection.js";
