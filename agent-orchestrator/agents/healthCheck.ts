/**
 * Agent process health checks.
 *
 * @module agent-orchestrator/agents/healthCheck
 */

import type { AppState, AgentPane, AgentStatus } from '../types.js';
import { spawnAgent } from './lifecycle.js';

export const AGENT_HEALTH_CHECK_INTERVAL_MS = 30_000;
export const AGENT_MAX_RESTARTS = 3;

export interface HealthCheckResult {
	checked: number;
	changed: Array<{ agentId: string; from: AgentStatus; to: AgentStatus }>;
}

const restartCounts = new Map<string, number>();

function paneRestartKey(pane: AgentPane): string {
	return [
		pane.agent.kind,
		pane.agent.label,
		pane.agent.command,
		pane.agent.args.join('\0'),
		pane.agent.cwd,
	].join('\x1f');
}

function isPaneRunning(pane: AgentPane): boolean {
	const terminal = pane.terminal as { isRunning?: () => boolean };
	if (typeof terminal.isRunning === 'function') {
		return terminal.isRunning();
	}

	// Conservative fallback when backend terminal does not expose process status.
	return pane.agent.status !== 'stopped' && pane.agent.status !== 'error';
}

function nextStatusForProcessState(
	current: AgentStatus,
	running: boolean,
): AgentStatus {
	if (running) {
		return current === 'starting' ? 'running' : current;
	}

	if (current === 'stopped' || current === 'error') {
		return current;
	}

	if (current === 'idle') {
		return 'stopped';
	}

	return 'error';
}

function replacePaneReference(
	state: AppState,
	oldPane: AgentPane,
	newPane: AgentPane,
): void {
	if (state.orchestratorPane === oldPane) {
		state.orchestratorPane = newPane;
		return;
	}

	const workerIndex = state.workerPanes.indexOf(oldPane);
	if (workerIndex >= 0) {
		state.workerPanes[workerIndex] = newPane;
	}
}

function attemptRestart(state: AppState, pane: AgentPane): AgentPane | null {
	const key = paneRestartKey(pane);
	const restartCount = restartCounts.get(key) ?? 0;
	if (restartCount >= AGENT_MAX_RESTARTS) {
		return null;
	}

	const replacement = spawnAgent(state, {
		kind: pane.agent.kind,
		label: pane.agent.label,
		command: pane.agent.command,
		args: pane.agent.args,
		cwd: pane.agent.cwd,
		env: pane.agent.env,
		mock: state.mockMode,
	});

	restartCounts.set(key, restartCount + 1);
	replacement.x = pane.x;
	replacement.y = pane.y;
	replacement.width = pane.width;
	replacement.height = pane.height;
	replacement.gridRow = pane.gridRow;
	replacement.gridCol = pane.gridCol;

	return replacement;
}

/**
 * Checks orchestrator + workers for crashed/stopped processes and updates status in-place.
 */
export function checkAgentHealth(state: AppState): HealthCheckResult {
	const panes: AgentPane[] = [];
	if (state.orchestratorPane) {
		panes.push(state.orchestratorPane);
	}
	panes.push(...state.workerPanes);

	const changed: Array<{ agentId: string; from: AgentStatus; to: AgentStatus }> = [];

	for (const pane of panes) {
		const running = isPaneRunning(pane);
		const prev = pane.agent.status;
		const next = nextStatusForProcessState(prev, running);
		const restartKey = paneRestartKey(pane);

		if (running) {
			restartCounts.delete(restartKey);
		}

		// If process died unexpectedly, try restarting before marking final error/stopped.
		if (!running && prev !== 'stopped' && prev !== 'error') {
			const restarted = attemptRestart(state, pane);
			if (restarted) {
				replacePaneReference(state, pane, restarted);
				restarted.agent.status = isPaneRunning(restarted) ? 'running' : 'error';
				changed.push({ agentId: pane.agent.id, from: prev, to: restarted.agent.status });
				continue;
			}
		}

		if (next !== prev) {
			pane.agent.status = next;
			changed.push({ agentId: pane.agent.id, from: prev, to: next });
		}
	}

	if (changed.length > 0) {
		state.needsRender = true;
	}

	return {
		checked: panes.length,
		changed,
	};
}

/**
 * Starts periodic health checks (default every 30 seconds).
 */
export function startAgentHealthCheckInterval(
	state: AppState,
	intervalMs = AGENT_HEALTH_CHECK_INTERVAL_MS,
): NodeJS.Timeout {
	return setInterval(() => {
		checkAgentHealth(state);
	}, intervalMs);
}

/**
 * Stops a previously started health check interval.
 */
export function stopAgentHealthCheckInterval(timer: NodeJS.Timeout): void {
	clearInterval(timer);
}
