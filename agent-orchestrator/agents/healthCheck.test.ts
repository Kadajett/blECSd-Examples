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

		for (let i = 0; i < AGENT_MAX_RESTARTS + 2; i++) {
			checkAgentHealth(state);
			state.workerPanes[0] = makePane(`old-${i + 10}`, false, 'running', 'Worker B');
		}

		expect((spawnAgent as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(AGENT_MAX_RESTARTS);
	});
});
