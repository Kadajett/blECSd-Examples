/**
 * Memory sidebar renderer.
 *
 * Renders a toggleable sidebar on the far left showing RAG documents,
 * shared context entries, and a search interface.
 *
 * @module agent-orchestrator/ui/memorySidebar
 */

import type { MemorySidebarState, SidebarTab, RagSearchResult, RagDocument, SharedContextEntry } from '../types.js';
import { HEADER_HEIGHT } from '../config.js';
import { THEME, getBorderChars } from './theme.js';

const RESET = THEME.reset;
const BORDER = getBorderChars('single');

/**
 * Data needed to render the sidebar.
 */
export interface SidebarRenderData {
	readonly ragDocuments: ReadonlyArray<RagDocument & { pinned: boolean }>;
	readonly ragDocumentCount: number;
	readonly contextEntries: readonly SharedContextEntry[];
	readonly searchResults: readonly RagSearchResult[];
}

/**
 * Renders the memory sidebar.
 *
 * @param state - Sidebar state
 * @param data - Data to display
 * @param screenHeight - Total screen height
 * @returns ANSI string for the sidebar
 */
export function renderMemorySidebar(
	state: MemorySidebarState,
	data: SidebarRenderData,
	screenHeight: number,
): string {
	if (!state.visible) return '';

	const { width } = state;
	const startRow = 1 + HEADER_HEIGHT; // Start below header bar
	const height = screenHeight - 1 - HEADER_HEIGHT; // Reserve status bar + header
	let output = '';

	const rowBgEven = THEME.surface.bg;
	const rowBgOdd = THEME.overlay.bg;
	const borderColor = state.focused ? THEME.accent2.fg : THEME.subtext.fg;

	// Top border with "Memory" label
	output += `\x1b[${startRow};1H`;
	output += borderColor;
	output += `${BORDER.tl}${BORDER.h} `;
	output += RESET;
	output += `${THEME.bold}${THEME.text.fg}Memory${RESET}`;
	output += borderColor;
	output += ' ';
	output += BORDER.h.repeat(Math.max(0, width - 11));
	output += BORDER.tr;
	output += RESET;

	// Tab bar
	output += `\x1b[${startRow + 1};1H`;
	output += borderColor + BORDER.v + RESET;
	output += renderTabBar(state.tab, width - 2);
	output += borderColor + BORDER.v + RESET;

	// Content area
	const contentHeight = height - 3;
	const contentLines = renderContent(state, data, width - 2, contentHeight);

	for (let row = 0; row < contentHeight; row++) {
		output += `\x1b[${startRow + 2 + row};1H`;
		output += borderColor + BORDER.v + RESET;

		const line = contentLines[row] ?? '';
		const rowBg = row % 2 === 0 ? rowBgEven : rowBgOdd;
		const lineWithBg = applyRowBackground(line, rowBg);
		const visLen = stripAnsiLength(lineWithBg);
		output += rowBg + lineWithBg;
		output += ' '.repeat(Math.max(0, width - 2 - visLen));
		output += RESET;

		output += borderColor + BORDER.v + RESET;
	}

	// Bottom border with scroll indicator
	const scrollInfo = getScrollInfo(state, data);
	output += `\x1b[${startRow + height - 1};1H`;
	output += borderColor;
	output += BORDER.bl;
	if (scrollInfo) {
		const infoStr = ` ${scrollInfo} `;
		const padLen = Math.max(0, width - 2 - infoStr.length);
		const leftPad = Math.floor(padLen / 2);
		const rightPad = padLen - leftPad;
		output += BORDER.h.repeat(leftPad);
		output += `${RESET}${THEME.subtext.fg}${infoStr}${RESET}${borderColor}`;
		output += BORDER.h.repeat(rightPad);
	} else {
		output += BORDER.h.repeat(width - 2);
	}
	output += BORDER.br;
	output += RESET;

	return output;
}

function renderTabBar(activeTab: SidebarTab, innerWidth: number): string {
	const tabs: Array<{ key: SidebarTab; label: string }> = [
		{ key: 'rag', label: 'RAG' },
		{ key: 'context', label: 'CTX' },
		{ key: 'search', label: 'FIND' },
	];

	let bar = '';
	for (const tab of tabs) {
		if (tab.key === activeTab) {
			bar += `${THEME.bold}${THEME.accent1.fg}${tab.label}${RESET}${THEME.accent1.fg} _${RESET}`;
		} else {
			bar += `${THEME.subtext.fg} ${tab.label} ${RESET}`;
		}
	}

	const visLen = stripAnsiLength(bar);
	bar += ' '.repeat(Math.max(0, innerWidth - visLen));

	return bar;
}

