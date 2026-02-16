/**
 * Presence & Multi-Cursor Demo
 *
 * Demonstrates blECSd's collaborative terminal features:
 * - Presence system: tracks users, status (active/idle/away), events
 * - Multi-cursor overlay: renders remote cursors, labels, selections
 *
 * Simulates multiple remote users joining, moving cursors, selecting text,
 * going idle, and leaving. You control the local cursor with arrow keys.
 *
 * Controls:
 *   Arrow keys  - Move your cursor
 *   +/-         - Add/remove a simulated remote user
 *   s           - Toggle selection on a random remote user
 *   p           - Pause/resume remote cursor movement
 *   q / Ctrl+C  - Quit
 */

import {
	clearBuffer,
	createDoubleBuffer,
	createScreenEntity,
	createWorld,
	outputSystem,
	setDimensions,
	clearScreen,
	type World,
} from 'blecsd';
import { hexToColor } from 'blecsd/components';
import { createDirtyTracker } from 'blecsd/core';
import {
	enterAlternateScreen,
	getOutputBuffer,
	hideCursor,
	setOutputBuffer,
	setOutputStream,
	setRenderBuffer,
	cleanup as cleanupOutput,
} from 'blecsd/systems';
import {
	createInputHandler,
	setupSigwinchHandler,
	triggerResize,
	writeString,

	// Presence system
	createPresenceManager,
	addUser,
	removeUser,
	moveUserCursor,
	setUserFocus,
	getActiveUsers,
	onPresenceEvent,
	updatePresenceStatus,
	formatPresenceBar,
	getUserCount,
	type PresenceEvent,

	// Multi-cursor overlay system
	createOverlayManager,
	addSessionOverlay,
	removeSessionOverlay,
	setCursorOverlay,
	setSelectionOverlay,
	clearSelectionOverlay,
	renderOverlaysToAnsi,
	onOverlayEvent,
	type OverlayEvent,
} from 'blecsd/terminal';

// =============================================================================
// CONSTANTS
// =============================================================================

const REMOTE_USERS = [
	{ id: 'alice', name: 'Alice' },
	{ id: 'bob', name: 'Bob' },
	{ id: 'carol', name: 'Carol' },
	{ id: 'dave', name: 'Dave' },
	{ id: 'eve', name: 'Eve' },
	{ id: 'frank', name: 'Frank' },
];

const ANSI_COLORS = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14];

const SAMPLE_DOC = [
	'/**',
	' * blECSd Collaborative Terminal Session',
	' *',
	' * This document is being edited by multiple users.',
	' * Watch the colored cursors move around!',
	' */',
	'',
	'import { createWorld, addEntity } from "blecsd";',
	'import { Presence, MultiCursor } from "blecsd";',
	'',
	'// Initialize the collaborative session',
	'const world = createWorld();',
	'Presence.create({ idleTimeout: 30000 });',
	'MultiCursor.create({ showLabels: true });',
	'',
	'// Each connected user gets a colored cursor',
	'function handleUserConnect(sessionId, name) {',
	'  const user = Presence.addUser(sessionId, name);',
	'  MultiCursor.addSession(sessionId, name, user.color);',
	'  console.log(`${name} joined the session`);',
	'}',
	'',
	'// Cursor positions are synced across all terminals',
	'function handleCursorMove(sessionId, x, y) {',
	'  Presence.moveCursor(sessionId, x, y);',
	'  MultiCursor.setCursor(sessionId, x, y);',
	'}',
	'',
	'// Users can select text ranges',
	'function handleSelection(sessionId, start, end) {',
	'  MultiCursor.setSelection(sessionId, {',
	'    startLine: start.line,',
	'    startCol: start.col,',
	'    endLine: end.line,',
	'    endCol: end.col,',
	'    mode: "stream",',
	'  });',
	'}',
	'',
	'// Status updates automatically based on activity',
	'setInterval(() => Presence.updateStatus(), 10000);',
];

const DOC_TOP = 2;
const LOG_WIDTH = 36;
const PRESENCE_BAR_HEIGHT = 1;
const HEADER_HEIGHT = 1;

// =============================================================================
// STATE
// =============================================================================

interface RemoteUserState {
	readonly id: string;
	readonly name: string;
	readonly color: number;
	active: boolean;
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	moveTimer: number;
	hasSelection: boolean;
}

interface AppState {
	localX: number;
	localY: number;
	remoteUsers: RemoteUserState[];
	nextUserIndex: number;
	eventLog: string[];
	paused: boolean;
	tick: number;
}

const state: AppState = {
	localX: 0,
	localY: 0,
	remoteUsers: [],
	nextUserIndex: 0,
	eventLog: [],
	paused: false,
	tick: 0,
};

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 40;

// =============================================================================
// EVENT LOG
// =============================================================================

