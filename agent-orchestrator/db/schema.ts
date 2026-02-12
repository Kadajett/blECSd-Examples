/**
 * SQLite database schema for agent orchestration.
 *
 * @module agent-orchestrator/db/schema
 */

import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
-- Shared context entries between agents
CREATE TABLE IF NOT EXISTS shared_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent output logs
CREATE TABLE IF NOT EXISTS agent_output (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  line TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RAG document chunks
CREATE TABLE IF NOT EXISTS rag_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_agent_id TEXT NOT NULL,
  chunk TEXT NOT NULL,
  tokens TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agent session records
CREATE TABLE IF NOT EXISTS agent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

-- Pinned RAG documents
CREATE TABLE IF NOT EXISTS pinned_documents (
  doc_id INTEGER PRIMARY KEY,
  pinned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shared_context_agent ON shared_context(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_output_agent ON agent_output(agent_id);
CREATE INDEX IF NOT EXISTS idx_rag_documents_agent ON rag_documents(source_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_output_timestamp ON agent_output(timestamp);
`;

/**
 * Create the database schema and indexes.
 *
 * @param db - SQLite database instance
 */
export function createSchema(db: Database.Database): void {
	db.exec(SCHEMA_SQL);
}
