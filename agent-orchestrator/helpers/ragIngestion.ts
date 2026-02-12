/**
 * RAG ingestion loops for capturing agent output and indexing it.
 *
 * Supports both tmux mode (captures via tmux pane) and blECSd mode
 * (captures via backend API). Includes deduplication and noise filtering.
 *
 * @module agent-orchestrator/helpers/ragIngestion
 */

import * as tmux from '../tmux/controller.js';
import { warn } from '../utils/logger.js';

import type BetterSqlite3 from 'better-sqlite3';
import type { RagIndex } from '../db/rag.js';
import type { AppState } from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** How often to capture and ingest agent output (ms). */
const RAG_CAPTURE_INTERVAL = 10_000;

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Tracks previously captured output per pane to avoid re-ingesting identical content.
 * Maps pane ID to hash of last captured output.
 */
const lastCapturedHashes = new Map<string, string>();

/**
 * Simple hash for deduplication. Not cryptographic, just fast.
 */
function quickHash(text: string): string {
	let hash = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return String(hash);
}

// =============================================================================
// NOISE FILTERING
// =============================================================================

/**
 * Filters out terminal noise lines that are not useful for RAG indexing.
 * Keeps only meaningful content lines.
 *
 * @param lines - Raw terminal output lines
 * @returns Filtered lines with noise removed
 */
export function filterNoiseLines(lines: string[]): string[] {
	return lines.filter((line) => {
		const trimmed = line.trim();

		// Too short to be meaningful
		if (trimmed.length < 15) return false;

		// Box-drawing / separator lines
		if (/^[─═│┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬\-=|+·•*_~]{3,}$/.test(trimmed)) return false;

		// Shell prompts and cd commands
		if (/^([$#>%]\s*$|cd\s+["']|bash\s*$|exit\s*$)/.test(trimmed)) return false;
		if (/^\$\s/.test(trimmed) && trimmed.length < 40) return false;

		// ANSI-only content (escape sequences with no visible text)
		const stripped = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
		if (stripped.length < 10) return false;

		// Repeated dashes, dots, or equals
		if (/^[.\-=~]{5,}$/.test(stripped)) return false;

		// Pure file path lines (no explanation)
		if (/^[\/~][^\s]*$/.test(stripped) && stripped.length < 80) return false;

		// tmux status / pane indicator lines
		if (/^\[.*\]\s*$/.test(stripped) && stripped.length < 30) return false;

		return true;
	});
}

// =============================================================================
// INGESTION LOOPS
// =============================================================================

/**
 * Starts the RAG ingestion loop for tmux mode.
 * Periodically captures output from worker panes and indexes it.
 *
 * @param session - Tmux session name
 * @param workerPanes - Worker pane IDs
 * @param db - SQLite database
 * @param ragIndex - RAG index
 * @param ragModule - RAG module reference
 * @returns Timer handle for cleanup
 */
export function startTmuxRagIngestion(
	session: string,
	workerPanes: string[],
	db: BetterSqlite3.Database,
	ragIndex: RagIndex,
	ragModule: typeof import('../db/rag.js'),
): NodeJS.Timeout {
	return setInterval(() => {
		for (const pane of workerPanes) {
			try {
				const output = tmux.capturePane(session, pane);
				if (output.length === 0) continue;

				// Deduplicate: skip if output hasn't changed since last capture
				const hash = quickHash(output);
				if (lastCapturedHashes.get(pane) === hash) continue;
				lastCapturedHashes.set(pane, hash);

				// Filter noise and only ingest meaningful lines
				const lines = filterNoiseLines(output.split('\n'));
				if (lines.length > 0) {
					ragModule.ingestAgentOutput(db, ragIndex, `pane-${pane}`, lines);
				}
			} catch (err) {
				warn(`RAG ingestion failed for tmux pane ${pane}`, err);
			}
		}
	}, RAG_CAPTURE_INTERVAL);
}

/**
 * Starts the RAG ingestion loop for blECSd native mode.
 * Periodically captures output from worker terminals and indexes it.
 *
 * @param state - Application state
 * @param db - SQLite database
 * @param ragIndex - RAG index
 * @param ragModule - RAG module reference
 * @returns Timer handle for cleanup
 */
export function startBlecsdRagIngestion(
	state: AppState,
	db: BetterSqlite3.Database,
	ragIndex: RagIndex,
	ragModule: typeof import('../db/rag.js'),
): NodeJS.Timeout {
	return setInterval(() => {
		if (!state.backend) return;

		const panes = state.backend.listPanes();
		for (const paneInfo of panes) {
			if (paneInfo.isOrchestrator) continue;

			try {
				const output = state.backend.captureOutput(paneInfo.id);
				if (output.length === 0) continue;

				// Deduplicate
				const hash = quickHash(output);
				if (lastCapturedHashes.get(paneInfo.id) === hash) continue;
				lastCapturedHashes.set(paneInfo.id, hash);

				// Filter noise
				const lines = filterNoiseLines(output.split('\n'));
				if (lines.length > 0) {
					ragModule.ingestAgentOutput(db, ragIndex, paneInfo.id, lines);
				}
			} catch (err) {
				warn(`RAG ingestion failed for blECSd pane ${paneInfo.id}`, err);
			}
		}
	}, RAG_CAPTURE_INTERVAL);
}
