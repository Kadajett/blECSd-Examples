#!/usr/bin/env node
/**
 * Multi-Agent Orchestrator
 *
 * Dual-path entrypoint:
 *   - Default:   Tmux-based layout (reliable PTY rendering for Claude Code, etc.)
 *   - --blecsd:  Experimental native blECSd TUI with custom chrome, sparklines
 *
 * Layout (tmux mode, default):
 *   +----------+-----------+----------+----------+
 *   | RAG      |           | Worker 1 | Worker 2 |
 *   | Sidebar  | Orchestr. |          |          |
 *   | (viewer) |  (30%)    +----------+----------+
 *   |          |           | Worker 3 | Worker 4 |
 *   |          |           |          |          |
 *   +----------+-----------+----------+----------+
 *
 * @module agent-orchestrator
 */

import { spawn } from 'node:child_process';
import { createWorld } from 'blecsd';
import { parseCliArgs, parseAgentSpec, FRAME_MS } from './config.js';
import * as tmux from './tmux/controller.js';
import { startMcpServer } from './mcp/server.js';
import { getToolDefinitions, createToolHandlers, createMemoryDepsHolder } from './mcp/tools.js';
import { createAppState } from './state/appState.js';
import { createBlecsdBackend } from './backend/blecsd.js';
import { createTmuxBackend } from './backend/tmux.js';
import { spawnAgent } from './agents/lifecycle.js';
import { addWorker } from './agents/worker.js';
import { writeWorkerMemoryContextFile } from './agents/communication.js';
import { handleInput } from './input/handlers.js';
import { renderFrame } from './ui/render.js';
import { resizeAllPanes } from './ui/layout.js';
import { warn, error as logError } from './utils/logger.js';
import { startAgentHealthCheckInterval, stopAgentHealthCheckInterval } from './agents/healthCheck.js';

// Extracted modules
import { createTmuxLayout, startSidebarViewer, startAgentsInPanes } from './tmux/layout.js';
import { cleanupBlecsd, cleanupTmux, setDbModuleForCleanup } from './helpers/cleanup.js';
import { writeMcpConfig, writeOrchestratorContext, writeBlecsdOrchestratorContext } from './helpers/context.js';
import { startTmuxRagIngestion, startBlecsdRagIngestion } from './helpers/ragIngestion.js';

import type BetterSqlite3 from 'better-sqlite3';
import type { RagIndex } from './db/rag.js';
import type { McpServerState, AppState } from './types.js';
import type { AgentPreset } from './config.js';

// DB/RAG imports (optional, may fail if better-sqlite3 not installed)
let dbModule: typeof import('./db/index.js') | null = null;
let ragModule: typeof import('./db/rag.js') | null = null;

// =============================================================================
// CONSTANTS
// =============================================================================

const SESSION = `blecsd-${process.pid}`;

// =============================================================================
// OPTIONAL MODULE LOADING
// =============================================================================

