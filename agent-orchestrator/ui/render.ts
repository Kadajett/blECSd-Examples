/**
 * Frame rendering for the agent orchestrator UI.
 *
 * @module agent-orchestrator/ui/render
 */

import type { AppState, AgentPane, OverlayState, RagDocument, SharedContextEntry } from '../types.js';
import { renderPaneBorder, type BorderStyle } from './agentPanel.js';
import { renderStatusBar } from './statusBar.js';
import { renderHeaderBar } from './headerBar.js';
import { renderToasts } from './toast.js';
import { renderMemorySidebar, type SidebarRenderData } from './memorySidebar.js';
import { THEME, getBorderChars } from './theme.js';

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
 * @param borderStyle - Border character style
 * @returns ANSI string for the pane
 */
export function renderAgentPane(
	pane: AgentPane,
	isFocused: boolean,
	borderColor: string,
	activityData?: readonly number[],
	borderStyle: BorderStyle = 'single',
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
		borderStyle,
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
 * Renders the entire frame: header, sidebar, orchestrator, workers, status bar, toasts.
 *
 * @param state - Application state
 */
export function renderFrame(state: AppState): void {
	// Clear screen + hide cursor + move to home
	let output = '\x1b[?25l\x1b[2J\x1b[H';

	// 0. Render header bar at row 1
	output += renderHeaderBar(state.screenWidth, '');

	// 1. Render memory sidebar (if visible)
	if (state.sidebar.visible) {
		const sidebarData = buildSidebarData(state);
		output += renderMemorySidebar(state.sidebar, sidebarData, state.screenHeight);
	}

	const orchFocused = state.focusTarget === 'orchestrator';

	// 2. Render orchestrator pane (rounded border + accent4)
	if (state.orchestratorPane) {
		const orchBorderColor = orchFocused ? THEME.accent1.fg : THEME.accent4.fg;
		const orchBorderStyle: BorderStyle = orchFocused ? 'double' : 'rounded';
		const orchActivity = state.activity.history.get(state.orchestratorPane.agent.id);
		output += renderAgentPane(state.orchestratorPane, orchFocused, orchBorderColor, orchActivity, orchBorderStyle);
	}

	// 3. Render worker panes
	for (let i = 0; i < state.workerPanes.length; i++) {
		const pane = state.workerPanes[i];
		if (!pane) continue;

		const isFocused = !orchFocused && i === state.focusedWorkerIndex;

		let borderColor: string;
		let borderStyle: BorderStyle;

		if (isFocused) {
			borderColor = THEME.accent1.fg;
			borderStyle = 'double';
		} else {
			borderColor = THEME.subtext.fg;
			borderStyle = 'single';
		}

		const workerActivity = state.activity.history.get(pane.agent.id);
		output += renderAgentPane(pane, isFocused, borderColor, workerActivity, borderStyle);
	}

	// 4. Render status bar
	output += renderStatusBar(state);

	// 5. Render overlay (command palette, agent detail) on top of everything
	if (state.overlay.kind !== 'none') {
		output += renderOverlay(state.overlay, state.screenWidth, state.screenHeight);
	}

	// 6. Render toasts on top of everything (including overlay)
	output += renderToasts(state.screenWidth, state.screenHeight);

	// 7. Position cursor in the focused pane (only show cursor in focused pane)
	if (!state.sidebar.focused && state.overlay.kind === 'none') {
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

// =============================================================================
// OVERLAY RENDERING
// =============================================================================

/**
 * Renders an overlay (command palette or agent detail) centered on screen.
 *
 * @param overlay - Overlay state
 * @param screenW - Screen width
 * @param screenH - Screen height
 * @returns ANSI string for the overlay
 */
function renderOverlay(overlay: OverlayState, screenW: number, screenH: number): string {
	if (overlay.kind === 'command-palette') {
		return renderCommandPalette(overlay, screenW, screenH);
	}
	return '';
}

/**
 * Renders the command palette overlay: search box, items, hints.
 * Uses THEME colors for consistent styling.
 */
function renderCommandPalette(overlay: OverlayState, screenW: number, screenH: number): string {
	const rounded = getBorderChars('rounded');
	const boxW = Math.min(64, screenW - 4);
	const groupedRows = groupPaletteRows(overlay.filteredItems);
	const maxRows = Math.min(groupedRows.length, Math.max(4, screenH - 10));
	const boxH = maxRows + 5; // search + separator + rows + hint + borders
	const startX = Math.max(1, Math.floor((screenW - boxW) / 2));
	const startY = Math.max(1, Math.floor((screenH - boxH) / 2));

	const contentW = boxW - 2; // inside borders

	let output = '';

	// Theme-based colors
	const border = THEME.accent1.fg;
	const bg = THEME.overlay.bg;
	const searchFg = THEME.text.fg;
	const itemFg = THEME.text.fg;
	const selectedFg = `${THEME.bold}${THEME.accent1.fg}`;
	const hintFg = THEME.subtext.fg;
	const headerFg = `${THEME.bold}${THEME.accent4.fg}`;

	// Top border
	output += `\x1b[${startY};${startX}H${border}${bg}${rounded.tl}${rounded.h.repeat(contentW)}${rounded.tr}${RESET}`;

	// Search box row
	const searchLabel = `${THEME.accent1.fg}>${RESET} `;
	const queryDisplay = overlay.searchQuery.slice(0, contentW - searchLabel.length);
	const searchPad = contentW - searchLabel.length - queryDisplay.length;
	output += `\x1b[${startY + 1};${startX}H${border}${bg}${rounded.v}${searchFg}${bg}${searchLabel}${queryDisplay}${' '.repeat(Math.max(0, searchPad))}${border}${bg}${rounded.v}${RESET}`;

	// Separator
	output += `\x1b[${startY + 2};${startX}H${border}${bg}\u251c${rounded.h.repeat(contentW)}\u2524${RESET}`;

	// Items
	for (let i = 0; i < maxRows; i++) {
		const row = groupedRows[i];
		const rowY = startY + 3 + i;
		if (!row) {
			output += `\x1b[${rowY};${startX}H${border}${bg}${rounded.v}${' '.repeat(contentW)}${border}${bg}${rounded.v}${RESET}`;
			continue;
		}

		if (row.type === 'header') {
			const label = row.label.slice(0, contentW);
			const pad = contentW - label.length;
			output += `\x1b[${rowY};${startX}H${border}${bg}${rounded.v}${headerFg}${bg}${label}${' '.repeat(Math.max(0, pad))}${border}${bg}${rounded.v}${RESET}`;
			continue;
		}

		const isSelected = row.itemIndex === overlay.selectedIndex;
		const label = `${row.icon} ${row.label}`.slice(0, contentW);
		const pad = contentW - label.length;
		const rowFg = isSelected ? selectedFg : itemFg;
		output += `\x1b[${rowY};${startX}H${border}${bg}${rounded.v}${rowFg}${bg}${label}${' '.repeat(Math.max(0, pad))}${border}${bg}${rounded.v}${RESET}`;
	}

	// Hints row
	const hintsY = startY + 3 + maxRows;
	const hints = '\u2191\u2193 navigate  Enter select  Esc close';
	const hintText = hints.slice(0, contentW);
	const hintPad = contentW - hintText.length;
	output += `\x1b[${hintsY};${startX}H${border}${bg}${rounded.v}${hintFg}${bg}${hintText}${' '.repeat(Math.max(0, hintPad))}${border}${bg}${rounded.v}${RESET}`;

	// Bottom border
	output += `\x1b[${hintsY + 1};${startX}H${border}${bg}${rounded.bl}${rounded.h.repeat(contentW)}${rounded.br}${RESET}`;

	return output;
}

type PaletteRow = { type: 'header'; label: string } | { type: 'item'; label: string; icon: string; itemIndex: number };

function groupPaletteRows(items: readonly string[]): PaletteRow[] {
	const categories: readonly Array<'Workers' | 'Navigation' | 'Views' | 'System'> = [
		'Workers',
		'Navigation',
		'Views',
		'System',
	];
	const rows: PaletteRow[] = [];

	for (const category of categories) {
		const categoryItems = items
			.map((label, itemIndex) => ({ label, itemIndex }))
			.filter((item) => getPaletteCategory(item.label) === category);
		if (categoryItems.length === 0) {
			continue;
		}

		rows.push({ type: 'header', label: ` ${category}` });
		for (const item of categoryItems) {
			rows.push({
				type: 'item',
				label: item.label,
				icon: getPaletteIcon(item.label),
				itemIndex: item.itemIndex,
			});
		}
	}

	return rows;
}

function getPaletteCategory(label: string): 'Workers' | 'Navigation' | 'Views' | 'System' {
	if (label.includes('Worker')) {
		return 'Workers';
	}
	if (label.startsWith('Focus ') || label.includes('Pane')) {
		return 'Navigation';
	}
	if (label.includes('Sidebar') || label.includes('Detail') || label.includes('Command Mode')) {
		return 'Views';
	}
	return 'System';
}

function getPaletteIcon(label: string): string {
	if (label.startsWith('Add')) return '＋';
	if (label.startsWith('Remove')) return '×';
	if (label.includes('Sidebar')) return '◧';
	if (label.startsWith('Focus')) return '◉';
	if (label.includes('Pane')) return '▸';
	return '⌘';
}

// =============================================================================
// SIDEBAR DATA
// =============================================================================

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
