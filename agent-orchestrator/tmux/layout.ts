/**
 * Tmux layout creation, worker grid calculation, and agent pane management.
 *
 * Extracted from index.ts to keep the entrypoint thin.
 *
 * @module agent-orchestrator/tmux/layout
 */

import * as path from 'node:path';
import * as tmux from './controller.js';
import { parseAgentSpec } from '../config.js';
import { writeWorkerMemoryContextFile } from '../agents/communication.js';

import type { AgentPreset } from '../config.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Width of the RAG sidebar pane in columns. */
const SIDEBAR_WIDTH = 25;

/** Orchestrator pane takes 30% of screen width. */
const ORCHESTRATOR_PERCENT = 30;

// =============================================================================
// LAYOUT
// =============================================================================

/**
 * Creates the full tmux layout: sidebar (optional) + orchestrator + worker grid.
 *
 * @param session - Tmux session name
 * @param workerCount - Number of worker panes to create
 * @param width - Terminal width in columns
 * @param height - Terminal height in rows
 * @param options - Layout options
 * @returns Pane identifiers for orchestrator, workers, and sidebar
 */
export function createTmuxLayout(
	session: string,
	workerCount: number,
	width: number,
	height: number,
	options: { noSidebar: boolean; dbPath: string },
): { orchPane: string; workerPanes: string[]; sidebarPane: string | null } {
	tmux.createSession(session, width, height);
	const firstPane = tmux.getFirstPane(session);

	// Style the session
	tmux.setOption(session, 'mouse', 'on');
	tmux.setOption(session, 'status', 'on');
	tmux.setOption(session, 'status-style', 'bg=#1a1b26,fg=#7aa2f7');
	tmux.setOption(session, 'pane-border-style', 'fg=#3b4261');
	tmux.setOption(session, 'pane-active-border-style', 'fg=#7aa2f7');
	tmux.setOption(session, 'status-left', ' [blECSd] Ctrl+B q:quit n:new d:kill ');
	tmux.setOption(session, 'status-right', ` ${workerCount}W | %H:%M `);
	tmux.setWindowOption(session, 'pane-border-status', 'top');
	tmux.setWindowOption(session, 'pane-border-format', ' #{pane_index}: #{pane_title} ');

	// Keybindings (prefix is Ctrl+B by default)
	tmux.bindKeyGlobal('q', `kill-session -t ${session}`);
	tmux.bindKeyGlobal('n', `split-window -t ${session} -h`);
	tmux.bindKeyGlobal('d', 'kill-pane');
	tmux.bindKeyGlobal('Tab', 'select-pane -t +');
	tmux.bindKeyGlobal('BTab', 'select-pane -t -');

	// Step 1: Create the sidebar pane on the far left (if not disabled)
	let sidebarPane: string | null = null;
	let orchPane = firstPane;

	if (!options.noSidebar) {
		const sidebarPercent = Math.max(10, Math.min(30, Math.floor((SIDEBAR_WIDTH / width) * 100)));
		tmux.splitWindow(session, firstPane, true, 100 - sidebarPercent);

		const panesAfterSidebar = tmux.listPanes(session);
		sidebarPane = panesAfterSidebar[0] ?? firstPane;
		orchPane = panesAfterSidebar[1] ?? firstPane;
	}

	// Step 2: Split main area into orchestrator (left 30%) and worker area (right 70%)
	tmux.splitWindow(session, orchPane, true, 100 - ORCHESTRATOR_PERCENT);

	const panesAfterOrch = tmux.listPanes(session);
	const firstWorkerPane = panesAfterOrch[panesAfterOrch.length - 1] ?? orchPane;
	const workerPanes: string[] = [firstWorkerPane];

	// Step 3: Create worker grid
	if (workerCount > 1) {
		const grid = calculateWorkerGrid(workerCount);

		// First, create rows by splitting vertically
		const rowPanes: string[] = [firstWorkerPane];
		for (let r = 1; r < grid.rows; r++) {
			const targetPane = rowPanes[rowPanes.length - 1]!;
			const remainingRows = grid.rows - r;
			const percent = Math.floor(100 / (remainingRows + 1));
			tmux.splitWindow(session, targetPane, false, percent);
			const currentPanes = tmux.listPanes(session);
			rowPanes.push(currentPanes[currentPanes.length - 1] ?? targetPane);
		}

		// Now split each row into columns
		workerPanes.length = 0;
		for (let r = 0; r < rowPanes.length; r++) {
			const rowPane = rowPanes[r]!;
			const colsInRow = r < grid.rows - 1
				? grid.cols
				: workerCount - (grid.rows - 1) * grid.cols;

			workerPanes.push(rowPane);
			for (let c = 1; c < colsInRow; c++) {
				const targetPane = workerPanes[workerPanes.length - 1]!;
				const remainingCols = colsInRow - c;
				const percent = Math.floor(100 / (remainingCols + 1));
				tmux.splitWindow(session, targetPane, true, percent);
				const currentPanes = tmux.listPanes(session);
				workerPanes.push(currentPanes[currentPanes.length - 1] ?? targetPane);
			}
		}

		workerPanes.length = Math.min(workerPanes.length, workerCount);
	}

	// Focus the orchestrator pane
	tmux.selectPane(session, orchPane);

	return { orchPane, workerPanes, sidebarPane };
}

