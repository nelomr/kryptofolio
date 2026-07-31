/**
 * Tests apply migrations through the same runner production uses, so "does this migration apply
 * cleanly?" is never answered by a second implementation that happens to agree.
 */
export {
  applyMigrations,
  migrationFiles,
  readMigration,
  MIGRATIONS_DIR,
} from '../../src/sqlite/migrations.js';
