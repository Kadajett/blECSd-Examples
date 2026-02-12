#!/usr/bin/env node
/**
 * RAG Memory Sidebar Viewer
 *
 * Standalone script that runs in a narrow tmux pane on the far left.
 * Displays a live, scrollable list of shared context and RAG documents
 * from the SQLite database.
 *
 * Usage: tsx rag-viewer.ts [--db path/to/orchestrator.db]
 *
 * @module agent-orchestrator/rag-viewer
 */

import Database from 'better-sqlite3';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REFRESH_INTERVAL = 3000;
const DEFAULT_DB_PATH = './orchestrator.db';

// ANSI escape codes
const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const MAGENTA = `${ESC}[35m`;
const GRAY = `${ESC}[90m`;
const WHITE = `${ESC}[37m`;
const BG_DARK = `${ESC}[48;2;20;20;35m`;
const BG_ENTRY = `${ESC}[48;2;25;25;40m`;
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

// =============================================================================
// STATE
// =============================================================================

interface ViewerState {
	scrollOffset: number;
	db: Database.Database | null;
	running: boolean;
	width: number;
	height: number;
	tab: 'ctx' | 'rag';
	dbPath: string;
}

const state: ViewerState = {
	scrollOffset: 0,
	db: null,
	running: true,
	width: process.stdout.columns ?? 25,
	height: process.stdout.rows ?? 30,
	tab: 'ctx',
	dbPath: DEFAULT_DB_PATH,
};

// =============================================================================
// DATABASE QUERIES
// =============================================================================

interface ContextRow {
	readonly id: number;
	readonly key: string;
	readonly value: string;
	readonly tags: string;
	readonly agent_id: string;
	readonly updated_at: string;
}

interface RagRow {
	readonly id: number;
	readonly source_agent_id: string;
	readonly chunk: string;
	readonly created_at: string;
}

function getContextEntries(db: Database.Database): ContextRow[] {
	const stmt = db.prepare(
		'SELECT id, key, value, tags, agent_id, updated_at FROM shared_context ORDER BY updated_at DESC LIMIT 100',
	);
	return stmt.all() as ContextRow[];
}

function getContextCount(db: Database.Database): number {
	const result = db.prepare('SELECT COUNT(*) as count FROM shared_context').get() as { count: number } | undefined;
	return result?.count ?? 0;
}

function getRagDocuments(db: Database.Database, limit: number, offset: number): RagRow[] {
	const stmt = db.prepare(
		'SELECT id, source_agent_id, chunk, created_at FROM rag_documents ORDER BY id DESC LIMIT ? OFFSET ?',
	);
	return stmt.all(limit, offset) as RagRow[];
}

function getRagDocumentCount(db: Database.Database): number {
	const result = db.prepare('SELECT COUNT(*) as count FROM rag_documents').get() as { count: number } | undefined;
	return result?.count ?? 0;
}

/**
 * Get unique RAG documents by deduplicating on chunk content.
 * Returns the most recent entry for each unique chunk.
 */
function getUniqueRagDocuments(db: Database.Database, limit: number, offset: number): RagRow[] {
	const stmt = db.prepare(`
		SELECT r.id, r.source_agent_id, r.chunk, r.created_at
		FROM rag_documents r
		INNER JOIN (
			SELECT MAX(id) as max_id FROM rag_documents GROUP BY chunk
		) latest ON r.id = latest.max_id
		ORDER BY r.id DESC
		LIMIT ? OFFSET ?
	`);
	return stmt.all(limit, offset) as RagRow[];
}

function getUniqueRagCount(db: Database.Database): number {
	const result = db.prepare('SELECT COUNT(DISTINCT chunk) as count FROM rag_documents').get() as { count: number } | undefined;
	return result?.count ?? 0;
}

// =============================================================================
// RENDERING UTILITIES
// =============================================================================

function truncate(text: string, maxLen: number): string {
	if (maxLen <= 0) return '';
	if (text.length <= maxLen) return text;
	if (maxLen <= 3) return text.slice(0, maxLen);
	return `${text.slice(0, maxLen - 1)}\u2026`;
}

