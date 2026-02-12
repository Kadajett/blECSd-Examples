/**
 * Input parsing and key binding detection.
 *
 * @module agent-orchestrator/input/keyBindings
 */

import type { ParsedInput } from '../types.js';

/**
 * Parses raw terminal input into structured ParsedInput.
 *
 * @param data - Raw input string from stdin
 * @returns Parsed input with key, modifiers, and mouse coordinates
 *
 * @example
 * ```typescript
 * const input = parseInput('\x03'); // Ctrl+C
 * // { key: 'c', ctrl: true, shift: false, meta: false, raw: '\x03' }
 * ```
 */
export function parseInput(data: string): ParsedInput {
	// Ctrl key combinations
	if (data === '\x01') {
		return { key: 'a', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x03') {
		return { key: 'c', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x04') {
		return { key: 'd', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x0e') {
		return { key: 'n', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x10') {
		return { key: 'p', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x11') {
		return { key: 'q', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x1c') {
		return { key: '\\', ctrl: true, shift: false, meta: false, raw: data };
	}
	if (data === '\x1a') {
		return { key: 'z', ctrl: true, shift: false, meta: false, raw: data };
	}

	// Tab and Shift+Tab
	if (data === '\t') {
		return { key: 'tab', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[Z') {
		return { key: 'tab', ctrl: false, shift: true, meta: false, raw: data };
	}

	// Mouse sequences (SGR format: \x1b[<b;x;yM or \x1b[<b;x;ym)
	if (data.startsWith('\x1b[<')) {
		const match = data.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
		if (match && match[2] && match[3]) {
			return {
				key: 'mouse',
				ctrl: false,
				shift: false,
				meta: false,
				mouseX: Number.parseInt(match[2], 10),
				mouseY: Number.parseInt(match[3], 10),
				raw: data,
			};
		}
	}

	// Legacy mouse format: \x1b[Mbxy
	if (data.startsWith('\x1b[M') && data.length >= 6) {
		return {
			key: 'mouse',
			ctrl: false,
			shift: false,
			meta: false,
			mouseX: data.charCodeAt(4) - 32,
			mouseY: data.charCodeAt(5) - 32,
			raw: data,
		};
	}

	// Arrow keys
	if (data === '\x1b[A') {
		return { key: 'up', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[B') {
		return { key: 'down', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[C') {
		return { key: 'right', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[D') {
		return { key: 'left', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Home/End
	if (data === '\x1b[H' || data === '\x1bOH') {
		return { key: 'home', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[F' || data === '\x1bOF') {
		return { key: 'end', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Page Up/Down
	if (data === '\x1b[5~') {
		return { key: 'pageup', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[6~') {
		return { key: 'pagedown', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Insert/Delete
	if (data === '\x1b[2~') {
		return { key: 'insert', ctrl: false, shift: false, meta: false, raw: data };
	}
	if (data === '\x1b[3~') {
		return { key: 'delete', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Escape
	if (data === '\x1b') {
		return { key: 'escape', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Backspace
	if (data === '\x7f' || data === '\x08') {
		return { key: 'backspace', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Enter
	if (data === '\r' || data === '\n') {
		return { key: 'enter', ctrl: false, shift: false, meta: false, raw: data };
	}

	// Meta (Alt) combinations
	if (data.startsWith('\x1b') && data.length === 2) {
		return { key: data[1] ?? '', ctrl: false, shift: false, meta: true, raw: data };
	}

	// Single printable character
	if (data.length === 1) {
		return { key: data, ctrl: false, shift: false, meta: false, raw: data };
	}

	// Unknown/complex sequence
	return { key: 'unknown', ctrl: false, shift: false, meta: false, raw: data };
}
