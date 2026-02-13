#!/usr/bin/env node
/**
 * Standalone 3D header renderer for the agent orchestrator.
 *
 * Renders a 10-row header with:
 * - CENTER: Rotating 3D wireframe cube (braille backend)
 * - LEFT: Token usage sparklines for odd-numbered workers
 * - RIGHT: Token usage sparklines for even-numbered workers
 * - BOTTOM: Session stats bar (name, total tokens, uptime, clock)
 *
 * @module agent-orchestrator/tmux-header
 */

import {
	addEntity,
	createWorld,
	setOutputStream,
	writeRaw,
	hideCursor,
	showCursor,
	type Entity,
	type World,
	three,
	createViewport3D,
} from 'blecsd';
import { THEME, hexToAnsi } from './ui/theme.js';
import { renderSparkline } from './ui/sparkline.js';
import { getAgentPalette } from './ui/agentColors.js';
import {
	type TokenHistory,
	createTokenHistory,
	updateTokenHistory,
} from './utils/tokenTracker.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const ESC = '\x1b';
const RESET = THEME.reset;
const HEADER_ROWS = 10;
const CUBE_WIDTH = 20;
const CUBE_HEIGHT = 8;
const CUBE_COLOR = 0x7aa2f7; // Blue, matching the outline theme
const TARGET_FPS = 30;
const FRAME_MS = Math.floor(1000 / TARGET_FPS);
const TOKEN_REFRESH_MS = 3000;

// =============================================================================
// TYPES
// =============================================================================

interface HeaderOptions {
	readonly session: string;
	readonly workers: number;
	readonly panes: readonly string[];
}

// =============================================================================
// GLOBALS
// =============================================================================

const startTime = Date.now();
let width = process.stdout.columns ?? 120;
let lastTokenRefresh = 0;

// =============================================================================
// ARG PARSING
// =============================================================================

function parseArgs(argv: readonly string[]): HeaderOptions {
	let session = process.env['BLECSD_SESSION'] ?? 'blecsd';
	let workers = Number.parseInt(process.env['BLECSD_WORKERS'] ?? '0', 10);
	let panes: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--session' && argv[i + 1]) {
			session = argv[i + 1] as string;
			i++;
			continue;
		}
		if (arg === '--workers' && argv[i + 1]) {
			workers = Number.parseInt(argv[i + 1] as string, 10);
			i++;
			continue;
		}
		if (arg === '--panes' && argv[i + 1]) {
			panes = (argv[i + 1] as string).split(',').filter(Boolean);
			i++;
		}
	}

	if (!Number.isFinite(workers) || workers < 0) {
		workers = 0;
	}

	return { session, workers, panes };
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

function formatUptime(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}h ${minutes}m`;
}

function formatClock(now: Date): string {
	const hh = now.getHours().toString().padStart(2, '0');
	const mm = now.getMinutes().toString().padStart(2, '0');
	const ss = now.getSeconds().toString().padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

function formatTokenCount(tokens: number): string {
	if (tokens >= 1000000) {
		return `${(tokens / 1000000).toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		return `${(tokens / 1000).toFixed(1)}k`;
	}
	return `${tokens}`;
}