function padRight(text: string, len: number): string {
	if (text.length >= len) return text.slice(0, len);
	return text + ' '.repeat(len - text.length);
}

/**
 * Wraps text into lines that fit the given width.
 */
function wrapText(text: string, maxWidth: number, maxLines: number): string[] {
	const words = text.replace(/[\r\n]+/g, ' ').trim().split(/\s+/);
	const lines: string[] = [];
	let currentLine = '';

	for (const word of words) {
		if (lines.length >= maxLines) break;
		const candidate = currentLine ? `${currentLine} ${word}` : word;
		if (candidate.length > maxWidth) {
			if (currentLine) {
				lines.push(currentLine);
				currentLine = word.length > maxWidth ? truncate(word, maxWidth) : word;
			} else {
				lines.push(truncate(word, maxWidth));
			}
		} else {
			currentLine = candidate;
		}
	}

	if (currentLine && lines.length < maxLines) {
		lines.push(currentLine);
	}

	return lines;
}

/**
 * Formats a relative time string.
 */
function timeAgo(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr + 'Z').getTime();
	const diffSec = Math.floor((now - then) / 1000);

	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
	return `${Math.floor(diffSec / 86400)}d ago`;
}

// =============================================================================
// RENDERING
// =============================================================================

function renderHeader(w: number): string {
	let output = '';

	// Title
	const title = state.tab === 'ctx' ? 'Shared Memory' : 'RAG Index';
	output += `${BG_DARK}${BOLD}${CYAN} ${truncate(title, w - 2)}${RESET}${BG_DARK}${' '.repeat(Math.max(0, w - title.length - 2))}${RESET}\n`;

	// Tab bar
	const ctxLabel = state.tab === 'ctx' ? `${BOLD}${CYAN}[MEM]` : `${GRAY} MEM `;
	const ragLabel = state.tab === 'rag' ? `${BOLD}${CYAN}[RAG]` : `${GRAY} RAG `;
	output += `${BG_DARK} ${ctxLabel}${RESET}${BG_DARK} ${ragLabel}${RESET}${BG_DARK}${' '.repeat(Math.max(0, w - 14))}${RESET}\n`;

	// Separator
	output += `${GRAY}${'─'.repeat(w)}${RESET}\n`;
	return output;
}

function renderContextTab(w: number, h: number): string {
	if (!state.db) return '';

	let entries: ContextRow[];
	let count: number;
	try {
		entries = getContextEntries(state.db);
		count = getContextCount(state.db);
	} catch (err) {
		state.db = null; // Force reconnect on next refresh
		return `\n${GRAY}  DB query failed${RESET}\n${DIM}  Reconnecting...${RESET}\n`;
	}

	let output = '';
	const contentW = Math.max(1, w - 1);

	if (entries.length === 0) {
		output += `\n${GRAY}  [empty]${RESET}\n`;
		output += `\n${DIM}  No shared context.${RESET}\n`;
		output += `${DIM}  Use write_memory MCP${RESET}\n`;
		output += `${DIM}  tool to add entries.${RESET}\n`;
		return output;
	}

	// Count line
	output += `${GRAY} ${count} entries${RESET}\n`;

	let linesUsed = 1;
	const maxLines = h - 5; // header(3) + footer(1) + count(1)

	for (const entry of entries) {
		if (linesUsed >= maxLines) break;

		// Key (bold green)
		output += `${GREEN}${BOLD} ${truncate(entry.key, contentW)}${RESET}\n`;
		linesUsed++;

		// Value (wrapped, white)
		const valueLines = wrapText(entry.value, contentW - 1, 3);
		for (const vline of valueLines) {
			if (linesUsed >= maxLines) break;
			output += `${WHITE} ${vline}${RESET}\n`;
			linesUsed++;
		}

		// Metadata line (dim)
		if (linesUsed < maxLines) {
			const meta = `${entry.agent_id} ${timeAgo(entry.updated_at)}`;
			output += `${GRAY}${DIM} ${truncate(meta, contentW)}${RESET}\n`;
			linesUsed++;
		}

		// Tags (if any)
		if (entry.tags && linesUsed < maxLines) {
			const tagDisplay = entry.tags.split(/\s+/).map((t) => `#${t}`).join(' ');
			output += `${MAGENTA}${DIM} ${truncate(tagDisplay, contentW)}${RESET}\n`;
			linesUsed++;
		}

		// Separator
		if (linesUsed < maxLines) {
			output += `${GRAY}${DIM} ${'·'.repeat(Math.min(contentW - 1, 15))}${RESET}\n`;
			linesUsed++;
		}
	}

	return output;
}

