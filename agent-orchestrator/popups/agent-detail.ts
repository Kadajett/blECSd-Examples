/**
 * Standalone agent detail popup for tmux mode.
 *
 * Runs inside a tmux display-popup. Shows pane details, agent status,
 * and activity sparklines.
 *
 * Usage: npx tsx agent-detail.ts --session <name> --db <path>
 *
 * @module agent-orchestrator/popups/agent-detail
 */

import { execSync } from 'node:child_process';

// =============================================================================
// ANSI HELPERS
// =============================================================================

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

function fg(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `${ESC}[38;2;${r};${g};${b}m`;
}

function bg(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `${ESC}[48;2;${r};${g};${b}m`;
}

// Tokyo Night palette
const C = {
	bg: '#1a1b26',
	surface: '#24283b',
	overlay: '#414868',
	text: '#c0caf5',
	subtext: '#565f89',
	accent1: '#7dcfff',
	accent2: '#7aa2f7',
	accent3: '#9ece6a',
	accent4: '#bb9af7',
	accent5: '#ff9e64',
	warning: '#e0af68',
	error: '#f7768e',
	success: '#73daca',
};

// =============================================================================
// SPARKLINE
// =============================================================================

const SPARK_CHARS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function sparkline(data: readonly number[], width: number): string {
	if (data.length === 0) return fg(C.subtext) + '─'.repeat(width) + RESET;

	const max = Math.max(...data, 1);
	const normalized = data.map((v) => v / max);
	const step = Math.max(1, Math.floor(data.length / width));
	let out = '';

	for (let i = 0; i < width; i++) {
		const idx = Math.min(i * step, normalized.length - 1);
		const val = normalized[idx] ?? 0;
		const charIdx = Math.round(val * (SPARK_CHARS.length - 1));
		const ch = SPARK_CHARS[charIdx] ?? ' ';

		// Color by intensity
		let color: string;
		if (val >= 0.9) color = fg(C.error);
		else if (val >= 0.65) color = fg(C.accent5);
		else if (val >= 0.35) color = fg(C.accent3);
		else color = fg(C.subtext);

		out += color + ch;
	}
	return out + RESET;
}

// =============================================================================
// PARSE ARGS
// =============================================================================

const args = process.argv.slice(2);
let session = '';
let dbPath = '';
const sessionIdx = args.indexOf('--session');
if (sessionIdx !== -1) {
	session = args[sessionIdx + 1] ?? '';
}
const dbIdx = args.indexOf('--db');
if (dbIdx !== -1) {
	dbPath = args[dbIdx + 1] ?? '';
}

const SOCKET = 'blecsd';

// =============================================================================
// DATA COLLECTION
// =============================================================================

interface PaneInfo {
	readonly index: string;
	readonly title: string;
	readonly width: number;
	readonly height: number;
	readonly pid: number;
	readonly active: boolean;
	readonly command: string;
}

function listPanes(): readonly PaneInfo[] {
	try {
		const out = execSync(
			`tmux -L ${SOCKET} list-panes -t ${session} -F "#{pane_index}|#{pane_title}|#{pane_width}|#{pane_height}|#{pane_pid}|#{pane_active}|#{pane_current_command}"`,
			{ encoding: 'utf8', timeout: 3000 },
		).trim();
		return out.split('\n').filter(Boolean).map((line) => {
			const parts = line.split('|');
			return {
				index: parts[0] ?? '?',
				title: parts[1] ?? 'untitled',
				width: parseInt(parts[2] ?? '0', 10),
				height: parseInt(parts[3] ?? '0', 10),
				pid: parseInt(parts[4] ?? '0', 10),
				active: parts[5] === '1',
				command: parts[6] ?? 'unknown',
			};
		});
	} catch {
		return [];
	}
}

function getSessionUptime(): string {
	try {
		const created = execSync(
			`tmux -L ${SOCKET} display-message -t ${session} -p "#{session_created}"`,
			{ encoding: 'utf8', timeout: 3000 },
		).trim();
		const seconds = Math.floor(Date.now() / 1000 - parseInt(created, 10));
		const m = Math.floor(seconds / 60);
		const h = Math.floor(m / 60);
		if (h > 0) return `${h}h ${m % 60}m`;
		return `${m}m ${seconds % 60}s`;
	} catch {
		return '?';
	}
}

function getDbDocCount(): number {
	if (!dbPath) return 0;
	try {
		const out = execSync(
			`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM rag_documents;" 2>/dev/null`,
			{ encoding: 'utf8', timeout: 2000 },
		).trim();
		return parseInt(out, 10) || 0;
	} catch {
		return 0;
	}
}

