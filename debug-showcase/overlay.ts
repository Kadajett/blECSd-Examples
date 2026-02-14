/**
 * Debug overlay rendering.
 * Displays entity inspector, world stats, performance metrics, and system timings.
 */

import {
	Position,
	Velocity,
	writeRaw,
} from 'blecsd';
import type { World, Entity } from 'blecsd';

interface PerformanceData {
	fps: number;
	frameTime: number;
	frameCount: number;
	lastFpsUpdate: number;
}

interface SystemTimings {
	movement: number;
	bounce: number;
}

export interface OverlayState {
	readonly enabled: boolean;
	readonly selectedEntity: Entity | null;
	readonly showSystemTimings: boolean;
}

export function createOverlayState(): OverlayState {
	return {
		enabled: false,
		selectedEntity: null,
		showSystemTimings: true,
	};
}

export function toggleOverlay(state: OverlayState): OverlayState {
	return { ...state, enabled: !state.enabled };
}

export function selectEntity(state: OverlayState, eid: Entity | null): OverlayState {
	return { ...state, selectedEntity: eid };
}

/**
 * Get memory usage in MB
 */
function getMemoryUsage(): number {
	const usage = process.memoryUsage();
	return usage.heapUsed / 1024 / 1024;
}

/**
 * Render the debug overlay on the right side of the screen
 */
export function renderOverlay(
	world: World,
	state: OverlayState,
	width: number,
	height: number,
	performance: PerformanceData,
	timings: SystemTimings,
): void {
	if (!state.enabled) return;

	const overlayWidth = 50;
	const startX = width - overlayWidth;

	// Draw overlay background
	for (let y = 0; y < height; y++) {
		writeRaw(`\x1b[${y + 1};${startX + 1}H`);
		writeRaw('\x1b[48;2;30;30;40m'); // Dark background
		writeRaw(' '.repeat(overlayWidth));
	}

	let line = 0;

	// Title
	writeRaw(`\x1b[${line + 1};${startX + 2}H`);
	writeRaw('\x1b[38;2;255;255;255;1m'); // White bold
	writeRaw('DEBUG OVERLAY');
	writeRaw('\x1b[0m');
	line += 2;

	// Performance stats
	if (line < height - 1) {
		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;255;255;100;1m'); // Yellow bold
		writeRaw('PERFORMANCE');
		writeRaw('\x1b[0m');
		line++;

		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;200;255;200m'); // Light green
		writeRaw(`FPS: ${performance.fps.toFixed(1)}`);
		writeRaw('\x1b[0m');
		line++;

		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;200;255;200m');
		writeRaw(`Frame: ${performance.frameTime.toFixed(2)}ms`);
		writeRaw('\x1b[0m');
		line++;

		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;200;255;200m');
		writeRaw(`Mem: ${getMemoryUsage().toFixed(1)}MB`);
		writeRaw('\x1b[0m');
		line++;
	}
	line++;

	// System timings
	if (state.showSystemTimings && line < height - 1) {
		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;255;200;100;1m'); // Orange bold
		writeRaw('SYSTEM TIMINGS');
		writeRaw('\x1b[0m');
		line++;

		const sortedTimings = Object.entries(timings).sort((a, b) => b[1] - a[1]);
		for (const [name, ms] of sortedTimings) {
			if (line >= height - 1) break;
			writeRaw(`\x1b[${line + 1};${startX + 2}H`);
			writeRaw('\x1b[38;2;255;200;150m'); // Light orange
			const displayName = name.slice(0, 20);
			const displayMs = ms.toFixed(2);
			writeRaw(`${displayName}: ${displayMs}ms`);
			writeRaw('\x1b[0m');
			line++;
		}
	}
	line++;

	// Entity inspector
	if (state.selectedEntity !== null && line < height - 1) {
		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;100;255;255;1m'); // Cyan bold
		writeRaw('ENTITY INSPECTOR');
		writeRaw('\x1b[0m');
		line++;

		writeRaw(`\x1b[${line + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;255;255m'); // Light cyan
		writeRaw(`Entity ID: ${state.selectedEntity}`);
		writeRaw('\x1b[0m');
		line++;

		// Position
		const x = Position.x[state.selectedEntity];
		const y = Position.y[state.selectedEntity];
		if (x !== undefined && y !== undefined) {
			writeRaw(`\x1b[${line + 1};${startX + 2}H`);
			writeRaw('\x1b[38;2;150;255;255m');
			writeRaw(`Position: (${x.toFixed(2)}, ${y.toFixed(2)})`);
			writeRaw('\x1b[0m');
			line++;
		}

		// Velocity
		const vx = Velocity.x[state.selectedEntity];
		const vy = Velocity.y[state.selectedEntity];
		if (vx !== undefined && vy !== undefined) {
			writeRaw(`\x1b[${line + 1};${startX + 2}H`);
			writeRaw('\x1b[38;2;150;255;255m');
			writeRaw(`Velocity: (${vx.toFixed(2)}, ${vy.toFixed(2)})`);
			writeRaw('\x1b[0m');
			line++;

			const speed = Math.sqrt(vx * vx + vy * vy);
			writeRaw(`\x1b[${line + 1};${startX + 2}H`);
			writeRaw('\x1b[38;2;150;255;255m');
			writeRaw(`Speed: ${speed.toFixed(2)}`);
			writeRaw('\x1b[0m');
			line++;
		}
	}

	// Controls help at bottom
	const helpY = height - 6;
	if (helpY > line) {
		writeRaw(`\x1b[${helpY + 1};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;150;150m'); // Gray
		writeRaw('F12/d: Toggle overlay');
		writeRaw('\x1b[0m');

		writeRaw(`\x1b[${helpY + 2};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;150;150m');
		writeRaw('1/2/3: Workload');
		writeRaw('\x1b[0m');

		writeRaw(`\x1b[${helpY + 3};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;150;150m');
		writeRaw('b: Burst mode');
		writeRaw('\x1b[0m');

		writeRaw(`\x1b[${helpY + 4};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;150;150m');
		writeRaw('Tab: Next entity');
		writeRaw('\x1b[0m');

		writeRaw(`\x1b[${helpY + 5};${startX + 2}H`);
		writeRaw('\x1b[38;2;150;150;150m');
		writeRaw('q: Quit');
		writeRaw('\x1b[0m');
	}
}
