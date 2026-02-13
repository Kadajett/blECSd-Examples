// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../agents/worker.js', () => ({
	addWorker: vi.fn(),
	removeFocusedWorker: vi.fn(),
}));

vi.mock('../ui/layout.js', () => ({
	resizeAllPanes: vi.fn(),
}));

import { handleInput } from './handlers.js';
import { addWorker } from '../agents/worker.js';
import { resizeAllPanes } from '../ui/layout.js';
import type { AppState } from '../types.js';

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

function openPalette(state: AppState): void {
	handleInput(state, '\x01'); // Ctrl+A -> prefix
	handleInput(state, 'p');     // open palette
}

describe('input/command palette via handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('command palette opens with expected command labels', () => {
		const state = makeState();
		openPalette(state);

		expect(state.overlay.kind).toBe('command-palette');
		expect(state.overlay.filteredItems).toContain('Add Worker');
		expect(state.overlay.filteredItems).toContain('Toggle Memory Sidebar');
		expect(state.overlay.filteredItems).toContain('Quit');
	});

	it('filters palette items by search text', () => {
		const state = makeState();
		openPalette(state);

		handleInput(state, 'q');
		handleInput(state, 'u');
		handleInput(state, 'i');

		expect(state.overlay.filteredItems).toEqual(['Quit']);
		expect(state.overlay.selectedIndex).toBe(0);
	});

	it('executes selected palette item and mutates state', () => {
		const state = makeState();
		openPalette(state);

		handleInput(state, 'q');
		handleInput(state, 'u');
		handleInput(state, 'i');
		handleInput(state, '\r'); // Enter

		expect(state.overlay.kind).toBe('none');
		expect(state.running).toBe(false);
	});

	it('executes add worker command', () => {
		const state = makeState();
		openPalette(state);
		handleInput(state, '\r'); // default selected index 0: Add Worker
		expect(addWorker).toHaveBeenCalledWith(state, 'claude');
	});

	it('toggle sidebar command triggers resize', () => {
		const state = makeState();
		openPalette(state);

		for (const ch of 'toggle') {
			handleInput(state, ch);
		}
		handleInput(state, '\r');

		expect(resizeAllPanes).toHaveBeenCalledTimes(1);
		expect(state.sidebar.visible).toBe(false);
	});
});
