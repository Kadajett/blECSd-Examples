/**
 * MCP tool definitions backed by PaneBackend.
 *
 * Each tool delegates to the PaneBackend interface, which may be
 * backed by either tmux or blECSd terminals. Memory tools use the
 * SQLite database and in-memory RAG index directly.
 *
 * @module agent-orchestrator/mcp/tools
 */

import { z } from 'zod';
import type { McpToolDef } from '../types.js';
import type { PaneBackend } from '../backend/interface.js';

// =============================================================================
// ZOD INPUT SCHEMAS
// =============================================================================

const SendPromptInput = z.object({
	pane: z.string().min(1, 'Missing pane ID'),
	text: z.string().min(1, 'Missing text'),
});

const PaneIdInput = z.object({
	pane: z.string().min(1, 'Missing pane ID'),
});

const AddWorkerInput = z.object({
	agent: z.string().default('claude'),
	workspace: z.string().optional(),
	mock: z.boolean().optional().default(false),
	name: z.string().min(1).optional(),
	worktree: z.boolean().optional().default(false),
});

const RemoveWorkerInput = z.object({
	pane: z.string().optional().default(''),
	name: z.string().min(1).optional(),
	cleanup_worktree: z.boolean().optional().default(false),
});

const RestartWorkerInput = z.object({
	pane: z.string().min(1, 'Missing pane ID'),
	agent: z.string().optional().default('claude'),
});

const QueryMemoryInput = z.object({
	query: z.string().min(1, 'Missing query'),
	limit: z.number().int().positive().optional().default(10),
});

const WriteMemoryInput = z.object({
	key: z.string().min(1, 'Missing key'),
	value: z.string().min(1, 'Missing value'),
	tags: z.string().optional().default(''),
	agent_id: z.string().min(1).optional().default('orchestrator'),
});

const ListMemoriesInput = z.object({
	tag: z.string().optional(),
	limit: z.number().int().positive().optional().default(50),
});

const KeyInput = z.object({
	key: z.string().min(1, 'Missing key'),
});

const DocIdInput = z.object({
	doc_id: z.number().int().positive('Invalid doc_id'),
});

const ListPinnedInput = z.object({
	limit: z.number().int().positive().optional().default(50),
});

/**
 * Validates tool input with a Zod schema.
 * Returns parsed data on success, or a { success: false, error } response on failure.
 */