function getDbSessionCount(): number {
	if (!dbPath) return 0;
	try {
		const out = execSync(
			`sqlite3 "${dbPath}" "SELECT COUNT(*) FROM agent_sessions;" 2>/dev/null`,
			{ encoding: 'utf8', timeout: 2000 },
		).trim();
		return parseInt(out, 10) || 0;
	} catch {
		return 0;
	}
}

// =============================================================================
// RENDER
// =============================================================================

function render(): void {
	const width = process.stdout.columns || 78;
	const panes = listPanes();
	const uptime = getSessionUptime();
	const docCount = getDbDocCount();
	const sessionCount = getDbSessionCount();

	let out = `${ESC}[H${ESC}[2J`; // Clear + home

	// Header
	out += `${fg(C.accent2)}${BOLD} Session: ${RESET}${fg(C.text)}${session}${RESET}`;
	out += `    ${fg(C.subtext)}Uptime: ${fg(C.accent1)}${uptime}${RESET}\n`;
	out += `${fg(C.overlay)}${'═'.repeat(width)}${RESET}\n`;

	// DB stats
	out += `${fg(C.accent4)}${BOLD} Database${RESET}\n`;
	out += `${fg(C.subtext)}   RAG documents: ${fg(C.text)}${docCount}${RESET}\n`;
	out += `${fg(C.subtext)}   Agent sessions: ${fg(C.text)}${sessionCount}${RESET}\n`;
	out += `${fg(C.overlay)}${'─'.repeat(width)}${RESET}\n`;

	// Panes
	out += `${fg(C.accent1)}${BOLD} Panes (${panes.length})${RESET}\n\n`;

	// Generate fake activity data per pane for sparklines
	const sparkWidth = Math.min(20, Math.floor(width / 4));

	for (const pane of panes) {
		const activeMarker = pane.active
			? `${fg(C.accent3)}${BOLD}●${RESET}`
			: `${fg(C.overlay)}○${RESET}`;

		const titleColor = pane.active ? fg(C.text) + BOLD : fg(C.text);
		const titleTrunc = pane.title.length > 30
			? pane.title.slice(0, 27) + '...'
			: pane.title;

		out += `  ${activeMarker} ${fg(C.accent1)}#${pane.index}${RESET} ${titleColor}${titleTrunc}${RESET}\n`;
		out += `    ${fg(C.subtext)}${DIM}${pane.width}x${pane.height}${RESET}`;
		out += `  ${fg(C.subtext)}${DIM}pid:${pane.pid}${RESET}`;
		out += `  ${fg(C.subtext)}${DIM}cmd:${pane.command}${RESET}\n`;

		// Fake activity sparkline (based on pane pid LSBs for visual variety)
		const fakeData: number[] = [];
		for (let i = 0; i < sparkWidth; i++) {
			fakeData.push(((pane.pid * (i + 1) * 7) % 100) / 100);
		}
		out += `    ${fg(C.subtext)}activity: ${sparkline(fakeData, sparkWidth)}${RESET}\n\n`;
	}

	// Footer
	out += `${fg(C.overlay)}${'─'.repeat(width)}${RESET}\n`;
	out += `${fg(C.subtext)} Press ${fg(C.accent1)}q${fg(C.subtext)} or ${fg(C.accent1)}Esc${fg(C.subtext)} to close`;
	out += `    ${fg(C.subtext)}Press ${fg(C.accent1)}r${fg(C.subtext)} to refresh${RESET}`;

	process.stdout.write(out);
}

// =============================================================================
// INPUT
// =============================================================================

function handleKey(data: Buffer): void {
	const str = data.toString('utf8');

	if (str === 'q' || str === '\x1b' || str === '\x03') {
		cleanup();
		process.exit(0);
	}

	if (str === 'r') {
		render();
	}
}

// =============================================================================
// MAIN
// =============================================================================

function cleanup(): void {
	process.stdout.write(SHOW_CURSOR);
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
}

process.stdout.write(HIDE_CURSOR);
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on('data', handleKey);
render();

// Auto-refresh every 5 seconds
const refreshInterval = setInterval(render, 5000);

process.on('exit', () => { clearInterval(refreshInterval); cleanup(); });
process.on('SIGINT', () => { clearInterval(refreshInterval); cleanup(); process.exit(0); });
process.on('SIGTERM', () => { clearInterval(refreshInterval); cleanup(); process.exit(0); });
