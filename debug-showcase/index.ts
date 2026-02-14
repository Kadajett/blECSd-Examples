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

import {
	createWorld,
	setOutputStream,
	enterAlternateScreen,
	leaveAlternateScreen,
	hideCursor,
	showCursor,
	clearScreen,
	cursorHome,
	writeRaw,
	Position,
	Velocity,
	cleanup as cleanupOutput,
	enableSystemTiming,
	getSystemTimings,
	timedSystem,
	listEntities,
	getPerformanceStats,
	resetSystemTimings,
} from 'blecsd';
import type { World } from 'blecsd';
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
	renderOverlay,
} from './overlay.js';
import type { OverlayState } from './overlay.js';

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
	width: number;
	height: number;
	running: boolean;
	burstMode: boolean;
	burstState: ReturnType<typeof createBurstState>;
	currentWorkload: keyof typeof WORKLOADS;
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

		// Bounce off walls
		if (x <= 0) {
			x = 0;
			vx = Math.abs(vx);
		} else if (x >= width - 1) {
			x = width - 1;
			vx = -Math.abs(vx);
		}

		if (y <= 0) {
			y = 0;
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

function render(state: AppState): void {
	const { world, particles, width, height } = state;

	// Clear screen
	cursorHome();
	writeRaw('\x1b[0m'); // Reset colors
	clearScreen();

	// Render particles
	for (const particle of particles) {
		const x = Position.x[particle.eid];
		const y = Position.y[particle.eid];

		if (x === undefined || y === undefined) continue;

		const ix = Math.floor(x);
		const iy = Math.floor(y);

		if (ix >= 0 && ix < width && iy >= 0 && iy < height) {
			const fg = particle.color;
			const fgR = (fg >> 24) & 0xff;
			const fgG = (fg >> 16) & 0xff;
			const fgB = (fg >> 8) & 0xff;

			writeRaw(`\x1b[${iy + 1};${ix + 1}H`);
			writeRaw(`\x1b[38;2;${fgR};${fgG};${fgB}m`);
			writeRaw(particle.char);
			writeRaw('\x1b[0m');
		}
	}

	// Render status bar
	const perfStats = getPerformanceStats(world);
	const workloadDesc = state.burstMode
		? 'Burst Mode'
		: WORKLOADS[state.currentWorkload].description;
	const statusText = `${workloadDesc} | Entities: ${particles.length} | FPS: ${perfStats.fps.toFixed(0)} | Press F12 for debug overlay | q to quit`;
	writeRaw('\x1b[1;1H');
	writeRaw('\x1b[48;2;40;40;60;38;2;255;255;255m');
	writeRaw(statusText.padEnd(width).slice(0, width));
	writeRaw('\x1b[0m');

	// Render debug overlay
	renderOverlay(world, state.overlay, width, height);
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
		state.width,
		state.height,
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

function handleInput(state: AppState, key: string): AppState {
	// Quit
	if (key === 'q' || key === 'Q' || key === '\x03') {
		return { ...state, running: false };
	}

	// Toggle overlay
	if (key === '\x1b[24~' || key === 'd' || key === 'D') {
		// F12 or 'd'
		return { ...state, overlay: toggleOverlay(state.overlay) };
	}

	// Workload selection
	if (key === '1') {
		return switchWorkload(state, 'light');
	}
	if (key === '2') {
		return switchWorkload(state, 'medium');
	}
	if (key === '3') {
		return switchWorkload(state, 'heavy');
	}

	// Burst mode
	if (key === 'b' || key === 'B') {
		return enableBurstMode(state);
	}

	// Select next entity (Tab)
	if (key === '\t') {
		const entities = state.particles.map(p => p.eid);
		if (entities.length === 0) {
			return state;
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
			return { ...state, overlay: selectEntity(state.overlay, nextEntity) };
		}
	}

	return state;
}

// =============================================================================
// MAIN LOOP
// =============================================================================

function update(state: AppState, deltaTime: number): AppState {
	const { world, width, height } = state;

	// Update burst mode
	if (state.burstMode) {
		const now = Date.now();
		const newBurstState = updateBurst(world, state.burstState, width, height, now);

		// Update particles list if burst changed
		if (newBurstState !== state.burstState) {
			return {
				...state,
				particles: newBurstState.particles,
				burstState: newBurstState,
			};
		}
	}

	// Run systems with timing
	const timedMovement = timedSystem('movement', (w: World) => movementSystem(w, deltaTime));
	timedMovement(world);

	const timedBounce = timedSystem('bounce', (w: World) => bounceSystem(w, width, height));
	timedBounce(world);

	return state;
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
	const stdout = process.stdout;
	const stdin = process.stdin;

	const width = stdout.columns ?? 80;
	const height = stdout.rows ?? 24;

	// Create world and enable system timing
	const world = createWorld();
	enableSystemTiming(true);

	// Setup terminal
	setOutputStream(process.stdout);
	enterAlternateScreen();
	hideCursor();
	clearScreen();

	// Create initial workload
	const particles = createWorkload(world, width, height, WORKLOADS.light);

	let state: AppState = {
		world,
		particles,
		overlay: createOverlayState(),
		width,
		height,
		running: true,
		burstMode: false,
		burstState: createBurstState(),
		currentWorkload: 'light',
	};

	// Setup input handler
	stdin.setRawMode?.(true);
	stdin.resume();
	stdin.on('data', (data: Buffer) => {
		const key = data.toString();
		state = handleInput(state, key);
	});

	// Main loop
	let lastTime = Date.now();

	const loop = (): void => {
		if (!state.running) {
			// Cleanup
			stdin.pause();
			showCursor();
			leaveAlternateScreen();
			cleanupOutput();
			process.exit(0);
			return;
		}

		const now = Date.now();
		const deltaTime = (now - lastTime) / 1000;
		lastTime = now;

		// Update
		state = update(state, deltaTime);

		// Render
		render(state);

		// Schedule next frame
		const elapsed = Date.now() - now;
		const delay = Math.max(0, FRAME_TIME - elapsed);
		setTimeout(loop, delay);
	};

	// Start loop
	loop();
}

main().catch((err) => {
	console.error('Error:', err);
	process.exit(1);
});