function validateInput<T>(
	schema: z.ZodType<T>,
	params: Record<string, unknown>,
): { ok: true; data: T } | { ok: false; error: { success: false; error: string } } {
	const result = schema.safeParse(params);
	if (result.success) {
		return { ok: true, data: result.data };
	}
	const firstIssue = result.error.issues[0];
	const message = firstIssue
		? `${firstIssue.path.join('.')}: ${firstIssue.message}`.replace(/^: /, '')
		: 'Invalid input';
	return { ok: false, error: { success: false, error: message } };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const PANE_TOOLS: readonly McpToolDef[] = [
	{
		name: 'send_prompt',
		description:
			'Send a prompt to a worker pane. Text is typed into the pane and Enter is pressed automatically.',
		inputSchema: {
			type: 'object',
			properties: {
				pane: { type: 'string', description: 'Pane ID. Use list_panes to find IDs.' },
				text: { type: 'string', description: 'The prompt text to send to the worker.' },
			},
			required: ['pane', 'text'],
		},
	},
	{
		name: 'read_output',
		description: 'Capture the current visible content of a pane.',
		inputSchema: {
			type: 'object',
			properties: {
				pane: { type: 'string', description: 'Pane ID.' },
			},
			required: ['pane'],
		},
	},
	{
		name: 'list_panes',
		description: 'List all panes with their ID, label, kind, status, and size.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'add_worker',
		description: 'Create a new worker pane and start an agent in it.',
		inputSchema: {
			type: 'object',
			properties: {
				agent: { type: 'string', description: 'Agent type: "claude", "codex", "gemini", or "custom:<command>".' },
				workspace: { type: 'string', description: 'Working directory. Defaults to orchestrator workspace.' },
				mock: { type: 'boolean', description: 'If true, spawn a mock bash shell.' },
				name: { type: 'string', description: 'Human-readable name for this worker.' },
				worktree: { type: 'boolean', description: 'If true, auto-create a git worktree for isolation.' },
			},
			required: ['agent'],
		},
	},
	{
		name: 'remove_worker',
		description: 'Kill a worker pane and remove it from the session.',
		inputSchema: {
			type: 'object',
			properties: {
				pane: { type: 'string', description: 'Pane ID to kill.' },
				name: { type: 'string', description: 'Worker name to find and kill, alternative to pane ID.' },
				cleanup_worktree: { type: 'boolean', description: 'If true, remove the git worktree.' },
			},
		},
	},
	{
		name: 'restart_worker',
		description: 'Restart a worker pane by killing it and spawning a fresh agent in a new pane',
		inputSchema: {
			type: 'object',
			properties: {
				pane: { type: 'string', description: 'Pane ID to restart.' },
				agent: { type: 'string', description: 'Agent type for the new pane. Defaults to "claude".' },
			},
			required: ['pane'],
		},
	},
	{
		name: 'send_ctrl_c',
		description: 'Send Ctrl+C (SIGINT) to a pane to interrupt a running process',
		inputSchema: {
			type: 'object',
			properties: {
				pane: { type: 'string', description: 'Pane ID.' },
			},
			required: ['pane'],
		},
	},
	{
		name: 'shutdown_all',
		description: 'Gracefully terminate all worker panes and clean up the session',
		inputSchema: { type: 'object', properties: {} },
	},
];

const MEMORY_TOOLS: readonly McpToolDef[] = [
	{
		name: 'query_memory',
		description: 'Search across RAG documents using TF-IDF similarity. Returns ranked results.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query text.' },
				limit: { type: 'number', description: 'Maximum results to return (default 10).' },
			},
			required: ['query'],
		},
	},
	{
		name: 'write_memory',
		description: 'Store a key-value entry in shared context. Other agents can read it.',
		inputSchema: {
			type: 'object',
			properties: {
				key: { type: 'string', description: 'Context key (unique identifier).' },
				value: { type: 'string', description: 'Context value to store.' },
				tags: { type: 'string', description: 'Space-separated tags for filtering.' },
				agent_id: { type: 'string', description: 'Agent ID of the writer. Defaults to "orchestrator".' },
			},
			required: ['key', 'value'],
		},
	},
	{
		name: 'list_memories',
		description: 'Browse shared context entries, optionally filtered by tag.',
		inputSchema: {
			type: 'object',
			properties: {
				tag: { type: 'string', description: 'Optional tag to filter by.' },
				limit: { type: 'number', description: 'Maximum entries to return (default 50).' },
			},
		},
	},
	{
		name: 'get_memory',
		description: 'Get a specific shared context value by key.',
		inputSchema: {
			type: 'object',
			properties: {
				key: { type: 'string', description: 'Context key to retrieve.' },
			},
			required: ['key'],
		},
	},
	{
		name: 'delete_memory',
		description: 'Delete a shared context entry by key.',
		inputSchema: {
			type: 'object',
			properties: {
				key: { type: 'string', description: 'Context key to delete.' },
			},
			required: ['key'],
		},
	},
	{
		name: 'pin_document',
		description: 'Pin a RAG document so it persists across sessions and appears at the top of memory.',
		inputSchema: {
			type: 'object',
			properties: {
				doc_id: { type: 'number', description: 'RAG document ID to pin.' },
			},
			required: ['doc_id'],
		},
	},
	{
		name: 'unpin_document',
		description: 'Unpin a previously pinned RAG document.',
		inputSchema: {
			type: 'object',
			properties: {
				doc_id: { type: 'number', description: 'RAG document ID to unpin.' },
			},
			required: ['doc_id'],
		},
	},
	{
		name: 'list_pinned',
		description: 'List all pinned RAG documents with their content.',
		inputSchema: {
			type: 'object',
			properties: {
				limit: { type: 'number', description: 'Maximum results to return (default 50).' },
			},
		},
	},
];

/** Returns the MCP tool definitions (pane + memory tools). */
export function getToolDefinitions(): readonly McpToolDef[] {
	return [...PANE_TOOLS, ...MEMORY_TOOLS];
}

// =============================================================================
// MEMORY DEPENDENCIES (mutable holder pattern)
// =============================================================================

/**
 * Database dependencies for memory tools.
 */
export interface MemoryDeps {
	readonly db: unknown; // BetterSqlite3.Database
	readonly ragIndex: unknown; // RagIndex
	readonly dbOps: typeof import('../db/operations.js');
	readonly ragOps: typeof import('../db/rag.js');
}

/**
 * Mutable holder for memory dependencies.
 * Allows the DB to be initialized after the MCP server starts.
 * Tool handlers read from holder.deps at call time (not capture time).
 */