/**
 * Calculates grid dimensions (rows x cols) for a given worker count.
 *
 * @param count - Number of workers
 * @returns Grid dimensions
 */
export function calculateWorkerGrid(count: number): { rows: number; cols: number } {
	if (count <= 1) return { rows: 1, cols: 1 };
	if (count === 2) return { rows: 2, cols: 1 };
	if (count <= 4) return { rows: 2, cols: 2 };
	if (count <= 6) return { rows: 2, cols: 3 };
	if (count <= 9) return { rows: 3, cols: 3 };
	const cols = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / cols);
	return { rows, cols };
}

/**
 * Starts the RAG viewer script in the sidebar tmux pane.
 *
 * @param session - Tmux session name
 * @param sidebarPane - Pane ID for the sidebar
 * @param dbPath - Path to the SQLite database
 */
export function startSidebarViewer(session: string, sidebarPane: string, dbPath: string): void {
	const viewerPath = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'..',
		'rag-viewer.ts',
	);

	tmux.sendCommand(session, sidebarPane, `npx tsx "${viewerPath}" --db "${dbPath}"`);
	tmux.tryRun(`select-pane -t ${session}:${sidebarPane} -T "RAG Memory"`);
}

/**
 * Starts agent processes in their assigned tmux panes.
 *
 * @param session - Tmux session name
 * @param cliArgs - Parsed CLI arguments
 * @param orchPane - Orchestrator pane ID
 * @param workerPanes - Worker pane IDs
 * @param mcpConfigPath - Path to MCP config file (null if unavailable)
 */
export function startAgentsInPanes(
	session: string,
	cliArgs: { orchestrator: string; workers: readonly string[]; mock: boolean; workspace: string },
	orchPane: string,
	workerPanes: string[],
	mcpConfigPath: string | null,
): void {
	const orchSpec = parseAgentSpec(cliArgs.orchestrator);
	const workerSpecs = cliArgs.workers.length > 0
		? cliArgs.workers.map((w) => parseAgentSpec(w))
		: [parseAgentSpec('claude')];

	if (cliArgs.mock) {
		tmux.sendCommand(session, orchPane, `printf '\\033[1;36m=== ${orchSpec.label} (Orchestrator) ===\\033[0m\\n' && bash`);
	} else {
		const orchCommand = buildAgentCommand(orchSpec, cliArgs.workspace, mcpConfigPath);
		tmux.sendCommand(session, orchPane, orchCommand);
	}

	for (let i = 0; i < workerSpecs.length && i < workerPanes.length; i++) {
		const spec = workerSpecs[i]!;
		const pane = workerPanes[i]!;

		if (cliArgs.mock) {
			tmux.sendCommand(session, pane, `printf '\\033[1;33m=== ${spec.label} (Worker ${i + 1}) ===\\033[0m\\n' && bash`);
		} else {
			tmux.sendCommand(session, pane, buildAgentCommand(spec, cliArgs.workspace, null));
		}
	}

	tmux.tryRun(`select-pane -t ${session}:${orchPane} -T "${orchSpec.label} (Orchestrator)"`);
	for (let i = 0; i < workerSpecs.length && i < workerPanes.length; i++) {
		const pane = workerPanes[i]!;
		const spec = workerSpecs[i]!;
		tmux.tryRun(`select-pane -t ${session}:${pane} -T "${spec.label} (Worker ${i + 1})"`);
	}
	for (let i = 0; i < workerSpecs.length && i < workerPanes.length; i++) {
		const pane = workerPanes[i]!;
		const spec = workerSpecs[i]!;
		writeWorkerMemoryContextFile(
			cliArgs.workspace,
			`${spec.label} (Worker ${i + 1})`,
			pane,
		);
	}

	tmux.selectPane(session, orchPane);
}

/**
 * Builds the shell command string to launch an agent.
 *
 * @param spec - Agent preset configuration
 * @param workspace - Working directory path
 * @param mcpConfigPath - Path to MCP config file (null if unavailable)
 * @returns Shell command string
 */
export function buildAgentCommand(spec: AgentPreset, workspace: string, mcpConfigPath: string | null): string {
	const extraArgs: string[] = [...spec.args];
	if (mcpConfigPath && spec.kind === 'claude') {
		extraArgs.push('--mcp-config', mcpConfigPath);
	}
	const args = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : '';
	return `cd "${workspace}" && ${spec.command}${args}`;
}
