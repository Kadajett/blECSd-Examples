/**
 * Token usage tracker for agent panes.
 *
 * Captures tmux pane output and parses token usage from Claude Code and
 * Codex CLI status lines. Maintains per-pane history for sparkline rendering.
 *
 * @module agent-orchestrator/utils/tokenTracker
 */

import { execSync } from 'node:child_process';

// =============================================================================
// TYPES
// =============================================================================

/** A single point-in-time token usage reading from a pane. */
export interface TokenSnapshot {
	readonly paneId: string;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly contextPercent: number;
	readonly timestamp: number;
}

/** Rolling history of token snapshots for a single pane. */
export interface TokenHistory {
	readonly paneId: string;
	readonly snapshots: readonly TokenSnapshot[];
	readonly maxSnapshots: number;
}

// =============================================================================
// PARSING
// =============================================================================

/**
 * Parses a "Nk" or plain number string into an integer.
 *
 * @param raw - String like "10.2k", "547", or "3.5k"
 * @returns Parsed integer value
 */
function parseTokenValue(raw: string): number {
	const trimmed = raw.trim();
	if (trimmed.endsWith('k') || trimmed.endsWith('K')) {
		const num = Number.parseFloat(trimmed.slice(0, -1));
		return Number.isFinite(num) ? Math.round(num * 1000) : 0;
	}
	const num = Number.parseFloat(trimmed);
	return Number.isFinite(num) ? Math.round(num) : 0;
}

/**
 * Parses token counts from captured pane text.
 *
 * Looks for patterns like:
 * - Down arrow followed by number and "tokens" (input/consumed)
 * - Up arrow followed by number and "tokens" (output/generated)
 * - "N% context" for context percentage
 *
 * When multiple matches exist, the last one wins (most recent line).
 *
 * @param output - Raw captured pane text
 * @returns Parsed token counts
 */
export function parseTokensFromOutput(output: string): {
	inputTokens: number;
	outputTokens: number;
	contextPercent: number;
} {
	let inputTokens = 0;
	let outputTokens = 0;
	let contextPercent = 0;

	// Down arrow (input/consumed tokens): ↓ 547 tokens, ↓ 10.2k tokens
	const inputPattern = /↓\s*([\d.]+k?)\s*tokens/gi;
	let match: RegExpExecArray | null = null;
	while ((match = inputPattern.exec(output)) !== null) {
		const val = match[1];
		if (val) {
			inputTokens = parseTokenValue(val);
		}
	}

	// Up arrow (output/generated tokens): ↑ 420 tokens, ↑ 2.1k tokens
	const outputPattern = /↑\s*([\d.]+k?)\s*tokens/gi;
	while ((match = outputPattern.exec(output)) !== null) {
		const val = match[1];
		if (val) {
			outputTokens = parseTokenValue(val);
		}
	}

	// Context percentage: 67% context
	const contextPattern = /(\d+)%\s*context/gi;
	while ((match = contextPattern.exec(output)) !== null) {
		const val = match[1];
		if (val) {
			contextPercent = Number.parseInt(val, 10);
		}
	}

	return { inputTokens, outputTokens, contextPercent };
}

// =============================================================================
// CAPTURE
// =============================================================================

/**
 * Captures a token snapshot from a tmux pane by reading its visible output.
 *
 * @param session - Tmux session name
 * @param paneId - Target pane ID (e.g. "0.2")
 * @returns Token snapshot with parsed values
 */
export function captureTokenSnapshot(session: string, paneId: string): TokenSnapshot {
	let output = '';
	try {
		output = execSync(
			`tmux -L blecsd capture-pane -t ${session}:${paneId} -p`,
			{ encoding: 'utf8', timeout: 3000 },
		).trim();
	} catch {
		// Pane may not exist or tmux may be unavailable
	}

	const parsed = parseTokensFromOutput(output);
	return {
		paneId,
		inputTokens: parsed.inputTokens,
		outputTokens: parsed.outputTokens,
		contextPercent: parsed.contextPercent,
		timestamp: Date.now(),
	};
}

// =============================================================================
// HISTORY
// =============================================================================

/**
 * Creates an empty token history buffer for a pane.
 *
 * @param paneId - Pane ID to track
 * @param maxSnapshots - Maximum number of snapshots to retain (default 60)
 * @returns New empty token history
 */
export function createTokenHistory(paneId: string, maxSnapshots = 60): TokenHistory {
	return { paneId, snapshots: [], maxSnapshots };
}

/**
 * Captures a new token snapshot and appends it to the history.
 * Trims old entries beyond maxSnapshots.
 *
 * @param history - Current token history
 * @param session - Tmux session name
 * @returns Updated token history (immutable)
 */
export function updateTokenHistory(history: TokenHistory, session: string): TokenHistory {
	const snapshot = captureTokenSnapshot(session, history.paneId);
	const updated = [...history.snapshots, snapshot];
	const trimmed = updated.length > history.maxSnapshots
		? updated.slice(updated.length - history.maxSnapshots)
		: updated;

	return { ...history, snapshots: trimmed };
}