export interface MemoryDepsHolder {
	deps: MemoryDeps | null;
}

/**
 * Creates a new empty memory deps holder.
 */
export function createMemoryDepsHolder(): MemoryDepsHolder {
	return { deps: null };
}

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/**
 * Creates a Map of tool-name -> handler-function.
 *
 * @param backend - The pane backend (tmux or blECSd)
 * @param orchestratorPaneId - The orchestrator pane ID (to prevent accidentally killing it)
 * @param memoryDepsHolder - Mutable holder for database dependencies (set after DB init)
 * @returns Map of tool handlers
 */
export function createToolHandlers(
	backend: PaneBackend,
	orchestratorPaneId: string,
	memoryDepsHolder?: MemoryDepsHolder,
): ReadonlyMap<string, (params: Record<string, unknown>) => unknown> {
	const handlers = new Map<string, (params: Record<string, unknown>) => unknown>();

	// -- Pane tools (Zod-validated) --

	handlers.set('send_prompt', (params) => {
		const v = validateInput(SendPromptInput, params);
		if (!v.ok) return v.error;
		backend.sendPrompt(v.data.pane, v.data.text);
		return { success: true, pane: v.data.pane, sent: `${v.data.text.length} chars` };
	});

	handlers.set('read_output', (params) => {
		const v = validateInput(PaneIdInput, params);
		if (!v.ok) return v.error;
		return { success: true, pane: v.data.pane, output: backend.captureOutput(v.data.pane) };
	});

	handlers.set('list_panes', () => {
		const panes = backend.listPanes();
		return {
			success: true,
			panes: panes.map((p) => ({
				id: p.id, label: p.label, kind: p.kind, status: p.status,
				size: `${p.width}x${p.height}`, is_orchestrator: p.isOrchestrator,
			})),
		};
	});

	handlers.set('add_worker', async (params) => {
		const v = validateInput(AddWorkerInput, params);
		if (!v.ok) return v.error;
		const { agent: agentKind, mock, name, worktree: useWorktree } = v.data;

		let workspace = v.data.workspace ?? '';
		let worktreePath: string | undefined;

		if (useWorktree && name) {
			const { createWorktree } = await import('../worktrees.js');
			const info = createWorktree(process.cwd(), name);
			workspace = info.path;
			worktreePath = info.path;
		}

		const newPaneId = backend.addPane(agentKind, workspace || process.cwd(), mock);

		if (name && backend.findPaneByName) {
			backend.sendInput(newPaneId, `\x1b]2;${name}\x07`);
		}

		return {
			success: true,
			pane: newPaneId,
			agent: agentKind,
			...(name ? { name } : {}),
			...(worktreePath ? { worktree: worktreePath } : {}),
		};
	});

	handlers.set('remove_worker', async (params) => {
		const v = validateInput(RemoveWorkerInput, params);
		if (!v.ok) return v.error;
		let { pane } = v.data;
		const { name, cleanup_worktree: cleanupWorktree } = v.data;

		if (!pane && name && backend.findPaneByName) {
			const found = backend.findPaneByName(name);
			if (!found) return { success: false, error: `No pane found matching name "${name}"` };
			pane = found;
		}

		if (!pane) return { success: false, error: 'Missing pane ID or name' };
		if (pane === orchestratorPaneId) return { success: false, error: 'Cannot kill the orchestrator pane' };

		backend.removePane(pane);

		if (cleanupWorktree && name) {
			const { removeWorktree } = await import('../worktrees.js');
			removeWorktree(process.cwd(), name);
		}

		return {
			success: true,
			pane,
			...(name ? { name } : {}),
			...(cleanupWorktree ? { worktree_cleaned: true } : {}),
		};
	});

	handlers.set('restart_worker', (params) => {
		const v = validateInput(RestartWorkerInput, params);
		if (!v.ok) return v.error;
		const { pane, agent: agentKind } = v.data;
		if (pane === orchestratorPaneId) return { success: false, error: 'Cannot restart the orchestrator pane' };

		backend.removePane(pane);
		const newPaneId = backend.addPane(agentKind, process.cwd(), false);
		return { success: true, old_pane: pane, new_pane: newPaneId, agent: agentKind };
	});

	handlers.set('send_ctrl_c', (params) => {
		const v = validateInput(PaneIdInput, params);
		if (!v.ok) return v.error;
		backend.sendInput(v.data.pane, '\x03');
		return { success: true, pane: v.data.pane };
	});

	handlers.set('shutdown_all', async () => {
		const panes = backend.listPanes();
		const workers = panes.filter((p) => !p.isOrchestrator);
		const killed: string[] = [];

		for (const w of workers) {
			backend.sendInput(w.id, '\x03');
		}

		await new Promise<void>((resolve) => setTimeout(resolve, 1000));

		for (const w of workers) {
			backend.removePane(w.id);
			killed.push(w.id);
		}

		return { success: true, killed };
	});

	// -- Memory tools (Zod-validated, read from holder.deps at call time) --

	handlers.set('query_memory', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(QueryMemoryInput, params);
		if (!v.ok) return v.error;

		const results = deps.ragOps.searchIndex(
			deps.ragIndex as import('../db/rag.js').RagIndex,
			v.data.query,
			v.data.limit,
		);

		return {
			success: true,
			results: results.map((r) => ({
				chunk: r.chunk,
				source_agent: r.sourceAgentId,
				score: Math.round(r.score * 1000) / 1000,
			})),
		};
	});

	handlers.set('write_memory', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(WriteMemoryInput, params);
		if (!v.ok) return v.error;

		deps.dbOps.setSharedContext(
			deps.db as import('better-sqlite3').Database,
			v.data.key, v.data.value, v.data.tags, v.data.agent_id,
		);

		return { success: true, key: v.data.key };
	});

	handlers.set('list_memories', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(ListMemoriesInput, params);
		if (!v.ok) return v.error;

		const entries = deps.dbOps.listSharedContext(
			deps.db as import('better-sqlite3').Database,
			v.data.tag,
		);

		return {
			success: true,
			entries: entries.slice(0, v.data.limit).map((e) => ({
				key: e.key,
				value: e.value,
				tags: e.tags,
				agent_id: e.agentId,
				updated_at: e.updatedAt,
			})),
		};
	});

	handlers.set('get_memory', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(KeyInput, params);
		if (!v.ok) return v.error;

		const entry = deps.dbOps.getSharedContext(
			deps.db as import('better-sqlite3').Database,
			v.data.key,
		);

		if (!entry) return { success: false, error: `Key "${v.data.key}" not found` };

		return {
			success: true,
			key: entry.key,
			value: entry.value,
			tags: entry.tags,
			agent_id: entry.agentId,
			updated_at: entry.updatedAt,
		};
	});

	handlers.set('delete_memory', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(KeyInput, params);
		if (!v.ok) return v.error;

		const deleted = deps.dbOps.deleteSharedContext(
			deps.db as import('better-sqlite3').Database,
			v.data.key,
		);

		return { success: true, key: v.data.key, deleted };
	});

	// -- Pinned document tools (Zod-validated) --

	handlers.set('pin_document', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(DocIdInput, params);
		if (!v.ok) return v.error;

		deps.dbOps.pinDocument(deps.db as import('better-sqlite3').Database, v.data.doc_id);
		return { success: true, doc_id: v.data.doc_id, pinned: true };
	});

	handlers.set('unpin_document', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(DocIdInput, params);
		if (!v.ok) return v.error;

		deps.dbOps.unpinDocument(deps.db as import('better-sqlite3').Database, v.data.doc_id);
		return { success: true, doc_id: v.data.doc_id, pinned: false };
	});

	handlers.set('list_pinned', (params) => {
		const deps = memoryDepsHolder?.deps;
		if (!deps) return { success: false, error: 'Database not available' };

		const v = validateInput(ListPinnedInput, params);
		if (!v.ok) return v.error;

		const db = deps.db as import('better-sqlite3').Database;
		const pinnedIds = deps.dbOps.getPinnedDocumentIds(db);
		if (pinnedIds.size === 0) return { success: true, documents: [] };

		// Note: SQLite returns snake_case columns; access both forms for runtime safety.
		const docs = deps.dbOps.getRagDocumentsWithPins(db, v.data.limit, 0);
		const pinned = docs.filter((d) => pinnedIds.has(d.id));

		return {
			success: true,
			documents: pinned.map((d) => {
				const raw = d as unknown as Record<string, unknown>;
				return {
					id: d.id,
					source_agent: raw['source_agent_id'] ?? d.sourceAgentId,
					chunk: raw['chunk'] ?? d.chunk,
					created_at: raw['created_at'] ?? d.createdAt,
				};
			}),
		};
	});

	return handlers;
}
