/**
 * Braille sparkline renderer for activity visualization.
 *
 * Uses Unicode braille characters to render a mini-chart of recent
 * activity data in the border of each agent panel.
 *
 * @module agent-orchestrator/ui/sparkline
 */
import { THEME } from './theme.js';

/**
 * Braille blocks ordered by fill height (0 = empty, 7 = full).
 * Uses the bottom half of the braille pattern space.
 */
const SPARKLINE_CHARS = ' \u2581\u2582\u2583\u2584\u2585\u2586\u2587';

/**
 * Renders a sparkline from a data array.
 *
 * @param data - Array of numeric values (most recent last)
 * @param width - Maximum character width of the sparkline
 * @returns Sparkline string using Unicode block characters
 */
export function renderSparkline(data: readonly number[], width: number): string {
	if (data.length === 0 || width <= 0) {
		return '';
	}

	// Take the last `width` data points
	const slice = data.slice(-width);

	// Find the range
	let max = 0;
	for (const v of slice) {
		if (v > max) max = v;
	}

	// If all zeros, return flat line
	if (max === 0) {
		return `${THEME.subtext.fg}${SPARKLINE_CHARS[0]!.repeat(slice.length)}${THEME.reset}`;
	}

	// Map each value to a character and color based on relative intensity.
	let result = '';
	for (const v of slice) {
		const ratio = v / max;
		const level = Math.round(ratio * 7);
		const clamped = Math.min(7, Math.max(0, level));
		const color = getSparklineColor(ratio);
		result += `${color}${SPARKLINE_CHARS[clamped] ?? ' '}`;
	}

	return `${result}${THEME.reset}`;
}

function getSparklineColor(ratio: number): string {
	if (ratio >= 0.9) return THEME.error.fg;
	if (ratio >= 0.65) return THEME.accent5.fg;
	if (ratio >= 0.35) return THEME.accent3.fg;
	return THEME.subtext.fg;
}