function stripAnsi(input: string): string {
	return input.replace(/\x1b\[[0-9;]*m/g, '');
}

// =============================================================================
// 3D CUBE SETUP
// =============================================================================

interface CubeState {
	readonly world: World;
	readonly vpEntity: Entity;
	readonly cubeEid: Entity;
}

function createCube(): CubeState {
	const world = createWorld() as World;
	const vpEntity = addEntity(world) as Entity;

	// Center the cube viewport in the header
	const cubeLeft = Math.max(0, Math.floor((width - CUBE_WIDTH) / 2));
	const viewport = createViewport3D(world, vpEntity, {
		left: cubeLeft,
		top: 0,
		width: CUBE_WIDTH,
		height: CUBE_HEIGHT,
		fov: Math.PI / 3,
		backend: 'braille',
	});

	const cubeId = three.createCubeMesh({ size: 1.2 });
	const meshEid = viewport.addMesh(cubeId, { tz: -4 });
	three.setAnimation3D(world, meshEid, {
		rotateSpeed: { x: 0.6, y: 0.9, z: 0.2 },
	});
	viewport.setCameraPosition(0, 0, 0);

	return { world, vpEntity, cubeEid: meshEid };
}

// =============================================================================
// SPARKLINE RENDERING
// =============================================================================

/**
 * Renders worker token info and sparkline into 2 lines.
 *
 * @param workerIndex - Zero-based worker index
 * @param history - Token history for this worker
 * @param maxWidth - Maximum character width available
 * @returns Array of 2 strings (label line, sparkline line)
 */
function renderWorkerSparkline(
	workerIndex: number,
	history: TokenHistory,
	maxWidth: number,
): [string, string] {
	const palette = getAgentPalette(workerIndex);
	const colorFg = hexToAnsi(palette.primary, false);
	const workerNum = workerIndex + 1;

	const lastSnapshot = history.snapshots.length > 0
		? history.snapshots[history.snapshots.length - 1]
		: undefined;

	const totalTokens = lastSnapshot
		? lastSnapshot.inputTokens + lastSnapshot.outputTokens
		: 0;
	const ctxStr = lastSnapshot && lastSnapshot.contextPercent > 0
		? `${lastSnapshot.contextPercent}%`
		: '--';
	const tokStr = formatTokenCount(totalTokens);

	// Label line: "W1  45.2k  67%"
	const label = `W${workerNum}`;
	const stats = `${tokStr} ${ctxStr}`;
	const padLen = Math.max(0, maxWidth - label.length - stats.length);
	const labelLine = `${colorFg}${label}${RESET}${' '.repeat(padLen)}${THEME.subtext.fg}${stats}${RESET}`;

	// Sparkline: use input token values from history
	const data = history.snapshots.map((s) => s.inputTokens + s.outputTokens);
	const sparkWidth = Math.max(1, maxWidth);
	const sparkLine = data.length > 0
		? renderSparkline(data, sparkWidth)
		: `${THEME.subtext.fg}${'·'.repeat(sparkWidth)}${RESET}`;

	return [labelLine, sparkLine];
}

// =============================================================================
// FRAME BUFFER
// =============================================================================

/**
 * Builds the complete 10-row frame as a 2D character grid, then flushes to stdout.
 */
function renderFrame(
	options: HeaderOptions,
	cubeState: CubeState,
	histories: TokenHistory[],
	dt: number,
): void {
	// Initialize a blank frame buffer (10 rows x width columns)
	const rows: string[] = [];
	for (let r = 0; r < HEADER_ROWS; r++) {
		rows.push(' '.repeat(width));
	}

	// --- 3D cube update ---
	three.Transform3D.rx[cubeState.cubeEid] = (three.Transform3D.rx[cubeState.cubeEid] as number) + 0.6 * dt;
	three.Transform3D.ry[cubeState.cubeEid] = (three.Transform3D.ry[cubeState.cubeEid] as number) + 0.9 * dt;
	three.Transform3D.rz[cubeState.cubeEid] = (three.Transform3D.rz[cubeState.cubeEid] as number) + 0.2 * dt;
	three.Transform3D.dirty[cubeState.cubeEid] = 1;

	three.sceneGraphSystem(cubeState.world);
	three.projectionSystem(cubeState.world);
	three.rasterSystem(cubeState.world);
	three.viewportOutputSystem(cubeState.world);

	// --- Compose ANSI output ---
	let ansi = `${ESC}[H`; // Home cursor
	ansi += THEME.bg.bg; // Background color for entire header

	// Calculate zones
	const cubeLeft = Math.max(0, Math.floor((width - CUBE_WIDTH) / 2));
	const leftZoneWidth = Math.max(8, cubeLeft - 2);
	const rightZoneStart = cubeLeft + CUBE_WIDTH + 2;
	const rightZoneWidth = Math.max(8, width - rightZoneStart);

	// Split workers into odd (left) and even (right)
	const oddWorkers: number[] = [];
	const evenWorkers: number[] = [];
	for (let i = 0; i < options.workers; i++) {
		if ((i + 1) % 2 === 1) {
			oddWorkers.push(i);
		} else {
			evenWorkers.push(i);
		}
	}

	// --- Render sparklines for odd workers (LEFT side, rows 1-8) ---
	const leftLines: string[] = [];
	const maxLeftWorkers = Math.min(oddWorkers.length, 4); // Max 4 workers on left (2 lines each = 8 rows)
	for (let w = 0; w < maxLeftWorkers; w++) {
		const workerIdx = oddWorkers[w];
		if (workerIdx === undefined) break;
		const history = histories[workerIdx];
		if (!history) break;
		const [label, spark] = renderWorkerSparkline(workerIdx, history, leftZoneWidth);
		leftLines.push(label);
		leftLines.push(spark);
	}

	// --- Render sparklines for even workers (RIGHT side, rows 1-8) ---
	const rightLines: string[] = [];
	const maxRightWorkers = Math.min(evenWorkers.length, 4);
	for (let w = 0; w < maxRightWorkers; w++) {
		const workerIdx = evenWorkers[w];
		if (workerIdx === undefined) break;
		const history = histories[workerIdx];
		if (!history) break;
		const [label, spark] = renderWorkerSparkline(workerIdx, history, rightZoneWidth);
		rightLines.push(label);
		rightLines.push(spark);
	}

	// --- Build rows 1-8 ---
	for (let r = 0; r < CUBE_HEIGHT; r++) {
		const row = r + 1; // 1-based terminal row
		// Left sparkline area
		const leftContent = leftLines[r] ?? '';
		const leftVisible = stripAnsi(leftContent).length;
		const leftPad = leftContent + ' '.repeat(Math.max(0, leftZoneWidth - leftVisible));
		ansi += `${ESC}[${row};1H${THEME.bg.bg} ${leftPad}`;

		// Right sparkline area
		const rightContent = rightLines[r] ?? '';
		const rightVisible = stripAnsi(rightContent).length;
		const rightPad = rightContent + ' '.repeat(Math.max(0, rightZoneWidth - rightVisible));
		ansi += `${ESC}[${row};${rightZoneStart}H${rightPad}`;
	}

	// --- Render 3D cube cells on top of center area ---
	const output = three.outputStore.get(cubeState.vpEntity);
	if (output?.encoded.cells) {
		for (const cell of output.encoded.cells) {
			if (cell.char === '\u2800') continue; // skip blank braille
			const row = cell.y + 1;
			const col = cubeLeft + cell.x + 1;
			if (row < 1 || row > CUBE_HEIGHT || col < 1 || col > width) continue;

			// Use the cube color
			const r = (CUBE_COLOR >> 16) & 0xff;
			const g = (CUBE_COLOR >> 8) & 0xff;
			const b = CUBE_COLOR & 0xff;
			ansi += `${ESC}[${row};${col}H${ESC}[38;2;${r};${g};${b}m${cell.char}${RESET}${THEME.bg.bg}`;
		}
	}

	// --- Row 9: Separator line ---
	const sepChar = '─';
	const sepLine = sepChar.repeat(width);
	ansi += `${ESC}[9;1H${THEME.overlay.fg}${THEME.bg.bg}${sepLine}${RESET}`;

	// --- Row 10: Stats bar ---
	const now = new Date();
	const uptime = formatUptime(Date.now() - startTime);
	const clock = formatClock(now);

	// Total tokens across all workers
	let totalTokens = 0;
	for (const h of histories) {
		const last = h.snapshots.length > 0 ? h.snapshots[h.snapshots.length - 1] : undefined;
		if (last) {
			totalTokens += last.inputTokens + last.outputTokens;
		}
	}
	const totalStr = formatTokenCount(totalTokens);

	const leftLabel = `${THEME.bold}${THEME.accent2.fg}blECSd Orchestrator${RESET}`;
	const centerLabel = `${THEME.accent1.fg}Tokens: ${totalStr}${RESET}`;
	const rightLabel = `${THEME.accent1.fg}${uptime}${RESET}${THEME.subtext.fg} | ${RESET}${THEME.accent1.fg}${clock}${RESET}`;

	const leftLen = stripAnsi(leftLabel).length;
	const centerLen = stripAnsi(centerLabel).length;
	const rightLen = stripAnsi(rightLabel).length;

	// Position: left at col 2, center at middle, right at right edge
	const centerCol = Math.max(leftLen + 4, Math.floor((width - centerLen) / 2));
	const rightCol = Math.max(centerCol + centerLen + 2, width - rightLen - 1);

	ansi += `${ESC}[10;1H${THEME.surface.bg}${' '.repeat(width)}`;
	ansi += `${ESC}[10;2H${THEME.surface.bg}${leftLabel}`;
	ansi += `${ESC}[10;${centerCol + 1}H${THEME.surface.bg}${centerLabel}`;
	ansi += `${ESC}[10;${rightCol + 1}H${THEME.surface.bg}${rightLabel}`;
	ansi += RESET;

	writeRaw(ansi);
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
	const options = parseArgs(process.argv.slice(2));

	// Initialize blECSd output stream
	setOutputStream(process.stdout);

	// Hide cursor, clear header area
	if (process.stdout.isTTY) {
		hideCursor();
	}
	writeRaw(`${ESC}[2J`);

	// Set up 3D cube
	const cubeState = createCube();

	// Set up token histories for each worker pane
	let histories: TokenHistory[] = [];
	for (let i = 0; i < options.panes.length; i++) {
		const paneId = options.panes[i];
		if (paneId) {
			histories.push(createTokenHistory(paneId));
		}
	}

	// If no panes provided, create placeholder histories based on worker count
	if (histories.length === 0 && options.workers > 0) {
		for (let i = 0; i < options.workers; i++) {
			histories.push(createTokenHistory(`unknown-${i}`));
		}
	}

	let lastTime = Date.now();

	const frameLoop = setInterval(() => {
		const now = Date.now();
		const dt = (now - lastTime) / 1000;
		lastTime = now;

		// Refresh token data every TOKEN_REFRESH_MS
		if (now - lastTokenRefresh >= TOKEN_REFRESH_MS) {
			lastTokenRefresh = now;
			histories = histories.map((h) => updateTokenHistory(h, options.session));
		}

		renderFrame(options, cubeState, histories, dt);
	}, FRAME_MS);

	process.stdout.on('resize', () => {
		width = process.stdout.columns ?? 120;
	});

	const cleanup = (): void => {
		clearInterval(frameLoop);
		if (process.stdout.isTTY) {
			showCursor();
			writeRaw(RESET);
		}
		process.exit(0);
	};

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
}

main();
