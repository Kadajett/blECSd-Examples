// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi } from 'vitest';
import type { AgentPane, AppState } from '../types.js';

vi.mock('../config.js', () => ({
	parseAgentSpec: vi.fn(),
	calculateGridDimensions: vi.fn(),
}));

vi.mock('./lifecycle.js', () => ({
	spawnAgent: vi.fn(),
	terminateAgent: vi.fn(),
}));

import { addWorker, removeWorker } from './worker.js';
import { parseAgentSpec, calculateGridDimensions } from '../config.js';
import { spawnAgent, terminateAgent } from './lifecycle.js';

function makePane(id: string): AgentPane {
	return {
		terminal: {} as AgentPane['terminal'],
		agent: {
			id,
			kind: 'claude',
			label: id,
			command: 'claude',
			args: [],
			cwd: '/workspace',
			env: {},
			status: 'running',
			spawnedAt: Date.now(),
			lastOutputAt: Date.now(),
			outputLineCount: 0,
		},
		x: 0,
		y: 0,
		width: 80,
		height: 24,
		gridRow: 0,
		gridCol: 0,
	};
}

function makeState(): AppState {
	return {
		world: {} as AppState['world'],
		backend: null,
		orchestratorPane: null,
		workerPanes: [],
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
		sidebar: {
			visible: true,
			focused: false,
			tab: 'rag',
			scrollOffset: 0,
			searchQuery: '',
			searchResults: [],
			width: 25,
		},
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
		startTime: Date.now(),
		nextAgentId: 0,
	};
}

describe('agents/worker', () => {
	it('addWorker spawns pane, appends it, and recalculates grid', () => {
		const state = makeState();
		const pane = makePane('worker-1');

		// @ts-ignore mocked function
		parseAgentSpec.mockReturnValue({
			kind: 'codex',
			label: 'Codex CLI',
			command: 'codex',
			args: ['--full-auto'],
			env: {},
		});
		// @ts-ignore mocked function
		calculateGridDimensions.mockReturnValue({ rows: 1, cols: 1 });
		// @ts-ignore mocked function
		spawnAgent.mockReturnValue(pane);

		const created = addWorker(state, 'codex:/tmp/worktree-1');

		expect(created).toBe(pane);
		expect(state.workerPanes).toHaveLength(1);
		expect(state.workerPanes[0]).toBe(pane);
		expect(pane.gridRow).toBe(0);
		expect(pane.gridCol).toBe(0);
		expect(state.needsRender).toBe(true);
		// @ts-ignore mocked function
		const spawnConfig = spawnAgent.mock.calls[0]?.[1];
		expect(spawnConfig?.cwd).toBe('/tmp/worktree-1');
	});

	it('recalculateGrid behavior is applied as workers are added', () => {
		const state = makeState();
		const paneA = makePane('worker-a');
		const paneB = makePane('worker-b');
		let spawnCount = 0;

		// @ts-ignore mocked function
		parseAgentSpec.mockReturnValue({
			kind: 'claude',
			label: 'Claude Code',
			command: 'claude',
			args: [],
			env: {},
		});
		// @ts-ignore mocked function
		calculateGridDimensions.mockImplementation((count: number) => {
			return count <= 1 ? { rows: 1, cols: 1 } : { rows: 1, cols: 2 };
		});
		// @ts-ignore mocked function
		spawnAgent.mockImplementation(() => {
			spawnCount++;
			return spawnCount === 1 ? paneA : paneB;
		});

		addWorker(state, 'claude');
		addWorker(state, 'claude');

		expect(state.workerGrid).toEqual({ rows: 1, cols: 2 });
		expect(state.workerPanes[0]?.gridRow).toBe(0);
		expect(state.workerPanes[0]?.gridCol).toBe(0);
		expect(state.workerPanes[1]?.gridRow).toBe(0);
		expect(state.workerPanes[1]?.gridCol).toBe(1);
	});

	it('removeWorker ignores invalid index (bounds check)', () => {
		const state = makeState();
		state.workerPanes.push(makePane('worker-only'));
		state.needsRender = false;

		removeWorker(state, 99);

		expect(state.workerPanes).toHaveLength(1);
		// @ts-ignore mocked function
		expect(terminateAgent).toHaveBeenCalledTimes(0);
		expect(state.needsRender).toBe(false);
	});

	it('removeWorker removes worker, adjusts focus, and recalculates grid', () => {
		const state = makeState();
		const paneA = makePane('worker-a');
		const paneB = makePane('worker-b');
		state.workerPanes.push(paneA, paneB);
		state.focusedWorkerIndex = 2;

		// @ts-ignore mocked function
		calculateGridDimensions.mockReturnValue({ rows: 1, cols: 1 });
		// @ts-ignore mocked function
		terminateAgent.mockImplementation((s: AppState, pane: AgentPane) => {
			const idx = s.workerPanes.indexOf(pane);
			if (idx >= 0) s.workerPanes.splice(idx, 1);
			s.needsRender = true;
		});

		removeWorker(state, 1);

		expect(state.workerPanes).toHaveLength(1);
		expect(state.workerPanes[0]).toBe(paneA);
		expect(state.focusedWorkerIndex).toBe(0);
		expect(state.workerGrid).toEqual({ rows: 1, cols: 1 });
		// @ts-ignore mocked function
		expect(terminateAgent).toHaveBeenCalledTimes(1);
	});
});
