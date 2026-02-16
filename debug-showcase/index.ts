#!/usr/bin/env node
/**
 * Debug Showcase - Demonstrates blECSd's debugging and profiling capabilities
 *
 * Features:
 * - Entity inspector (view component data for selected entity)
 * - World statistics (entity count, component usage)
 * - Performance monitoring (FPS, frame time, memory)
 * - System timing (per-system execution time)
 * - Configurable workloads (light, medium, heavy, burst mode)
 *
 * Controls:
 * - F12 or 'd': Toggle debug overlay
 * - '1': Light workload (50 entities)
 * - '2': Medium workload (200 entities)
 * - '3': Heavy workload (500 entities)
 * - 'b': Burst mode (rapid create/destroy)
 * - Tab: Select next entity for inspection
 * - 'q' or Ctrl+C: Quit
 */

import { createWorld, renderText, type World } from 'blecsd';
import { Position, Velocity } from 'blecsd/components';
import {
	enableSystemTiming,
	getPerformanceStats,
	listEntities,
	resetSystemTimings,
	timedSystem,
} from 'blecsd/debug';
import {
	enterAlternateScreen,
	hideCursor,
	leaveAlternateScreen,
	setOutputStream,
	showCursor,
	writeRaw,
} from 'blecsd/systems';
import { parseKeyBuffer } from 'blecsd/terminal';
import { createCellBuffer, packColor, type CellBuffer } from 'blecsd/utils';
import {
	createWorkload,
	clearParticles,
	WORKLOADS,
	createBurstState,
	updateBurst,
} from './workloads.js';
import type { Particle } from './workloads.js';
import {
	createOverlayState,
	toggleOverlay,
	selectEntity,
	renderOverlayToBuffer,
	createOverlayColors,
} from './overlay.js';
import type { OverlayState, OverlayColors } from './overlay.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
const MIN_SPEED = 10;

// =============================================================================
// TYPES
// =============================================================================

interface AppState {
	world: World;
	particles: Particle[];
	overlay: OverlayState;
	overlayColors: OverlayColors;
	termWidth: number;
	termHeight: number;
	running: boolean;
	burstMode: boolean;
	burstState: ReturnType<typeof createBurstState>;
	currentWorkload: keyof typeof WORKLOADS;
	needsRedraw: boolean;
}

// =============================================================================
// SYSTEMS
// =============================================================================

/**
 * Movement system - updates positions based on velocity
 */
function movementSystem(world: World, deltaTime: number): World {
	const entities = listEntities(world);

	for (const eid of entities) {
		const x = Position.x[eid];
		const y = Position.y[eid];
		const vx = Velocity.x[eid];
		const vy = Velocity.y[eid];

		if (x === undefined || y === undefined || vx === undefined || vy === undefined) {
			continue;
		}

		Position.x[eid] = x + vx * deltaTime;
		Position.y[eid] = y + vy * deltaTime;
	}

	return world;
}

/**
 * Bounce system - handles boundary collision
 */
function bounceSystem(world: World, width: number, height: number): World {
	const entities = listEntities(world);

	for (const eid of entities) {
		let x = Position.x[eid];
		let y = Position.y[eid];
		let vx = Velocity.x[eid];
		let vy = Velocity.y[eid];

		if (x === undefined || y === undefined || vx === undefined || vy === undefined) {
			continue;
		}

		// Bounce off walls (account for status bar at top)
		if (x <= 0) {
			x = 0;
			vx = Math.abs(vx);
		} else if (x >= width - 1) {
			x = width - 1;
			vx = -Math.abs(vx);
		}

		if (y <= 1) {
			// Status bar at y=0
			y = 1;
			vy = Math.abs(vy);
		} else if (y >= height - 1) {
			y = height - 1;
			vy = -Math.abs(vy);
		}

		// Maintain minimum speed
		const speed = Math.sqrt(vx * vx + vy * vy);
		if (speed < MIN_SPEED) {
			const scale = MIN_SPEED / Math.max(speed, 0.1);
			vx *= scale;
			vy *= scale;
		}

		Position.x[eid] = x;
		Position.y[eid] = y;
		Velocity.x[eid] = vx;
		Velocity.y[eid] = vy;
	}

	return world;
}

// =============================================================================
// RENDERING
// =============================================================================

/**
 * Type alias for buffer with cells property
 */
type BufferWithCells = ReturnType<typeof createCellBuffer>;

/**
 * Fill a rectangle in a cell buffer with a character and colors
 */
function fill(
	buffer: CellBuffer,
	x: number,
	y: number,
	w: number,
	h: number,
	char: string,
	fg: number,
	bg: number,
): void {
	for (let row = 0; row < h; row++) {
		for (let col = 0; col < w; col++) {
			buffer.setCell(x + col, y + row, char, fg, bg);
		}
	}
}

