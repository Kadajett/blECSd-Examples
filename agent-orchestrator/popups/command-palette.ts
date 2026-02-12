/**
 * Standalone command palette popup for tmux mode.
 *
 * Runs inside a tmux display-popup. Shows a filterable list of commands.
 * Selecting a command executes the corresponding tmux action.
 *
 * Usage: npx tsx command-palette.ts --session <name> --db <path>
 *
 * @module agent-orchestrator/popups/command-palette
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
	error: '#f7768e',
};

// =============================================================================
// PARSE ARGS
// =============================================================================

const args = process.argv.slice(2);
let session = '';
const sessionIdx = args.indexOf('--session');
if (sessionIdx !== -1) {
	session = args[sessionIdx + 1] ?? '';
}

const SOCKET = 'blecsd';

function tmuxRun(cmd: string): void {
	try {
		execSync(`tmux -L ${SOCKET} ${cmd}`, { encoding: 'utf8', timeout: 3000 });
	} catch {
		// ignore
	}
}

// =============================================================================
// COMMANDS
// =============================================================================

interface Command {
	readonly label: string;
	readonly hint: string;
	readonly action: () => void;
}

const COMMANDS: readonly Command[] = [
	{
		label: 'Add Worker',
		hint: 'Split a new worker pane',
		action: () => { tmuxRun(`split-window -t ${session} -h`); },
	},
	{
		label: 'Kill Focused Pane',
		hint: 'Remove the active pane',
		action: () => { tmuxRun('kill-pane'); },
	},
	{
		label: 'Toggle Sidebar',
		hint: 'Show/hide RAG sidebar',
		action: () => {
			// Toggle by resizing sidebar pane
			tmuxRun(`display-message -t ${session} "Toggle sidebar (use layout manager)"`);
		},
	},
	{
		label: 'Next Pane',
		hint: 'Ctrl+B Tab',
		action: () => { tmuxRun(`select-pane -t ${session} -t +`); },
	},
	{
		label: 'Previous Pane',
		hint: 'Ctrl+B Shift+Tab',
		action: () => { tmuxRun(`select-pane -t ${session} -t -`); },
	},
	{
		label: 'Tiled Layout',
		hint: 'Even out all pane sizes',
		action: () => { tmuxRun(`select-layout -t ${session} tiled`); },
	},
	{
		label: 'Horizontal Layout',
		hint: 'Stack panes top-to-bottom',
		action: () => { tmuxRun(`select-layout -t ${session} even-vertical`); },
	},
	{
		label: 'Vertical Layout',
		hint: 'Stack panes side-by-side',
		action: () => { tmuxRun(`select-layout -t ${session} even-horizontal`); },
	},
	{
		label: 'Quit',
		hint: 'Kill session and exit',
		action: () => { tmuxRun(`kill-session -t ${session}`); },
	},
];

// =============================================================================
// STATE
// =============================================================================

let searchQuery = '';
let selectedIndex = 0;

function getFiltered(): readonly Command[] {
	if (searchQuery.length === 0) return COMMANDS;
	const lower = searchQuery.toLowerCase();
	return COMMANDS.filter((cmd) => cmd.label.toLowerCase().includes(lower));
}

// =============================================================================
// RENDER
// =============================================================================

function render(): void {
	const width = process.stdout.columns || 58;
	const height = process.stdout.rows || 18;
	const filtered = getFiltered();

	let out = `${ESC}[H${ESC}[2J`; // Clear screen, cursor home

	// Search input line
	const prompt = `${fg(C.accent1)}${BOLD} > ${RESET}${fg(C.text)}${searchQuery}${RESET}`;
	const cursor = `${fg(C.accent2)}█${RESET}`;
	out += `${prompt}${cursor}\n`;

	// Separator
	out += `${fg(C.overlay)}${'─'.repeat(width)}${RESET}\n`;

	// List items (leave 3 rows for header + separator + footer)
	const maxVisible = Math.max(1, height - 4);
	const start = Math.max(0, selectedIndex - maxVisible + 1);
	const end = Math.min(filtered.length, start + maxVisible);

	for (let i = start; i < end; i++) {
		const cmd = filtered[i];
		if (!cmd) continue;

		const isSelected = i === selectedIndex;
		const prefix = isSelected ? `${fg(C.accent3)}${BOLD} ▸ ` : `${fg(C.subtext)}   `;
		const labelColor = isSelected ? fg(C.text) + BOLD : fg(C.text);
		const hintColor = isSelected ? fg(C.subtext) : fg(C.overlay);

		const labelText = cmd.label;
		const hintText = cmd.hint;
		const availableWidth = width - 6;
		const truncLabel = labelText.length > availableWidth
			? labelText.slice(0, availableWidth - 3) + '...'
			: labelText;
		const remainingWidth = availableWidth - truncLabel.length - 2;
		const truncHint = remainingWidth > 3
			? (hintText.length > remainingWidth ? hintText.slice(0, remainingWidth - 3) + '...' : hintText)
			: '';

		out += `${prefix}${labelColor}${truncLabel}${RESET}`;
		if (truncHint) {
			out += `  ${hintColor}${DIM}${truncHint}${RESET}`;
		}
		out += '\n';
	}

	// Footer
	const total = filtered.length;
	const footer = total === 0
		? `${fg(C.error)} No matches`
		: `${fg(C.subtext)} ${total} command${total === 1 ? '' : 's'}`;
	// Pad to bottom
	const usedRows = 2 + (end - start);
	for (let i = usedRows; i < height - 1; i++) {
		out += '\n';
	}
	out += `${footer}${RESET}`;

	process.stdout.write(out);
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function handleKey(data: Buffer): void {
	const str = data.toString('utf8');

	// Escape or Ctrl+C: close popup
	if (str === '\x1b' || str === '\x03') {
		cleanup();
		process.exit(0);
	}

	// Enter: execute selected command
	if (str === '\r' || str === '\n') {
		const filtered = getFiltered();
		const cmd = filtered[selectedIndex];
		if (cmd) {
			cleanup();
			cmd.action();
			process.exit(0);
		}
		return;
	}

	// Backspace
	if (str === '\x7f' || str === '\x08') {
		if (searchQuery.length > 0) {
			searchQuery = searchQuery.slice(0, -1);
			selectedIndex = 0;
		}
		render();
		return;
	}

	// Arrow keys
	if (str === '\x1b[A') { // Up
		selectedIndex = Math.max(0, selectedIndex - 1);
		render();
		return;
	}
	if (str === '\x1b[B') { // Down
		const filtered = getFiltered();
		selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1);
		render();
		return;
	}

	// Printable characters
	if (str.length === 1 && str >= ' ' && str <= '~') {
		searchQuery += str;
		selectedIndex = 0;
		render();
		return;
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

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
