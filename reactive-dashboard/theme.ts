/**
 * Theme configuration for the reactive dashboard.
 *
 * Provides ANSI color codes for different themes that can be cycled at runtime.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Theme {
	name: string;
	bg: string;
	fg: string;
	dim: string;
	accent: string;
	green: string;
	yellow: string;
	red: string;
	cyan: string;
	white: string;
	bold: string;
	reset: string;
}

// =============================================================================
// ANSI CODES
// =============================================================================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// =============================================================================
// THEME DEFINITIONS
// =============================================================================

export const darkTheme: Theme = {
	name: 'Dark',
	bg: '\x1b[40m',
	fg: '\x1b[37m',
	dim: '\x1b[90m',
	accent: '\x1b[36m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	bold: BOLD,
	reset: RESET,
};

export const lightTheme: Theme = {
	name: 'Light',
	bg: '\x1b[47m',
	fg: '\x1b[30m',
	dim: '\x1b[90m',
	accent: '\x1b[34m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	white: '\x1b[97m',
	bold: BOLD,
	reset: RESET,
};

export const nordTheme: Theme = {
	name: 'Nord',
	bg: '\x1b[48;2;46;52;64m', // #2E3440
	fg: '\x1b[38;2;236;239;244m', // #ECEFF4
	dim: '\x1b[38;2;76;86;106m', // #4C566A
	accent: '\x1b[38;2;136;192;208m', // #88C0D0
	green: '\x1b[38;2;163;190;140m', // #A3BE8C
	yellow: '\x1b[38;2;235;203;139m', // #EBCB8B
	red: '\x1b[38;2;191;97;106m', // #BF616A
	cyan: '\x1b[38;2;136;192;208m', // #88C0D0
	white: '\x1b[38;2;236;239;244m', // #ECEFF4
	bold: BOLD,
	reset: RESET,
};

export const draculaTheme: Theme = {
	name: 'Dracula',
	bg: '\x1b[48;2;40;42;54m', // #282A36
	fg: '\x1b[38;2;248;248;242m', // #F8F8F2
	dim: '\x1b[38;2;98;114;164m', // #6272A4
	accent: '\x1b[38;2;189;147;249m', // #BD93F9
	green: '\x1b[38;2;80;250;123m', // #50FA7B
	yellow: '\x1b[38;2;241;250;140m', // #F1FA8C
	red: '\x1b[38;2;255;85;85m', // #FF5555
	cyan: '\x1b[38;2;139;233;253m', // #8BE9FD
	white: '\x1b[38;2;248;248;242m', // #F8F8F2
	bold: BOLD,
	reset: RESET,
};

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

export const themes: Theme[] = [darkTheme, lightTheme, nordTheme, draculaTheme];

export function getNextTheme(current: Theme): Theme {
	const index = themes.indexOf(current);
	return themes[(index + 1) % themes.length] ?? darkTheme;
}
