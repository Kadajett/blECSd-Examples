// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryDepsHolder, createToolHandlers, getToolDefinitions } from './tools.js';
import { openDatabase, closeDatabase } from '../db/connection.js';
import * as dbOps from '../db/operations.js';
import * as ragOps from '../db/rag.js';
import type { PaneBackend } from '../backend/interface.js';

function createBackend(): PaneBackend {
	const panes = [
		{ id: 'orch', label: 'Orchestrator', kind: 'claude', status: 'running', width: 100, height: 40, isOrchestrator: true },
		{ id: 'w1', label: 'Worker 1', kind: 'claude', status: 'running', width: 50, height: 40, isOrchestrator: false },
	] as const;

	return {
		sendInput: vi.fn(),
		sendEnter: vi.fn(),
		sendPrompt: vi.fn(),
		updatePaneTask: vi.fn(),
		captureOutput: vi.fn(() => 'captured output'),
		listPanes: vi.fn(() => panes),
		addPane: vi.fn(() => 'w2'),
		removePane: vi.fn(),
		resizePane: vi.fn(),
		findPaneByName: vi.fn((name: string) => (name === 'Worker 1' ? 'w1' : undefined)),
	};
}

describe('mcp/tools', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('getToolDefinitions exposes expected tool names', () => {
		const names = getToolDefinitions().map((t) => t.name);
		expect(names).toEqual([
			'send_prompt',
			'update_agent_task',
			'read_output',
			'list_panes',
			'add_worker',
			'remove_worker',
			'restart_worker',
			'send_ctrl_c',
			'shutdown_all',
			'query_memory',
			'write_memory',
			'list_memories',
			'get_memory',
			'delete_memory',
			'pin_document',
			'unpin_document',
			'list_pinned',
		]);
	});

	it('pane handlers call backend methods correctly', async () => {
		const backend = createBackend();
		const handlers = createToolHandlers(backend, 'orch');
		const sendPrompt = handlers.get('send_prompt');
		const updateAgentTask = handlers.get('update_agent_task');
		const listPanes = handlers.get('list_panes');
		const readOutput = handlers.get('read_output');
		const addWorker = handlers.get('add_worker');
		const removeWorker = handlers.get('remove_worker');
		const restartWorker = handlers.get('restart_worker');
		const sendCtrlC = handlers.get('send_ctrl_c');
		const shutdownAll = handlers.get('shutdown_all');
		if (!sendPrompt || !updateAgentTask || !listPanes || !readOutput || !addWorker || !removeWorker || !restartWorker || !sendCtrlC || !shutdownAll) {
			throw new Error('missing handlers');
		}

		expect(sendPrompt({ pane: 'w1', text: 'hello' })).toEqual({ success: true, pane: 'w1', sent: '5 chars' });
		expect((backend.sendPrompt as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['w1', 'hello']);
		expect((backend.updatePaneTask as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(['w1', 'hello']);

		expect(updateAgentTask({ pane: 'w1', task: 'Review PR #42' })).toEqual({
			success: true,
			pane: 'w1',
			task: 'Review PR #42',
		});
		expect((backend.updatePaneTask as ReturnType<typeof vi.fn>).mock.calls[1]).toEqual(['w1', 'Review PR #42']);

		expect(readOutput({ pane: 'w1' })).toEqual({ success: true, pane: 'w1', output: 'captured output' });
		expect(listPanes({})).toMatchObject({ success: true });

		const addRes = await addWorker({ agent: 'codex', workspace: '/tmp/ws', mock: true, name: 'Worker 2' });
		expect(addRes).toMatchObject({ success: true, pane: 'w2', agent: 'codex', name: 'Worker 2' });

		const removeRes = await removeWorker({ name: 'Worker 1' });
		expect(removeRes).toEqual({ success: true, pane: 'w1', name: 'Worker 1' });

		expect(restartWorker({ pane: 'w1', agent: 'gemini' })).toMatchObject({ success: true, old_pane: 'w1', new_pane: 'w2', agent: 'gemini' });
		expect(sendCtrlC({ pane: 'w1' })).toEqual({ success: true, pane: 'w1' });

		const shutdownPromise = shutdownAll({}) as Promise<unknown>;
		await vi.advanceTimersByTimeAsync(1000);
		const shut = await shutdownPromise;
		expect(shut).toEqual({ success: true, killed: ['w1'] });
	});

	it('memory handlers operate with sqlite-backed shared context and rag index', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'orchestrator-mcp-tools-'));
		const dbPath = join(tempDir, 'test.db');
		const db = openDatabase(dbPath);
		const ragIndex = ragOps.createRagIndex();
		ragOps.addDocumentToIndex(ragIndex, 1, 'agent-1', 'vitest integration memory signal');
		ragOps.addDocumentToIndex(ragIndex, 2, 'agent-2', 'totally different context');
		ragOps.addDocumentToIndex(ragIndex, 3, 'agent-3', 'another unrelated document body');

		const holder = createMemoryDepsHolder();
		holder.deps = { db, ragIndex, dbOps, ragOps };

		const handlers = createToolHandlers(createBackend(), 'orch', holder);
		const writeMemory = handlers.get('write_memory');
		const getMemory = handlers.get('get_memory');
		const listMemories = handlers.get('list_memories');
		const queryMemory = handlers.get('query_memory');
		const deleteMemory = handlers.get('delete_memory');
		if (!writeMemory || !getMemory || !listMemories || !queryMemory || !deleteMemory) {
			throw new Error('missing memory handlers');
		}

		expect(writeMemory({ key: 'k1', value: 'v1', tags: 'tag1 tag2', agent_id: 'worker-2' }))
			.toEqual({ success: true, key: 'k1' });

		expect(getMemory({ key: 'k1' })).toMatchObject({
			success: true,
			key: 'k1',
			value: 'v1',
			tags: 'tag1 tag2',
		});

		expect(listMemories({ tag: 'tag1', limit: 10 })).toMatchObject({ success: true });
		const query = queryMemory({ query: 'vitest', limit: 5 }) as { success: boolean; results: unknown[] };
		expect(query.success).toBe(true);
		expect(query.results.length).toBeGreaterThan(0);

		expect(deleteMemory({ key: 'k1' })).toEqual({ success: true, key: 'k1', deleted: true });

		closeDatabase(db);
		rmSync(tempDir, { recursive: true, force: true });
	});
});