/**
 * Convert a cell buffer to ANSI escape sequences
 */
function bufferToAnsi(buffer: BufferWithCells): string {
	const lines: string[] = [];
	for (let y = 0; y < buffer.height; y++) {
		let line = '';
		let prevFg = -1;
		let prevBg = -1;
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.cells[y]?.[x];
			if (!cell) continue;
			if (cell.fg !== prevFg || cell.bg !== prevBg) {
				const fgR = (cell.fg >> 16) & 0xff;
				const fgG = (cell.fg >> 8) & 0xff;
				const fgB = cell.fg & 0xff;
				const bgR = (cell.bg >> 16) & 0xff;
				const bgG = (cell.bg >> 8) & 0xff;
				const bgB = cell.bg & 0xff;
				line += `\x1b[38;2;${fgR};${fgG};${fgB};48;2;${bgR};${bgG};${bgB}m`;
				prevFg = cell.fg;
				prevBg = cell.bg;
			}
			line += cell.char;
		}
		lines.push(line);
	}
	return '\x1b[H' + lines.join('\n') + '\x1b[0m';
}

/**
 * Render the entire scene to a cell buffer
 */
function renderToBuffer(state: AppState): BufferWithCells {
	const { world, particles, termWidth, termHeight, overlay, overlayColors } = state;

	// Create buffer
	const bgColor = packColor(0, 0, 0);
	const buffer = createCellBuffer(termWidth, termHeight, 0xffffffff, bgColor);

	// Fill with black background
	fill(buffer, 0, 0, termWidth, termHeight, ' ', 0xffffffff, bgColor);

	// Render status bar at top
	const statusBg = packColor(40, 40, 60);
	const statusFg = packColor(255, 255, 255);
	const perfStats = getPerformanceStats(world);
	const workloadDesc = state.burstMode
		? 'Burst Mode'
		: WORKLOADS[state.currentWorkload].description;
	const statusText = `${workloadDesc} | Entities: ${particles.length} | FPS: ${perfStats.fps.toFixed(0)} | Press F12 for debug overlay | q to quit`;

	fill(buffer, 0, 0, termWidth, 1, ' ', statusFg, statusBg);
	renderText(buffer, 0, 0, statusText.slice(0, termWidth), statusFg, statusBg);

	// Render particles
	for (const particle of particles) {
		const x = Position.x[particle.eid];
		const y = Position.y[particle.eid];

		if (x === undefined || y === undefined) continue;

		const ix = Math.floor(x);
		const iy = Math.floor(y);

		if (ix >= 0 && ix < termWidth && iy >= 1 && iy < termHeight) {
			// Extract RGB from particle color (format: 0xRRGGBBAA)
			const fgR = (particle.color >> 24) & 0xff;
			const fgG = (particle.color >> 16) & 0xff;
			const fgB = (particle.color >> 8) & 0xff;
			const fg = packColor(fgR, fgG, fgB);

			buffer.setCell(ix, iy, particle.char, fg, bgColor);
		}
	}

	// Render debug overlay
	if (overlay.enabled) {
		const overlayWidth = 50;
		const overlayX = termWidth - overlayWidth;
		renderOverlayToBuffer(
			buffer,
			world,
			overlay,
			overlayX,
			1,
			overlayWidth,
			termHeight - 1,
			overlayColors,
		);
	}

	return buffer;
}

// =============================================================================
// WORKLOAD MANAGEMENT
// =============================================================================

function switchWorkload(state: AppState, workload: keyof typeof WORKLOADS): AppState {
	// Clear current particles
	clearParticles(state.world, state.particles);

	// Reset system timings
	resetSystemTimings();

	// Create new workload
	const particles = createWorkload(
		state.world,
		state.termWidth,
		state.termHeight,
		WORKLOADS[workload],
	);

	// Reset overlay selection
	const overlay = { ...state.overlay, selectedEntity: null };

	return {
		...state,
		particles,
		overlay,
		currentWorkload: workload,
		burstMode: false,
	};
}

