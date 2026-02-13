// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../tmux/controller.js', () => ({
	killSession: vi.fn(),
}));

vi.mock('../mcp/server.js', () => ({
	stopMcpServer: vi.fn(async () => undefined),
}));

vi.mock('../utils/logger.js', () => ({
	log: vi.fn(),
	warn: vi.fn(),
}));

import { cleanupBlecsd, cleanupTmux, setDbModuleForCleanup } from './cleanup.js';
import * as tmux from '../tmux/controller.js';
import { stopMcpServer } from '../mcp/server.js';
import { log } from '../utils/logger.js';
import type { AppState } from '../types.js';

function makePane() {
	return {
		terminal: {
			kill: vi.fn(),
			destroy: vi.fn(),
		},
	} as unknown as AppState['workerPanes'][number];
}

function makeState(): AppState {
	return {
		world: {} as AppState['world'],
		backend: null,
		orchestratorPane: makePane(),
		workerPanes: [makePane(), makePane()],
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

describe('helpers/cleanup', () => {
	const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
	const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
	const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => code as never) as never);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		setDbModuleForCleanup(null);
	});

	it('cleanupBlecsd clears timers, kills panes, stops mcp, closes db, exits', async () => {
		const closeDatabase = vi.fn();
		setDbModuleForCleanup({ closeDatabase } as unknown as typeof import('../db/index.js'));
		const state = makeState();
		const db = {} as unknown;
		const ragTimer = setInterval(() => undefined, 10000);
		const activityTicker = setInterval(() => undefined, 10000);
		const mcpState = { port: 1, server: {} } as unknown;

		const healthTimer = setInterval(() => undefined, 30000);
		cleanupBlecsd(state, db as never, ragTimer, activityTicker, healthTimer, mcpState as never);
		await Promise.resolve();

		expect(clearIntervalSpy).toHaveBeenCalled();
		expect((state.orchestratorPane?.terminal.kill as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
		expect((state.orchestratorPane?.terminal.destroy as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
		expect(stopMcpServer).toHaveBeenCalledTimes(1);
		expect(closeDatabase).toHaveBeenCalledTimes(1);
		expect(stdoutSpy).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('cleanupTmux kills session, clears timer, stops mcp, closes db', async () => {
		const closeDatabase = vi.fn();
		setDbModuleForCleanup({ closeDatabase } as unknown as typeof import('../db/index.js'));
		const ragTimer = setInterval(() => undefined, 10000);
		const db = {} as unknown;
		const mcpState = { port: 1, server: {} } as unknown;

		cleanupTmux('session-1', db as never, ragTimer, mcpState as never);
		await Promise.resolve();

		expect(tmux.killSession).toHaveBeenCalledWith('session-1');
		expect(clearIntervalSpy).toHaveBeenCalled();
		expect(stopMcpServer).toHaveBeenCalledTimes(1);
		expect(closeDatabase).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('Tmux session cleaned up');
	});
});
