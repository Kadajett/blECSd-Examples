// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, closeDatabase } from './connection.js';
import {
	insertRagDocument,
	pinDocument,
	unpinDocument,
	getPinnedDocumentIds,
	getRagDocumentsWithPins,
	setSharedContext,
	getSharedContext,
	listSharedContext,
} from './operations.js';

describe('db/operations pinned documents + shared context', () => {
	it('pins, unpins, and lists pinned document ids and pinned ordering', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'orchestrator-ops-'));
		const dbPath = join(tempDir, 'ops.db');
		const db = openDatabase(dbPath);

		insertRagDocument(db, 'agent-a', 'chunk one', '["one"]'); // id 1
		insertRagDocument(db, 'agent-b', 'chunk two', '["two"]'); // id 2
		insertRagDocument(db, 'agent-c', 'chunk three', '["three"]'); // id 3

		pinDocument(db, 1);
		pinDocument(db, 3);
		pinDocument(db, 3); // idempotent via INSERT OR IGNORE

		const pinned = getPinnedDocumentIds(db);
		expect(pinned.has(1)).toBe(true);
		expect(pinned.has(3)).toBe(true);
		expect(pinned.size).toBe(2);

		const docs = getRagDocumentsWithPins(db, 10, 0);
		expect(docs).toHaveLength(3);
		// Pinned first, descending by rag doc ID
		expect(docs[0]?.id).toBe(3);
		expect(Number(docs[0]?.pinned)).toBe(1);
		expect(docs[1]?.id).toBe(1);
		expect(Number(docs[1]?.pinned)).toBe(1);
		expect(docs[2]?.id).toBe(2);
		expect(Number(docs[2]?.pinned)).toBe(0);

		unpinDocument(db, 1);
		const afterUnpin = getPinnedDocumentIds(db);
		expect(afterUnpin.has(1)).toBe(false);
		expect(afterUnpin.has(3)).toBe(true);
		expect(afterUnpin.size).toBe(1);

		closeDatabase(db);
		rmSync(tempDir, { recursive: true, force: true });
	});

	it('setSharedContext upserts and listSharedContext filters by tag', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'orchestrator-ctx-'));
		const dbPath = join(tempDir, 'ctx.db');
		const db = openDatabase(dbPath);

		setSharedContext(db, 'k1', 'v1', 'alpha beta', 'agent-1');
		setSharedContext(db, 'k2', 'v2', 'beta', 'agent-2');
		setSharedContext(db, 'k3', 'v3', 'gamma', 'agent-3');

		setSharedContext(db, 'k1', 'v1-updated', 'alpha', 'agent-9');

		const k1 = getSharedContext(db, 'k1');
		expect(k1?.value).toBe('v1-updated');
		expect(k1?.tags).toBe('alpha');
		const rawK1 = db.prepare('SELECT agent_id FROM shared_context WHERE key = ?').get('k1') as { agent_id: string } | undefined;
		expect(rawK1?.agent_id).toBe('agent-9');

		const beta = listSharedContext(db, 'beta');
		const betaKeys = new Set(beta.map((e) => e.key));
		expect(betaKeys.has('k2')).toBe(true);
		expect(betaKeys.has('k1')).toBe(false);

		const all = listSharedContext(db);
		expect(all.length).toBe(3);

		closeDatabase(db);
		rmSync(tempDir, { recursive: true, force: true });
	});
});
