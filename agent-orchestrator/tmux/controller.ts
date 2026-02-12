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
