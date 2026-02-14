#!/usr/bin/env node
/**
 * Reactive Dashboard Example
 *
 * Demonstrates a reactive-style dashboard with:
 * - Live system data polling (CPU, memory, network, system info)
 * - Color-coded thresholds
 * - Theme switching at runtime
 * - Clean separation of data, rendering, and effects
 *
 * While this example uses polling with setInterval (matching system-monitor pattern),
 * it demonstrates reactive programming principles with pure functions and
 * data-driven rendering.
 *
 * Controls:
 * - q or Ctrl+C: Quit
 * - t: Cycle theme
 * - r: Force refresh
 *
 * Run: pnpm dev
 *
 * @module examples/reactive-dashboard
 */

import * as os from 'node:os';
import {
	clearScreen,
	cursorHome,
	enterAlternateScreen,
	hideCursor,
	leaveAlternateScreen,
	showCursor,
	writeRaw,
	setOutputStream,
} from 'blecsd';

import { calculateCpuUsage, getMemoryData, getNetworkData, getSystemData } from './data';
import type { CpuData, MemoryData, NetworkData, SystemData } from './data';
import { checkCpuAlert, checkMemoryAlert } from './effects';
import {
	renderCpuPanel,
	renderMemoryPanel,
	renderNetworkPanel,
	renderSystemPanel,
	renderStatusBar,
} from './layout';
import { darkTheme, getNextTheme, type Theme } from './theme';

// =============================================================================
// CONFIGURATION
// =============================================================================

const POLL_INTERVAL_MS = 1000;
const RENDER_FPS = 10;

// =============================================================================
// STATE
// =============================================================================

interface AppState {
	running: boolean;
	needsRender: boolean;
	screenWidth: number;
	screenHeight: number;
	theme: Theme;
	cpu: CpuData;
	memory: MemoryData;
	network: NetworkData;
	system: SystemData;
}

// =============================================================================
// DATA POLLING
// =============================================================================

/**
 * Poll all data sources and update state.
 */
function pollData(state: AppState): void {
	state.cpu = calculateCpuUsage();
	state.memory = getMemoryData();
	state.network = getNetworkData();
	state.system = getSystemData();

	// Run side effects
	checkCpuAlert(state.cpu);
	checkMemoryAlert(state.memory);

	state.needsRender = true;
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * Render the entire dashboard.
 */
function render(state: AppState): void {
	hideCursor();
	cursorHome();

	const { screenWidth, screenHeight, theme, cpu, memory, network, system } = state;

	// Calculate panel dimensions
	const leftWidth = Math.floor(screenWidth * 0.6);
	const rightWidth = screenWidth - leftWidth;
	const cpuHeight = Math.min(os.cpus().length + 5, Math.floor((screenHeight - 1) * 0.5));
	const memoryHeight = Math.floor((screenHeight - 1 - cpuHeight) * 0.5);
	const networkHeight = screenHeight - 1 - cpuHeight - memoryHeight;

	let output = '';

	// Left column
	output += renderCpuPanel(cpu, 1, 1, leftWidth, cpuHeight, theme);
	output += renderMemoryPanel(memory, 1, cpuHeight + 1, leftWidth, memoryHeight, theme);
	output += renderNetworkPanel(network, 1, cpuHeight + memoryHeight + 1, leftWidth, networkHeight, theme);

	// Right column
	output += renderSystemPanel(system, leftWidth + 1, 1, rightWidth, screenHeight - 1, theme);

	// Status bar
	output += renderStatusBar(screenWidth, screenHeight, theme);

	writeRaw(output);
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

/**
 * Handle keyboard input.
 */
function handleInput(state: AppState, data: string): void {
	if (data === 'q' || data === 'Q' || data === '\x03') {
		state.running = false;
		return;
	}

	if (data === 't' || data === 'T') {
		state.theme = getNextTheme(state.theme);
		state.needsRender = true;
		return;
	}

	if (data === 'r' || data === 'R') {
		pollData(state);
		return;
	}
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
	const stdout = process.stdout;
	const stdin = process.stdin;

	const screenWidth = stdout.columns ?? 80;
	const screenHeight = stdout.rows ?? 24;

	// Initialize state
	const state: AppState = {
		running: true,
		needsRender: true,
		screenWidth,
		screenHeight,
		theme: darkTheme,
		cpu: { perCore: [], average: 0, loadAvg: [0, 0, 0] },
		memory: { used: 0, total: os.totalmem(), percent: 0 },
		network: { rx: 0, tx: 0, rxRate: 0, txRate: 0 },
		system: {
			uptime: 0,
			hostname: os.hostname(),
			platform: os.platform(),
			arch: os.arch(),
		},
	};

	// Terminal setup
	setOutputStream(process.stdout);
	enterAlternateScreen();
	clearScreen();
	hideCursor();

	stdin.setRawMode?.(true);
	stdin.resume();

	// Input handler
	stdin.on('data', (data: Buffer) => {
		handleInput(state, data.toString());
	});

	// Resize handler
	stdout.on('resize', () => {
		state.screenWidth = stdout.columns ?? 80;
		state.screenHeight = stdout.rows ?? 24;
		state.needsRender = true;
	});

	// Initial poll
	pollData(state);

	// Data polling interval
	const pollInterval = setInterval(() => {
		if (state.running) {
			pollData(state);
		}
	}, POLL_INTERVAL_MS);

	// Render loop
	const FRAME_MS = 1000 / RENDER_FPS;
	const loop = (): void => {
		if (!state.running) {
			clearInterval(pollInterval);
			showCursor();
			leaveAlternateScreen();
			process.exit(0);
		}

		if (state.needsRender) {
			render(state);
			state.needsRender = false;
		}

		setTimeout(loop, FRAME_MS);
	};

	// Start
	render(state);
	loop();
}

main().catch((err) => {
	showCursor();
	leaveAlternateScreen();
	console.error('Error:', err);
	process.exit(1);
});
