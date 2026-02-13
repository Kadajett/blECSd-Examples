/**
 * Terminal detection and lifecycle management.
 *
 * Detects Kitty graphics protocol support, consolidates terminal
 * setup (alt screen, cursor hiding, mouse capture) and cleanup
 * (image deletion, cursor restore, alt screen exit) into single
 * functions with double-cleanup protection.
 *
 * @module render/terminal
 */

import type { KittyRenderer } from './kittyProtocol.js';

// ─── Terminal Detection ──────────────────────────────────────────

/** Known terminal emulators that support the Kitty graphics protocol. */
const KITTY_TERMINALS = new Set([
	'kitty',
	'wezterm',
	'ghostty',
]);

/**
 * Check whether the current terminal supports the Kitty graphics protocol.
 *
 * Inspects `TERM_PROGRAM` environment variable for known Kitty-capable
 * terminals. Falls back to checking `TERM` for "xterm-kitty".
 */
export function isKittySupported(): boolean {
	const termProgram = process.env['TERM_PROGRAM']?.toLowerCase() ?? '';
	if (KITTY_TERMINALS.has(termProgram)) return true;

	const term = process.env['TERM']?.toLowerCase() ?? '';
	if (term === 'xterm-kitty') return true;

	return false;
}

// ─── Terminal Setup / Cleanup ────────────────────────────────────

let shuttingDown = false;

/**
 * Set up the terminal for rendering.
 *
 * Enters the alternate screen buffer, hides the cursor, and
 * enables raw mode for keyboard input.
 */
export function setupTerminal(): void {
	shuttingDown = false;
	process.stdout.write('\x1b[?1049h'); // alt screen
	process.stdout.write('\x1b[?25l');   // hide cursor
}

/**
 * Clean up the terminal, restoring it to its previous state.
 *
 * Deletes any Kitty image, shows the cursor, and exits the
 * alternate screen buffer. Guarded against double-cleanup.
 *
 * @param kittyRenderer - Optional Kitty renderer to clean up images
 */
export function cleanupTerminal(kittyRenderer?: KittyRenderer): void {
	if (shuttingDown) return;
	shuttingDown = true;

	// Delete Kitty image if renderer exists
	if (kittyRenderer) {
		kittyRenderer.cleanup();
	}

	process.stdout.write('\x1b[?25h');   // show cursor
	process.stdout.write('\x1b[?1049l'); // exit alt screen
}
