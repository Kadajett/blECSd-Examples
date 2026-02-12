/**
 * Tmux session controller.
 *
 * All orchestrator-to-agent communication goes through tmux commands.
 * Uses a dedicated socket name (`blecsd`) to avoid conflicts with the
 * user's own tmux sessions.
 *
 * @module agent-orchestrator/tmux/controller
 */

import { execSync } from 'node:child_process';

/** Named tmux socket so we don't collide with user sessions. */
const SOCKET = 'blecsd';

// =============================================================================
// LOW-LEVEL EXEC
// =============================================================================

/**
 * Runs a tmux command against the blecsd socket.
 *
 * @param cmd - tmux subcommand and arguments
 * @returns stdout (trimmed)
 */
export function run(cmd: string): string {
	return execSync(`tmux -L ${SOCKET} ${cmd}`, {
		encoding: 'utf8',
		timeout: 5000,
	}).trim();
}

/**
 * Runs a tmux command, suppressing errors (returns empty string on failure).
 *
 * @param cmd - tmux subcommand and arguments
 * @returns stdout or empty string
 */
export function tryRun(cmd: string): string {
	try {
		return run(cmd);
	} catch {
		return '';
	}
}

// =============================================================================
// SESSION LIFECYCLE
// =============================================================================

/**
 * Creates a detached tmux session.
 *
 * @param session - Session name
 * @param width - Initial width
 * @param height - Initial height
 */
export function createSession(session: string, width: number, height: number): void {
	run(`new-session -d -s ${session} -x ${width} -y ${height}`);
}

/**
 * Kills a tmux session (no-op if it doesn't exist).
 *
 * @param session - Session name
 */
export function killSession(session: string): void {
	tryRun(`kill-session -t ${session}`);
}

/**
 * Returns the tmux attach command and args (for spawning via PTY).
 *
 * @param session - Session name
 * @returns [command, ...args]
 */
export function attachArgs(session: string): [string, string[]] {
	return ['tmux', ['-L', SOCKET, 'attach-session', '-t', session]];
}

// =============================================================================
// PANE MANAGEMENT
// =============================================================================

/**
 * Splits a pane.
 *
 * @param session - Session name
 * @param target - Target pane (e.g. "0.0")
 * @param horizontal - true for horizontal split (side-by-side), false for vertical
 * @param percent - Size percentage for the new pane
 */
export function splitWindow(
	session: string,
	target: string,
	horizontal: boolean,
	percent: number,
): void {
	const flag = horizontal ? '-h' : '-v';
	run(`split-window ${flag} -t ${session}:${target} -p ${percent}`);
}

/**
 * Selects (focuses) a pane.
 *
 * @param session - Session name
 * @param target - Target pane
 */
export function selectPane(session: string, target: string): void {
	run(`select-pane -t ${session}:${target}`);
}

/**
 * Kills a specific pane.
 *
 * @param session - Session name
 * @param target - Target pane
 */
export function killPane(session: string, target: string): void {
	tryRun(`kill-pane -t ${session}:${target}`);
}

/**
 * Lists pane addresses (window.pane) in a session.
 *
 * @param session - Session name
 * @returns Array of "window.pane" strings (e.g. ["1.1", "1.2"])
 */
export function listPanes(session: string): string[] {
	const out = tryRun(`list-panes -t ${session} -F "#{window_index}.#{pane_index}"`);
	return out.split('\n').filter(Boolean);
}

/**
 * Returns the address of the first (and only) pane after session creation.
 * Handles both base-index 0 and 1 configs.
 *
 * @param session - Session name
 * @returns "window.pane" string (e.g. "0.0" or "1.1")
 */
export function getFirstPane(session: string): string {
	const panes = listPanes(session);
	return panes[0] ?? '0.0';
}

// =============================================================================
// SENDING INPUT
// =============================================================================

/**
 * Sends literal keystrokes to a tmux pane.
 *
 * @param session - Session name
 * @param target - Target pane
 * @param text - Text to type
 */
