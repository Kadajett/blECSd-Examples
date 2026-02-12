/**
 * Database CRUD operations for all tables.
 *
 * @module agent-orchestrator/db/operations
 */

import type Database from 'better-sqlite3';
import type {
	SharedContextEntry,
	AgentOutputEntry,
	RagDocument,
	AgentSession,
} from '../types.js';

// =============================================================================
// SHARED CONTEXT
// =============================================================================

/**
 * Set a shared context entry (upsert).
 *
 * @param db - SQLite database instance
 * @param key - Context key
 * @param value - Context value
 * @param tags - Space-separated tags
 * @param agentId - Agent ID that set this context
 */
export function setSharedContext(
	db: Database.Database,
	key: string,
	value: string,
	tags: string,
	agentId: string,
): void {
	const stmt = db.prepare(`
    INSERT INTO shared_context (key, value, tags, agent_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      tags = excluded.tags,
      agent_id = excluded.agent_id,
      updated_at = datetime('now')
  `);

	stmt.run(key, value, tags, agentId);
}

/**
 * Get a shared context entry by key.
 *
 * @param db - SQLite database instance
 * @param key - Context key
 * @returns Context entry or undefined if not found
 */
export function getSharedContext(
	db: Database.Database,
	key: string,
): SharedContextEntry | undefined {
	const stmt = db.prepare('SELECT * FROM shared_context WHERE key = ?');
	const row = stmt.get(key) as SharedContextEntry | undefined;
	return row;
}

/**
 * List all shared context entries, optionally filtered by tag.
 *
 * @param db - SQLite database instance
 * @param tag - Optional tag to filter by
 * @returns Array of context entries
 */
export function listSharedContext(
	db: Database.Database,
	tag?: string,
): SharedContextEntry[] {
	if (tag === undefined) {
		const stmt = db.prepare('SELECT * FROM shared_context ORDER BY updated_at DESC');
		return stmt.all() as SharedContextEntry[];
	}

	const stmt = db.prepare('SELECT * FROM shared_context WHERE tags LIKE ? ORDER BY updated_at DESC');
	return stmt.all(`%${tag}%`) as SharedContextEntry[];
}

/**
 * Deletes a shared context entry by key.
 *
 * @param db - SQLite database instance
 * @param key - Context key to delete
 * @returns True if a row was deleted, false if key did not exist
 */
export function deleteSharedContext(
	db: Database.Database,
	key: string,
): boolean {
	const stmt = db.prepare('DELETE FROM shared_context WHERE key = ?');
	const result = stmt.run(key);
	return result.changes > 0;
}

// =============================================================================
// AGENT OUTPUT
// =============================================================================

/**
 * Log an agent output line.
 *
 * @param db - SQLite database instance
 * @param agentId - Agent ID
 * @param line - Output line text
 */
export function logAgentOutput(
	db: Database.Database,
	agentId: string,
	line: string,
): void {
	const stmt = db.prepare('INSERT INTO agent_output (agent_id, line) VALUES (?, ?)');
	stmt.run(agentId, line);
}

/**
 * Get recent agent output lines.
 *
 * @param db - SQLite database instance
 * @param agentId - Agent ID
 * @param limit - Maximum number of lines to return (default 100)
 * @returns Array of output entries
 */
