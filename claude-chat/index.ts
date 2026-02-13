#!/usr/bin/env node
/**
 * Claude Code Chat Simulator
 *
 * A scrollable, animated demo that simulates the Claude Code CLI interface.
 * Starts with thousands of pre-populated chat messages in a VirtualizedList,
 * then streams new messages as an animated script plays out.
 *
 * Demonstrates:
 * - VirtualizedList widget handling thousands of lines efficiently
 * - Cursor-navigable virtualized scrolling
 * - Multi-line text input with cursor
 * - Mouse wheel scrolling
 * - Live content appending with follow mode
 * - FPS counter
 * - Rich ANSI color formatting
 *
 * Controls:
 *   Mouse wheel     - scroll chat up/down
 *   Tab             - toggle focus between chat list and input
 *   Up/Down arrows  - scroll chat (when list focused) or move input cursor
 *   PgUp/PgDn       - scroll chat by pages
 *   Enter           - submit input / newline with Shift+Enter
 *   Ctrl+C          - quit
 *
 * Options:
 *   --buffer        - run on alternate screen (default: primary screen)
 *
 * @module examples/claude-chat
 */

import {
	createWorld,
	parseMouseSequence,
	isMouseBuffer,
	enterAlternateScreen,
	leaveAlternateScreen,
	hideCursor,
	showCursor as showTerminalCursor,
	writeRaw,
	setOutputStream,
} from 'blecsd';
import type { ParsedMouseEvent } from 'blecsd';
import { createVirtualizedList, handleVirtualizedListKey } from 'blecsd/widgets';

// =============================================================================
// ANSI COLOR HELPERS
// =============================================================================

const R = '\x1b[0m';
const BOLD = '\x1b[1m';

function fgRgb(r: number, g: number, b: number): string {
	return `\x1b[38;2;${r};${g};${b}m`;
}

function bgRgb(r: number, g: number, b: number): string {
	return `\x1b[48;2;${r};${g};${b}m`;
}

// Theme foreground colors
const PURPLE = fgRgb(187, 154, 247);
const ORANGE = fgRgb(255, 158, 100);
const CYAN = fgRgb(125, 207, 255);
const GREEN = fgRgb(158, 206, 106);
const YELLOW = fgRgb(224, 175, 104);
const DIM = fgRgb(86, 95, 137);
const TEXT = fgRgb(200, 208, 224);
const BRIGHT = `${BOLD}${fgRgb(226, 232, 240)}`;
const BORDER_FG = fgRgb(59, 66, 97);

// Background colors
const STATUS_BG = bgRgb(36, 40, 59);
const CURSOR_BG = bgRgb(42, 46, 66);
const INPUT_BG = bgRgb(30, 30, 50);
const INPUT_BORDER = fgRgb(59, 66, 97);

// =============================================================================
// SPINNER
// =============================================================================

const SPINNER_CHARS = [
	'\u280B', '\u2819', '\u2839', '\u2838', '\u283C',
	'\u2834', '\u2826', '\u2827', '\u2807', '\u280F',
];

// =============================================================================
// MULTI-LINE INPUT STATE
// =============================================================================

const INPUT_HEIGHT = 3; // Visible rows for the text input area

interface InputState {
	lines: string[];
	cursorRow: number;
	cursorCol: number;
	scrollRow: number; // First visible line when content exceeds INPUT_HEIGHT
}

function createInputState(): InputState {
	return { lines: [''], cursorRow: 0, cursorCol: 0, scrollRow: 0 };
}

function inputInsertChar(input: InputState, ch: string): void {
	const line = input.lines[input.cursorRow] ?? '';
	input.lines[input.cursorRow] =
		line.slice(0, input.cursorCol) + ch + line.slice(input.cursorCol);
	input.cursorCol += ch.length;
}

function inputNewline(input: InputState): void {
	const line = input.lines[input.cursorRow] ?? '';
	const before = line.slice(0, input.cursorCol);
	const after = line.slice(input.cursorCol);
	input.lines[input.cursorRow] = before;
	input.lines.splice(input.cursorRow + 1, 0, after);
	input.cursorRow++;
	input.cursorCol = 0;
	ensureInputVisible(input);
}

