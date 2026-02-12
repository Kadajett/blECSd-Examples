/**
 * Application state initialization.
 *
 * @module agent-orchestrator/state/appState
 */

import type { World } from 'blecsd';
import type { AppState, CliArgs } from '../types.js';
import { parseAgentSpec } from '../config.js';

/**
 * Creates the initial AppState from CLI arguments.
 *
 * @param world - The bitecs world instance
 * @param cliArgs - Parsed CLI arguments
 * @returns Initial application state
 */
export function createAppState(world: World, cliArgs: CliArgs): AppState {
	const orchestratorSpec = parseAgentSpec(cliArgs.orchestrator);

	return {
		world,

		// Backend
		backend: null,

		// Orchestrator
		orchestratorPane: null,

		// Workers
		workerPanes: [],
		workerGrid: { rows: 1, cols: 1 },
		focusedWorkerIndex: 0,

		// Focus
		focusTarget: 'worker',

		// UI state
		inputMode: 'direct',
		commandBuffer: '',
		screenWidth: process.stdout.columns ?? 120,
		screenHeight: process.stdout.rows ?? 30,
		running: true,
		needsRender: true,
		showCursor: false,

		// Memory sidebar
		sidebar: {
			visible: !cliArgs.noSidebar,
			focused: false,
			tab: 'rag',
			scrollOffset: 0,
			searchQuery: '',
			searchResults: [],
			width: 25,
		},

		// Overlay
		overlay: {
			kind: 'none',
			searchQuery: '',
			selectedIndex: 0,
			filteredItems: [],
		},

		// Activity tracking
		activity: {
			counters: new Map(),
			history: new Map(),
		},

		// Database
		db: null,
		ragIndex: null,
		dbOps: null,

		// Config
		mockMode: cliArgs.mock,
		useTmux: !cliArgs.blecsd,
		orchestratorKind: orchestratorSpec.kind,
		workspacePath: cliArgs.workspace,
		dbPath: cliArgs.db,

		// Counters
		nextAgentId: 0,
	};
}