function enableBurstMode(state: AppState): AppState {
	// Clear current particles
	clearParticles(state.world, state.particles);

	// Reset system timings
	resetSystemTimings();

	return {
		...state,
		particles: [],
		burstMode: true,
		burstState: createBurstState(),
		overlay: { ...state.overlay, selectedEntity: null },
	};
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function handleKeypress(state: AppState, keyEvent: ReturnType<typeof parseKeyBuffer>[number]): void {
	// Quit
	if (keyEvent.name === 'q' || (keyEvent.ctrl && keyEvent.name === 'c')) {
		state.running = false;
		return;
	}

	// Toggle overlay
	if (keyEvent.name === 'f12' || keyEvent.name === 'd') {
		state.overlay = toggleOverlay(state.overlay);
		state.needsRedraw = true;
		return;
	}

	// Workload selection
	if (keyEvent.name === '1') {
		Object.assign(state, switchWorkload(state, 'light'));
		state.needsRedraw = true;
		return;
	}
	if (keyEvent.name === '2') {
		Object.assign(state, switchWorkload(state, 'medium'));
		state.needsRedraw = true;
		return;
	}
	if (keyEvent.name === '3') {
		Object.assign(state, switchWorkload(state, 'heavy'));
		state.needsRedraw = true;
		return;
	}

	// Burst mode
	if (keyEvent.name === 'b') {
		Object.assign(state, enableBurstMode(state));
		state.needsRedraw = true;
		return;
	}

	// Select next entity (Tab)
	if (keyEvent.name === 'tab') {
		const entities = state.particles.map(p => p.eid);
		if (entities.length === 0) {
			return;
		}

		const current = state.overlay.selectedEntity;
		let nextIndex = 0;

		if (current !== null) {
			const currentIndex = entities.indexOf(current);
			if (currentIndex !== -1) {
				nextIndex = (currentIndex + 1) % entities.length;
			}
		}

		const nextEntity = entities[nextIndex];
		if (nextEntity !== undefined) {
			state.overlay = selectEntity(state.overlay, nextEntity);
			state.needsRedraw = true;
		}
	}
}

// =============================================================================
// MAIN LOOP
// =============================================================================

function updateSystems(state: AppState): void {
	const { world, termWidth, termHeight } = state;

	// Update burst mode
	if (state.burstMode) {
		const now = Date.now();
		const newBurstState = updateBurst(world, state.burstState, termWidth, termHeight, now);

		// Update particles list if burst changed
		if (newBurstState !== state.burstState) {
			state.particles = newBurstState.particles;
			state.burstState = newBurstState;
		}
	}

	// Run systems with timing
	const deltaTime = 1 / 60; // Fixed timestep for consistent movement
	const timedMovement = timedSystem('movement', (w: World) => movementSystem(w, deltaTime));
	timedMovement(world);

	const timedBounce = timedSystem('bounce', (w: World) => bounceSystem(w, termWidth, termHeight));
	timedBounce(world);
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
	const termWidth = process.stdout.columns ?? 80;
	const termHeight = process.stdout.rows ?? 24;

	// Create world and enable system timing
	const world = createWorld();
	enableSystemTiming(true);

	// Setup terminal
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();
	setOutputStream(process.stdout);
	hideCursor();
	enterAlternateScreen();

	// Create initial workload
	const particles = createWorkload(world, termWidth, termHeight, WORKLOADS.light);

	const state: AppState = {
		world,
		particles,
		overlay: createOverlayState(),
		overlayColors: createOverlayColors(),
		termWidth,
		termHeight,
		running: true,
		burstMode: false,
		burstState: createBurstState(),
		currentWorkload: 'light',
		needsRedraw: true,
	};

	let terminalRestored = false;
	const restoreTerminal = (): void => {
		if (terminalRestored) return;
		terminalRestored = true;
		leaveAlternateScreen();
		showCursor();
		writeRaw('\x1b[0m');
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
	};

	// Setup input handler
	process.stdin.on('data', (data: Buffer) => {
		if (!state.running) return;
		const keyEvents = parseKeyBuffer(data);
		for (const keyEvent of keyEvents) {
			handleKeypress(state, keyEvent);
		}
	});

	// Handle terminal resize
	process.stdout.on('resize', () => {
		state.termWidth = process.stdout.columns ?? 80;
		state.termHeight = process.stdout.rows ?? 24;
		state.needsRedraw = true;
	});

	// Initial render
	writeRaw(bufferToAnsi(renderToBuffer(state)));
	state.needsRedraw = false;

	// Main loop
	const renderInterval = setInterval(() => {
		if (!state.running) {
			clearInterval(renderInterval);
			restoreTerminal();
			process.exit(0);
			return;
		}

		// Update ECS systems
		updateSystems(state);
		state.needsRedraw = true; // Entities move every frame

		if (state.needsRedraw) {
			writeRaw(bufferToAnsi(renderToBuffer(state)));
			state.needsRedraw = false;
		}
	}, FRAME_TIME);

	const exit = (): void => {
		state.running = false;
		clearInterval(renderInterval);
		restoreTerminal();
		process.exit(0);
	};

	process.on('SIGINT', exit);
	process.on('SIGTERM', exit);
}

main();