function inputBackspace(input: InputState): void {
	if (input.cursorCol > 0) {
		const line = input.lines[input.cursorRow] ?? '';
		input.lines[input.cursorRow] =
			line.slice(0, input.cursorCol - 1) + line.slice(input.cursorCol);
		input.cursorCol--;
	} else if (input.cursorRow > 0) {
		const currentLine = input.lines[input.cursorRow] ?? '';
		input.lines.splice(input.cursorRow, 1);
		input.cursorRow--;
		const prevLine = input.lines[input.cursorRow] ?? '';
		input.cursorCol = prevLine.length;
		input.lines[input.cursorRow] = prevLine + currentLine;
		ensureInputVisible(input);
	}
}

function inputDelete(input: InputState): void {
	const line = input.lines[input.cursorRow] ?? '';
	if (input.cursorCol < line.length) {
		input.lines[input.cursorRow] =
			line.slice(0, input.cursorCol) + line.slice(input.cursorCol + 1);
	} else if (input.cursorRow < input.lines.length - 1) {
		const nextLine = input.lines[input.cursorRow + 1] ?? '';
		input.lines[input.cursorRow] = line + nextLine;
		input.lines.splice(input.cursorRow + 1, 1);
	}
}

function inputMoveLeft(input: InputState): void {
	if (input.cursorCol > 0) {
		input.cursorCol--;
	} else if (input.cursorRow > 0) {
		input.cursorRow--;
		input.cursorCol = (input.lines[input.cursorRow] ?? '').length;
		ensureInputVisible(input);
	}
}

function inputMoveRight(input: InputState): void {
	const line = input.lines[input.cursorRow] ?? '';
	if (input.cursorCol < line.length) {
		input.cursorCol++;
	} else if (input.cursorRow < input.lines.length - 1) {
		input.cursorRow++;
		input.cursorCol = 0;
		ensureInputVisible(input);
	}
}

function inputMoveUp(input: InputState): void {
	if (input.cursorRow > 0) {
		input.cursorRow--;
		const line = input.lines[input.cursorRow] ?? '';
		input.cursorCol = Math.min(input.cursorCol, line.length);
		ensureInputVisible(input);
	}
}

function inputMoveDown(input: InputState): void {
	if (input.cursorRow < input.lines.length - 1) {
		input.cursorRow++;
		const line = input.lines[input.cursorRow] ?? '';
		input.cursorCol = Math.min(input.cursorCol, line.length);
		ensureInputVisible(input);
	}
}

function inputMoveHome(input: InputState): void {
	input.cursorCol = 0;
}

function inputMoveEnd(input: InputState): void {
	input.cursorCol = (input.lines[input.cursorRow] ?? '').length;
}

function ensureInputVisible(input: InputState): void {
	if (input.cursorRow < input.scrollRow) {
		input.scrollRow = input.cursorRow;
	} else if (input.cursorRow >= input.scrollRow + INPUT_HEIGHT) {
		input.scrollRow = input.cursorRow - INPUT_HEIGHT + 1;
	}
}

function inputGetText(input: InputState): string {
	return input.lines.join('\n');
}

function inputClear(input: InputState): void {
	input.lines = [''];
	input.cursorRow = 0;
	input.cursorCol = 0;
	input.scrollRow = 0;
}

// =============================================================================
// CHAT CONTENT BUILDERS
// =============================================================================

