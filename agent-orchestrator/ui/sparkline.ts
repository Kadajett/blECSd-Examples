/**
 * Braille sparkline renderer for activity visualization.
 *
 * Uses Unicode braille characters to render a mini-chart of recent
 * activity data in the border of each agent panel.
 *
 * @module agent-orchestrator/ui/sparkline
 */

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
		return SPARKLINE_CHARS[0]!.repeat(slice.length);
	}

	// Map each value to a braille character (0-7 levels)
	let result = '';
	for (const v of slice) {
		const level = Math.round((v / max) * 7);
		const clamped = Math.min(7, Math.max(0, level));
		result += SPARKLINE_CHARS[clamped] ?? ' ';
	}

	return result;
}
