/**
 * Worker agent management - add, remove, focus.
 *
 * @module agent-orchestrator/agents/worker
 */

import type { AppState, AgentPane } from '../types.js';
import { parseAgentSpec, calculateGridDimensions } from '../config.js';
import { spawnAgent, terminateAgent } from './lifecycle.js';

/**
 * Recalculates grid positions for all worker panes.
 *
 * @param state - Application state
 */
function recalculateGrid(state: AppState): void {
	const workerCount = state.workerPanes.length;

	if (workerCount === 0) {
		state.workerGrid = { rows: 1, cols: 1 };
		return;
	}

	state.workerGrid = calculateGridDimensions(workerCount);

	// Assign grid positions
	let idx = 0;
	for (let row = 0; row < state.workerGrid.rows; row++) {
		for (let col = 0; col < state.workerGrid.cols; col++) {
			if (idx < workerCount) {
				const pane = state.workerPanes[idx];
				if (pane) {
					pane.gridRow = row;
					pane.gridCol = col;
				}
				idx++;
			}
		}
	}

	state.needsRender = true;
}

/**
 * Adds a new worker agent.
 *
 * @param state - Application state
 * @param spec - Agent specification string (e.g., "claude", "codex:/path/to/worktree")
 * @returns The created worker pane
 */
export function addWorker(state: AppState, spec: string): AgentPane {
	const preset = parseAgentSpec(spec);

	// Extract cwd from spec if present (e.g., "claude:/path/to/worktree")
	let cwd = state.workspacePath;
	const colonIndex = spec.indexOf(':');
	if (colonIndex > 0 && spec.length > colonIndex + 1) {
		const potentialPath = spec.slice(colonIndex + 1);
		if (potentialPath.startsWith('/')) {
			cwd = potentialPath;
		}
	}

	// Build args, including MCP config for Claude agents
	const workerArgs: string[] = [...preset.args];
	if (state.mcpConfigPath && preset.kind === 'claude') {
		workerArgs.push('--mcp-config', state.mcpConfigPath);
	}

	// Spawn the worker
	const pane = spawnAgent(state, {
		kind: preset.kind,
		label: `${preset.label} (Worker)`,
		command: preset.command,
		args: workerArgs,
		cwd,
		env: preset.env,
		mock: state.mockMode,
	});

	// Add to workers array
	state.workerPanes.push(pane);

	// Recalculate grid layout
	recalculateGrid(state);

	return pane;
}

/**
 * Removes a worker agent by index.
 *
 * @param state - Application state
 * @param index - Worker index to remove
 */
export function removeWorker(state: AppState, index: number): void {
	const pane = state.workerPanes[index];

	if (!pane) {
		return; // Invalid index
	}

	// Terminate the agent
	terminateAgent(state, pane);

	// Adjust focus if necessary
	if (state.focusedWorkerIndex >= state.workerPanes.length) {
		state.focusedWorkerIndex = Math.max(0, state.workerPanes.length - 1);
	}

	// Recalculate grid
	recalculateGrid(state);
}

/**
 * Removes the currently focused worker.
 *
 * @param state - Application state
 */
export function removeFocusedWorker(state: AppState): void {
	if (state.workerPanes.length === 0) {
		return; // No workers to remove
	}

	removeWorker(state, state.focusedWorkerIndex);
}
