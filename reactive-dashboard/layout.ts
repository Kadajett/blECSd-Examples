/**
 * Layout and rendering functions for the reactive dashboard.
 *
 * Uses blECSd cell buffer rendering.
 */

import { renderText } from 'blecsd';
import { BOX_SINGLE, renderBox, type CellBuffer } from 'blecsd/utils';
import type { Theme } from './theme';
import type { CpuData, MemoryData, NetworkData, SystemData } from './data';
import { formatBytes, formatDuration } from './data';

// =============================================================================
// PROGRESS BAR CHARACTERS
// =============================================================================

const BAR_FILLED = '█';
const BAR_PARTIAL = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
const BAR_EMPTY = '░';

// =============================================================================
// LOCAL HELPER: fill() - replaces fillRect
// =============================================================================

/**
 * Fill a rectangle in the buffer with a character and colors.
 * This avoids the fillRect collision in blecsd barrel exports.
 */
function fill(
	buffer: CellBuffer,
	x: number,
	y: number,
	w: number,
	h: number,
	char: string,
	fg: number,
	bg: number,
): void {
	for (let row = 0; row < h; row++) {
		for (let col = 0; col < w; col++) {
			buffer.setCell(x + col, y + row, char, fg, bg);
		}
	}
}

// =============================================================================
// RENDERING HELPERS
// =============================================================================

/**
 * Get color based on threshold.
 */
function getThresholdColor(percent: number, theme: Theme): number {
	if (percent >= 80) return theme.red;
	if (percent >= 50) return theme.yellow;
	return theme.green;
}

/**
 * Render a progress bar into the buffer.
 */
function renderProgressBar(
	buffer: CellBuffer,
	x: number,
	y: number,
	percent: number,
	width: number,
	theme: Theme,
): void {
	const filledWidth = (percent / 100) * width;
	const fullChars = Math.floor(filledWidth);
	const partialIndex = Math.floor((filledWidth - fullChars) * 8);

	const color = getThresholdColor(percent, theme);

	// Filled portion
	for (let i = 0; i < fullChars; i++) {
		buffer.setCell(x + i, y, BAR_FILLED, color, theme.bg);
	}

	// Partial character
	if (fullChars < width) {
		const partialChar = BAR_PARTIAL[partialIndex] || '';
		if (partialChar) {
			buffer.setCell(x + fullChars, y, partialChar, color, theme.bg);
		}
	}

	// Empty portion
	const emptyStart = fullChars + (partialIndex > 0 ? 1 : 0);
	for (let i = emptyStart; i < width; i++) {
		buffer.setCell(x + i, y, BAR_EMPTY, theme.dim, theme.bg);
	}
}

// =============================================================================
// PANEL RENDERING
// =============================================================================

/**
 * Render CPU panel.
 */
export function renderCpuPanel(
	buffer: CellBuffer,
	cpu: CpuData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): void {
	// Draw box
	renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: theme.borderFg, bg: theme.panelBg });

	// Title
	const title = ' CPU Usage ';
	const titleX = x + Math.floor((width - title.length) / 2);
	renderText(buffer, titleX, y, title, theme.white, theme.panelBg);

	const innerWidth = width - 4;
	const barWidth = Math.max(10, innerWidth - 20);

	let row = y + 1;

	// Per-core usage
	for (let i = 0; i < Math.min(cpu.perCore.length, height - 4); i++) {
		const usage = cpu.perCore[i] ?? 0;

		// Label
		const label = `CPU${i.toString().padStart(2)} `;
		renderText(buffer, x + 2, row, label, theme.dim, theme.panelBg);

		// Progress bar
		renderProgressBar(buffer, x + 2 + label.length, row, usage, barWidth, theme);

		// Percentage
		const pct = ` ${usage.toFixed(1).padStart(5)}%`;
		renderText(buffer, x + 2 + label.length + barWidth, row, pct, theme.fg, theme.panelBg);

		row++;
	}

	// Average and load
	if (row < y + height - 1) {
		const avgText = `Avg: ${cpu.average.toFixed(1)}%`;
		renderText(buffer, x + 2, row, 'Avg: ', theme.white, theme.panelBg);
		renderText(
			buffer,
			x + 2 + 5,
			row,
			cpu.average.toFixed(1) + '%',
			getThresholdColor(cpu.average, theme),
			theme.panelBg,
		);
		row++;
	}

	if (row < y + height - 1) {
		const loadText = `Load: ${cpu.loadAvg.map((l) => l.toFixed(2)).join(' ')}`;
		renderText(buffer, x + 2, row, loadText, theme.dim, theme.panelBg);
	}
}

/**
 * Render Memory panel.
 */
