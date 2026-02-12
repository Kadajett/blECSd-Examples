/**
 * Standalone help/keybindings popup for tmux mode.
 *
 * Runs inside a tmux display-popup. Shows all available keybindings
 * organized by category with Tokyo Night styling.
 *
 * Usage: npx tsx help.ts
 *
 * @module agent-orchestrator/popups/help
 */

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
};

// =============================================================================
// KEYBINDING DATA
// =============================================================================

interface Section {
	readonly title: string;
	readonly color: string;
	readonly bindings: ReadonlyArray<readonly [string, string]>;
}

const SECTIONS: readonly Section[] = [
	{
		title: 'Navigation',
		color: C.accent1,
		bindings: [
			['Ctrl+B  Tab', 'Next pane'],
			['Ctrl+B  Shift+Tab', 'Previous pane'],
		],
	},
	{
		title: 'Pane Management',
		color: C.accent3,
		bindings: [
			['Ctrl+B  n', 'Add new worker pane'],
			['Ctrl+B  d', 'Kill focused pane'],
			['Ctrl+B  x', 'Confirm quit menu'],
			['Ctrl+B  q', 'Kill session (immediate)'],
		],
	},
	{
		title: 'Popups & Overlays',
		color: C.accent4,
		bindings: [
			['Ctrl+B  Space', 'Command palette'],
			['Ctrl+B  ?', 'This help screen'],
			['Ctrl+B  i', 'Agent detail / info'],
		],
	},
	{
		title: 'Tmux Built-in',
		color: C.accent5,
		bindings: [
			['Ctrl+B  z', 'Zoom/unzoom pane'],
			['Ctrl+B  [', 'Enter copy mode (scroll)'],
			['Ctrl+B  ]', 'Paste buffer'],
			['Ctrl+B  {', 'Swap pane up'],
			['Ctrl+B  }', 'Swap pane down'],
			['Ctrl+B  !', 'Break pane to window'],
		],
	},
	{
		title: 'Copy Mode (Scroll)',
		color: C.warning,
		bindings: [
			['↑  ↓', 'Scroll line by line'],
			['PgUp  PgDn', 'Scroll page'],
			['g  /  G', 'Top / search / bottom'],
			['q  or  Esc', 'Exit copy mode'],
		],
	},
];

// =============================================================================
// RENDER
// =============================================================================

function render(): void {
	const width = process.stdout.columns || 68;

	let out = `${ESC}[H${ESC}[2J`; // Clear + home

	// Title
	out += `${fg(C.accent2)}${BOLD}  Keybindings${RESET}\n`;
	out += `${fg(C.overlay)}  ${'═'.repeat(width - 4)}${RESET}\n\n`;

	for (const section of SECTIONS) {
		out += `  ${fg(section.color)}${BOLD}${section.title}${RESET}\n`;
		out += `  ${fg(C.overlay)}${'─'.repeat(width - 4)}${RESET}\n`;

		for (const [key, desc] of section.bindings) {
			const keyPadded = key.padEnd(22);
			out += `  ${fg(C.accent1)}${BOLD}${keyPadded}${RESET} ${fg(C.text)}${desc}${RESET}\n`;
		}
		out += '\n';
	}

	// Footer
	out += `${fg(C.overlay)}  ${'─'.repeat(width - 4)}${RESET}\n`;
	out += `  ${fg(C.subtext)}Press ${fg(C.accent1)}q${fg(C.subtext)} or ${fg(C.accent1)}Esc${fg(C.subtext)} to close${RESET}`;

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