function renderContent(
	state: MemorySidebarState,
	data: SidebarRenderData,
	innerWidth: number,
	maxLines: number,
): string[] {
	if (state.tab === 'rag') {
		return renderRagTab(data.ragDocuments, data.ragDocumentCount, state.scrollOffset, innerWidth, maxLines);
	}

	if (state.tab === 'context') {
		return renderContextTab(data.contextEntries, state.scrollOffset, innerWidth, maxLines);
	}

	return renderSearchTab(state.searchQuery, data.searchResults, state.scrollOffset, innerWidth, maxLines);
}

function renderRagTab(
	docs: ReadonlyArray<RagDocument & { pinned: boolean }>,
	totalCount: number,
	scrollOffset: number,
	innerWidth: number,
	maxLines: number,
): string[] {
	const lines: string[] = [];

	lines.push(`${THEME.bold}${THEME.accent3.fg}RAG Memory (${totalCount} docs)${RESET}`);
	lines.push(`${THEME.subtext.fg}${'\u2500'.repeat(Math.max(0, innerWidth))}${RESET}`);

	if (docs.length === 0) {
		lines.push(`${THEME.subtext.fg}[empty]${RESET}`);
		return lines;
	}

	const startIdx = scrollOffset;
	const visibleDocs = docs.slice(startIdx, startIdx + maxLines - 2);

	for (const doc of visibleDocs) {
		const pin = doc.pinned ? `${THEME.accent5.fg}\u2605${RESET}` : ' ';
		const agentTag = `${THEME.subtext.fg}[${truncateStr(doc.sourceAgentId, 6)}]${RESET}`;
		const chunkText = `${THEME.text.fg}${truncateStr(doc.chunk.replace(/\n/g, ' '), innerWidth - 10)}${RESET}`;
		lines.push(`${pin}${agentTag} ${chunkText}`);
	}

	return lines;
}

function renderContextTab(
	entries: readonly SharedContextEntry[],
	scrollOffset: number,
	innerWidth: number,
	maxLines: number,
): string[] {
	const lines: string[] = [];

	lines.push(`${THEME.subtext.fg}Shared Context (${entries.length})${RESET}`);
	lines.push('');

	if (entries.length === 0) {
		lines.push(`${THEME.subtext.fg}[empty]${RESET}`);
		return lines;
	}

	const startIdx = scrollOffset;
	const visible = entries.slice(startIdx, startIdx + maxLines - 2);

	for (const entry of visible) {
		const key = `${THEME.bold}${THEME.accent3.fg}${truncateStr(entry.key, innerWidth - 2)}${RESET}`;
		lines.push(key);

		const valLine = `${THEME.text.fg}${truncateStr(entry.value, innerWidth - 2)}${RESET}`;
		lines.push(valLine);

		if (entry.tags) {
			const tags = entry.tags
				.split(' ')
				.filter(Boolean)
				.map((t) => `${THEME.accent4.fg}(${t})${RESET}`)
				.join(' ');
			lines.push(tags);
		}

		lines.push('');
	}

	return lines;
}

function renderSearchTab(
	query: string,
	results: readonly RagSearchResult[],
	scrollOffset: number,
	innerWidth: number,
	maxLines: number,
): string[] {
	const lines: string[] = [];

	const inputLine = `${THEME.accent1.fg}> ${query}${RESET}`;
	lines.push(inputLine);
	lines.push('');

	if (query.length === 0) {
		lines.push(`${THEME.subtext.fg}Type to search...${RESET}`);
		return lines;
	}

	if (results.length === 0) {
		lines.push(`${THEME.subtext.fg}No results${RESET}`);
		return lines;
	}

	const startIdx = scrollOffset;
	const visible = results.slice(startIdx, startIdx + maxLines - 2);

	for (const result of visible) {
		const scoreColor = result.score >= 0.5 ? THEME.success.fg : THEME.subtext.fg;
		const score = `${scoreColor}(${result.score.toFixed(2)})${RESET}`;
		const agentTag = `${THEME.subtext.fg}[${truncateStr(result.sourceAgentId, 6)}]${RESET}`;
		const textColor = result.score >= 0.5 ? THEME.success.fg : THEME.subtext.fg;
		const text = `${textColor}${truncateStr(result.chunk.replace(/\n/g, ' '), innerWidth - 16)}${RESET}`;
		lines.push(`${score} ${agentTag} ${text}`);
	}

	return lines;
}

function getScrollInfo(state: MemorySidebarState, data: SidebarRenderData): string | null {
	let total = 0;
	if (state.tab === 'rag') {
		total = data.ragDocumentCount;
	} else if (state.tab === 'context') {
		total = data.contextEntries.length;
	} else {
		total = data.searchResults.length;
	}

	if (total <= 0) return null;
	return `[${state.scrollOffset + 1}/${total}]`;
}

function truncateStr(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	if (maxLen <= 3) return str.slice(0, maxLen);
	return str.slice(0, maxLen - 3) + '...';
}

function stripAnsiLength(str: string): number {
	return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function applyRowBackground(line: string, bg: string): string {
	return line.replace(/\x1b\[[0-9;]*m/g, (m) => (m === RESET ? `${RESET}${bg}` : m));
}