export function renderMemoryPanel(
	buffer: CellBuffer,
	memory: MemoryData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): void {
	// Draw box
	renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: theme.borderFg, bg: theme.panelBg });

	// Title
	const title = ' Memory ';
	const titleX = x + Math.floor((width - title.length) / 2);
	renderText(buffer, titleX, y, title, theme.white, theme.panelBg);

	const innerWidth = width - 4;
	const barWidth = Math.max(10, innerWidth - 25);

	const memUsed = formatBytes(memory.used);
	const memTotal = formatBytes(memory.total);

	// Memory bar
	const label = 'RAM ';
	renderText(buffer, x + 2, y + 1, label, theme.white, theme.panelBg);
	renderProgressBar(buffer, x + 2 + label.length, y + 1, memory.percent, barWidth, theme);

	const pct = ` ${memory.percent.toFixed(1).padStart(5)}%`;
	renderText(buffer, x + 2 + label.length + barWidth, y + 1, pct, theme.fg, theme.panelBg);

	// Memory details
	const details = `Used: ${memUsed} / ${memTotal}`;
	renderText(buffer, x + 2, y + 2, details, theme.dim, theme.panelBg);
}

/**
 * Render Network panel.
 */
export function renderNetworkPanel(
	buffer: CellBuffer,
	network: NetworkData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): void {
	// Draw box
	renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: theme.borderFg, bg: theme.panelBg });

	// Title
	const title = ' Network I/O ';
	const titleX = x + Math.floor((width - title.length) / 2);
	renderText(buffer, titleX, y, title, theme.white, theme.panelBg);

	// RX
	renderText(buffer, x + 2, y + 1, 'RX:', theme.cyan, theme.panelBg);
	const rxText = ` ${formatBytes(network.rx)} (${formatBytes(network.rxRate)}/s)`;
	renderText(buffer, x + 2 + 3, y + 1, rxText, theme.fg, theme.panelBg);

	// TX
	renderText(buffer, x + 2, y + 2, 'TX:', theme.cyan, theme.panelBg);
	const txText = ` ${formatBytes(network.tx)} (${formatBytes(network.txRate)}/s)`;
	renderText(buffer, x + 2 + 3, y + 2, txText, theme.fg, theme.panelBg);
}

/**
 * Render System Info panel.
 */
export function renderSystemPanel(
	buffer: CellBuffer,
	system: SystemData,
	x: number,
	y: number,
	width: number,
	height: number,
	theme: Theme,
): void {
	// Draw box
	renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: theme.borderFg, bg: theme.panelBg });

	// Title
	const title = ' System Info ';
	const titleX = x + Math.floor((width - title.length) / 2);
	renderText(buffer, titleX, y, title, theme.white, theme.panelBg);

	// System info lines
	let row = y + 1;

	renderText(buffer, x + 2, row, 'Hostname:', theme.cyan, theme.panelBg);
	renderText(buffer, x + 2 + 10, row, `  ${system.hostname}`, theme.fg, theme.panelBg);
	row++;

	if (row < y + height - 1) {
		renderText(buffer, x + 2, row, 'Platform:', theme.cyan, theme.panelBg);
		renderText(buffer, x + 2 + 10, row, `  ${system.platform} ${system.arch}`, theme.fg, theme.panelBg);
		row++;
	}

	if (row < y + height - 1) {
		renderText(buffer, x + 2, row, 'Uptime:', theme.cyan, theme.panelBg);
		renderText(buffer, x + 2 + 10, row, `    ${formatDuration(system.uptime)}`, theme.fg, theme.panelBg);
	}
}

/**
 * Render status bar with theme name and controls.
 */
export function renderStatusBar(
	buffer: CellBuffer,
	screenWidth: number,
	screenHeight: number,
	theme: Theme,
): void {
	const y = screenHeight - 1;

	// Fill status bar background
	fill(buffer, 0, y, screenWidth, 1, ' ', theme.statusFg, theme.statusBg);

	const controls = ' q:Quit  t:Theme  r:Refresh ';
	const themeName = `Theme: ${theme.name}`;
	const timestamp = ` ${new Date().toLocaleTimeString()} `;

	const totalWidth = controls.length + themeName.length + timestamp.length;
	const padding = Math.max(0, screenWidth - totalWidth);

	let xPos = 0;

	// Controls
	renderText(buffer, xPos, y, controls, theme.statusFg, theme.statusBg);
	xPos += controls.length;

	// Left padding
	xPos += Math.floor(padding / 2);

	// Theme name
	renderText(buffer, xPos, y, themeName, theme.statusFg, theme.statusBg);
	xPos += themeName.length;

	// Right padding
	xPos += Math.ceil(padding / 2);

	// Timestamp
	renderText(buffer, xPos, y, timestamp, theme.statusFg, theme.statusBg);
}