async function loadOptionalModules(): Promise<void> {
	try {
		dbModule = await import('./db/index.js');
		ragModule = await import('./db/rag.js');
		setDbModuleForCleanup(dbModule);
	} catch {
		warn('better-sqlite3 not installed, DB/RAG features disabled');
	}
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

function buildSpawnConfig(
	spec: AgentPreset,
	workspace: string,
	mock: boolean,
	mcpConfigPath: string | null,
): { kind: AgentPreset['kind']; label: string; command: string; args: readonly string[]; cwd: string; env: Record<string, string>; mock: boolean } {
	const extraArgs: string[] = [...spec.args];
	if (mcpConfigPath && spec.kind === 'claude') {
		extraArgs.push('--mcp-config', mcpConfigPath);
	}

	return {
		kind: spec.kind,
		label: spec.label,
		command: spec.command,
		args: extraArgs,
		cwd: workspace,
		env: spec.env ?? {},
		mock,
	};
}

// =============================================================================
// BLECSD-SPECIFIC HELPERS
// =============================================================================

/**
 * Forces a resize on all terminal widgets to match their pane dimensions.
 * This ensures the PTY processes know their actual terminal size.
 */
function forceResizeAllTerminals(state: AppState): void {
	const allPanes = [state.orchestratorPane, ...state.workerPanes].filter(Boolean);
	for (const pane of allPanes) {
		if (!pane) continue;
		const contentWidth = Math.max(1, pane.width - 2);
		const contentHeight = Math.max(1, pane.height - 2);
		pane.terminal.resize(contentWidth, contentHeight);
	}
}

function wireActivityTracking(state: AppState): void {
	const allPanes = [state.orchestratorPane, ...state.workerPanes].filter(Boolean);
	for (const pane of allPanes) {
		if (!pane) continue;
		const agentId = pane.agent.id;

		state.activity.counters.set(agentId, 0);
		state.activity.history.set(agentId, []);

		pane.terminal.onData(() => {
			const current = state.activity.counters.get(agentId) ?? 0;
			state.activity.counters.set(agentId, current + 1);
		});
	}
}

function tickActivityHistory(state: AppState): void {
	for (const [agentId, count] of state.activity.counters) {
		const history = state.activity.history.get(agentId) ?? [];
		history.push(count);

		while (history.length > 60) {
			history.shift();
		}

		state.activity.history.set(agentId, history);
		state.activity.counters.set(agentId, 0);
	}

	state.needsRender = true;
}

// =============================================================================
// BLECSD MAIN (--blecsd experimental path)
// =============================================================================

async function mainBlecsd(): Promise<void> {
	const cliArgs = parseCliArgs(process.argv);
	await loadOptionalModules();

	// Create ECS world and app state
	const world = createWorld();
	const state = createAppState(world, cliArgs);

	// Create blECSd backend
	const backend = createBlecsdBackend(world, cliArgs.workspace, cliArgs.mock, () => {
		state.needsRender = true;
	});
	state.backend = backend;

	// Enter alt screen, raw mode, mouse tracking, hide cursor
	process.stdout.write('\x1b[?1049h'); // Alt screen
	process.stdout.write('\x1b[?25l');   // Hide cursor
	process.stdout.write('\x1b[?1006h'); // SGR mouse encoding
	process.stdout.write('\x1b[?1000h'); // Button press/release only (no motion tracking)
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();

	// Create mutable memory deps holder (populated after DB init)
	const memoryDepsHolder = createMemoryDepsHolder();

	// Start MCP server
	let mcpState: McpServerState | null = null;
	let mcpConfigPath: string | null = null;

	try {
		const toolDefs = getToolDefinitions();
		const toolHandlers = createToolHandlers(backend, 'blecsd-0', memoryDepsHolder);
		mcpState = await startMcpServer(toolDefs, toolHandlers);
		mcpConfigPath = writeMcpConfig(cliArgs.workspace, mcpState.port);
	} catch (err) {
		warn('MCP server failed to start, tools will be unavailable', err, 'mcp');
	}

	// Spawn orchestrator
	const orchSpec = parseAgentSpec(cliArgs.orchestrator);
	const orchConfig = buildSpawnConfig(orchSpec, cliArgs.workspace, cliArgs.mock, mcpConfigPath);
	const orchestratorPane = spawnAgent(state, orchConfig);
	state.orchestratorPane = orchestratorPane;

	// Spawn workers
	const workerSpecs = cliArgs.workers.length > 0 ? cliArgs.workers : ['claude'];
	for (const spec of workerSpecs) {
		addWorker(state, spec);
	}
	for (const pane of state.workerPanes) {
		writeWorkerMemoryContextFile(pane.agent.cwd, pane.agent.label, pane.agent.id);
	}

	// Wire terminal data callbacks for activity tracking
	wireActivityTracking(state);

	// Initialize database and wire to MCP tool handlers
	let db: BetterSqlite3.Database | null = null;
	let ragIndex: RagIndex | null = null;
	let ragTimer: NodeJS.Timeout | null = null;

	if (dbModule && ragModule) {
		try {
			db = dbModule.openDatabase(cliArgs.db);
			ragIndex = ragModule.createRagIndex();
			ragModule.rebuildIndexFromDb(db, ragIndex);
			ragTimer = startBlecsdRagIngestion(state, db, ragIndex, ragModule);

			// Wire DB to MCP tool handlers via the mutable holder
			const dbOpsModule = await import('./db/operations.js');
			memoryDepsHolder.deps = {
				db,
				ragIndex,
				dbOps: dbOpsModule,
				ragOps: ragModule,
			};

			// Store DB in state for sidebar rendering
			state.db = db;
			state.ragIndex = ragIndex;
			state.dbOps = dbOpsModule;
		} catch (err) {
			warn('Database initialization failed', err, 'db');
			db = null;
			ragIndex = null;
		}
	}

	// Write orchestrator context file
	writeBlecsdOrchestratorContext(cliArgs.workspace, state, mcpState?.port ?? 0);

	// Initial layout calculation
	resizeAllPanes(state);

	// Force resize on all terminals so PTY processes know their actual dimensions
	forceResizeAllTerminals(state);

	// Input handler
	process.stdin.on('data', (data: Buffer) => {
		handleInput(state, data.toString());
	});

	// Resize handler
	process.stdout.on('resize', () => {
		state.screenWidth = process.stdout.columns ?? 120;
		state.screenHeight = process.stdout.rows ?? 30;
		resizeAllPanes(state);
		forceResizeAllTerminals(state);
	});

	// Activity history ticker (once per second)
	const activityTicker = setInterval(() => {
		tickActivityHistory(state);
	}, 1000);

	// Agent health check (every 30 seconds, auto-restarts crashed agents)
	const healthTimer = startAgentHealthCheckInterval(state);

	// Render loop: always render at 30fps to pick up terminal output changes.
	function renderLoop(): void {
		if (!state.running) {
			cleanupBlecsd(state, db, ragTimer, activityTicker, healthTimer, mcpState);
			return;
		}

		renderFrame(state);
		state.needsRender = false;

		setTimeout(renderLoop, FRAME_MS);
	}

	renderLoop();
}

// =============================================================================
// TMUX MAIN (default path)
// =============================================================================

async function mainTmux(): Promise<void> {
	// Verify tmux is installed
	const tmuxVersion = tmux.tryRun('-V');
	if (!tmuxVersion) {
		console.error('tmux is not installed. Please install tmux first.');
		process.exit(1);
	}

	const cliArgs = parseCliArgs(process.argv);
	const width = process.stdout.columns ?? 120;
	const height = process.stdout.rows ?? 30;

	await loadOptionalModules();
	tmux.killSession(SESSION);

	const workerCount = cliArgs.workers.length > 0 ? cliArgs.workers.length : 1;
	const { orchPane, workerPanes, sidebarPane } = createTmuxLayout(
		SESSION,
		workerCount,
		width,
		height,
		{ noSidebar: cliArgs.noSidebar, dbPath: cliArgs.db },
	);

	// Initialize database first (before MCP server, so sidebar can connect)
	let db: BetterSqlite3.Database | null = null;
	let ragIndex: RagIndex | null = null;
	let ragTimer: NodeJS.Timeout | null = null;

	if (dbModule && ragModule) {
		try {
			db = dbModule.openDatabase(cliArgs.db);
			ragIndex = ragModule.createRagIndex();
			ragModule.rebuildIndexFromDb(db, ragIndex);
			ragTimer = startTmuxRagIngestion(SESSION, workerPanes, db, ragIndex, ragModule);
		} catch (err) {
			warn('Database initialization failed', err, 'db');
			db = null;
			ragIndex = null;
		}
	}

	// Start MCP server
	let mcpState: McpServerState | null = null;
	let mcpConfigPath: string | null = null;

	try {
		const toolDefs = getToolDefinitions();
		const tmuxBackend = createTmuxBackend(SESSION, cliArgs.workspace, cliArgs.mock, orchPane);
		const memoryDepsHolder = createMemoryDepsHolder();
		const toolHandlers = createToolHandlers(
			tmuxBackend,
			orchPane,
			memoryDepsHolder,
			(message, durationMs) => tmux.displayMessage(SESSION, message, durationMs),
		);
		mcpState = await startMcpServer(toolDefs, toolHandlers);
		mcpConfigPath = writeMcpConfig(cliArgs.workspace, mcpState.port);

		// Wire DB to MCP tools if available
		if (db && ragIndex && ragModule) {
			try {
				const dbOpsModule = await import('./db/operations.js');
				memoryDepsHolder.deps = {
					db,
					ragIndex,
					dbOps: dbOpsModule,
					ragOps: ragModule,
				};
			} catch (err) {
				warn('DB operations module not available', err, 'db');
			}
		}
	} catch (err) {
		warn('MCP server failed to start, tools will be unavailable', err, 'mcp');
	}

	// Start the RAG viewer in the sidebar pane
	if (sidebarPane) {
		startSidebarViewer(SESSION, sidebarPane, cliArgs.db);
	}

	// Start agents in their panes
	startAgentsInPanes(SESSION, cliArgs, orchPane, workerPanes, mcpConfigPath);
	writeOrchestratorContext(SESSION, cliArgs.workspace, orchPane, workerPanes, mcpState?.port ?? 0);

	// Print session info
	console.log(`\x1b[1;36mblECSd Agent Orchestrator\x1b[0m`);
	console.log(`  Session : ${SESSION}`);
	console.log(`  Socket  : blecsd`);
	console.log(`  Orch    : ${orchPane}`);
	console.log(`  Workers : ${workerPanes.join(', ')}`);
	if (sidebarPane) {
		console.log(`  Sidebar : ${sidebarPane} (RAG viewer)`);
	}
	console.log(`  MCP     : ${mcpState ? `http://127.0.0.1:${mcpState.port}/mcp` : 'disabled'}`);
	console.log(`  DB      : ${db ? cliArgs.db : 'disabled'}`);
	console.log(`  Mock    : ${cliArgs.mock ? 'ON' : 'OFF'}`);
	console.log(`  Context : ${cliArgs.workspace}/.blecsd-orchestrator.md`);
	console.log('');
	console.log(`Attaching to tmux session...`);
	console.log(`  Ctrl+B q : Kill session (exit all panes)`);
	console.log(`  Ctrl+B d : Kill focused pane`);
	console.log(`  Ctrl+B n : Add new pane`);
	console.log(`  Ctrl+B Tab : Next pane`);
	console.log(`  Ctrl+B Shift+Tab : Prev pane`);
	console.log(`  (Ctrl+B then : for tmux command mode)`);
	console.log('');

	await new Promise((resolve) => setTimeout(resolve, 500));

	const [cmd, args] = tmux.attachArgs(SESSION);
	const child = spawn(cmd, args, {
		stdio: 'inherit',
		env: { ...process.env, TERM: 'xterm-256color' },
	});

	child.on('exit', (code) => {
		cleanupTmux(SESSION, db, ragTimer, mcpState);
		process.exit(code ?? 0);
	});

	const onSignal = (): void => {
		child.kill();
		tmux.killSession(SESSION);
		cleanupTmux(SESSION, db, ragTimer, mcpState);
		process.exit(0);
	};

	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
	const cliArgs = parseCliArgs(process.argv);

	if (cliArgs.blecsd) {
		await mainBlecsd();
	} else {
		await mainTmux();
	}
}

main().catch((err) => {
	// Restore terminal on fatal error
	process.stdout.write('\x1b[?1000l');
	process.stdout.write('\x1b[?1006l');
	process.stdout.write('\x1b[?25h');
	process.stdout.write('\x1b[?1049l');
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}

	logError('Fatal error', err);
	try { tmux.killSession(SESSION); } catch { /* best effort */ }
	process.exit(1);
});
