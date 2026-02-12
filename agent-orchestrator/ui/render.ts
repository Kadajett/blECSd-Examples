/**
 * Frame rendering for the agent orchestrator UI.
 *
 * @module agent-orchestrator/ui/render
 */

import type { AppState, AgentPane, RagDocument, SharedContextEntry } from '../types.js';
import { COLORS } from '../config.js';
import { renderPaneBorder } from './agentPanel.js';
import { renderStatusBar } from './statusBar.js';
import { renderMemorySidebar, type SidebarRenderData } from './memorySidebar.js';

import { warn } from '../utils/logger.js';

import type Database from 'better-sqlite3';

const RESET = '\x1b[0m';

/**
 * RGBA color components.
 */
interface RgbaColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

/**
 * Unpacks a packed RGBA color value to components.
 *
 * @param color - Packed RGBA color (0xRRGGBBAA)
 * @returns Color components
 */
export function unpackRgba(color: number): RgbaColor {
	return {
		r: (color >> 24) & 0xff,
		g: (color >> 16) & 0xff,
		b: (color >> 8) & 0xff,
		a: color & 0xff,
	};
}

/**
 * Renders a single agent pane with border and activity sparkline.
 *
 * @param pane - The agent pane to render
 * @param isFocused - Whether this pane is focused
 * @param borderColor - ANSI color code for the border
 * @param activityData - Activity history for sparkline
 * @returns ANSI string for the pane
 */
export function renderAgentPane(
	pane: AgentPane,
	isFocused: boolean,
	borderColor: string,
	activityData?: readonly number[],
): string {
	let output = '';

	// Render border with sparkline
	output += renderPaneBorder(
		pane.x,
		pane.y,
		pane.width,
		pane.height,
		pane.agent.label,
		pane.agent.status,
		borderColor,
		activityData,
	);

	// Render terminal content
	const dims = pane.terminal.getDimensions();
	const cells = pane.terminal.getCells();

	if (!cells) {
		return output;
	}

	// Content area (inside border)
	const contentX = pane.x + 1;
	const contentY = pane.y + 1;

	for (let row = 0; row < dims.height; row++) {
		output += `\x1b[${contentY + row + 1};${contentX + 1}H`;

		let prevFg = -1;
		let prevBg = -1;
		let prevAttrs = -1;

		for (let col = 0; col < dims.width; col++) {
			const idx = row * dims.width + col;
			const cell = cells[idx];

			if (cell) {
				const fgPacked = cell.fg;
				const bgPacked = cell.bg;
				const attrs = cell.attrs;

				// Only emit ANSI codes if colors/attrs changed from previous cell
				if (fgPacked !== prevFg || bgPacked !== prevBg || attrs !== prevAttrs) {
					const fg = unpackRgba(fgPacked);
					const bg = unpackRgba(bgPacked);

					const codes: string[] = ['0']; // Reset first
					if (attrs & 1) codes.push('1'); // Bold
					if (attrs & 2) codes.push('2'); // Dim
					if (attrs & 4) codes.push('3'); // Italic
					if (attrs & 8) codes.push('4'); // Underline
					if (attrs & 16) codes.push('5'); // Blink
					if (attrs & 32) codes.push('7'); // Inverse
					if (attrs & 64) codes.push('8'); // Hidden
					if (attrs & 128) codes.push('9'); // Strikethrough

					codes.push(`38;2;${fg.r};${fg.g};${fg.b}`);
					codes.push(`48;2;${bg.r};${bg.g};${bg.b}`);

					output += `\x1b[${codes.join(';')}m`;
					prevFg = fgPacked;
					prevBg = bgPacked;
					prevAttrs = attrs;
				}

				output += cell.char || ' ';
			} else {
				if (prevFg !== -1) {
					output += RESET;
					prevFg = -1;
					prevBg = -1;
					prevAttrs = -1;
				}
				output += ' ';
			}
		}

		// Reset at end of row
		if (prevFg !== -1) {
			output += RESET;
		}
	}

	return output;
}

/**
 * Renders the entire frame: sidebar, orchestrator, workers, status bar.
 *
 * @param state - Application state
 */
