/**
 * Theme configuration for the reactive dashboard.
 *
 * Provides packed color values for different themes that can be cycled at runtime.
 */

import { packColor } from 'blecsd/utils';

// =============================================================================
// TYPES
// =============================================================================

export interface Theme {
	name: string;
	bg: number;
	fg: number;
	dim: number;
	accent: number;
	green: number;
	yellow: number;
	red: number;
	cyan: number;
	white: number;
	panelBg: number;
	headerBg: number;
	borderFg: number;
	statusBg: number;
	statusFg: number;
}

// =============================================================================
// THEME DEFINITIONS
// =============================================================================

export const darkTheme: Theme = {
	name: 'Dark',
	bg: packColor(0, 0, 0), // Black background
	fg: packColor(192, 192, 192), // Light gray text
	dim: packColor(128, 128, 128), // Dim gray
	accent: packColor(0, 192, 192), // Cyan accent
	green: packColor(0, 192, 0), // Green
	yellow: packColor(192, 192, 0), // Yellow
	red: packColor(192, 0, 0), // Red
	cyan: packColor(0, 192, 192), // Cyan
	white: packColor(255, 255, 255), // White
	panelBg: packColor(0, 0, 0), // Black panel background
	headerBg: packColor(0, 0, 0), // Black header background
	borderFg: packColor(0, 192, 192), // Cyan borders
	statusBg: packColor(192, 192, 192), // Light gray status bar background
	statusFg: packColor(0, 0, 0), // Black status bar text
};

export const lightTheme: Theme = {
	name: 'Light',
	bg: packColor(255, 255, 255), // White background
	fg: packColor(0, 0, 0), // Black text
	dim: packColor(128, 128, 128), // Dim gray
	accent: packColor(0, 0, 192), // Blue accent
	green: packColor(0, 128, 0), // Green
	yellow: packColor(192, 128, 0), // Yellow
	red: packColor(192, 0, 0), // Red
	cyan: packColor(0, 128, 192), // Cyan
	white: packColor(255, 255, 255), // White
	panelBg: packColor(255, 255, 255), // White panel background
	headerBg: packColor(255, 255, 255), // White header background
	borderFg: packColor(0, 0, 192), // Blue borders
	statusBg: packColor(0, 0, 0), // Black status bar background
	statusFg: packColor(255, 255, 255), // White status bar text
};

export const nordTheme: Theme = {
	name: 'Nord',
	bg: packColor(46, 52, 64), // #2E3440
	fg: packColor(236, 239, 244), // #ECEFF4
	dim: packColor(76, 86, 106), // #4C566A
	accent: packColor(136, 192, 208), // #88C0D0
	green: packColor(163, 190, 140), // #A3BE8C
	yellow: packColor(235, 203, 139), // #EBCB8B
	red: packColor(191, 97, 106), // #BF616A
	cyan: packColor(136, 192, 208), // #88C0D0
	white: packColor(236, 239, 244), // #ECEFF4
	panelBg: packColor(46, 52, 64), // #2E3440
	headerBg: packColor(46, 52, 64), // #2E3440
	borderFg: packColor(136, 192, 208), // #88C0D0
	statusBg: packColor(76, 86, 106), // #4C566A
	statusFg: packColor(236, 239, 244), // #ECEFF4
};

export const draculaTheme: Theme = {
	name: 'Dracula',
	bg: packColor(40, 42, 54), // #282A36
	fg: packColor(248, 248, 242), // #F8F8F2
	dim: packColor(98, 114, 164), // #6272A4
	accent: packColor(189, 147, 249), // #BD93F9
	green: packColor(80, 250, 123), // #50FA7B
	yellow: packColor(241, 250, 140), // #F1FA8C
	red: packColor(255, 85, 85), // #FF5555
	cyan: packColor(139, 233, 253), // #8BE9FD
	white: packColor(248, 248, 242), // #F8F8F2
	panelBg: packColor(40, 42, 54), // #282A36
	headerBg: packColor(40, 42, 54), // #282A36
	borderFg: packColor(189, 147, 249), // #BD93F9
	statusBg: packColor(98, 114, 164), // #6272A4
	statusFg: packColor(248, 248, 242), // #F8F8F2
};

// =============================================================================
// THEME MANAGEMENT
// =============================================================================

export const themes: Theme[] = [darkTheme, lightTheme, nordTheme, draculaTheme];

export function getNextTheme(current: Theme): Theme {
	const index = themes.indexOf(current);
	return themes[(index + 1) % themes.length] ?? darkTheme;
}
