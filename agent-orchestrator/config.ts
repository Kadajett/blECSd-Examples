/**
 * Configuration constants, agent presets, and Zod schemas.
 *
 * @module agent-orchestrator/config
 */

import { z } from 'zod';
import type { AgentKind } from './types.js';
import { THEME } from './ui/theme.js';

// =============================================================================
// DISPLAY CONSTANTS
// =============================================================================

/** Minimum terminal dimensions required. */
export const MIN_WIDTH = 120;
export const MIN_HEIGHT = 30;

/** Orchestrator pane takes 30% of screen width. */
export const ORCHESTRATOR_WIDTH_RATIO = 0.3;

/** Target render framerate. */
export const TARGET_FPS = 30;
export const FRAME_MS = Math.floor(1000 / TARGET_FPS);

/** Height of the header bar in rows (3D cube + sparklines + stats). */
export const HEADER_HEIGHT = 10;

/** Terminal scrollback buffer size per agent. */
export const SCROLLBACK_LINES = 1000;

// =============================================================================
// ANSI COLORS
// =============================================================================

export const COLORS = {
	reset: THEME.reset,
	bold: THEME.bold,
	dim: THEME.dim,
	reverse: THEME.reverse,

	borderNormal: THEME.subtext.fg,
	borderFocused: `${THEME.bold}${THEME.accent1.fg}`,
	borderOrchestrator: `${THEME.bold}${THEME.accent4.fg}`,
	borderPassthrough: `${THEME.bold}${THEME.accent3.fg}`,

	statusBg: THEME.surface.bg,
	statusFg: THEME.text.fg,

	agentRunning: THEME.accent3.fg,
	agentIdle: THEME.warning.fg,
	agentError: THEME.error.fg,
	agentStopped: THEME.subtext.fg,

	modeNormal: `${THEME.bold}${THEME.text.fg}`,
	modePassthrough: `${THEME.bold}${THEME.accent3.fg}`,
	modeCommand: `${THEME.bold}${THEME.accent4.fg}`,
} as const;

// =============================================================================
// AGENT PRESETS
// =============================================================================

export interface AgentPreset {
	readonly kind: AgentKind;
	readonly command: string;
	readonly args: readonly string[];
	readonly label: string;
	readonly env?: Record<string, string>;
}

export const AGENT_PRESETS: Record<string, AgentPreset> = {
	claude: {
		kind: 'claude',
		command: 'claude',
		args: ['--dangerously-skip-permissions'],
		label: 'Claude Code',
	},
	codex: {
		kind: 'codex',
		command: 'codex',
		args: ['--full-auto'],
		label: 'Codex CLI',
	},
	gemini: {
		kind: 'gemini',
		command: 'gemini',
		args: [],
		label: 'Gemini CLI',
	},
} as const;

/** Parse an orchestrator/worker spec string into a preset or custom config. */
export function parseAgentSpec(spec: string): AgentPreset {
	// Check for preset name
	const preset = AGENT_PRESETS[spec];
	if (preset) {
		return preset;
	}

	// Custom command: "custom:<command>"
	if (spec.startsWith('custom:')) {
		const command = spec.slice(7).trim();
		const parts = command.split(/\s+/);
		return {
			kind: 'custom',
			command: parts[0] ?? command,
			args: parts.slice(1),
			label: `Custom (${parts[0] ?? command})`,
		};
	}

	// Worker spec: "kind:/path/to/worktree"
	const colonIndex = spec.indexOf(':');
	if (colonIndex > 0) {
		const kind = spec.slice(0, colonIndex);
		const cwd = spec.slice(colonIndex + 1);
		const preset = AGENT_PRESETS[kind];
		if (preset) {
			return { ...preset, env: { ...preset.env, AGENT_CWD: cwd } };
		}
	}

	// Default to claude
	return AGENT_PRESETS['claude'] as AgentPreset;
}

// =============================================================================
// MOCK MODE
// =============================================================================

/** Banner displayed in mock agent terminals. */
export function getMockBanner(label: string, id: string): string {
	const spinnerFrames = ['◐', '◓', '◑', '◒'] as const;
	const spinner = spinnerFrames[Math.floor(Date.now() / 250) % spinnerFrames.length] ?? '◐';
	const title = truncateBanner(`${label}`, 34);
	const idText = truncateBanner(id, 30);
	return [
		`${THEME.bold}${THEME.accent2.fg}╭──────────────────────────────────────╮${THEME.reset}`,
		`${THEME.bold}${THEME.accent2.fg}│${THEME.reset} ${THEME.bold}${THEME.text.fg}${title.padEnd(36)}${THEME.reset}${THEME.bold}${THEME.accent2.fg}│${THEME.reset}`,
		`${THEME.bold}${THEME.accent2.fg}│${THEME.reset} ${THEME.subtext.fg}ID: ${idText.padEnd(32)}${THEME.reset}${THEME.bold}${THEME.accent2.fg}│${THEME.reset}`,
		`${THEME.bold}${THEME.accent2.fg}│${THEME.reset} ${THEME.warning.fg}${spinner} Mock Mode - No real agents${' '.repeat(7)}${THEME.reset}${THEME.bold}${THEME.accent2.fg}│${THEME.reset}`,
		`${THEME.bold}${THEME.accent2.fg}╰──────────────────────────────────────╯${THEME.reset}`,
		'',
	].join('\r\n');
}

