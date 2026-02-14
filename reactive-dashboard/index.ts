#!/usr/bin/env node
/**
 * Reactive Dashboard Example
 *
 * Demonstrates blECSd's signal system with:
 * - Polling signals for live data (CPU, memory, network, system)
 * - Computed signals for derived values (color thresholds)
 * - Effects for side effects (alerts, logging)
 * - Signal-based theme switching
 * - Declarative reactive programming
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
import { createSignal, createEffect } from 'blecsd';
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

import {
	createCpuSignal,
	createMemorySignal,
	createNetworkSignal,
	createSystemSignal,
	createCpuColorSignal,
	createMemoryColorSignal,
} from './data';

import { createCpuAlertEffect, createMemoryAlertEffect } from './effects';

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

const RENDER_FPS = 10;

// =============================================================================
// STATE
// =============================================================================

interface AppState {
	running: boolean;
	needsRender: boolean;
	screenWidth: number;
	screenHeight: number;
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
	};

	// Create theme signal [getter, setter]
	const [getTheme, setTheme] = createSignal<Theme>(darkTheme);

	// Create data source signals [getter, dispose]
	const [getCpu, disposeCpu] = createCpuSignal();
	const [getMemory, disposeMemory] = createMemorySignal();
	const [getNetwork, disposeNetwork] = createNetworkSignal();
	const [getSystem, disposeSystem] = createSystemSignal();

	// Create computed signals (just getters)
	const getCpuColor = createCpuColorSignal(getCpu);
	const getMemoryColor = createMemoryColorSignal(getMemory);

	// Create effects for alerts (auto-track dependencies)
	createCpuAlertEffect(getCpu);
	createMemoryAlertEffect(getMemory);

	// Terminal setup
	setOutputStream(process.stdout);
	enterAlternateScreen();
	clearScreen();
	hideCursor();

	stdin.setRawMode?.(true);
	stdin.resume();

	// Render function
	function render(): void {
		hideCursor();
		cursorHome();

		const { screenWidth, screenHeight } = state;
		const theme = getTheme();

		// Get current data from signals (call getter functions)
		const cpu = getCpu();
		const memory = getMemory();
		const network = getNetwork();
		const system = getSystem();

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

	// Input handler
	stdin.on('data', (data: Buffer) => {
		const key = data.toString();

		if (key === 'q' || key === 'Q' || key === '\x03') {
			state.running = false;
			return;
		}

		if (key === 't' || key === 'T') {
			const nextTheme = getNextTheme(getTheme());
			setTheme(nextTheme);
			state.needsRender = true;
			return;
		}

		if (key === 'r' || key === 'R') {
			state.needsRender = true;
			return;
		}
	});

	// Resize handler
	stdout.on('resize', () => {
		state.screenWidth = stdout.columns ?? 80;
		state.screenHeight = stdout.rows ?? 24;
		state.needsRender = true;
	});

	// Use createEffect to automatically track signal changes and trigger re-render
	createEffect(() => {
		// Access all signals to track them as dependencies
		getCpu();
		getMemory();
		getNetwork();
		getSystem();
		getTheme();

		// Mark that we need a re-render
		state.needsRender = true;
	});

	// Render loop
	const FRAME_MS = 1000 / RENDER_FPS;
	const loop = (): void => {
		if (!state.running) {
			showCursor();
			leaveAlternateScreen();
			process.exit(0);
		}

		if (state.needsRender) {
			render();
			state.needsRender = false;
		}

		setTimeout(loop, FRAME_MS);
	};

	// Initial render
	render();
	loop();
}

main().catch((err) => {
	showCursor();
	leaveAlternateScreen();
	console.error('Error:', err);
	process.exit(1);
});
