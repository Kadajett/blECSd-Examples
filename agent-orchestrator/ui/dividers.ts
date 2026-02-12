/**
 * Reusable divider and section-header render helpers.
 *
 * @module agent-orchestrator/ui/dividers
 */

import { THEME } from './theme.js';

export type DividerStyle = 'single' | 'double' | 'bold';

function getDividerChar(style: DividerStyle): string {
	if (style === 'double') return '\u2550';
	if (style === 'bold') return '\u2501';
	return '\u2500';
}

/**
 * Renders a horizontal divider at an absolute terminal position.
 */
export function renderHorizontalDivider(
	x: number,
	y: number,
	width: number,
	color: string,
	style: DividerStyle,
	label?: string,
): string {
	if (width <= 0) {
		return '';
	}

	const ch = getDividerChar(style);
	if (!label || label.length === 0) {
		return `\x1b[${y};${x}H${color}${ch.repeat(width)}${THEME.reset}`;
	}

	const labelText = ` ${label} `;
	const fillWidth = Math.max(0, width - labelText.length);
	const left = Math.floor(fillWidth / 2);
	const right = fillWidth - left;
	return `\x1b[${y};${x}H${color}${ch.repeat(left)}${labelText}${ch.repeat(right)}${THEME.reset}`;
}

/**
 * Renders a titled section header (e.g. "── Header ──") at an absolute position.
 */
export function renderSectionHeader(
	x: number,
	y: number,
	width: number,
	text: string,
	color: string,
): string {
	return renderHorizontalDivider(x, y, width, color, 'single', text);
}