function renderRagTab(w: number, h: number): string {
	if (!state.db) return '';

	let uniqueCount: number;
	let totalCount: number;
	let docs: RagRow[];
	const contentW = Math.max(1, w - 1);
	const maxLines = h - 5;
	const docsPerPage = Math.max(1, Math.floor(maxLines / 5));

	try {
		uniqueCount = getUniqueRagCount(state.db);
		totalCount = getRagDocumentCount(state.db);
		docs = getUniqueRagDocuments(state.db, docsPerPage, state.scrollOffset);
	} catch (err) {
		state.db = null; // Force reconnect on next refresh
		return `\n${GRAY}  DB query failed${RESET}\n${DIM}  Reconnecting...${RESET}\n`;
	}

	let output = '';

	if (docs.length === 0 && state.scrollOffset === 0) {
		output += `\n${GRAY}  [empty]${RESET}\n`;
		output += `\n${DIM}  No RAG documents yet.${RESET}\n`;
		output += `${DIM}  Agent output will be${RESET}\n`;
		output += `${DIM}  indexed automatically.${RESET}\n`;
		return output;
	}

	// Count line
	output += `${GRAY} ${uniqueCount} unique / ${totalCount} total${RESET}\n`;

	let linesUsed = 1;

	for (const doc of docs) {
		if (linesUsed >= maxLines) break;

		// Source agent (dim yellow)
		const srcLine = `${doc.source_agent_id} ${timeAgo(doc.created_at)}`;
		output += `${YELLOW}${DIM} ${truncate(srcLine, contentW)}${RESET}\n`;
		linesUsed++;

		// Chunk text (wrapped, white, up to 3 lines)
		const chunkText = doc.chunk.replace(/[\r\n]+/g, ' ').trim();
		const textLines = wrapText(chunkText, contentW - 1, 3);
		for (const tline of textLines) {
			if (linesUsed >= maxLines) break;
			output += `${WHITE} ${tline}${RESET}\n`;
			linesUsed++;
		}

		// Separator
		if (linesUsed < maxLines) {
			output += `${GRAY}${DIM} ${'·'.repeat(Math.min(contentW - 1, 15))}${RESET}\n`;
			linesUsed++;
		}
	}

	return output;
}

function renderFooter(w: number): string {
	let info: string;
	if (state.tab === 'rag') {
		let total = 0;
		try { total = state.db ? getUniqueRagCount(state.db) : 0; } catch { /* use 0 */ }
		const pos = total > 0 ? `${state.scrollOffset + 1}/${total}` : '0/0';
		info = pos;
	} else {
		let count = 0;
		try { count = state.db ? getContextCount(state.db) : 0; } catch { /* use 0 */ }
		info = `${count} entries`;
	}

	const hint = 'Tab:switch j/k:scroll';
	const line = `${info} ${truncate(hint, Math.max(0, w - info.length - 2))}`;
	return `${BG_DARK}${GRAY}${padRight(` ${line}`, w)}${RESET}`;
}

