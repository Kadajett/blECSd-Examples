/**
 * Cleanup handlers for both blECSd and tmux modes.
 *
 * @module agent-orchestrator/helpers/cleanup
 */

import { writeRaw, showCursor, leaveAlternateScreen } from 'blecsd';
import * as tmux from '../tmux/controller.js';
import { stopMcpServer } from '../mcp/server.js';
import { log, warn } from '../utils/logger.js';

import type BetterSqlite3 from 'better-sqlite3';
import type { AppState, McpServerState } from '../types.js';

// DB module reference - set by the caller to avoid circular imports
let dbModuleRef: typeof import('../db/index.js') | null = null;

/**
 * Provides the db module reference for cleanup operations.
 * Call this once after loading the optional db module.
 */
export function setDbModuleForCleanup(mod: typeof import('../db/index.js') | null): void {
	dbModuleRef = mod;
}

/**
 * Cleans up all resources for blECSd native mode:
 * terminals, timers, MCP server, database, and terminal state.
 *
 * @param state - Application state
 * @param db - SQLite database (null if unavailable)
 * @param ragTimer - RAG ingestion interval (null if not running)
 * @param activityTicker - Activity tracking interval
 * @param healthTimer - Agent health check interval
 * @param mcpState - MCP server state (null if not running)
 */
export function cleanupBlecsd(
	state: AppState,
	db: BetterSqlite3.Database | null,
	ragTimer: NodeJS.Timeout | null,
	activityTicker: NodeJS.Timeout,
	healthTimer: NodeJS.Timeout,
	mcpState: McpServerState | null,
): void {
	clearInterval(activityTicker);
	clearInterval(healthTimer);
	if (ragTimer) clearInterval(ragTimer);

	// Kill all terminals
	if (state.orchestratorPane) {
		state.orchestratorPane.terminal.kill();
		state.orchestratorPane.terminal.destroy();
	}
	for (const pane of state.workerPanes) {
		pane.terminal.kill();
		pane.terminal.destroy();
	}

	// Restore terminal
	// TODO: blECSd missing mouse tracking enable/disable API - using writeRaw
	writeRaw('\x1b[?1000l'); // Disable button mouse tracking
	writeRaw('\x1b[?1006l'); // Disable SGR mouse encoding
	showCursor();
	leaveAlternateScreen();

	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}

	if (mcpState) {
		stopMcpServer(mcpState).catch((err) => {
			warn('Failed to stop MCP server during cleanup', err);
		});
	}

	if (db && dbModuleRef) {
		try {
			dbModuleRef.closeDatabase(db);
		} catch (err) {
			warn('Failed to close database during cleanup', err);
		}
	}

	process.exit(0);
}

/**
 * Cleans up all resources for tmux mode:
 * session, timers, MCP server, and database.
 *
 * @param session - Tmux session name
 * @param db - SQLite database (null if unavailable)
 * @param ragTimer - RAG ingestion interval (null if not running)
 * @param mcpState - MCP server state (null if not running)
 */
export function cleanupTmux(
	session: string,
	db: BetterSqlite3.Database | null,
	ragTimer: NodeJS.Timeout | null,
	mcpState: McpServerState | null,
): void {
	tmux.killSession(session);
	if (ragTimer) clearInterval(ragTimer);

	if (mcpState) {
		stopMcpServer(mcpState).catch((err) => {
			warn('Failed to stop MCP server during cleanup', err);
		});
	}

	if (db && dbModuleRef) {
		try {
			dbModuleRef.closeDatabase(db);
		} catch (err) {
			warn('Failed to close database during cleanup', err);
		}
	}

	log('Tmux session cleaned up');
}
