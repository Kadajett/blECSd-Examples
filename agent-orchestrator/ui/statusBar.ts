/**
 * Status bar rendering.
 *
 * @module agent-orchestrator/ui/statusBar
 */

import type { AppState } from '../types.js';
import { COLORS } from '../config.js';

/**
 * Renders the status bar at the bottom of the screen.
 *
 * @param state - Application state
 * @returns ANSI string for the status bar
 */
export function renderStatusBar(state: AppState): string {
	const { inputMode, commandBuffer, focusedWorkerIndex, workerPanes, screenWidth } = state;

	// Mode indicator with color
	let modeText = '';
	let modeColor: string = COLORS.modeNormal;

	if (state.sidebar.focused) {
		modeText = 'SIDEBAR';
		modeColor = '\x1b[1;36m'; // Cyan
	} else if (state.overlay.kind !== 'none') {
		modeText = 'OVERLAY';
		modeColor = '\x1b[1;35m'; // Magenta
	} else if (inputMode === 'direct') {
		modeText = 'DIRECT';
		modeColor = COLORS.modeNormal;
	} else if (inputMode === 'prefix') {
		modeText = 'PREFIX';
		modeColor = COLORS.modePassthrough;
	} else if (inputMode === 'command') {
		modeText = 'COMMAND';
		modeColor = COLORS.modeCommand;
	}

	let content = '';

	// Mode indicator
	content += ' [';
	content += modeColor;
	content += modeText;
	content += COLORS.reset;
	content += COLORS.statusFg;
	content += '] ';

	// Command buffer in command mode
	if (inputMode === 'command') {
		content += ':';
		content += commandBuffer;
		content += ' ';
	} else if (inputMode === 'prefix') {
		content += 'Ctrl+A... ';
	} else {
		// Focused pane info
		if (state.focusTarget === 'orchestrator' && state.orchestratorPane) {
			content += '| Focused: ';
			content += state.orchestratorPane.agent.label;
			content += ' ';
		} else {
			const focusedPane = workerPanes[focusedWorkerIndex];
			if (focusedPane) {
				content += '| Focused: ';
				content += focusedPane.agent.label;
				content += ' ';
			}
		}

		// Worker count
		content += `| ${workerPanes.length} worker${workerPanes.length !== 1 ? 's' : ''} `;

		// Key hints
		if (state.sidebar.focused) {
			content += '| Tab:Tabs  Arrows:Scroll  /:Search  Esc:Back';
		} else if (inputMode === 'direct') {
			content += '| Ctrl+A:Prefix  Ctrl+Q:Quit';
		}
	}

	// Pad to full width
	const strippedLength = stripAnsi(content).length;
	const padding = Math.max(0, screenWidth - strippedLength);
	content += ' '.repeat(padding);

	// Position at bottom row
	let output = `\x1b[${state.screenHeight};1H`;
	output += COLORS.statusBg;
	output += COLORS.statusFg;
	output += content;
	output += COLORS.reset;

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
