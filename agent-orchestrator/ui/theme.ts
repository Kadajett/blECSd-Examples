/**
 * Tokyo Night inspired color palette and theme system.
 *
 * All colors are defined as ANSI truecolor escape codes (38;2;R;G;B for fg, 48;2;R;G;B for bg).
 * Border character sets are provided for single, double, and rounded box-drawing styles.
 *
 * @module agent-orchestrator/ui/theme
 */

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Converts a hex color string to an ANSI truecolor escape code.
 *
 * @param hex - Hex color string (e.g. "#7dcfff" or "7dcfff")
 * @param isBg - If true, returns a background escape code (48;2;...); otherwise foreground (38;2;...)
 * @returns ANSI escape code string
 */
export function hexToAnsi(hex: string, isBg: boolean): string {
	const h = hex.startsWith('#') ? hex.slice(1) : hex;
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	const prefix = isBg ? '48' : '38';
	return `\x1b[${prefix};2;${r};${g};${b}m`;
}

/**
 * Creates a color entry with both foreground and background ANSI codes.
 *
 * @param hex - Hex color string
 * @returns Object with fg and bg ANSI escape codes
 */
function color(hex: string): ThemeColor {
	return {
		fg: hexToAnsi(hex, false),
		bg: hexToAnsi(hex, true),
		hex,
	};
}

// =============================================================================
// TYPES
// =============================================================================

/** A theme color with foreground and background ANSI escape codes. */
export interface ThemeColor {
	readonly fg: string;
	readonly bg: string;
	readonly hex: string;
}

/** Border character set for box-drawing. */
export interface BorderChars {
	readonly tl: string;
	readonly tr: string;
	readonly bl: string;
	readonly br: string;
	readonly h: string;
	readonly v: string;
}

/** The complete theme definition. */
export interface Theme {
	readonly bg: ThemeColor;
	readonly surface: ThemeColor;
	readonly overlay: ThemeColor;
	readonly text: ThemeColor;
	readonly subtext: ThemeColor;
	readonly comment: ThemeColor;
	readonly accent1: ThemeColor;
	readonly accent2: ThemeColor;
	readonly accent3: ThemeColor;
	readonly accent4: ThemeColor;
	readonly accent5: ThemeColor;
	readonly warning: ThemeColor;
	readonly error: ThemeColor;
	readonly success: ThemeColor;
	readonly reset: string;
	readonly bold: string;
	readonly dim: string;
	readonly reverse: string;
}

// =============================================================================
// BORDER CHARACTER SETS
// =============================================================================

/** Single-line box-drawing characters. */
export const BORDER_SINGLE: BorderChars = {
	tl: '\u250C', // ┌
	tr: '\u2510', // ┐
	bl: '\u2514', // └
	br: '\u2518', // ┘
	h: '\u2500',  // ─
	v: '\u2502',  // │
};

/** Double-line box-drawing characters. */
export const BORDER_DOUBLE: BorderChars = {
	tl: '\u2554', // ╔
	tr: '\u2557', // ╗
	bl: '\u255A', // ╚
	br: '\u255D', // ╝
	h: '\u2550',  // ═
	v: '\u2551',  // ║
};

/** Rounded box-drawing characters. */
export const BORDER_ROUNDED: BorderChars = {
	tl: '\u256D', // ╭
	tr: '\u256E', // ╮
	bl: '\u2570', // ╰
	br: '\u256F', // ╯
	h: '\u2500',  // ─
	v: '\u2502',  // │
};

// =============================================================================
// TOKYO NIGHT THEME
// =============================================================================

/** Tokyo Night inspired color palette. */
export const THEME: Theme = {
	bg: color('#1a1b26'),
	surface: color('#24283b'),
	overlay: color('#414868'),
	text: color('#c0caf5'),
	subtext: color('#565f89'),
	comment: color('#565f89'),
	accent1: color('#7dcfff'),   // cyan
	accent2: color('#7aa2f7'),   // blue
	accent3: color('#9ece6a'),   // green
	accent4: color('#bb9af7'),   // magenta
	accent5: color('#ff9e64'),   // orange
	warning: color('#e0af68'),
	error: color('#f7768e'),
	success: color('#73daca'),
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	reverse: '\x1b[7m',
};

/**
 * Retrieves a border character set by style name.
 *
 * @param style - Border style name
 * @returns The corresponding border character set
 */
export function getBorderChars(style: 'single' | 'double' | 'rounded'): BorderChars {
	if (style === 'double') return BORDER_DOUBLE;
	if (style === 'rounded') return BORDER_ROUNDED;
	return BORDER_SINGLE;
}
