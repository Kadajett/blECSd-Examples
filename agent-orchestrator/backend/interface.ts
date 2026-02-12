/**
 * Backend abstraction for pane management.
 *
 * Both tmux and blECSd implementations conform to this interface,
 * allowing MCP tools and input handlers to work with either backend.
 *
 * @module agent-orchestrator/backend/interface
 */

import type { AgentKind, AgentStatus } from '../types.js';

/**
 * Information about a single pane in the layout.
 */
export interface PaneInfo {
	readonly id: string;
	readonly label: string;
	readonly kind: AgentKind;
	readonly status: AgentStatus;
	readonly width: number;
	readonly height: number;
	readonly isOrchestrator: boolean;
}

/**
 * Backend interface for pane management.
 *
 * MCP tools and input handlers call these methods without knowing
 * whether the underlying implementation uses tmux or blECSd terminals.
 */
export interface PaneBackend {
	/** Send raw text to a pane's terminal input (does NOT press Enter). */
	sendInput(paneId: string, text: string): void;

	/** Press Enter in a pane's terminal. */
	sendEnter(paneId: string): void;

	/**
	 * Send text and automatically press Enter.
	 * This is the preferred method for sending commands to panes.
	 * Callers should use this instead of sendInput + sendEnter separately.
	 */
	sendPrompt(paneId: string, text: string): void;

	/** Update the short task label shown for a pane. */
	updatePaneTask(paneId: string, task: string): void;

	/** Capture the visible text output of a pane. */
	captureOutput(paneId: string): string;

	/** List all active panes. */
	listPanes(): readonly PaneInfo[];

	/**
	 * Add a new pane and spawn an agent in it.
	 *
	 * @param kind - Agent kind (preset name or "custom:<command>")
	 * @param workspace - Working directory for the agent
	 * @param mock - Whether to use mock mode
	 * @returns The new pane's ID
	 */
	addPane(kind: string, workspace: string, mock: boolean): string;

	/** Remove a pane and kill its process. */
	removePane(paneId: string): void;

	/** Resize a pane to new dimensions. */
	resizePane(paneId: string, width: number, height: number): void;

	/** Find a pane by its human-readable name/title. Returns pane ID if found. */
	findPaneByName?(name: string): string | undefined;
}