export function sendKeys(session: string, target: string, text: string): void {
	// Use -l for literal text (no key name interpretation)
	const escaped = text.replace(/'/g, "'\\''");
	run(`send-keys -t ${session}:${target} -l '${escaped}'`);
}

/**
 * Sends Enter to a tmux pane.
 *
 * @param session - Session name
 * @param target - Target pane
 */
export function sendEnter(session: string, target: string): void {
	run(`send-keys -t ${session}:${target} Enter`);
}

/**
 * Sends text + Enter in one call.
 *
 * @param session - Session name
 * @param target - Target pane
 * @param text - Command to send
 */
export function sendCommand(session: string, target: string, text: string): void {
	sendKeys(session, target, text);
	sendEnter(session, target);
}

// =============================================================================
// READING OUTPUT
// =============================================================================

/**
 * Captures the visible content of a pane.
 *
 * @param session - Session name
 * @param target - Target pane
 * @returns Captured text
 */
export function capturePane(session: string, target: string): string {
	return tryRun(`capture-pane -t ${session}:${target} -p`);
}

// =============================================================================
// OPTIONS & STYLING
// =============================================================================

/**
 * Sets a tmux session-level option.
 *
 * @param session - Session name
 * @param option - Option name
 * @param value - Option value
 */
export function setOption(session: string, option: string, value: string): void {
	tryRun(`set-option -t ${session} ${option} "${value}"`);
}

/**
 * Sets a tmux window-level option.
 *
 * @param session - Session name
 * @param option - Option name
 * @param value - Option value
 */
export function setWindowOption(session: string, option: string, value: string): void {
	tryRun(`set-window-option -t ${session} ${option} "${value}"`);
}

/**
 * Binds a key in the tmux session.
 *
 * @param session - Session name
 * @param key - Key to bind (e.g. "C-q", "M-n")
 * @param command - tmux command to run when key is pressed
 */
export function bindKey(session: string, key: string, command: string): void {
	tryRun(`bind-key -t ${session} ${key} ${command}`);
}

/**
 * Binds a key globally (not session-scoped) on the blecsd socket.
 *
 * @param key - Key to bind (e.g. "C-q", "M-n")
 * @param command - tmux command to run when key is pressed
 */
export function bindKeyGlobal(key: string, command: string): void {
	tryRun(`bind-key ${key} ${command}`);
}

/**
 * Applies a tiled layout to even out pane sizes.
 *
 * @param session - Session name
 */
export function tiledLayout(session: string): void {
	tryRun(`select-layout -t ${session} tiled`);
}

/**
 * Resizes a pane.
 *
 * @param session - Session name
 * @param target - Target pane
 * @param width - New width
 * @param height - New height
 */
export function resizePane(
	session: string,
	target: string,
	width: number,
	height: number,
): void {
	tryRun(`resize-pane -t ${session}:${target} -x ${width} -y ${height}`);
}

// =============================================================================
// POPUPS & NOTIFICATIONS
// =============================================================================

/** Border style mapping for tmux display-popup -b flag. */
const POPUP_BORDER_MAP: Record<string, string> = {
	single: 'simple',
	double: 'double',
	heavy: 'heavy',
	rounded: 'rounded',
	none: 'none',
};

/** Options for display-popup. */
export interface PopupOptions {
	readonly width: number;
	readonly height: number;
	readonly title?: string;
	readonly borderStyle?: 'single' | 'double' | 'heavy' | 'rounded' | 'none';
	readonly style?: string;
	readonly borderStyle_fg?: string;
	readonly command: string;
}

/**
 * Opens a tmux popup window running a command.
 *
 * @param session - Session name
 * @param opts - Popup configuration
 */
export function displayPopup(session: string, opts: PopupOptions): void {
	const border = POPUP_BORDER_MAP[opts.borderStyle ?? 'rounded'] ?? 'rounded';
	const parts = [
		`display-popup -t ${session}`,
		`-w ${opts.width}`,
		`-h ${opts.height}`,
		`-b ${border}`,
		`-E`,
	];
	if (opts.title) {
		parts.push(`-T " ${opts.title} "`);
	}
	if (opts.style) {
		parts.push(`-s "${opts.style}"`);
	}
	if (opts.borderStyle_fg) {
		parts.push(`-S "fg=${opts.borderStyle_fg}"`);
	}
	parts.push(`"${opts.command.replace(/"/g, '\\"')}"`);
	tryRun(parts.join(' '));
}

/**
 * Shows a tmux status-line message (toast-like notification).
 *
 * @param session - Session name
 * @param message - Message text (supports tmux style tags like #[fg=...])
 * @param durationMs - How long to show (milliseconds, default 3000)
 */
export function displayMessage(session: string, message: string, durationMs = 3000): void {
	const seconds = Math.max(1, Math.ceil(durationMs / 1000));
	tryRun(`set-option -t ${session} display-time "${seconds * 1000}"`);
	const escaped = message.replace(/"/g, '\\"');
	tryRun(`display-message -t ${session} "${escaped}"`);
}

// =============================================================================
// PANE USER OPTIONS
// =============================================================================

/**
 * Sets a per-pane user option (prefixed with @).
 *
 * @param session - Session name
 * @param target - Target pane (e.g. "0.2")
 * @param key - Option key (without @ prefix)
 * @param value - Option value
 */
export function setPaneUserOption(session: string, target: string, key: string, value: string): void {
	const escaped = value.replace(/"/g, '\\"');
	tryRun(`set-option -p -t ${session}:${target} @${key} "${escaped}"`);
}

/**
 * Gets a per-pane user option value.
 *
 * @param session - Session name
 * @param target - Target pane (e.g. "0.2")
 * @param key - Option key (without @ prefix)
 * @returns Option value or empty string
 */
export function getPaneUserOption(session: string, target: string, key: string): string {
	return tryRun(`display-message -p -t ${session}:${target} "#{@${key}}"`);
}

/**
 * Opens a tmux display-menu.
 *
 * @param session - Session name
 * @param title - Menu title
 * @param items - Menu entries as [label, shortcutKey, command] tuples.
 *                Use ["", "", ""] for a separator.
 */
export function displayMenu(
	session: string,
	title: string,
	items: ReadonlyArray<readonly [string, string, string]>,
): void {
	const parts = [`display-menu -t ${session} -T " ${title} "`];
	for (const [label, key, command] of items) {
		if (label === '' && key === '' && command === '') {
			parts.push('""');
		} else {
			parts.push(`"${label}" "${key}" "${command.replace(/"/g, '\\"')}"`);
		}
	}
	tryRun(parts.join(' '));
}
