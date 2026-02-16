/**
 * 3D Cube Example
 *
 * Renders a rotating wireframe cube in the terminal using braille characters.
 * Demonstrates the 3D rendering pipeline: scene graph, projection, rasterization,
 * and viewport output.
 *
 * Run: pnpm dev
 * Quit: Ctrl+C
 */

import { addEntity, clearScreen, createWorld } from 'blecsd';
import type { Entity, World } from 'blecsd';
import { createPackedQueryAdapter, setWorldAdapter, syncWorldAdapter } from 'blecsd/core';
import {
	enterAlternateScreen,
	hideCursor,
	leaveAlternateScreen,
	setOutputStream,
	showCursor,
	writeRaw,
} from 'blecsd/systems';
import {
	Camera3D,
	Mesh,
	Transform3D,
	Viewport3D,
	createCubeMesh,
	createViewport3D,
	outputStore,
	projectionSystem,
	rasterSystem,
	sceneGraphSystem,
	setAnimation3D,
	viewportOutputSystem,
} from '@blecsd/3d';

// Create ECS world
const world = createWorld() as World;

// Set up packed adapter for 3D performance
const adapter = createPackedQueryAdapter({
	queries: [
		{ name: 'transforms', components: [Transform3D] },
		{ name: 'cameras', components: [Camera3D] },
		{ name: 'viewports', components: [Viewport3D] },
		{ name: 'meshes', components: [Mesh] },
	],
	initialCapacity: 128,
	syncMode: 'all',
});
setWorldAdapter(world, adapter);

// Terminal dimensions
const VIEWPORT_WIDTH = 60;
const VIEWPORT_HEIGHT = 20;

// Create viewport entity
const vpEntity = addEntity(world) as Entity;
const viewport = createViewport3D(world, vpEntity, {
	left: 2,
	top: 1,
	width: VIEWPORT_WIDTH,
	height: VIEWPORT_HEIGHT,
	fov: Math.PI / 3,
	backend: 'braille',
});

// Create a cube mesh
const cubeId = createCubeMesh({ size: 1.5 });

// Add cube to the scene
const cubeEid = viewport.addMesh(cubeId, { tz: -5 });

// Set up animation: rotate the cube
setAnimation3D(world, cubeEid, {
	rotateSpeed: { x: 0.8, y: 1.2, z: 0.3 },
});

// Position camera
viewport.setCameraPosition(0, 0, 0);

// Frame timing
let lastTime = Date.now();
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

// Setup terminal
setOutputStream(process.stdout);
enterAlternateScreen();
hideCursor();
clearScreen();

function frame(): void {
	const now = Date.now();
	const dt = (now - lastTime) / 1000;
	lastTime = now;

	// Run animation
	// Manually update rotation since we don't have the scheduler running
	Transform3D.rx[cubeEid] = (Transform3D.rx[cubeEid] as number) + 0.8 * dt;
	Transform3D.ry[cubeEid] = (Transform3D.ry[cubeEid] as number) + 1.2 * dt;
	Transform3D.rz[cubeEid] = (Transform3D.rz[cubeEid] as number) + 0.3 * dt;
	Transform3D.dirty[cubeEid] = 1;

	// Sync packed adapter before running systems
	syncWorldAdapter(world);

	// Run 3D pipeline
	sceneGraphSystem(world);
	projectionSystem(world);
	rasterSystem(world);
	viewportOutputSystem(world);

	// Get output
	const output = outputStore.get(vpEntity);
	if (!output?.encoded.cells) return;

	// Render cells to terminal
	let ansi = '';
	for (const cell of output.encoded.cells) {
		// Move cursor and write character with color
		ansi += `\x1B[${cell.y + 1};${cell.x + 1}H`;

		if (cell.char !== '\u2800') {
			// Foreground color from cell
			const r = (cell.fg >> 16) & 0xff;
			const g = (cell.fg >> 8) & 0xff;
			const b = cell.fg & 0xff;
			ansi += `\x1B[38;2;${r};${g};${b}m${cell.char}\x1B[0m`;
		} else {
			ansi += ' ';
		}
	}

	// Draw title
	const title = ' 3D Cube - blECSd ';
	const titleX = Math.floor((VIEWPORT_WIDTH - title.length) / 2) + 2;
	ansi += `\x1B[1;${titleX}H\x1B[1;36m${title}\x1B[0m`;

	// Draw FPS counter
	const fps = dt > 0 ? Math.round(1 / dt) : 0;
	ansi += `\x1B[${VIEWPORT_HEIGHT + 2};2H\x1B[90mFPS: ${fps}  Press Ctrl+C to quit\x1B[0m`;

	writeRaw(ansi);
}

// Run frame loop
const interval = setInterval(frame, FRAME_MS);

// Clean up on exit
function cleanup(): void {
	clearInterval(interval);
	showCursor();
	leaveAlternateScreen();
	process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
