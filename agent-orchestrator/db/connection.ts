/**
 * Database connection management.
 *
 * @module agent-orchestrator/db/connection
 */

import Database from 'better-sqlite3';
import { createSchema } from './schema.js';

/**
 * Open or create a SQLite database with WAL mode enabled.
 *
 * @param dbPath - Path to the SQLite database file
 * @returns SQLite database instance
 *
 * @example
 * ```typescript
 * import { openDatabase } from './db/connection.js';
 * const db = openDatabase('./orchestrator.db');
 * ```
 */
export function openDatabase(dbPath: string): Database.Database {
	const db = new Database(dbPath);

	// Enable WAL mode for better concurrency
	db.pragma('journal_mode = WAL');

	// Set busy timeout to 5 seconds
	db.pragma('busy_timeout = 5000');

	// Create schema if it doesn't exist
	createSchema(db);

	return db;
}

/**
 * Close the database connection.
 *
 * @param db - SQLite database instance
 */
export function closeDatabase(db: Database.Database): void {
	db.close();
}