export function renderFrame(state: AppState): void {
	// Clear screen + hide cursor + move to home
	let output = '\x1b[?25l\x1b[2J\x1b[H';

	// 0. Render memory sidebar (if visible)
	if (state.sidebar.visible) {
		const sidebarData = buildSidebarData(state);
		output += renderMemorySidebar(state.sidebar, sidebarData, state.screenHeight);
	}

	const orchFocused = state.focusTarget === 'orchestrator';
	const focusedBorderColor = COLORS.borderFocused;

	// 1. Render orchestrator pane
	if (state.orchestratorPane) {
		const orchBorder = orchFocused ? focusedBorderColor : COLORS.borderOrchestrator;
		const orchActivity = state.activity.history.get(state.orchestratorPane.agent.id);
		output += renderAgentPane(state.orchestratorPane, orchFocused, orchBorder, orchActivity);
	}

	// 2. Render worker panes
	for (let i = 0; i < state.workerPanes.length; i++) {
		const pane = state.workerPanes[i];
		if (!pane) continue;

		const isFocused = !orchFocused && i === state.focusedWorkerIndex;
		let borderColor: string = COLORS.borderNormal;

		if (isFocused) {
			borderColor = focusedBorderColor;
		}

		const workerActivity = state.activity.history.get(pane.agent.id);
		output += renderAgentPane(pane, isFocused, borderColor, workerActivity);
	}

	// 3. Render status bar
	output += renderStatusBar(state);

	// 4. Position cursor in the focused pane (only show cursor in focused pane)
	if (!state.sidebar.focused) {
		const focusedPane = orchFocused
			? state.orchestratorPane
			: state.workerPanes[state.focusedWorkerIndex];

		if (focusedPane) {
			const cursor = focusedPane.terminal.getCursor();
			const cursorX = focusedPane.x + cursor.x + 2; // +1 for border, +1 for 1-indexed
			const cursorY = focusedPane.y + cursor.y + 2;
			output += `\x1b[${cursorY};${cursorX}H`;
			output += '\x1b[?25h'; // Show cursor
		}
	}

	// Write to stdout
	process.stdout.write(output);
}

// Raw row shapes from SQLite (snake_case column names)
interface RawRagRow {
	readonly id: number;
	readonly source_agent_id: string;
	readonly chunk: string;
	readonly tokens: string;
	readonly created_at: string;
	readonly pinned: number;
}

interface RawContextRow {
	readonly id: number;
	readonly key: string;
	readonly value: string;
	readonly tags: string;
	readonly agent_id: string;
	readonly created_at: string;
	readonly updated_at: string;
}

/**
 * Builds the sidebar render data from state and database.
 * Maps snake_case SQLite columns to camelCase TypeScript interfaces.
 */
function buildSidebarData(state: AppState): SidebarRenderData {
	const emptyData: SidebarRenderData = {
		ragDocuments: [],
		ragDocumentCount: 0,
		contextEntries: [],
		searchResults: [],
	};

	if (!state.db || !state.dbOps) {
		return emptyData;
	}

	try {
		const db = state.db as Database.Database;
		const dbOps = state.dbOps;

		const rawRagDocs = dbOps.getRagDocumentsWithPins(db, 100, state.sidebar.scrollOffset) as unknown as RawRagRow[];
		const ragDocuments: Array<RagDocument & { pinned: boolean }> = rawRagDocs.map((row) => ({
			id: row.id,
			sourceAgentId: row.source_agent_id,
			chunk: row.chunk,
			tokens: row.tokens,
			createdAt: row.created_at,
			pinned: row.pinned === 1,
		}));

		const ragDocumentCount = dbOps.getRagDocumentCount(db);

		const rawContextEntries = dbOps.listSharedContext(db) as unknown as RawContextRow[];
		const contextEntries: SharedContextEntry[] = rawContextEntries.map((row) => ({
			id: row.id,
			key: row.key,
			value: row.value,
			tags: row.tags,
			agentId: row.agent_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));

		return {
			ragDocuments,
			ragDocumentCount,
			contextEntries,
			searchResults: state.sidebar.searchResults,
		};
	} catch (err) {
		warn('Failed to build sidebar data from database', err, 'render');
		return emptyData;
	}
}
