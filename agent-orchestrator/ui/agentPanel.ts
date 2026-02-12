/**
 * Agent pane border rendering with sparkline activity indicators.
 *
 * @module agent-orchestrator/ui/agentPanel
 */

import type { AgentStatus } from '../types.js';
import { renderSparkline } from './sparkline.js';

/**
 * Status indicator characters and colors.
 */
const STATUS_INDICATORS: Record<AgentStatus, { readonly symbol: string; readonly color: string }> = {
	starting: { symbol: '\u25D0', color: '\x1b[33m' }, // Yellow half-circle
	running: { symbol: '\u25CF', color: '\x1b[32m' }, // Green circle
	idle: { symbol: '\u25D0', color: '\x1b[33m' }, // Yellow half-circle
	error: { symbol: '\u2717', color: '\x1b[31m' }, // Red X
	stopped: { symbol: '\u25CB', color: '\x1b[90m' }, // Gray hollow circle
};

const RESET = '\x1b[0m';

/**
 * Renders a pane border with title, activity sparkline, and status indicator.
 *
 * @param x - X position (0-indexed)
 * @param y - Y position (0-indexed)
 * @param width - Total width including border
 * @param height - Total height including border
 * @param label - Pane title label
 * @param status - Agent status
 * @param borderColor - ANSI color code for border
 * @param activityData - Recent activity data points for sparkline
 * @returns ANSI string for the border
 */
export function renderPaneBorder(
	x: number,
	y: number,
	width: number,
	height: number,
	label: string,
	status: AgentStatus,
	borderColor: string,
	activityData?: readonly number[],
): string {
	if (width < 4 || height < 2) {
		return ''; // Too small to render
	}

	let output = '';
	const indicator = STATUS_INDICATORS[status];
	if (!indicator) {
		return '';
	}

	// Top border with title, sparkline, and status
	output += `\x1b[${y + 1};${x + 1}H`;
	output += borderColor;
	output += '\u250C\u2500 ';
	output += RESET;
	output += label;
	output += borderColor;
	output += ' ';

	// Calculate how much space is left for sparkline + status + closing
	const titleLength = 4 + label.length; // "|- " + label + " "
	const statusLength = 4; // " " + indicator + " |"

	// Sparkline fills available space
	const sparklineMaxWidth = Math.max(0, width - titleLength - statusLength - 1);
	let sparklineStr = '';
	if (activityData && activityData.length > 0 && sparklineMaxWidth > 2) {
		sparklineStr = renderSparkline(activityData, sparklineMaxWidth - 1);
	}

	const sparklineLength = sparklineStr.length;
	const paddingLength = Math.max(0, width - titleLength - sparklineLength - statusLength);

	output += RESET;
	output += '\x1b[90m'; // Dim for sparkline
	output += sparklineStr;
	output += RESET;
	output += borderColor;
	output += '\u2500'.repeat(paddingLength);
	output += ' ';
	output += RESET;
	output += indicator.color;
	output += indicator.symbol;
	output += RESET;
	output += borderColor;
	output += ' \u2510';
	output += RESET;

	// Side borders
	for (let row = 1; row < height - 1; row++) {
		output += `\x1b[${y + row + 1};${x + 1}H`;
		output += borderColor + '\u2502' + RESET;
		output += `\x1b[${y + row + 1};${x + width}H`;
		output += borderColor + '\u2502' + RESET;
	}

	// Bottom border
	output += `\x1b[${y + height};${x + 1}H`;
	output += borderColor;
	output += '\u2514';
	output += '\u2500'.repeat(width - 2);
	output += '\u2518';
	output += RESET;

	return output;
}
