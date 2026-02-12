/**
 * Agent pane border rendering with sparkline activity indicators.
 *
 * @module agent-orchestrator/ui/agentPanel
 */

import type { AgentStatus } from '../types.js';
import { renderSparkline } from './sparkline.js';
import { THEME, getBorderChars, type BorderChars } from './theme.js';

/** Border style name. */
export type BorderStyle = 'single' | 'double' | 'rounded';

/**
 * Status indicator characters and colors using theme palette.
 */
const STATUS_INDICATORS: Record<AgentStatus, { readonly symbol: string; readonly color: string }> = {
	starting: { symbol: '\u25D0', color: THEME.warning.fg },
	running: { symbol: '\u25CF', color: THEME.accent3.fg },
	idle: { symbol: '\u25D0', color: THEME.warning.fg },
	error: { symbol: '\u2717', color: THEME.error.fg },
	stopped: { symbol: '\u25CB', color: THEME.subtext.fg },
};

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
 * @param borderStyle - Border character style (defaults to 'single')
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
	borderStyle: BorderStyle = 'single',
): string {
	if (width < 4 || height < 2) {
		return ''; // Too small to render
	}

	let output = '';
	const indicator = STATUS_INDICATORS[status];
	if (!indicator) {
		return '';
	}

	const chars: BorderChars = getBorderChars(borderStyle);

	// Top border with title, sparkline, and status
	output += `\x1b[${y + 1};${x + 1}H`;
	output += borderColor;
	output += `${chars.tl}${chars.h} `;
	output += THEME.reset;
	output += label;
	output += borderColor;
	output += ' ';

	// Calculate how much space is left for sparkline + status + closing
	const titleLength = 4 + label.length; // "tl h " + label + " "
	const statusLength = 4; // " " + indicator + " tr"

	// Sparkline fills available space
	const sparklineMaxWidth = Math.max(0, width - titleLength - statusLength - 1);
	let sparklineStr = '';
	if (activityData && activityData.length > 0 && sparklineMaxWidth > 2) {
		sparklineStr = renderSparkline(activityData, sparklineMaxWidth - 1);
	}

	const sparklineLength = sparklineStr.length;
	const paddingLength = Math.max(0, width - titleLength - sparklineLength - statusLength);

	output += THEME.reset;
	output += THEME.subtext.fg; // Dim for sparkline
	output += sparklineStr;
	output += THEME.reset;
	output += borderColor;
	output += chars.h.repeat(paddingLength);
	output += ' ';
	output += THEME.reset;
	output += indicator.color;
	output += indicator.symbol;
	output += THEME.reset;
	output += borderColor;
	output += ` ${chars.tr}`;
	output += THEME.reset;

	// Side borders
	for (let row = 1; row < height - 1; row++) {
		output += `\x1b[${y + row + 1};${x + 1}H`;
		output += borderColor + chars.v + THEME.reset;
		output += `\x1b[${y + row + 1};${x + width}H`;
		output += borderColor + chars.v + THEME.reset;
	}

	// Bottom border
	output += `\x1b[${y + height};${x + 1}H`;
	output += borderColor;
	output += chars.bl;
	output += chars.h.repeat(width - 2);
	output += chars.br;
	output += THEME.reset;

	return output;
}
