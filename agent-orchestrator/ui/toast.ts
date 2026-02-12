/**
 * Toast notification system.
 *
 * Renders auto-dismissing notification messages in the top-right corner.
 * Toasts are stored in a module-level array and auto-expire after 3 seconds.
 *
 * @module agent-orchestrator/ui/toast
 */

import { THEME } from './theme.js';

// =============================================================================
// TYPES
// =============================================================================

/** Toast notification kind. */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

/** A single toast notification entry. */
interface ToastEntry {
	readonly message: string;
	readonly kind: ToastKind;
	readonly createdAt: number;
}

// =============================================================================
// STATE
// =============================================================================

/** Module-level mutable toast array. */
const toasts: ToastEntry[] = [];

/** Toast display duration in ms. */
const TOAST_TTL = 3000;

// =============================================================================
// ICONS AND COLORS
// =============================================================================

/** Icon prefix per toast kind. */
const TOAST_ICONS: Record<ToastKind, string> = {
	info: '\u2139',  // ℹ
	success: '\u2713', // ✓
	warning: '\u26A0', // ⚠
	error: '\u2717',   // ✗
};

/** Color per toast kind. */
const TOAST_COLORS: Record<ToastKind, string> = {
	info: THEME.accent2.fg,
	success: THEME.success.fg,
	warning: THEME.warning.fg,
	error: THEME.error.fg,
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Adds a toast notification.
 *
 * @param message - Toast message text
 * @param kind - Toast kind (info, success, warning, error)
 */
export function addToast(message: string, kind: ToastKind): void {
	toasts.push({ message, kind, createdAt: Date.now() });
}

/**
 * Renders all active (non-expired) toasts in the top-right corner.
 * Expired toasts are pruned before rendering.
 *
 * @param screenW - Screen width
 * @param _screenH - Screen height (reserved for future use)
 * @returns ANSI string for all visible toasts
 */
export function renderToasts(screenW: number, _screenH: number): string {
	// Prune expired toasts
	const now = Date.now();
	let i = 0;
	while (i < toasts.length) {
		const toast = toasts[i];
		if (toast && now - toast.createdAt > TOAST_TTL) {
			toasts.splice(i, 1);
		} else {
			i++;
		}
	}

	if (toasts.length === 0) {
		return '';
	}

	let output = '';
	const maxToastWidth = Math.min(40, screenW - 4);

	for (let idx = 0; idx < toasts.length; idx++) {
		const toast = toasts[idx];
		if (!toast) continue;

		const icon = TOAST_ICONS[toast.kind];
		const color = TOAST_COLORS[toast.kind];

		// Truncate message to fit
		const prefix = `${icon} `;
		const maxMsgLen = maxToastWidth - prefix.length - 2; // 2 for padding
		const msg = toast.message.length > maxMsgLen
			? toast.message.slice(0, maxMsgLen - 3) + '...'
			: toast.message;

		const content = `${prefix}${msg}`;
		const visLen = content.length;
		const padR = Math.max(0, maxToastWidth - visLen);

		// Position: row 2+idx (below header), right-aligned
		const col = Math.max(1, screenW - maxToastWidth);
		const row = 2 + idx;

		output += `\x1b[${row};${col}H`;
		output += THEME.overlay.bg;
		output += color;
		output += ` ${content}${' '.repeat(padR)}`;
		output += THEME.reset;
	}

	return output;
}

/**
 * Returns the current number of active (non-expired) toasts.
 *
 * @returns Toast count
 */
export function getToastCount(): number {
	const now = Date.now();
	return toasts.filter((t) => now - t.createdAt <= TOAST_TTL).length;
}
