// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agents/worker.js', () => ({
	addWorker: vi.fn(),
	removeFocusedWorker: vi.fn(),
}));

vi.mock('../ui/layout.js', () => ({
	resizeAllPanes: vi.fn(),
}));

vi.mock('../ui/toast.js', () => ({
	addToast: vi.fn(),
}));

import { handleInput } from './handlers.js';
import { addToast } from '../ui/toast.js';
import type { AppState, AgentPane } from '../types.js';

function makePane(id: string, x = 0, y = 1, width = 40, height = 12): AgentPane {
	const terminal = {
		isRunning: () => true,
		input: vi.fn(),
		resize: vi.fn(),
		getDimensions: () => ({ width: Math.max(1, width - 2), height: Math.max(1, height - 2) }),
		getCells: () => [],
		getCursor: () => ({ x: 0, y: 0 }),
	} as unknown as AgentPane['terminal'];

	return {
		terminal,
		agent: {
			id,
			kind: 'claude',
			label: id,
			command: 'claude',
			args: [],
			cwd: '/workspace',
			env: {},
			status: 'running',
			spawnedAt: Date.now() - 1000,
			lastOutputAt: Date.now(),
			outputLineCount: 0,
		},
		x,
		y,
		width,
		height,
		gridRow: 0,
		gridCol: 0,
	};
}

function makeState(): AppState {
	const worker = makePane('worker-1', 40, 1, 40, 12);
	return {
		world: {} as AppState['world'],
		backend: null,
		orchestratorPane: makePane('orch-0', 0, 1, 40, 12),
		workerPanes: [worker],
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
		useTmux: false,
		orchestratorKind: 'claude',
		workspacePath: '/workspace',
		dbPath: './orchestrator.db',
		startTime: Date.now(),
		nextAgentId: 0,
	};
}

function enterPrefix(state: AppState): void {
	handleInput(state, '\x01');
	expect(state.inputMode).toBe('prefix');
}

describe('input/handlers prefix bindings and overlays', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('Ctrl+A d opens agent detail overlay', () => {
		const state = makeState();
		enterPrefix(state);
		handleInput(state, 'd');
		expect(state.overlay.kind).toBe('agent-detail');
		expect(state.inputMode).toBe('direct');
	});

	it('Ctrl+A h opens help overlay', () => {
		const state = makeState();
		enterPrefix(state);
		handleInput(state, 'h');
		expect(state.overlay.kind).toBe('help');
		expect(state.inputMode).toBe('direct');
	});

	it('Ctrl+A space opens command palette', () => {
		const state = makeState();
		enterPrefix(state);
		handleInput(state, ' ');
		expect(state.overlay.kind).toBe('command-palette');
		expect(state.overlay.filteredItems.length).toBeGreaterThan(0);
	});

	it('Ctrl+A right resizes focused pane and shows toast', () => {
		const state = makeState();
		const worker = state.workerPanes[0];
		expect(worker).toBeTruthy();
		const beforeWidth = worker?.width ?? 0;

		enterPrefix(state);
		handleInput(state, '\x1b[C'); // right arrow

		expect(state.inputMode).toBe('direct');
		expect((state.workerPanes[0]?.width ?? 0)).toBeGreaterThanOrEqual(beforeWidth);
		expect(addToast).toHaveBeenCalled();
	});

	it('Ctrl+A down resizes focused pane height and keeps bounds', () => {
		const state = makeState();
		const beforeHeight = state.workerPanes[0]?.height ?? 0;

		enterPrefix(state);
		handleInput(state, '\x1b[B'); // down arrow

		expect((state.workerPanes[0]?.height ?? 0)).toBeGreaterThanOrEqual(beforeHeight);
		expect(addToast).toHaveBeenCalled();
	});
});