/** Build one repeatable chat conversation chunk (~26 lines). */
function buildChatChunk(idx: number): string[] {
	const n = idx + 1;
	return [
		'',
		`${PURPLE}>${R} ${BRIGHT}Fix the authentication bug in the login handler (task #${n})${R}`,
		'',
		`  ${TEXT}I'll fix the authentication bug. Let me look at the login handler.${R}`,
		'',
		`  ${ORANGE}Read${R}${DIM}(${R}${CYAN}src/auth/login.ts${R}${DIM})${R}`,
		`    ${DIM}  1  import { verifyPassword } from './crypto';${R}`,
		`    ${DIM}  2  import { createSession } from './session';${R}`,
		`    ${DIM}  3${R}`,
		`    ${DIM}  4  export async function handleLogin(req, res) {${R}`,
		`    ${DIM}  5    const { email, password } = req.body;${R}`,
		`    ${DIM}  ...${R}`,
		'',
		`  ${ORANGE}Edit${R}${DIM}(${R}${CYAN}src/auth/login.ts${R}${DIM})${R}`,
		`    ${DIM}  Applied 3 changes to login handler${R}`,
		'',
		`  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"pnpm test src/auth/ 2>&1"${R}${DIM})${R}`,
		`    ${DIM}$ pnpm test src/auth/${R}`,
		`    ${DIM} PASS  src/auth/login.test.ts (6 tests)${R}`,
		`    ${DIM} PASS  src/auth/session.test.ts (4 tests)${R}`,
		`    ${GREEN}  \u2714 All 10 tests passed${R}`,
		'',
		`  ${TEXT}Fixed the authentication bug. The issue was a missing await on the${R}`,
		`  ${TEXT}password verification, causing early session creation.${R}`,
		'',
		`  ${BORDER_FG}${'─'.repeat(50)}${R}`,
	];
}

/** Build the welcome box header. */
function buildWelcomeLines(width: number): string[] {
	const boxW = Math.min(60, width - 4);
	const inner = boxW - 2;
	const pad = (s: string, w: number) => {
		const l = Math.floor((w - s.length) / 2);
		return ' '.repeat(Math.max(0, l)) + s + ' '.repeat(Math.max(0, w - s.length - l));
	};

	return [
		'',
		`  ${BORDER_FG}\u256D${'\u2500'.repeat(inner)}\u256E${R}`,
		`  ${BORDER_FG}\u2502${' '.repeat(inner)}\u2502${R}`,
		`  ${BORDER_FG}\u2502${R}${PURPLE}${pad('Claude Code', inner)}${R}${BORDER_FG}\u2502${R}`,
		`  ${BORDER_FG}\u2502${R}${DIM}${pad('v1.0.31', inner)}${R}${BORDER_FG}\u2502${R}`,
		`  ${BORDER_FG}\u2502${' '.repeat(inner)}\u2502${R}`,
		`  ${BORDER_FG}\u2502${R}${DIM}${pad('Model: claude-opus-4-6', inner)}${R}${BORDER_FG}\u2502${R}`,
		`  ${BORDER_FG}\u2502${R}${DIM}${pad('CWD: /home/user/projects/blECSd', inner)}${R}${BORDER_FG}\u2502${R}`,
		`  ${BORDER_FG}\u2502${' '.repeat(inner)}\u2502${R}`,
		`  ${BORDER_FG}\u2570${'\u2500'.repeat(inner)}\u256F${R}`,
		'',
		`  ${DIM}Tips: ${CYAN}/help${R} ${DIM}for commands, ${CYAN}Shift+Tab${R} ${DIM}to switch modes${R}`,
		'',
	];
}

// =============================================================================
// ANIMATED SCRIPT
// =============================================================================

interface ScriptEvent {
	delay: number;
	lines?: string[];
	spinnerStart?: string;
	spinnerStop?: string;
}

