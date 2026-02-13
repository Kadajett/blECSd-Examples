// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./lifecycle.js', () => ({
	spawnAgent: vi.fn(),
}));

import { checkAgentHealth, AGENT_MAX_RESTARTS } from './healthCheck.js';
import { spawnAgent } from './lifecycle.js';
import type { AgentPane, AppState } from '../types.js';

function makePane(
	id: string,
	running: boolean,
	status: AgentPane['agent']['status'] = 'running',
	label = 'Worker A',
): AgentPane {
	return {
		terminal: {
			isRunning: () => running,
		} as AgentPane['terminal'],
		agent: {
			id,
			kind: 'claude',
			label,
			command: 'claude',
			args: [],
			cwd: '/workspace',
			env: {},
			status,
			spawnedAt: Date.now(),
			lastOutputAt: Date.now(),
			outputLineCount: 0,
		},
		x: 1,
		y: 2,
		width: 80,
		height: 24,
		gridRow: 0,
		gridCol: 0,
	};
}

function makeState(workerPane: AgentPane): AppState {
	return {
		world: {} as AppState['world'],
		backend: null,
		orchestratorPane: null,
		workerPanes: [workerPane],
		workerGrid: { rows: 1, cols: 1 },
		focusedWorkerIndex: 0,
		focusTarget: 'worker',
		inputMode: 'direct',
		commandBuffer: '',
		screenWidth: 120,
		screenHeight: 30,
		running: true,
		needsRender: false,
		showCursor: false,
		sidebar: { visible: true, focused: false, tab: 'rag', scrollOffset: 0, searchQuery: '', searchResults: [], width: 25 },
		overlay: { kind: 'none', searchQuery: '', selectedIndex: 0, filteredItems: [] },
		activity: { counters: new Map(), history: new Map() },
		db: null,
		ragIndex: null,
		dbOps: null,
		mockMode: false,
		useTmux: true,
		orchestratorKind: 'claude',
		workspacePath: '/workspace',
		dbPath: './orchestrator.db',
		mcpConfigPath: null,
		startTime: Date.now(),
		nextAgentId: 0,
	};
}

describe('agents/healthCheck restart behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('restarts a crashed worker and replaces pane reference', () => {
		const crashed = makePane('old-1', false, 'running');
		const replacement = makePane('new-1', true, 'starting');
		// @ts-ignore mocked fn
		spawnAgent.mockReturnValue(replacement);

		const state = makeState(crashed);
		const result = checkAgentHealth(state);

		expect(spawnAgent).toHaveBeenCalledTimes(1);
		expect(state.workerPanes[0]).toBe(replacement);
		expect(state.workerPanes[0]?.gridRow).toBe(0);
		expect(state.workerPanes[0]?.gridCol).toBe(0);
		expect(result.changed.length).toBe(1);
		expect(state.needsRender).toBe(true);
	});

	it('caps restart attempts at max restarts', () => {
		const crashed = makePane('old-2', false, 'running', 'Worker B');
		const replacement = makePane('new-2', false, 'starting', 'Worker B');
		// @ts-ignore mocked fn
		spawnAgent.mockReturnValue(replacement);

		const state = makeState(crashed);
		let lastResult = checkAgentHealth(state);

		for (let i = 0; i < AGENT_MAX_RESTARTS + 2; i++) {
			lastResult = checkAgentHealth(state);
			state.workerPanes[0] = makePane(`old-${i + 10}`, false, 'running', 'Worker B');
		}

		expect((spawnAgent as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(AGENT_MAX_RESTARTS);
		state.workerPanes[0] = makePane('old-final', false, 'running', 'Worker B');
		lastResult = checkAgentHealth(state);
		expect(state.workerPanes[0]?.agent.status).toBe('error');
		expect(lastResult.changed[0]?.to).toBe('error');
		expect((spawnAgent as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(AGENT_MAX_RESTARTS);
	});

	it('resets restart count after the agent is healthy and running again', () => {
		const crashed = makePane('old-reset-1', false, 'running', 'Worker Reset');
		const replacementDown = makePane('new-reset-1', false, 'starting', 'Worker Reset');
		const replacementUp = makePane('new-reset-2', true, 'starting', 'Worker Reset');
		const spawnAgentMock = spawnAgent as unknown as ReturnType<typeof vi.fn>;

		spawnAgentMock
			.mockReturnValueOnce(replacementDown)
			.mockReturnValueOnce(replacementDown)
			.mockReturnValueOnce(replacementDown)
			.mockReturnValueOnce(replacementUp);

		const state = makeState(crashed);

		// Consume all restart attempts.
		for (let i = 0; i < AGENT_MAX_RESTARTS; i++) {
			checkAgentHealth(state);
			state.workerPanes[0] = makePane(`old-reset-${i + 10}`, false, 'running', 'Worker Reset');
		}

		// No restarts left => error.
		checkAgentHealth(state);
		expect(state.workerPanes[0]?.agent.status).toBe('error');

		// Running again should clear restart counter.
		state.workerPanes[0] = makePane('old-reset-running', true, 'running', 'Worker Reset');
		checkAgentHealth(state);

		// Crash once more should restart again.
		state.workerPanes[0] = makePane('old-reset-crash-again', false, 'running', 'Worker Reset');
		checkAgentHealth(state);
		expect(spawnAgentMock.mock.calls.length).toBe(AGENT_MAX_RESTARTS + 1);
	});
});