const MAX_LOG_LINES = 50;

function logEvent(msg: string): void {
	const timestamp = new Date().toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
	state.eventLog.push(`${timestamp} ${msg}`);
	if (state.eventLog.length > MAX_LOG_LINES) {
		state.eventLog.shift();
	}
}

// =============================================================================
// REMOTE USER SIMULATION
// =============================================================================

function addRemoteUser(): void {
	if (state.nextUserIndex >= REMOTE_USERS.length) {
		logEvent('[warn] Max remote users reached');
		return;
	}

	const def = REMOTE_USERS[state.nextUserIndex];
	if (!def) return;

	const color = ANSI_COLORS[state.nextUserIndex % ANSI_COLORS.length] ?? 1;
	const docWidth = Math.max(10, (process.stdout.columns ?? DEFAULT_WIDTH) - LOG_WIDTH - 2);
	const docHeight = SAMPLE_DOC.length;

	const userState: RemoteUserState = {
		id: def.id,
		name: def.name,
		color,
		active: true,
		x: Math.floor(Math.random() * Math.min(40, docWidth)),
		y: Math.floor(Math.random() * Math.min(10, docHeight)),
		targetX: 0,
		targetY: 0,
		moveTimer: 0,
		hasSelection: false,
	};
	userState.targetX = userState.x;
	userState.targetY = userState.y;

	state.remoteUsers.push(userState);
	state.nextUserIndex++;

	// Register with presence and overlay systems
	addUser(def.id, def.name);
	addSessionOverlay(def.id, def.name, color);
	moveUserCursor(def.id, userState.x, userState.y);
	setCursorOverlay(def.id, userState.x, userState.y + DOC_TOP);
}

function removeLastRemoteUser(): void {
	const user = state.remoteUsers.pop();
	if (!user) {
		logEvent('[warn] No remote users to remove');
		return;
	}
	state.nextUserIndex--;

	removeUser(user.id);
	removeSessionOverlay(user.id);
}

function pickNewTarget(user: RemoteUserState): void {
	const docWidth = Math.max(10, (process.stdout.columns ?? DEFAULT_WIDTH) - LOG_WIDTH - 2);
	const docHeight = SAMPLE_DOC.length;

	// Sometimes move to a nearby position, sometimes jump far
	if (Math.random() < 0.7) {
		// Small move: like editing nearby
		user.targetX = Math.max(0, Math.min(docWidth - 1, user.x + Math.floor(Math.random() * 10) - 5));
		user.targetY = Math.max(0, Math.min(docHeight - 1, user.y + Math.floor(Math.random() * 4) - 2));
	} else {
		// Big jump: scrolling or searching
		user.targetX = Math.floor(Math.random() * Math.min(60, docWidth));
		user.targetY = Math.floor(Math.random() * docHeight);
	}

	// Time to wait at target (frames)
	user.moveTimer = 30 + Math.floor(Math.random() * 90);
}

function simulateRemoteUsers(): void {
	if (state.paused) return;

	for (const user of state.remoteUsers) {
		if (!user.active) continue;

		if (user.moveTimer > 0) {
			user.moveTimer--;
			continue;
		}

		// Move toward target
		if (user.x !== user.targetX || user.y !== user.targetY) {
			const dx = Math.sign(user.targetX - user.x);
			const dy = Math.sign(user.targetY - user.y);

			// Move one step (sometimes skip x movement for natural feel)
			if (dx !== 0 && (dy === 0 || Math.random() < 0.6)) {
				user.x += dx;
			}
			if (dy !== 0 && Math.random() < 0.3) {
				user.y += dy;
			}

			moveUserCursor(user.id, user.x, user.y);
			setCursorOverlay(user.id, user.x, user.y + DOC_TOP);
		} else {
			pickNewTarget(user);
		}
	}
}

function toggleRemoteSelection(): void {
	// Pick a random active remote user
	const active = state.remoteUsers.filter((u) => u.active);
	if (active.length === 0) return;

	const user = active[Math.floor(Math.random() * active.length)];
	if (!user) return;

	if (user.hasSelection) {
		clearSelectionOverlay(user.id);
		user.hasSelection = false;
		logEvent(`${user.name} cleared selection`);
	} else {
		const startCol = Math.max(0, user.x - 2);
		const endCol = user.x + 8;
		const startLine = user.y + DOC_TOP;
		const endLine = startLine + Math.floor(Math.random() * 3);

		setSelectionOverlay(user.id, {
			startLine,
			startCol,
			endLine,
			endCol,
			mode: 'stream',
		});
		user.hasSelection = true;
		logEvent(`${user.name} selected text`);
	}
}

// =============================================================================
// RENDERING
// =============================================================================

