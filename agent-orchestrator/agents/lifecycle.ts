/**
 * Agent lifecycle management - spawn, terminate, restart.
 *
 * @module agent-orchestrator/agents/lifecycle
 */

import { createWorld } from 'blecsd';
import { createTerminal, type TerminalWidget } from 'blecsd/widgets';
import type { AppState, AgentPane, AgentSpawnConfig, AgentInfo } from '../types.js';
import { parseAgentSpec, getMockBanner, SCROLLBACK_LINES } from '../config.js';
import { addToast } from '../ui/toast.js';

/**
 * Spawns a new agent terminal.
 *
 * @param state - Application state
 * @param config - Agent spawn configuration
 * @returns AgentPane containing the terminal and agent info
 */
export function spawnAgent(state: AppState, config: AgentSpawnConfig): AgentPane {
	const preset = parseAgentSpec(config.kind);

	// Generate unique agent ID
	const agentId = `agent-${state.nextAgentId++}`;

	// Prepare environment variables
	const env: Record<string, string> = {
		...process.env,
		...preset.env,
		...config.env,
		TERM: 'xterm-256color',
		COLORTERM: 'truecolor',
		COLUMNS: '80',
		ROWS: '24',
	};

	// Create agent info
	const agent: AgentInfo = {
		id: agentId,
		kind: config.kind,
		label: config.label ?? preset.label,
		command: config.command ?? preset.command,
		args: config.args ?? preset.args,
		cwd: config.cwd ?? state.workspacePath,
		env,
		status: 'starting',
		spawnedAt: Date.now(),
		lastOutputAt: Date.now(),
		outputLineCount: 0,
	};

	// Create terminal widget
	const terminal = createTerminal(state.world, {
		width: 80, // Will be resized during layout
		height: 24,
		scrollback: SCROLLBACK_LINES,
		cursorBlink: false, // Orchestrator manages cursor position
	});

	// Create the pane
	const pane: AgentPane = {
		terminal,
		agent,
		x: 0,
		y: 0,
		width: 80,
		height: 24,
		gridRow: 0,
		gridCol: 0,
	};

	// Set up event handlers
	// Note: We do NOT set needsRender here. PTY onData fires per-byte which
	// would cause excessive rendering. The 30fps render loop always checks for
	// terminal output changes via a dirty flag.
	terminal.onData(() => {
		agent.lastOutputAt = Date.now();
		agent.outputLineCount++;
	});

	terminal.onExit((code) => {
		agent.status = code === 0 ? 'stopped' : 'error';
		terminal.writeln('');
		terminal.writeln(`\x1b[90mProcess exited (${code})\x1b[0m`);
		if (code !== 0) {
			addToast(`Worker error: ${agent.label}`, 'error');
		}
		state.needsRender = true;
	});

	// Spawn the PTY or mock shell
	const isMock = state.mockMode || config.mock;

	if (isMock) {
		// Spawn bash and write mock banner
		terminal.writeln(getMockBanner(agent.label, agent.id));
		terminal.spawn({
			shell: '/bin/bash',
			args: [],
			cwd: agent.cwd,
			env,
		});
		agent.status = 'idle';
	} else {
		// Spawn the actual agent command
		terminal.writeln(`\x1b[90mStarting ${agent.label}...\x1b[0m`);

		try {
			terminal.spawn({
				shell: agent.command,
				args: [...agent.args],
				cwd: agent.cwd,
				env,
			});

			if (terminal.isRunning()) {
				agent.status = 'running';
			} else {
				agent.status = 'error';
				terminal.writeln('\x1b[31mFailed to start agent.\x1b[0m');
				addToast(`Worker error: ${agent.label}`, 'error');
			}
		} catch (err) {
			agent.status = 'error';
			terminal.writeln(`\x1b[31mError: ${String(err)}\x1b[0m`);
			addToast(`Worker error: ${agent.label}`, 'error');
		}
	}

	return pane;
}

/**
 * Terminates an agent and destroys its terminal.
 *
 * @param state - Application state
 * @param pane - The agent pane to terminate
 */
export function terminateAgent(state: AppState, pane: AgentPane): void {
	pane.terminal.kill();
	pane.terminal.destroy();
	pane.agent.status = 'stopped';

	// Remove from workerPanes array if present
	const index = state.workerPanes.indexOf(pane);
	if (index >= 0) {
		state.workerPanes.splice(index, 1);
	}

	state.needsRender = true;
}

/**
 * Restarts an agent with the same configuration.
 *
 * @param state - Application state
 * @param pane - The agent pane to restart
 */
export function restartAgent(state: AppState, pane: AgentPane): void {
	const config: AgentSpawnConfig = {
		kind: pane.agent.kind,
		label: pane.agent.label,
		command: pane.agent.command,
		args: pane.agent.args,
		cwd: pane.agent.cwd,
		env: pane.agent.env,
		mock: state.mockMode,
	};

	// Kill existing terminal
	pane.terminal.kill();
	pane.terminal.destroy();

	// Create new terminal and spawn
	const newPane = spawnAgent(state, config);

	// Copy position data
	newPane.x = pane.x;
	newPane.y = pane.y;
	newPane.width = pane.width;
	newPane.height = pane.height;
	newPane.gridRow = pane.gridRow;
	newPane.gridCol = pane.gridCol;

	// Replace in workerPanes array
	const index = state.workerPanes.indexOf(pane);
	if (index >= 0) {
		state.workerPanes[index] = newPane;
	}

	// Replace orchestrator if this was it
	if (state.orchestratorPane === pane) {
		state.orchestratorPane = newPane;
	}

	state.needsRender = true;
}

/**
 * Terminates all agents (orchestrator and workers).
 *
 * @param state - Application state
 */
export function terminateAllAgents(state: AppState): void {
	// Terminate orchestrator
	if (state.orchestratorPane) {
		state.orchestratorPane.terminal.kill();
		state.orchestratorPane.terminal.destroy();
		state.orchestratorPane = null;
	}

	// Terminate all workers
	for (const pane of state.workerPanes) {
		pane.terminal.kill();
		pane.terminal.destroy();
	}

	state.workerPanes = [];
	state.needsRender = true;
}
