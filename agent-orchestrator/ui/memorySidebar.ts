/**
 * Memory sidebar renderer.
 *
 * Renders a toggleable sidebar on the far left showing RAG documents,
 * shared context entries, and a search interface.
 *
 * @module agent-orchestrator/ui/memorySidebar
 */

import type { MemorySidebarState, SidebarTab, RagSearchResult, RagDocument, SharedContextEntry } from '../types.js';
import { COLORS } from '../config.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[90m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

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
	const height = screenHeight - 1; // Reserve bottom row for status bar
	let output = '';

	// Border
	const borderColor = state.focused ? COLORS.borderFocused : COLORS.borderNormal;

	// Top border with "Memory" label
	output += `\x1b[1;1H`;
	output += borderColor;
	output += '\u250C\u2500 ';
	output += RESET;
	output += BOLD + 'Memory' + RESET;
	output += borderColor;
	output += ' ';
	output += '\u2500'.repeat(Math.max(0, width - 11));
	output += '\u2510';
	output += RESET;

	// Tab bar (row 2)
	output += `\x1b[2;1H`;
	output += borderColor + '\u2502' + RESET;
	output += renderTabBar(state.tab, width - 2);
	output += borderColor + '\u2502' + RESET;

	// Content area (rows 3 to height-1)
	const contentHeight = height - 3; // Top border + tab bar + bottom border
	const contentLines = renderContent(state, data, width - 2, contentHeight);

	for (let row = 0; row < contentHeight; row++) {
		output += `\x1b[${row + 3};1H`;
		output += borderColor + '\u2502' + RESET;

		const line = contentLines[row] ?? '';
		const visLen = stripAnsiLength(line);
		output += line;
		output += ' '.repeat(Math.max(0, width - 2 - visLen));

		output += borderColor + '\u2502' + RESET;
	}

	// Bottom border with scroll indicator
	const scrollInfo = getScrollInfo(state, data);
	output += `\x1b[${height};1H`;
	output += borderColor;
	output += '\u2514';
	if (scrollInfo) {
		const infoStr = ` ${scrollInfo} `;
		const padLen = Math.max(0, width - 2 - infoStr.length);
		const leftPad = Math.floor(padLen / 2);
		const rightPad = padLen - leftPad;
		output += '\u2500'.repeat(leftPad);
		output += RESET + DIM + infoStr + RESET + borderColor;
		output += '\u2500'.repeat(rightPad);
	} else {
		output += '\u2500'.repeat(width - 2);
	}
	output += '\u2518';
	output += RESET;

	// Side borders for rows already handled
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
			bar += BOLD + CYAN + `[${tab.label}]` + RESET;
		} else {
			bar += DIM + ` ${tab.label} ` + RESET;
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

	// Header
	lines.push(DIM + `RAG Memory (${totalCount} docs)` + RESET);
	lines.push('');

	if (docs.length === 0) {
		lines.push(DIM + '[empty]' + RESET);
		return lines;
	}

	const startIdx = scrollOffset;
	const visibleDocs = docs.slice(startIdx, startIdx + maxLines - 2);

	for (const doc of visibleDocs) {
		const pin = doc.pinned ? YELLOW + '\u{1F4CC}' + RESET : '';
		const agentTag = DIM + `[${truncateStr(doc.sourceAgentId, 6)}]` + RESET;
		const chunkText = WHITE + truncateStr(doc.chunk.replace(/\n/g, ' '), innerWidth - 10) + RESET;
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

	lines.push(DIM + `Shared Context (${entries.length})` + RESET);
	lines.push('');

	if (entries.length === 0) {
		lines.push(DIM + '[empty]' + RESET);
		return lines;
	}

	const startIdx = scrollOffset;
	const visible = entries.slice(startIdx, startIdx + maxLines - 2);

	for (const entry of visible) {
		const key = BOLD + GREEN + truncateStr(entry.key, innerWidth - 2) + RESET;
		lines.push(key);

		const valLine = DIM + truncateStr(entry.value, innerWidth - 2) + RESET;
		lines.push(valLine);

		if (entry.tags) {
			const tags = entry.tags.split(' ').filter(Boolean).map((t) => CYAN + `[${t}]` + RESET).join(' ');
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

	// Search input
	const inputLine = WHITE + '> ' + query + RESET;
	lines.push(inputLine);
	lines.push('');

	if (query.length === 0) {
		lines.push(DIM + 'Type to search...' + RESET);
		return lines;
	}

	if (results.length === 0) {
		lines.push(DIM + 'No results' + RESET);
		return lines;
	}

	const startIdx = scrollOffset;
	const visible = results.slice(startIdx, startIdx + maxLines - 2);

	for (const result of visible) {
		const score = DIM + `(${result.score.toFixed(2)})` + RESET;
		const agentTag = DIM + `[${truncateStr(result.sourceAgentId, 6)}]` + RESET;
		const text = WHITE + truncateStr(result.chunk.replace(/\n/g, ' '), innerWidth - 16) + RESET;
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
