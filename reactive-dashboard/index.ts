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
import { createSignal, createEffect } from 'blecsd/core';
import {
	enterAlternateScreen,
	hideCursor,
	leaveAlternateScreen,
	setOutputStream,
	showCursor,
	writeRaw,
} from 'blecsd/systems';
import { parseKeyBuffer } from 'blecsd/terminal';
import { createCellBuffer, type CellBuffer } from 'blecsd/utils';

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
// TYPE ALIASES (WORKAROUNDS)
// =============================================================================

// Type alias to avoid Cell collision
type BufferWithCells = ReturnType<typeof createCellBuffer>;

// =============================================================================
// STATE
// =============================================================================

interface AppState {
	running: boolean;
	needsRedraw: boolean;
	termWidth: number;
	termHeight: number;
}

// =============================================================================
// BUFFER TO ANSI (LOCAL IMPLEMENTATION)
// =============================================================================

/**
 * Convert a cell buffer to ANSI escape sequences.
 * This is needed because bufferToAnsi is not exported by blecsd.
 */
function bufferToAnsi(buffer: BufferWithCells): string {
	const lines: string[] = [];
	for (let y = 0; y < buffer.height; y++) {
		let line = '';
		let prevFg = -1;
		let prevBg = -1;
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.cells[y]?.[x];
			if (!cell) continue;
			if (cell.fg !== prevFg || cell.bg !== prevBg) {
				const fgR = (cell.fg >> 16) & 0xff;
				const fgG = (cell.fg >> 8) & 0xff;
				const fgB = cell.fg & 0xff;
				const bgR = (cell.bg >> 16) & 0xff;
				const bgG = (cell.bg >> 8) & 0xff;
				const bgB = cell.bg & 0xff;
				line += `\x1b[38;2;${fgR};${fgG};${fgB};48;2;${bgR};${bgG};${bgB}m`;
				prevFg = cell.fg;
				prevBg = cell.bg;
			}
			line += cell.char;
		}
		lines.push(line);
	}
	return '\x1b[H' + lines.join('\n') + '\x1b[0m';
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * Render the entire dashboard to a cell buffer.
 */
function renderToBuffer(
	state: AppState,
	theme: Theme,
	cpu: ReturnType<typeof createCpuSignal>[0],
	memory: ReturnType<typeof createMemorySignal>[0],
	network: ReturnType<typeof createNetworkSignal>[0],
	system: ReturnType<typeof createSystemSignal>[0],
): BufferWithCells {
	const buffer = createCellBuffer(state.termWidth, state.termHeight, theme.fg, theme.bg);

	const { termWidth, termHeight } = state;

	// Calculate panel dimensions
	const leftWidth = Math.floor(termWidth * 0.6);
	const rightWidth = termWidth - leftWidth;
	const cpuHeight = Math.min(os.cpus().length + 5, Math.floor((termHeight - 1) * 0.5));
	const memoryHeight = Math.floor((termHeight - 1 - cpuHeight) * 0.5);
	const networkHeight = termHeight - 1 - cpuHeight - memoryHeight;

	// Get current data from signals
	const cpuData = cpu();
	const memoryData = memory();
	const networkData = network();
	const systemData = system();

	// Left column
	renderCpuPanel(buffer, cpuData, 0, 0, leftWidth, cpuHeight, theme);
	renderMemoryPanel(buffer, memoryData, 0, cpuHeight, leftWidth, memoryHeight, theme);
	renderNetworkPanel(buffer, networkData, 0, cpuHeight + memoryHeight, leftWidth, networkHeight, theme);

	// Right column
	renderSystemPanel(buffer, systemData, leftWidth, 0, rightWidth, termHeight - 1, theme);

	// Status bar
	renderStatusBar(buffer, termWidth, termHeight, theme);

	return buffer;
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

/**
 * Handle key press events.
 */
function handleKeypress(state: AppState, keyEvent: ReturnType<typeof parseKeyBuffer>[number]): void {
	// Quit on 'q' or Ctrl+C
	if (keyEvent.name === 'q' || (keyEvent.ctrl && keyEvent.name === 'c')) {
		state.running = false;
		return;
	}
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
	const state: AppState = {
		running: true,
		needsRedraw: true,
		termWidth: process.stdout.columns ?? 80,
		termHeight: process.stdout.rows ?? 24,
	};

	// Create theme signal [getter, setter]
	const [getTheme, setTheme] = createSignal<Theme>(darkTheme);

	// Create data source signals [getter, dispose]
	const [getCpu] = createCpuSignal();
	const [getMemory] = createMemorySignal();
	const [getNetwork] = createNetworkSignal();
	const [getSystem] = createSystemSignal();

	// Create computed signals (just getters)
	const getCpuColor = createCpuColorSignal(getCpu);
	const getMemoryColor = createMemoryColorSignal(getMemory);

	// Create effects for alerts (auto-track dependencies)
	createCpuAlertEffect(getCpu);
	createMemoryAlertEffect(getMemory);

	// Terminal setup
	if (process.stdin.isTTY) process.stdin.setRawMode(true);
	process.stdin.resume();
	setOutputStream(process.stdout);
	hideCursor();
	enterAlternateScreen();

	let terminalRestored = false;
	const restoreTerminal = (): void => {
		if (terminalRestored) return;
		terminalRestored = true;
		leaveAlternateScreen();
		showCursor();
		writeRaw('\x1b[0m');
		if (process.stdin.isTTY) process.stdin.setRawMode(false);
		process.stdin.pause();
	};

	// Input handler - use parseKeyBuffer
	process.stdin.on('data', (data: Buffer) => {
		if (!state.running) return;
		const keyEvents = parseKeyBuffer(data);
		for (const keyEvent of keyEvents) {
			// Handle quit
			if (keyEvent.name === 'q' || (keyEvent.ctrl && keyEvent.name === 'c')) {
				state.running = false;
				return;
			}

			// Handle theme cycling
			if (keyEvent.name === 't') {
				const nextTheme = getNextTheme(getTheme());
				setTheme(nextTheme);
				state.needsRedraw = true;
				return;
			}

			// Handle refresh
			if (keyEvent.name === 'r') {
				state.needsRedraw = true;
				return;
			}
		}
	});

	// Resize handler
	process.stdout.on('resize', () => {
		state.termWidth = process.stdout.columns ?? 80;
		state.termHeight = process.stdout.rows ?? 24;
		state.needsRedraw = true;
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
		state.needsRedraw = true;
	});

	// Initial render
	writeRaw(bufferToAnsi(renderToBuffer(state, getTheme(), getCpu, getMemory, getNetwork, getSystem)));
	state.needsRedraw = false;

	// Render loop
	const renderInterval = setInterval(() => {
		if (!state.running) {
			clearInterval(renderInterval);
			restoreTerminal();
			process.exit(0);
			return;
		}

		// Trigger redraw on every interval for live data updates
		state.needsRedraw = true;

		if (state.needsRedraw) {
			writeRaw(bufferToAnsi(renderToBuffer(state, getTheme(), getCpu, getMemory, getNetwork, getSystem)));
			state.needsRedraw = false;
		}
	}, 50);

	const exit = (): void => {
		state.running = false;
		clearInterval(renderInterval);
		restoreTerminal();
		process.exit(0);
	};

	process.on('SIGINT', exit);
	process.on('SIGTERM', exit);
}

main();