export function getAgentOutput(
	db: Database.Database,
	agentId: string,
	limit = 100,
): AgentOutputEntry[] {
	const stmt = db.prepare(`
    SELECT * FROM agent_output
    WHERE agent_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);

	return stmt.all(agentId, limit) as AgentOutputEntry[];
}

/**
 * Get agent output since a given ID (for RAG ingestion).
 *
 * @param db - SQLite database instance
 * @param agentId - Agent ID
 * @param sinceId - Last processed output ID
 * @returns Array of output entries
 */
export function getUnprocessedOutput(
	db: Database.Database,
	agentId: string,
	sinceId: number,
): AgentOutputEntry[] {
	const stmt = db.prepare(`
    SELECT * FROM agent_output
    WHERE agent_id = ? AND id > ?
    ORDER BY id ASC
  `);

	return stmt.all(agentId, sinceId) as AgentOutputEntry[];
}

// =============================================================================
// RAG DOCUMENTS
// =============================================================================

/**
 * Insert a RAG document chunk.
 *
 * @param db - SQLite database instance
 * @param sourceAgentId - Agent ID that produced this chunk
 * @param chunk - Text chunk
 * @param tokens - JSON-serialized token array
 */
export function insertRagDocument(
	db: Database.Database,
	sourceAgentId: string,
	chunk: string,
	tokens: string,
): void {
	const stmt = db.prepare(`
    INSERT INTO rag_documents (source_agent_id, chunk, tokens)
    VALUES (?, ?, ?)
  `);

	stmt.run(sourceAgentId, chunk, tokens);
}

/**
 * Get total RAG document count.
 *
 * @param db - SQLite database instance
 * @returns Total number of RAG documents
 */
export function getRagDocumentCount(db: Database.Database): number {
	const stmt = db.prepare('SELECT COUNT(*) as count FROM rag_documents');
	const row = stmt.get() as { count: number } | undefined;
	return row?.count ?? 0;
}

/**
 * Get all RAG documents (for in-memory index rebuild).
 *
 * @param db - SQLite database instance
 * @returns Array of all RAG documents
 */
export function getAllRagDocuments(db: Database.Database): RagDocument[] {
	const stmt = db.prepare('SELECT * FROM rag_documents ORDER BY id ASC');
	return stmt.all() as RagDocument[];
}

// =============================================================================
// PINNED DOCUMENTS
// =============================================================================

/**
 * Pin a RAG document.
 *
 * @param db - SQLite database instance
 * @param docId - RAG document ID to pin
 */
export function pinDocument(db: Database.Database, docId: number): void {
	const stmt = db.prepare(`
    INSERT OR IGNORE INTO pinned_documents (doc_id)
    VALUES (?)
  `);
	stmt.run(docId);
}

/**
 * Unpin a RAG document.
 *
 * @param db - SQLite database instance
 * @param docId - RAG document ID to unpin
 */
export function unpinDocument(db: Database.Database, docId: number): void {
	const stmt = db.prepare('DELETE FROM pinned_documents WHERE doc_id = ?');
	stmt.run(docId);
}

/**
 * Get all pinned document IDs.
 *
 * @param db - SQLite database instance
 * @returns Set of pinned document IDs
 */
export function getPinnedDocumentIds(db: Database.Database): Set<number> {
	const stmt = db.prepare('SELECT doc_id FROM pinned_documents');
	const rows = stmt.all() as Array<{ doc_id: number }>;
	return new Set(rows.map((r) => r.doc_id));
}

/**
 * Get RAG documents with pinned status, pinned items first.
 *
 * @param db - SQLite database instance
 * @param limit - Maximum documents to return
 * @param offset - Offset for pagination
 * @returns Array of RAG documents with pinned flag
 */
export function getRagDocumentsWithPins(
	db: Database.Database,
	limit = 100,
	offset = 0,
): Array<RagDocument & { pinned: boolean }> {
	const stmt = db.prepare(`
    SELECT r.*, CASE WHEN p.doc_id IS NOT NULL THEN 1 ELSE 0 END as pinned
    FROM rag_documents r
    LEFT JOIN pinned_documents p ON r.id = p.doc_id
    ORDER BY pinned DESC, r.id DESC
    LIMIT ? OFFSET ?
  `);

	return stmt.all(limit, offset) as Array<RagDocument & { pinned: boolean }>;
}

// =============================================================================
// AGENT SESSIONS
// =============================================================================

/**
 * Start a new agent session.
 *
 * @param db - SQLite database instance
 * @param agentId - Agent ID
 * @param kind - Agent kind
 * @param label - Agent label
 * @returns Session ID
 */
export function startAgentSession(
	db: Database.Database,
	agentId: string,
	kind: string,
	label: string,
): number {
	const stmt = db.prepare(`
    INSERT INTO agent_sessions (agent_id, kind, label)
    VALUES (?, ?, ?)
  `);

	const result = stmt.run(agentId, kind, label);
	return result.lastInsertRowid as number;
}

/**
 * End an agent session.
 *
 * @param db - SQLite database instance
 * @param sessionId - Session ID
 * @param status - Final session status
 */
export function endAgentSession(
	db: Database.Database,
	sessionId: number,
	status: string,
): void {
	const stmt = db.prepare(`
    UPDATE agent_sessions
    SET ended_at = datetime('now'), status = ?
    WHERE id = ?
  `);

	stmt.run(status, sessionId);
}