function render(doubleBuffer: ReturnType<typeof createDoubleBuffer>, world: World): void {
	const buffer = doubleBuffer.backBuffer;
	const width = doubleBuffer.width;
	const height = doubleBuffer.height;
	clearBuffer(buffer);

	const docAreaWidth = Math.max(10, width - LOG_WIDTH - 1);
	const fg = hexToColor('#c9d1d9');
	const dimFg = hexToColor('#484f58');
	const headerFg = hexToColor('#58a6ff');
	const headerBg = hexToColor('#161b22');
	const bg = hexToColor('#0d1117');
	const logBg = hexToColor('#161b22');
	const logFg = hexToColor('#8b949e');
	const barBg = hexToColor('#21262d');
	const barFg = hexToColor('#c9d1d9');
	const commentFg = hexToColor('#8b949e');
	const keywordFg = hexToColor('#ff7b72');
	const stringFg = hexToColor('#a5d6ff');
	const funcFg = hexToColor('#d2a8ff');

	// Header bar
	const title = ` blECSd Presence Demo  |  Users: ${getUserCount()}  |  +/- add/remove  s=select  p=pause  q=quit `;
	const headerLine = title.padEnd(width);
	writeString(buffer, 0, 0, headerLine, headerFg, headerBg);

	// Document area
	const visibleLines = height - HEADER_HEIGHT - PRESENCE_BAR_HEIGHT;
	for (let row = 0; row < visibleLines && row < SAMPLE_DOC.length; row++) {
		const line = SAMPLE_DOC[row] ?? '';
		const lineNum = `${(row + 1).toString().padStart(3)} `;
		const screenY = row + DOC_TOP;

		// Line number (dim)
		writeString(buffer, 0, screenY, lineNum, dimFg, bg);

		// Syntax highlighting (simplified)
		const trimmed = line.trimStart();
		let lineFg = fg;
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed.startsWith('*/')) {
			lineFg = commentFg;
		} else if (trimmed.startsWith('import ') || trimmed.startsWith('const ') || trimmed.startsWith('function ') || trimmed.startsWith('export ')) {
			lineFg = keywordFg;
		} else if (trimmed.includes('"') || trimmed.includes("'") || trimmed.includes('`')) {
			lineFg = stringFg;
		} else if (trimmed.includes('(') || trimmed.includes(')')) {
			lineFg = funcFg;
		}

		const displayLine = line.slice(0, docAreaWidth - 4);
		writeString(buffer, 4, screenY, displayLine, lineFg, bg);
	}

	// Local cursor indicator (blinking)
	const cursorVisible = Math.floor(state.tick / 15) % 2 === 0;
	if (cursorVisible) {
		const localScreenY = state.localY + DOC_TOP;
		const localScreenX = state.localX + 4; // offset for line numbers
		if (localScreenY < height - PRESENCE_BAR_HEIGHT && localScreenX < docAreaWidth) {
			writeString(buffer, localScreenX, localScreenY, '\u2588', hexToColor('#e3b341'), bg);
		}
	}

	// Separator line between doc and event log
	const sepX = docAreaWidth;
	for (let row = HEADER_HEIGHT; row < height - PRESENCE_BAR_HEIGHT; row++) {
		writeString(buffer, sepX, row, '\u2502', dimFg, logBg);
	}

	// Event log panel
	const logLeft = sepX + 2;
	const logHeaderText = ' Event Log ';
	writeString(buffer, logLeft, HEADER_HEIGHT, logHeaderText, headerFg, logBg);

	const logStart = HEADER_HEIGHT + 1;
	const logLines = height - PRESENCE_BAR_HEIGHT - logStart;
	const startIdx = Math.max(0, state.eventLog.length - logLines);
	for (let i = 0; i < logLines; i++) {
		const logLine = state.eventLog[startIdx + i];
		if (!logLine) continue;
		const truncated = logLine.slice(0, LOG_WIDTH - 2);
		writeString(buffer, logLeft, logStart + i, truncated, logFg, logBg);
	}

	// Presence bar at the bottom
	const barY = height - 1;
	const presenceText = ` ${formatPresenceBar(width - 2)} `;
	const barLine = presenceText.padEnd(width);
	writeString(buffer, 0, barY, barLine, barFg, barBg);

	// Flush the double buffer
	doubleBuffer.fullRedraw = true;
	outputSystem(world);

	// Overlay multi-cursors directly via ANSI (composited on top)
	const overlayAnsi = renderOverlaysToAnsi(width, height, 'local');
	if (overlayAnsi) {
		process.stdout.write(overlayAnsi);
	}
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
	const world = createWorld() as World;

	const initialWidth = Math.max(60, process.stdout.columns ?? DEFAULT_WIDTH);
	const initialHeight = Math.max(20, process.stdout.rows ?? DEFAULT_HEIGHT);

	createScreenEntity(world, { width: initialWidth, height: initialHeight });

	let doubleBuffer = createDoubleBuffer(initialWidth, initialHeight);
	let dirtyTracker = createDirtyTracker(initialWidth, initialHeight);
	setRenderBuffer(dirtyTracker, doubleBuffer.backBuffer);
	setOutputBuffer(doubleBuffer);
	setOutputStream(process.stdout);

	enterAlternateScreen();
	hideCursor();
	clearScreen();

	// Initialize presence + overlay systems
	createPresenceManager({ idleTimeout: 10000, awayTimeout: 30000 });
	createOverlayManager({ showLabels: true, maxLabelLength: 10 });

	// Register the "local" user
	addUser('local', 'You');

	// Subscribe to presence events
	onPresenceEvent((event: PresenceEvent) => {
		switch (event.type) {
			case 'join':
				logEvent(`+ ${event.user.name} joined`);
				break;
			case 'leave':
				logEvent(`- ${event.sessionId} left`);
				break;
			case 'status_change':
				logEvent(`~ ${event.sessionId} -> ${event.status}`);
				break;
		}
	});

	// Subscribe to overlay events
	onOverlayEvent((event: OverlayEvent) => {
		switch (event.type) {
			case 'session_added':
				logEvent(`[overlay] +${event.name}`);
				break;
			case 'session_removed':
				logEvent(`[overlay] -${event.sessionId}`);
				break;
			case 'selection_set':
				logEvent(`[overlay] sel ${event.sessionId}`);
				break;
			case 'selection_cleared':
				logEvent(`[overlay] unsel ${event.sessionId}`);
				break;
		}
	});

	// Spawn initial remote users
	addRemoteUser();
	addRemoteUser();
	addRemoteUser();

	// Pick initial targets
	for (const u of state.remoteUsers) {
		pickNewTarget(u);
	}

	logEvent('Demo started. Use arrow keys.');
	logEvent('Press + to add users, - to remove.');
	logEvent('Press s for selections, p to pause.');

	// Input handling
	const input = createInputHandler(process.stdin);
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();

	input.onKey((event) => {
		const docWidth = Math.max(10, (process.stdout.columns ?? DEFAULT_WIDTH) - LOG_WIDTH - 2);
		const docHeight = SAMPLE_DOC.length;

		if (event.name === 'q' || event.name === 'escape' || (event.name === 'c' && event.ctrl)) {
			cleanup();
			return;
		}

		if (event.name === 'up') {
			state.localY = Math.max(0, state.localY - 1);
			moveUserCursor('local', state.localX, state.localY);
		} else if (event.name === 'down') {
			state.localY = Math.min(docHeight - 1, state.localY + 1);
			moveUserCursor('local', state.localX, state.localY);
		} else if (event.name === 'left') {
			state.localX = Math.max(0, state.localX - 1);
			moveUserCursor('local', state.localX, state.localY);
		} else if (event.name === 'right') {
			state.localX = Math.min(docWidth - 5, state.localX + 1);
			moveUserCursor('local', state.localX, state.localY);
		} else if (event.sequence === '+' || event.sequence === '=') {
			addRemoteUser();
		} else if (event.sequence === '-' || event.sequence === '_') {
			removeLastRemoteUser();
		} else if (event.name === 's') {
			toggleRemoteSelection();
		} else if (event.name === 'p') {
			state.paused = !state.paused;
			logEvent(state.paused ? 'Paused' : 'Resumed');
		}
	});

	input.start();

	// Resize handler
	const handleResize = (): void => {
		const cols = process.stdout.columns ?? DEFAULT_WIDTH;
		const rows = process.stdout.rows ?? DEFAULT_HEIGHT;
		triggerResize(world, cols, rows);

		const resized = getOutputBuffer();
		if (resized) {
			doubleBuffer = resized;
			dirtyTracker = createDirtyTracker(doubleBuffer.width, doubleBuffer.height);
			setRenderBuffer(dirtyTracker, doubleBuffer.backBuffer);
		}
		setDimensions(world, 0 as unknown as number, cols, rows);
	};

	const resizeCleanup = setupSigwinchHandler(world);
	process.stdout.on('resize', handleResize);

	// Status update timer (every 5 seconds)
	const statusInterval = setInterval(() => {
		updatePresenceStatus();
	}, 5000);

	// Main render loop at 30fps
	const FRAME_MS = 1000 / 30;
	const frameInterval = setInterval(() => {
		state.tick++;
		simulateRemoteUsers();
		render(doubleBuffer, world);
	}, FRAME_MS);

	function cleanup(): void {
		clearInterval(frameInterval);
		clearInterval(statusInterval);
		input.stop();
		process.stdout.off('resize', handleResize);
		resizeCleanup();
		cleanupOutput();
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
		process.exit(0);
	}

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
}

main();