function render(): void {
	const w = state.width;
	const h = state.height;

	if (!state.db) {
		process.stdout.write(`${CLEAR}${HIDE_CURSOR}`);
		process.stdout.write(`${CYAN}${BOLD} Memory Sidebar${RESET}\n`);
		process.stdout.write(`${GRAY}${'─'.repeat(w)}${RESET}\n`);
		process.stdout.write(`\n${YELLOW}  Waiting for DB...${RESET}\n`);
		process.stdout.write(`${DIM}  ${state.dbPath}${RESET}\n`);
		process.stdout.write(`\n${GRAY}  The orchestrator will${RESET}\n`);
		process.stdout.write(`${GRAY}  create the database${RESET}\n`);
		process.stdout.write(`${GRAY}  on first run.${RESET}\n`);
		return;
	}

	let output = `${CLEAR}${HIDE_CURSOR}`;
	output += renderHeader(w);

	if (state.tab === 'ctx') {
		output += renderContextTab(w, h);
	} else {
		output += renderRagTab(w, h);
	}

	// Footer at bottom
	output += `${ESC}[${h};1H`;
	output += renderFooter(w);

	process.stdout.write(output);
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function handleInput(data: string): void {
	// Quit
	if (data === 'q' || data === '\x03') {
		state.running = false;
		cleanup();
		return;
	}

	// Tab: switch tab
	if (data === '\t') {
		state.tab = state.tab === 'ctx' ? 'rag' : 'ctx';
		state.scrollOffset = 0;
		render();
		return;
	}

	// Scroll down: j, down arrow
	if (data === 'j' || data === '\x1b[B') {
		state.scrollOffset++;
		render();
		return;
	}

	// Scroll up: k, up arrow
	if (data === 'k' || data === '\x1b[A') {
		if (state.scrollOffset > 0) {
			state.scrollOffset--;
			render();
		}
		return;
	}

	// Page down: space, page down
	if (data === ' ' || data === '\x1b[6~') {
		state.scrollOffset += 10;
		render();
		return;
	}

	// Page up: b, page up
	if (data === 'b' || data === '\x1b[5~') {
		state.scrollOffset = Math.max(0, state.scrollOffset - 10);
		render();
		return;
	}

	// Home: g
	if (data === 'g') {
		state.scrollOffset = 0;
		render();
		return;
	}

	// End: G
	if (data === 'G') {
		state.scrollOffset = 999999;
		render();
		return;
	}
}

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

function connectDb(dbPath: string): Database.Database | null {
	try {
		const db = new Database(dbPath, { readonly: true });
		const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
		const hasRagTable = tables.some((t) => t.name === 'rag_documents');
		if (!hasRagTable) {
			db.close();
			return null;
		}
		return db;
	} catch (err) {
		// File doesn't exist yet, or is locked, or is corrupted.
		// The refresh loop will retry, so just return null.
		const code = (err as NodeJS.ErrnoException).code;
		if (code !== 'SQLITE_CANTOPEN' && code !== 'ENOENT') {
			process.stderr.write(`rag-viewer: DB connect failed: ${err instanceof Error ? err.message : String(err)}\n`);
		}
		return null;
	}
}

// =============================================================================
// LIFECYCLE
// =============================================================================

function cleanup(): void {
	process.stdout.write(`${SHOW_CURSOR}${RESET}`);
	if (state.db) {
		try { state.db.close(); } catch { /* ignore */ }
	}
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
	process.exit(0);
}

function main(): void {
	// Parse args
	const args = process.argv.slice(2);
	let dbPath = DEFAULT_DB_PATH;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--db' && args[i + 1]) {
			dbPath = args[i + 1] as string;
			i++;
		}
	}

	state.dbPath = dbPath;

	// Setup raw mode
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	// Resize handler
	process.stdout.on('resize', () => {
		state.width = process.stdout.columns ?? 25;
		state.height = process.stdout.rows ?? 30;
		render();
	});

	// Input handler
	process.stdin.on('data', (data: string) => {
		handleInput(data);
	});

	// Signal handlers
	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);

	// Try initial DB connection
	state.db = connectDb(dbPath);

	// Initial render
	render();

	// Refresh loop with error recovery
	const refreshTimer = setInterval(() => {
		if (!state.running) {
			clearInterval(refreshTimer);
			return;
		}

		// Retry DB connection if not connected
		if (!state.db) {
			state.db = connectDb(dbPath);
		}

		try {
			render();
		} catch (err) {
			// Render failures should not crash the viewer
			process.stderr.write(`rag-viewer: render error: ${err instanceof Error ? err.message : String(err)}\n`);
		}
	}, REFRESH_INTERVAL);
}

main();
