/**
 * Status bar rendering with theme colors and uptime display.
 *
 * @module agent-orchestrator/ui/statusBar
 */

import type { AppState } from '../types.js';
import { THEME } from './theme.js';

/** Separator character between status bar sections. */
const SEP = `${THEME.subtext.fg}\u2502${THEME.reset}`;

/** App start time, used to calculate uptime. */
const APP_START = Date.now();

/**
 * Formats a duration in milliseconds as HH:MM:SS.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted uptime string
 */
function formatUptime(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Renders the status bar at the bottom of the screen.
 *
 * @param state - Application state
 * @returns ANSI string for the status bar
 */
export function renderStatusBar(state: AppState): string {
	const { inputMode, commandBuffer, focusedWorkerIndex, workerPanes, screenWidth } = state;

	// Mode indicator with themed color
	let modeText = '';
	let modeColor: string = THEME.text.fg;

	if (state.sidebar.focused) {
		modeText = 'SIDEBAR';
		modeColor = `${THEME.bold}${THEME.accent1.fg}`; // cyan
	} else if (state.overlay.kind !== 'none') {
		modeText = 'OVERLAY';
		modeColor = `${THEME.bold}${THEME.accent4.fg}`; // magenta
	} else if (inputMode === 'direct') {
		modeText = 'DIRECT';
		modeColor = `${THEME.bold}${THEME.accent1.fg}`; // cyan
	} else if (inputMode === 'prefix') {
		modeText = 'PREFIX';
		modeColor = `${THEME.bold}${THEME.accent3.fg}`; // green
	} else if (inputMode === 'command') {
		modeText = 'COMMAND';
		modeColor = `${THEME.bold}${THEME.accent4.fg}`; // magenta
	}

	let content = '';

	// Mode indicator
	content += ` ${THEME.subtext.fg}[${THEME.reset}`;
	content += modeColor;
	content += modeText;
	content += `${THEME.reset}${THEME.subtext.fg}]${THEME.reset}`;
	content += `${THEME.text.fg} `;

	// Command buffer in command mode
	if (inputMode === 'command') {
		content += `${SEP} :${commandBuffer} `;
	} else if (inputMode === 'prefix') {
		content += `${SEP} Ctrl+A... `;
	} else {
		// Focused pane info
		if (state.focusTarget === 'orchestrator' && state.orchestratorPane) {
			content += `${SEP} Focused: ${state.orchestratorPane.agent.label} `;
		} else {
			const focusedPane = workerPanes[focusedWorkerIndex];
			if (focusedPane) {
				content += `${SEP} Focused: ${focusedPane.agent.label} `;
			}
		}

		// Worker count
		content += `${SEP} ${workerPanes.length} worker${workerPanes.length !== 1 ? 's' : ''} `;

		// Key hints
		if (state.sidebar.focused) {
			content += `${SEP} Tab:Tabs  Arrows:Scroll  /:Search  Esc:Back`;
		} else if (inputMode === 'direct') {
			content += `${SEP} Ctrl+A:Prefix  Ctrl+Q:Quit`;
		}
	}

	// Uptime on the right
	const uptime = formatUptime(Date.now() - APP_START);
	const uptimeSection = ` ${SEP} ${THEME.subtext.fg}up ${THEME.accent5.fg}${uptime}${THEME.reset} `;
	const uptimeVisLen = stripAnsi(uptimeSection).length;

	// Pad to full width, reserving space for uptime
	const contentVisLen = stripAnsi(content).length;
	const padding = Math.max(0, screenWidth - contentVisLen - uptimeVisLen);
	content += ' '.repeat(padding);
	content += uptimeSection;

	// Position at bottom row
	let output = `\x1b[${state.screenHeight};1H`;
	output += THEME.surface.bg;
	output += THEME.text.fg;
	output += content;
	output += THEME.reset;

	return output;
}

/**
 * Strips ANSI escape codes from a string to get actual visible length.
 *
 * @param str - String with ANSI codes
 * @returns Visible string without ANSI codes
 */
function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}
