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

import { getAgentPalette, ROLE_COLORS } from '../ui/agentColors.js';
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
	const { headerPane, contentPane } = createHeaderPane(session, firstPane, workerCount);

	// Style the session: Tokyo Night palette
	tmux.setOption(session, 'mouse', 'on');
	tmux.setOption(session, 'status', 'on');
	tmux.setOption(session, 'status-style', 'bg=#1a1b26,fg=#565f89');
	tmux.setOption(session, 'pane-border-style', 'fg=#3b4261');
	tmux.setOption(session, 'pane-active-border-style', 'fg=#c0caf5');
	tmux.setOption(session, 'message-style', 'bg=#24283b,fg=#7dcfff');
	tmux.setOption(session, 'message-command-style', 'bg=#24283b,fg=#c0caf5');
	tmux.setOption(session, 'display-time', '2000');
	tmux.setWindowOption(session, 'pane-border-lines', 'double');
	tmux.setWindowOption(session, 'pane-border-status', 'bottom');
	tmux.setWindowOption(
		session,
		'pane-border-format',
		'#[fg=#{@agent_color},bold] #{@agent_name} #[fg=#565f89,nobold]#{@agent_role} #[fg=#3b4261]| #[fg=#414868]#{@agent_task}',
	);

	// Status bar: left = title + keybinding hints, right = worker count + clock
	tmux.setOption(
		session,
		'status-left',
		'#[fg=#1a1b26,bg=#7aa2f7,bold] blECSd #[fg=#7aa2f7,bg=#24283b] #[fg=#c0caf5,bg=#24283b] ?:help Space:cmd i:info #[fg=#24283b,bg=#1a1b26] ',
	);
	tmux.setOption(session, 'status-left-length', '60');
	tmux.setOption(
		session,
		'status-right',
		`#[fg=#24283b,bg=#1a1b26]#[fg=#565f89,bg=#24283b] ${workerCount}W #[fg=#3b4261]│#[fg=#7dcfff] %H:%M #[fg=#7aa2f7,bg=#24283b]#[fg=#1a1b26,bg=#7aa2f7,bold] %b %d `,
	);
	tmux.setOption(session, 'status-right-length', '50');

	// Keybindings with toast notifications (prefix is Ctrl+B by default)
	tmux.bindKeyGlobal('q', `kill-session -t ${session}`);
	tmux.bindKeyGlobal('n', `split-window -t ${session} -h \\; display-message -t ${session} " Worker added"`);
	tmux.bindKeyGlobal('d', `kill-pane \\; display-message -t ${session} " Pane removed"`);
	tmux.bindKeyGlobal('Tab', `select-pane -t + \\; display-message -t ${session} " Pane #{pane_index}: #{pane_title}"`);
	tmux.bindKeyGlobal('BTab', `select-pane -t - \\; display-message -t ${session} " Pane #{pane_index}: #{pane_title}"`);

	// Popup keybindings
	bindPopupKeys(session, options.dbPath);

	// Step 1: Create the sidebar pane on the far left (if not disabled)
	let sidebarPane: string | null = null;
	let orchPane = contentPane;

	if (!options.noSidebar) {
		const sidebarPercent = Math.max(10, Math.min(30, Math.floor((SIDEBAR_WIDTH / width) * 100)));
		tmux.splitWindow(session, contentPane, true, 100 - sidebarPercent);

		const panesAfterSidebar = tmux.listPanes(session);
		const nonHeader = panesAfterSidebar.filter((p) => p !== headerPane);
		sidebarPane = nonHeader[0] ?? contentPane;
		orchPane = nonHeader[1] ?? contentPane;
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
 * Creates and starts a dedicated 1-line header pane at the top of the session.
 *
 * @param session - Tmux session name
 * @param firstPane - Initial pane in the session
 * @param workerCount - Number of workers to pass to header script
 * @returns Header pane ID and the remaining content pane ID
 */
function createHeaderPane(
	session: string,
	firstPane: string,
	workerCount: number,
): { headerPane: string; contentPane: string } {
	// Create top pane with fixed 1-line height above the main content.
	tmux.tryRun(`split-window -v -b -t ${session}:${firstPane} -l 1`);

	const panes = tmux.listPanes(session);
	const headerPane = panes[0] ?? firstPane;
	const contentPane = panes.find((p) => p !== headerPane) ?? firstPane;

	const headerScriptPath = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'..',
		'tmux-header.ts',
	);
	tmux.sendCommand(
		session,
		headerPane,
		`npx tsx "${headerScriptPath}" --session "${session}" --workers "${workerCount}"`,
	);
	tmux.tryRun(`select-pane -t ${session}:${headerPane} -T "Header"`);
	tmux.setPaneUserOption(session, headerPane, 'agent_color', ROLE_COLORS.header.primary);
	tmux.setPaneUserOption(session, headerPane, 'agent_name', 'Header');
	tmux.setPaneUserOption(session, headerPane, 'agent_role', '');
	tmux.setPaneUserOption(session, headerPane, 'agent_task', '');

	return { headerPane, contentPane };
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
	tmux.setPaneUserOption(session, sidebarPane, 'agent_color', ROLE_COLORS.sidebar.primary);
	tmux.setPaneUserOption(session, sidebarPane, 'agent_name', 'RAG Memory');
	tmux.setPaneUserOption(session, sidebarPane, 'agent_role', 'Sidebar');
	tmux.setPaneUserOption(session, sidebarPane, 'agent_task', 'Monitoring documents');
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
	tmux.setPaneUserOption(session, orchPane, 'agent_color', ROLE_COLORS.orchestrator.primary);
	tmux.setPaneUserOption(session, orchPane, 'agent_name', orchSpec.label);
	tmux.setPaneUserOption(session, orchPane, 'agent_role', 'Orchestrator');
	tmux.setPaneUserOption(session, orchPane, 'agent_task', 'Coordinating agents');

	for (let i = 0; i < workerSpecs.length && i < workerPanes.length; i++) {
		const pane = workerPanes[i]!;
		const spec = workerSpecs[i]!;
		tmux.tryRun(`select-pane -t ${session}:${pane} -T "${spec.label} (Worker ${i + 1})"`);
		tmux.setPaneUserOption(session, pane, 'agent_color', getAgentPalette(i).primary);
		tmux.setPaneUserOption(session, pane, 'agent_name', spec.label);
		tmux.setPaneUserOption(session, pane, 'agent_role', `Worker ${i + 1}`);
		tmux.setPaneUserOption(session, pane, 'agent_task', 'Ready');
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

// =============================================================================
// POPUP KEYBINDINGS
// =============================================================================

/**
 * Resolves the absolute path to a popup script relative to this module.
 *
 * @param scriptName - Filename inside the popups/ directory
 * @returns Absolute path to the script
 */
function resolvePopupScript(scriptName: string): string {
	return path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'..',
		'popups',
		scriptName,
	);
}

/**
 * Binds popup keybindings to the tmux session:
 * - Ctrl+B Space: command palette
 * - Ctrl+B ?: help overlay
 * - Ctrl+B i: agent detail
 * - Ctrl+B x: confirm quit menu
 *
 * @param session - Tmux session name
 * @param dbPath - Path to the SQLite database (passed to popup scripts)
 */
export function bindPopupKeys(session: string, dbPath: string): void {
	const palettePath = resolvePopupScript('command-palette.ts');
	const helpPath = resolvePopupScript('help.ts');
	const detailPath = resolvePopupScript('agent-detail.ts');

	// Ctrl+B Space: command palette (centered, 60x20)
	tmux.bindKeyGlobal(
		'Space',
		`display-popup -t ${session} -w 60 -h 20 -b rounded -T " Command Palette " -s "bg=#1a1b26" -S "fg=#7aa2f7" -E "npx tsx ${palettePath} --session ${session} --db ${dbPath}"`,
	);

	// Ctrl+B ?: help overlay (centered, 70x24)
	tmux.bindKeyGlobal(
		'?',
		`display-popup -t ${session} -w 70 -h 24 -b rounded -T " Keybindings " -s "bg=#1a1b26" -S "fg=#7dcfff" -E "npx tsx ${helpPath}"`,
	);

	// Ctrl+B i: agent detail (centered, 80x30)
	tmux.bindKeyGlobal(
		'i',
		`display-popup -t ${session} -w 80 -h 30 -b rounded -T " Agent Detail " -s "bg=#1a1b26" -S "fg=#9ece6a" -E "npx tsx ${detailPath} --session ${session} --db ${dbPath}"`,
	);

	// Ctrl+B x: confirm quit via display-menu
	tmux.bindKeyGlobal(
		'x',
		`display-menu -t ${session} -T " Quit? " "Confirm quit" q "kill-session -t ${session}" "" "" "" "Cancel" c ""`,
	);
}

// =============================================================================
// PANE TASK UPDATES
// =============================================================================

/**
 * Updates the current task text shown in a pane's bottom border tag.
 *
 * @param session - Tmux session name
 * @param pane - Target pane ID
 * @param task - Task description text
 */
export function updatePaneTask(session: string, pane: string, task: string): void {
	tmux.setPaneUserOption(session, pane, 'agent_task', task);
}
