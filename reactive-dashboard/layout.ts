/**
 * Layout and rendering functions for the reactive dashboard.
 *
 * Uses manual ANSI rendering following the system-monitor pattern.
 */

import type { Theme } from './theme';
import type { CpuData, MemoryData, NetworkData, SystemData } from './data';
import { formatBytes, formatDuration } from './data';

// =============================================================================
// BOX DRAWING CHARACTERS
// =============================================================================

const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';
const BOX_H = '─';
const BOX_V = '│';

// =============================================================================
// PROGRESS BAR CHARACTERS
// =============================================================================

const BAR_FILLED = '█';
const BAR_PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const BAR_EMPTY = '░';

// =============================================================================
// RENDERING HELPERS
// =============================================================================

/**
 * Get color based on threshold.
 */
function getThresholdColor(percent: number, theme: Theme): string {
	if (percent >= 80) return theme.red;
	if (percent >= 50) return theme.yellow;
	return theme.green;
}

/**
 * Render a progress bar.
 */
function renderProgressBar(percent: number, width: number, theme: Theme): string {
	const filledWidth = (percent / 100) * width;
	const fullChars = Math.floor(filledWidth);
	const partialIndex = Math.floor((filledWidth - fullChars) * 8);

	const color = getThresholdColor(percent, theme);
	let bar = color;
	bar += BAR_FILLED.repeat(fullChars);
	if (fullChars < width) {
		bar += BAR_PARTIAL[partialIndex] || '';
		bar += theme.dim + BAR_EMPTY.repeat(width - fullChars - 1);
	}
	bar += theme.reset;

	return bar;
}

/**
 * Draw a box with title.
 */
function drawBox(
	x: number,
	y: number,
	width: number,
	height: number,
	title: string,
	theme: Theme,
): string {
	let output = '';

	// Top border
	output += `\x1b[${y};${x}H`;
	output += theme.accent + BOX_TL;
	const titlePadded = ` ${title} `;
	const leftPad = Math.floor((width - 2 - titlePadded.length) / 2);
	const rightPad = width - 2 - titlePadded.length - leftPad;
	output += BOX_H.repeat(Math.max(0, leftPad));
	output += theme.white + theme.bold + titlePadded + theme.reset + theme.accent;
	output += BOX_H.repeat(Math.max(0, rightPad));
	output += BOX_TR + theme.reset;

	// Sides
	for (let row = 1; row < height - 1; row++) {
		output += `\x1b[${y + row};${x}H${theme.accent}${BOX_V}${theme.reset}`;
		output += `\x1b[${y + row};${x + width - 1}H${theme.accent}${BOX_V}${theme.reset}`;
	}

	// Bottom border
	output += `\x1b[${y + height - 1};${x}H`;
	output += theme.accent + BOX_BL + BOX_H.repeat(width - 2) + BOX_BR + theme.reset;

	return output;
}

// =============================================================================
// PANEL RENDERING
// =============================================================================

/**
 * Render CPU panel.
 */
export function renderCpuPanel(
	cpu: CpuData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): string {
	let output = drawBox(x, y, width, height, 'CPU Usage', theme);

	const innerWidth = width - 4;
	const barWidth = Math.max(10, innerWidth - 20);

	let row = y + 1;

	// Per-core usage
	for (let i = 0; i < Math.min(cpu.perCore.length, height - 4); i++) {
		const usage = cpu.perCore[i] ?? 0;

		output += `\x1b[${row};${x + 2}H`;
		output += `${theme.dim}CPU${i.toString().padStart(2)}${theme.reset} `;
		output += renderProgressBar(usage, barWidth, theme);
		output += ` ${usage.toFixed(1).padStart(5)}%`;

		row++;
	}

	// Average and load
	if (row < y + height - 1) {
		output += `\x1b[${row};${x + 2}H`;
		output += `${theme.white}Avg: ${getThresholdColor(cpu.average, theme)}${cpu.average.toFixed(1)}%${theme.reset}`;
		row++;
	}

	if (row < y + height - 1) {
		output += `\x1b[${row};${x + 2}H`;
		output += `${theme.dim}Load: ${cpu.loadAvg.map((l) => l.toFixed(2)).join(' ')}${theme.reset}`;
	}

	return output;
}

/**
 * Render Memory panel.
 */
export function renderMemoryPanel(
	memory: MemoryData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): string {
	let output = drawBox(x, y, width, height, 'Memory', theme);

	const innerWidth = width - 4;
	const barWidth = Math.max(10, innerWidth - 25);

	const memUsed = formatBytes(memory.used);
	const memTotal = formatBytes(memory.total);

	// Memory bar
	output += `\x1b[${y + 1};${x + 2}H`;
	output += `${theme.white}RAM ${theme.reset}`;
	output += renderProgressBar(memory.percent, barWidth, theme);
	output += ` ${memory.percent.toFixed(1).padStart(5)}%`;

	// Memory details
	output += `\x1b[${y + 2};${x + 2}H`;
	output += `${theme.dim}Used: ${memUsed} / ${memTotal}${theme.reset}`;

	return output;
}

/**
 * Render Network panel.
 */
export function renderNetworkPanel(
	network: NetworkData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): string {
	let output = drawBox(x, y, width, height, 'Network I/O', theme);

	// RX
	output += `\x1b[${y + 1};${x + 2}H`;
	output += `${theme.cyan}RX:${theme.reset} ${formatBytes(network.rx)} (${formatBytes(network.rxRate)}/s)`;

	// TX
	output += `\x1b[${y + 2};${x + 2}H`;
	output += `${theme.cyan}TX:${theme.reset} ${formatBytes(network.tx)} (${formatBytes(network.txRate)}/s)`;

	return output;
}

/**
 * Render System Info panel.
 */
export function renderSystemPanel(
	system: SystemData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): string {
	let output = drawBox(x, y, width, height, 'System Info', theme);

	const lines = [
		`${theme.cyan}Hostname:${theme.reset}  ${system.hostname}`,
		`${theme.cyan}Platform:${theme.reset}  ${system.platform} ${system.arch}`,
		`${theme.cyan}Uptime:${theme.reset}    ${formatDuration(system.uptime)}`,
	];

	for (let i = 0; i < Math.min(lines.length, height - 2); i++) {
		output += `\x1b[${y + 1 + i};${x + 2}H`;
		output += lines[i];
	}

	return output;
}

/**
 * Render status bar with theme name and controls.
 */
export function renderStatusBar(
	screenWidth: number,
	screenHeight: number,
	theme: Theme,
): string {
	const y = screenHeight;
	let output = `\x1b[${y};1H`;
	output += '\x1b[7m'; // Reverse video

	const controls = ` q:Quit  t:Theme  r:Refresh `;
	const themeName = `Theme: ${theme.name}`;
	const timestamp = new Date().toLocaleTimeString();

	const totalWidth = controls.length + themeName.length + timestamp.length + 4;
	const padding = Math.max(0, screenWidth - totalWidth);

	output += controls;
	output += ' '.repeat(Math.floor(padding / 2));
	output += themeName;
	output += ' '.repeat(Math.ceil(padding / 2));
	output += ` ${timestamp} `;
	output += theme.reset;

	return output;
}
