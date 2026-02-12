/**
 * Header bar rendering for the orchestrator UI.
 *
 * Renders a 1-line header at the top of the screen showing app title,
 * session name, and current time.
 *
 * @module agent-orchestrator/ui/headerBar
 */

import { THEME } from './theme.js';

/**
 * Renders the header bar at row 1.
 *
 * @param screenWidth - Terminal screen width
 * @param sessionName - Session name to display in center (or empty string)
 * @returns ANSI string for the header bar
 */
export function renderHeaderBar(screenWidth: number, sessionName: string): string {
	const left = `${THEME.bold}${THEME.accent2.fg}blECSd Orchestrator${THEME.reset}`;
	const leftVisible = 'blECSd Orchestrator';

	const center = sessionName
		? `${THEME.subtext.fg}${sessionName}${THEME.reset}`
		: '';
	const centerVisible = sessionName || '';

	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const timeStr = `${hours}:${minutes}`;
	const right = `${THEME.accent5.fg}${timeStr}${THEME.reset}`;
	const rightVisible = timeStr;

	// Calculate padding to position center and right-align the time
	const leftLen = leftVisible.length + 1; // +1 for leading space
	const rightLen = rightVisible.length + 1; // +1 for trailing space
	const centerLen = centerVisible.length;

	// Gap between left and center
	const centerStart = Math.max(leftLen + 1, Math.floor((screenWidth - centerLen) / 2));
	const leftPad = Math.max(1, centerStart - leftLen);

	// Gap between center and right
	const rightStart = screenWidth - rightLen;
	const centerEnd = centerStart + centerLen;
	const rightPad = Math.max(1, rightStart - centerEnd);

	// Build the full line with surface background
	let output = `\x1b[1;1H`; // Move to row 1, col 1
	output += THEME.surface.bg;
	output += THEME.text.fg;
	output += ' '; // Leading space
	output += left;
	output += ' '.repeat(leftPad);
	output += center;
	output += ' '.repeat(rightPad);
	output += right;

	// Fill remaining width
	const totalVisible = leftLen + leftPad + centerLen + rightPad + rightLen;
	const remaining = Math.max(0, screenWidth - totalVisible);
	output += ' '.repeat(remaining);

	output += THEME.reset;

	return output;
}