function buildScript(width: number): ScriptEvent[] {
	return [
		{ delay: 0, lines: buildWelcomeLines(width) },

		// User prompt
		{
			delay: 2000,
			lines: [
				'',
				`${PURPLE}>${R} ${BRIGHT}Ship the v0.2.0 release. Run all checks, merge the PR, publish to npm, and create a GitHub release.${R}`,
				'',
			],
		},

		// Planning
		{ delay: 800, spinnerStart: 'Thinking...' },
		{
			delay: 1500,
			spinnerStop: `${GREEN}\u2714${R} Done`,
			lines: [
				`  ${TEXT}I'll ship the v0.2.0 release. Let me run through the full checklist:${R}`,
				'',
				`  ${YELLOW}  1.${R} ${TEXT}Run typecheck, tests, lint, and build${R}`,
				`  ${YELLOW}  2.${R} ${TEXT}Merge the PR via squash${R}`,
				`  ${YELLOW}  3.${R} ${TEXT}Publish to npm${R}`,
				`  ${YELLOW}  4.${R} ${TEXT}Create GitHub release with changelog${R}`,
				'',
				`  ${TEXT}Let's start with the checks.${R}`,
			],
		},

		// Typecheck
		{
			delay: 600,
			lines: ['', `  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"pnpm typecheck 2>&1"${R}${DIM})${R}`],
		},
		{ delay: 200, spinnerStart: 'Running typecheck...' },
		{
			delay: 2200,
			spinnerStop: `${GREEN}\u2714${R} Typecheck completed`,
			lines: [
				`    ${DIM}$ pnpm typecheck${R}`,
				`    ${DIM}> blecsd@0.2.0 typecheck${R}`,
				`    ${DIM}> tsc --noEmit${R}`,
				`    ${GREEN}  \u2714 0 errors, 0 warnings${R}`,
			],
		},

		// Tests
		{
			delay: 400,
			lines: ['', `  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"pnpm test 2>&1"${R}${DIM})${R}`],
		},
		{ delay: 200, spinnerStart: 'Running tests...' },
		{
			delay: 3000,
			spinnerStop: `${GREEN}\u2714${R} Tests passed`,
			lines: [
				`    ${DIM}$ pnpm test${R}`,
				`    ${DIM} PASS  src/ecs/world.test.ts (12 tests)${R}`,
				`    ${DIM} PASS  src/ecs/query.test.ts (8 tests)${R}`,
				`    ${DIM} PASS  src/rendering/buffer.test.ts (15 tests)${R}`,
				`    ${DIM} PASS  src/rendering/ansi.test.ts (22 tests)${R}`,
				`    ${DIM} PASS  src/widgets/text.test.ts (9 tests)${R}`,
				`    ${DIM}  ... +15 more suites${R}`,
				'',
				`    ${DIM}Tests: 147 passed, 147 total  |  Time: 3.412s${R}`,
				`    ${GREEN}  \u2714 All 147 tests passed${R}`,
			],
		},

		// Lint
		{
			delay: 400,
			lines: ['', `  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"pnpm lint 2>&1"${R}${DIM})${R}`],
		},
		{ delay: 200, spinnerStart: 'Running linter...' },
		{
			delay: 1800,
			spinnerStop: `${GREEN}\u2714${R} Lint clean`,
			lines: [
				`    ${DIM}$ pnpm lint${R}`,
				`    ${DIM}> eslint src/ --max-warnings=0${R}`,
				`    ${GREEN}  \u2714 0 errors, 0 warnings${R}`,
			],
		},

		// Build
		{
			delay: 400,
			lines: ['', `  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"pnpm build 2>&1"${R}${DIM})${R}`],
		},
		{ delay: 200, spinnerStart: 'Building...' },
		{
			delay: 2500,
			spinnerStop: `${GREEN}\u2714${R} Build succeeded`,
			lines: [
				`    ${DIM}$ pnpm build${R}`,
				`    ${DIM}> tsup src/index.ts --format esm,cjs --dts${R}`,
				`    ${DIM}  CJS  dist/index.cjs        42.1 kB${R}`,
				`    ${DIM}  ESM  dist/index.js          38.7 kB${R}`,
				`    ${DIM}  DTS  dist/index.d.ts        12.3 kB${R}`,
				`    ${GREEN}  \u2714 Build: 3 files, 93.1 kB total${R}`,
			],
		},

		// Checks summary
		{
			delay: 600,
			lines: ['', `  ${TEXT}All checks passed. Merging the PR now.${R}`],
		},

		// PR Merge
		{
			delay: 500,
			lines: [
				'',
				`  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"gh pr merge 921 --squash --admin 2>&1"${R}${DIM})${R}`,
			],
		},
		{ delay: 200, spinnerStart: 'Merging PR...' },
		{
			delay: 2000,
			spinnerStop: `${GREEN}\u2714${R} PR merged`,
			lines: [
				`    ${DIM}\u2714 Squashed and merged pull request #921${R}`,
				`    ${DIM}  feat: v0.2.0 - new layout engine, widget improvements${R}`,
			],
		},

		// npm publish
		{
			delay: 500,
			lines: [
				'',
				`  ${TEXT}Main is up to date. Publishing to npm.${R}`,
				'',
				`  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"npm publish --access public 2>&1"${R}${DIM})${R}`,
			],
		},
		{ delay: 200, spinnerStart: 'Publishing to npm...' },
		{
			delay: 3500,
			spinnerStop: `${GREEN}\u2714${R} Published`,
			lines: [
				`    ${DIM}npm notice  blecsd@0.2.0${R}`,
				`    ${DIM}npm notice   42.1kB  dist/index.cjs${R}`,
				`    ${DIM}npm notice   38.7kB  dist/index.js${R}`,
				`    ${DIM}npm notice   12.3kB  dist/index.d.ts${R}`,
				`    ${DIM}  ... +81 more lines${R}`,
				`    ${DIM}+ blecsd@0.2.0${R}`,
				`    ${GREEN}  \u2714 Published blecsd@0.2.0 to npm${R}`,
			],
		},

		// GitHub release
		{
			delay: 500,
			lines: [
				'',
				`  ${TEXT}Package published. Creating the GitHub release.${R}`,
				'',
				`  ${ORANGE}Bash${R}${DIM}(${R}${CYAN}"gh release create v0.2.0 --title \\"v0.2.0\\" --notes-file CHANGELOG.md"${R}${DIM})${R}`,
			],
		},
		{ delay: 200, spinnerStart: 'Creating release...' },
		{
			delay: 2000,
			spinnerStop: `${GREEN}\u2714${R} Release created`,
			lines: [
				`    ${DIM}https://github.com/user/blECSd/releases/tag/v0.2.0${R}`,
				`    ${GREEN}  \u2714 Created GitHub release v0.2.0${R}`,
			],
		},

		// Final summary
		{
			delay: 600,
			lines: [
				'',
				`  ${BORDER_FG}${'─'.repeat(50)}${R}`,
				'',
				`  ${BRIGHT}Release Summary${R}`,
				'',
				`    ${GREEN}\u2714${R} ${TEXT}Typecheck: 0 errors${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}Tests: 147/147 passed${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}Lint: clean${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}Build: 93.1 kB (3 files)${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}PR #921: squash-merged to main${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}npm: blecsd@0.2.0 published${R}`,
				`    ${GREEN}\u2714${R} ${TEXT}GitHub: v0.2.0 release created${R}`,
				'',
				`  ${TEXT}The v0.2.0 release is shipped. The package is live on npm and the${R}`,
				`  ${TEXT}GitHub release is up with the full changelog.${R}`,
				'',
				`  ${BORDER_FG}${'─'.repeat(50)}${R}`,
				'',
			],
		},
	];
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
	const stdout = process.stdout;
	const stdin = process.stdin;
	const width = stdout.columns ?? 80;
	const height = stdout.rows ?? 24;

	// Check for --buffer flag to enable alternate screen mode
	const useBuffer = process.argv.includes('--buffer');

	const world = createWorld();

	// -------------------------------------------------------------------------
	// Pre-populate chat history: 200 copies of the chunk = ~5200 lines
	// -------------------------------------------------------------------------
	const HISTORY_COPIES = 200;
	const initialLines: string[] = [];
	for (let i = 0; i < HISTORY_COPIES; i++) {
		initialLines.push(...buildChatChunk(i));
	}

	// -------------------------------------------------------------------------
	// Layout: chat area + input area + status bar
	// Input area = 1 border + INPUT_HEIGHT lines + 1 border = INPUT_HEIGHT + 2
	// Status bar = 1
	// Chat area = remaining
	// -------------------------------------------------------------------------
	const inputBoxHeight = INPUT_HEIGHT + 2; // top border + lines + bottom border
	const statusBarHeight = 1;
	const chatHeight = Math.max(3, height - inputBoxHeight - statusBarHeight);

	const list = createVirtualizedList(world, {
		width,
		height: chatHeight,
		lines: initialLines,
	});

	list.scrollToBottom();
	list.follow(true);

	// -------------------------------------------------------------------------
	// Input state
	// -------------------------------------------------------------------------
	const input = createInputState();
	let focusInput = true; // Start with input focused

	// -------------------------------------------------------------------------
	// Script state
	// -------------------------------------------------------------------------
	const script = buildScript(width);
	let scriptIdx = 0;
	let nextEventAt = Date.now() + (script[0]?.delay ?? 0);
	let spinnerText: string | null = null;
	let spinnerFrame = 0;
	let lastSpinnerTick = 0;

	// -------------------------------------------------------------------------
	// FPS tracking
	// -------------------------------------------------------------------------
	let frameCount = 0;
	let lastFpsUpdate = Date.now();
	let fps = 0;

	// -------------------------------------------------------------------------
	// Terminal setup
	// -------------------------------------------------------------------------
	setOutputStream(process.stdout);
	if (useBuffer) {
		enterAlternateScreen();
	}
	hideCursor();
	writeRaw('\x1b[?1003h'); // Enable any-event mouse tracking
	writeRaw('\x1b[?1006h'); // Enable SGR mouse protocol
	stdin.setRawMode?.(true);
	stdin.resume();

	let running = true;

	// -------------------------------------------------------------------------
	// Submit handler: append user message to chat
	// -------------------------------------------------------------------------
	function submitInput(): void {
		const text = inputGetText(input).trim();
		if (!text) return;

		// Append as a user prompt
		const msgLines = [
			'',
			`${PURPLE}>${R} ${BRIGHT}${text}${R}`,
			'',
		];
		list.appendLines(msgLines);
		list.follow(true);
		inputClear(input);
	}

	// -------------------------------------------------------------------------
	// Input handling
	// -------------------------------------------------------------------------
	const SCROLL_LINES = 3;

	stdin.on('data', (data: Buffer) => {
		// Mouse events
		const buf = new Uint8Array(data);
		if (isMouseBuffer(buf)) {
			const result = parseMouseSequence(buf);
			if (result && result.type === 'mouse') {
				const ev = result.event;
				if (ev.action === 'wheel') {
					if (ev.button === 'wheelUp') {
						list.scrollBy(-SCROLL_LINES);
						list.follow(false);
					} else if (ev.button === 'wheelDown') {
						list.scrollBy(SCROLL_LINES);
						const info = list.getScrollInfo();
						if (info?.atBottom) list.follow(true);
					}
				}
			}
			return;
		}

		const ch = data.toString();

		// Ctrl+C always quits
		if (ch === '\x03') {
			running = false;
			return;
		}

		// Tab toggles focus
		if (ch === '\t') {
			focusInput = !focusInput;
			return;
		}

		// Route input based on focus
		if (focusInput) {
			handleInputKey(ch, data);
		} else {
			handleListKey(ch);
		}
	});

	function handleInputKey(ch: string, data: Buffer): void {
		if (ch === '\r' || ch === '\n') {
			// Enter = submit
			submitInput();
		} else if (ch === '\x1b[A') {
			// Up arrow
			inputMoveUp(input);
		} else if (ch === '\x1b[B') {
			// Down arrow
			inputMoveDown(input);
		} else if (ch === '\x1b[C') {
			// Right arrow
			inputMoveRight(input);
		} else if (ch === '\x1b[D') {
			// Left arrow
			inputMoveLeft(input);
		} else if (ch === '\x1b[H' || ch === '\x1bOH') {
			// Home
			inputMoveHome(input);
		} else if (ch === '\x1b[F' || ch === '\x1bOF') {
			// End
			inputMoveEnd(input);
		} else if (ch === '\x7f' || ch === '\b') {
			// Backspace
			inputBackspace(input);
		} else if (ch === '\x1b[3~') {
			// Delete
			inputDelete(input);
		} else if (ch === '\x1b[5~') {
			// PgUp: scroll chat even when input focused
			list.scrollPage(-1);
			list.follow(false);
		} else if (ch === '\x1b[6~') {
			// PgDn: scroll chat even when input focused
			list.scrollPage(1);
			const info = list.getScrollInfo();
			if (info?.atBottom) list.follow(true);
		} else if (ch === '\x15') {
			// Ctrl+U: clear input
			inputClear(input);
		} else if (ch === '\x0a' || ch === '\x1b\r' || ch === '\x1b\n') {
			// Alt+Enter or Shift+Enter: newline
			inputNewline(input);
		} else if (ch.length === 1 && ch >= ' ') {
			// Printable character
			inputInsertChar(input, ch);
		} else if (!ch.startsWith('\x1b') && ch.length > 0) {
			// Multi-byte printable (unicode)
			for (const c of ch) {
				if (c >= ' ') inputInsertChar(input, c);
			}
		}
	}

	function handleListKey(ch: string): void {
		if (ch === 'q' || ch === 'Q') {
			running = false;
			return;
		}

		if (ch === '\x1b[A') {
			list.cursorUp();
			list.follow(false);
		} else if (ch === '\x1b[B') {
			list.cursorDown();
			const info = list.getScrollInfo();
			if (info?.atBottom) list.follow(true);
		} else if (ch === '\x1b[5~') {
			list.scrollPage(-1);
			list.follow(false);
		} else if (ch === '\x1b[6~') {
			list.scrollPage(1);
			const info = list.getScrollInfo();
			if (info?.atBottom) list.follow(true);
		} else if (ch === '\x1b[H' || ch === '\x1bOH') {
			list.scrollToTop();
			list.follow(false);
		} else if (ch === '\x1b[F' || ch === '\x1bOF') {
			list.scrollToBottom();
			list.follow(true);
		} else {
			handleVirtualizedListKey(list, ch);
		}
	}

	// -------------------------------------------------------------------------
	// Resize handling
	// -------------------------------------------------------------------------
	stdout.on('resize', () => {
		const w = stdout.columns ?? 80;
		const h = stdout.rows ?? 24;
		const ch = Math.max(3, h - inputBoxHeight - statusBarHeight);
		list.setDimensions(w, ch);
	});

	// -------------------------------------------------------------------------
	// Render loop (~30 FPS)
	// -------------------------------------------------------------------------
	const FRAME_TIME = 1000 / 30;

	function render(): void {
		if (!running) {
			writeRaw('\x1b[?1006l'); // Disable SGR mouse protocol
			writeRaw('\x1b[?1003l'); // Disable mouse tracking
			showTerminalCursor();
			if (useBuffer) {
				leaveAlternateScreen();
			}
			process.exit(0);
		}

		const now = Date.now();
		const w = stdout.columns ?? 80;
		const h = stdout.rows ?? 24;
		const chatH = Math.max(3, h - inputBoxHeight - statusBarHeight);

		// Process script events
		while (scriptIdx < script.length && now >= nextEventAt) {
			const ev = script[scriptIdx]!;

			if (ev.spinnerStop) spinnerText = null;
			if (ev.lines) list.appendLines(ev.lines);
			if (ev.spinnerStart) spinnerText = ev.spinnerStart;

			scriptIdx++;
			if (scriptIdx < script.length) {
				nextEventAt = now + (script[scriptIdx]?.delay ?? 0);
			}
		}

		// Spinner animation tick
		if (spinnerText && now - lastSpinnerTick >= 80) {
			spinnerFrame++;
			lastSpinnerTick = now;
		}

		// FPS counter
		frameCount++;
		if (now - lastFpsUpdate >= 1000) {
			fps = frameCount;
			frameCount = 0;
			lastFpsUpdate = now;
		}

		// Read list state
		const scrollInfo = list.getScrollInfo();
		const firstVisible = scrollInfo?.currentLine ?? 0;
		const cursor = list.getCursor();
		const total = list.getLineCount();
		const scrollPct = Math.round(scrollInfo?.scrollPercent ?? 0);
		const following = list.isFollowing();
		const showCursor = !following;

		// =====================================================================
		// Build frame output
		// =====================================================================
		let out = '\x1b[H';

		// --- Chat area ---
		for (let i = 0; i < chatH; i++) {
			const lineIdx = firstVisible + i;
			const content = list.getLine(lineIdx);
			const isCursorLine = showCursor && lineIdx === cursor;

			if (content === undefined) {
				out += `${R} \x1b[K`;
			} else if (isCursorLine) {
				out += `${CURSOR_BG}${YELLOW}>${R} ${content}${R}\x1b[K`;
			} else {
				out += `${R}  ${content}${R}\x1b[K`;
			}

			out += '\n';
		}

		// --- Input box ---
		const inputTopRow = chatH + 1;
		const borderColor = focusInput ? PURPLE : INPUT_BORDER;
		const innerW = w - 2;

		// Top border with label
		const label = focusInput ? ' Input (Enter=send, Ctrl+U=clear) ' : ' Input (Tab to focus) ';
		const labelLen = label.length;
		const borderAfter = Math.max(0, innerW - labelLen);
		out += `\x1b[${inputTopRow};1H${borderColor}\u256D${label}${'─'.repeat(borderAfter)}\u256E${R}\x1b[K`;

		// Input content rows
		for (let i = 0; i < INPUT_HEIGHT; i++) {
			const row = inputTopRow + 1 + i;
			const lineIdx = input.scrollRow + i;
			const lineText = input.lines[lineIdx] ?? '';
			const display = lineText.slice(0, innerW).padEnd(innerW, ' ');

			out += `\x1b[${row};1H${borderColor}\u2502${R}${INPUT_BG}${focusInput ? fgRgb(200, 208, 224) : DIM}${display}${R}${borderColor}\u2502${R}\x1b[K`;
		}

		// Bottom border
		const bottomRow = inputTopRow + INPUT_HEIGHT + 1;
		out += `\x1b[${bottomRow};1H${borderColor}\u2570${'─'.repeat(innerW)}\u256F${R}\x1b[K`;

		// --- Status bar ---
		const statusRow = h;
		out += `\x1b[${statusRow};1H${STATUS_BG}\x1b[K`;

		// Left: app name
		out += `${STATUS_BG}${PURPLE} claude-chat${R}`;

		// Center: spinner or follow indicator
		const midText = spinnerText
			? ` ${SPINNER_CHARS[spinnerFrame % SPINNER_CHARS.length]} ${spinnerText} `
			: following
				? ' [following] '
				: '';
		if (midText) {
			const midCol = Math.max(1, Math.floor((w - midText.length) / 2));
			const midColor = spinnerText ? YELLOW : DIM;
			out += `\x1b[${statusRow};${midCol}H${STATUS_BG}${midColor}${midText}${R}`;
		}

		// Right: stats
		const rightText = `${total} lines | FPS: ${fps} | ${scrollPct}% `;
		const rightCol = Math.max(1, w - rightText.length + 1);
		out += `\x1b[${statusRow};${rightCol}H${STATUS_BG}${DIM}${rightText}${R}`;

		// --- Position cursor in the input area ---
		if (focusInput) {
			const curVisRow = input.cursorRow - input.scrollRow;
			if (curVisRow >= 0 && curVisRow < INPUT_HEIGHT) {
				const termRow = inputTopRow + 1 + curVisRow;
				const termCol = input.cursorCol + 2; // +1 for border, +1 for 1-indexed
				out += `\x1b[?25h\x1b[${termRow};${termCol}H`; // Show and position cursor
			} else {
				out += '\x1b[?25l';
			}
		} else {
			out += '\x1b[?25l'; // Hide cursor when list is focused
		}

		stdout.write(out);

		setTimeout(render, FRAME_TIME);
	}

	render();
}

main().catch((err) => {
	writeRaw('\x1b[?1006l'); // Disable SGR mouse protocol
	writeRaw('\x1b[?1003l'); // Disable mouse tracking
	showTerminalCursor();
	if (process.argv.includes('--buffer')) {
		leaveAlternateScreen();
	}
	console.error('Error:', err);
	process.exit(1);
});