function truncateBanner(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	if (maxLen <= 1) return text.slice(0, maxLen);
	return `${text.slice(0, maxLen - 1)}…`;
}

/** Simulated agent output lines for mock mode. */
export const MOCK_OUTPUT_LINES = [
	'\x1b[90m> Analyzing codebase...\x1b[0m',
	'\x1b[90m> Reading src/index.ts\x1b[0m',
	'\x1b[90m> Found 12 files matching pattern\x1b[0m',
	'\x1b[32m> Task completed successfully\x1b[0m',
	'\x1b[90m> Searching for references...\x1b[0m',
	'\x1b[33m> Warning: deprecated API usage found\x1b[0m',
	'\x1b[90m> Running tests...\x1b[0m',
	'\x1b[32m> All 24 tests passed\x1b[0m',
	'\x1b[90m> Generating documentation...\x1b[0m',
	'\x1b[90m> Building project...\x1b[0m',
];

/** Interval for mock output injection (ms). */
export const MOCK_OUTPUT_INTERVAL = 3000;

// =============================================================================
// RAG CONFIGURATION
// =============================================================================

/** Batch size for RAG ingestion. */
export const RAG_BATCH_SIZE = 50;

/** Interval for RAG ingestion (ms). */
export const RAG_INGEST_INTERVAL = 5000;

/** Maximum chunk size for RAG documents (characters). */
export const RAG_CHUNK_SIZE = 500;

/** Common English stop words for TF-IDF. */
export const STOP_WORDS = new Set([
	'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
	'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'she',
	'that', 'the', 'to', 'was', 'were', 'will', 'with', 'this',
	'but', 'they', 'have', 'had', 'what', 'when', 'where', 'who',
	'which', 'not', 'been', 'do', 'does', 'did', 'can', 'could',
	'would', 'should', 'may', 'might', 'shall', 'must', 'need',
]);

// =============================================================================
// CLI ARGUMENT SCHEMA
// =============================================================================

export const CliArgsSchema = z.object({
	orchestrator: z.string().default('claude'),
	workers: z.array(z.string()).default([]),
	mock: z.boolean().default(false),
	/** Use native blECSd terminal widgets instead of tmux (experimental). */
	blecsd: z.boolean().default(false),
	/** Legacy alias: --tmux is now a no-op (tmux is the default). */
	tmux: z.boolean().default(false),
	noSidebar: z.boolean().default(false),
	workspace: z.string().default(process.cwd()),
	db: z.string().default('./orchestrator.db'),
});

/** Parse CLI arguments from process.argv. */
export function parseCliArgs(argv: readonly string[]): z.infer<typeof CliArgsSchema> {
	const args: Record<string, unknown> = {
		orchestrator: 'claude',
		workers: [] as string[],
		mock: false,
		blecsd: false,
		tmux: false,
		noSidebar: false,
		workspace: process.cwd(),
		db: './orchestrator.db',
	};

	const rawArgs = argv.slice(2);
	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (!arg) continue;

		if (arg === '--mock') {
			args['mock'] = true;
		} else if (arg === '--blecsd') {
			args['blecsd'] = true;
		} else if (arg === '--tmux') {
			// No-op: tmux is now the default. Kept for backwards compat.
			args['tmux'] = true;
		} else if (arg === '--no-sidebar') {
			args['noSidebar'] = true;
		} else if (arg === '--orchestrator' && rawArgs[i + 1]) {
			args['orchestrator'] = rawArgs[i + 1];
			i++;
		} else if (arg === '--worker' && rawArgs[i + 1]) {
			(args['workers'] as string[]).push(rawArgs[i + 1] as string);
			i++;
		} else if (arg === '--workspace' && rawArgs[i + 1]) {
			args['workspace'] = rawArgs[i + 1];
			i++;
		} else if (arg === '--db' && rawArgs[i + 1]) {
			args['db'] = rawArgs[i + 1];
			i++;
		}
	}

	return CliArgsSchema.parse(args);
}

// =============================================================================
// GRID CALCULATION
// =============================================================================

/** Calculate grid dimensions for N workers. */
export function calculateGridDimensions(workerCount: number): { rows: number; cols: number } {
	if (workerCount <= 0) return { rows: 1, cols: 1 };
	if (workerCount === 1) return { rows: 1, cols: 1 };
	if (workerCount === 2) return { rows: 1, cols: 2 };
	if (workerCount <= 4) return { rows: 2, cols: 2 };
	if (workerCount <= 6) return { rows: 2, cols: 3 };
	if (workerCount <= 9) return { rows: 3, cols: 3 };

	// Aspect-ratio-optimized sqrt for 10+
	const cols = Math.ceil(Math.sqrt(workerCount));
	const rows = Math.ceil(workerCount / cols);
	return { rows, cols };
}
