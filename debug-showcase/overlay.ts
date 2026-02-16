/**
 * Debug overlay rendering.
 * Displays entity inspector, world stats, performance metrics, and system timings.
 */

import { renderText, type Entity, type World } from 'blecsd';
import {
	formatEntityInspection,
	formatWorldInspection,
	getPerformanceStats,
	getSystemTimings,
	inspectEntity,
	inspectWorld,
} from 'blecsd/debug';
import { BOX_SINGLE, packColor, renderBox, type CellBuffer } from 'blecsd/utils';

export interface OverlayState {
	readonly enabled: boolean;
	readonly selectedEntity: Entity | null;
	readonly showSystemTimings: boolean;
}

export interface OverlayColors {
	readonly bg: number;
	readonly title: number;
	readonly worldStats: number;
	readonly perfHeader: number;
	readonly perfValue: number;
	readonly timingHeader: number;
	readonly timingValue: number;
	readonly entityHeader: number;
	readonly entityValue: number;
	readonly help: number;
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
 * Render the debug overlay on the right side of the screen into a cell buffer
 */
export function renderOverlayToBuffer(
	buffer: CellBuffer,
	world: World,
	state: OverlayState,
	x: number,
	y: number,
	w: number,
	h: number,
	colors: OverlayColors,
): void {
	if (!state.enabled) return;

	// Draw overlay background
	fill(buffer, x, y, w, h, ' ', 0xffffffff, colors.bg);

	// Draw border
	renderBox(buffer, x, y, w, h, BOX_SINGLE, { fg: 0xaaaaaaff, bg: colors.bg });

	let line = y + 1;
	const textX = x + 2;
	const maxWidth = w - 4;

	// Title
	renderText(buffer, textX, line, 'DEBUG OVERLAY', colors.title, colors.bg);
	line += 2;

	// World stats
	const worldStats = inspectWorld(world);
	const worldText = formatWorldInspection(worldStats);
	const worldLines = worldText.split('\n').slice(0, 8);
	for (const textLine of worldLines) {
		if (line >= y + h - 1) break;
		const displayText = textLine.slice(0, maxWidth);
		renderText(buffer, textX, line, displayText, colors.worldStats, colors.bg);
		line++;
	}
	line++;

	// Performance stats
	const perfStats = getPerformanceStats(world);
	if (line < y + h - 1) {
		renderText(buffer, textX, line, 'PERFORMANCE', colors.perfHeader, colors.bg);
		line++;

		renderText(buffer, textX, line, `FPS: ${perfStats.fps.toFixed(1)}`, colors.perfValue, colors.bg);
		line++;

		renderText(buffer, textX, line, `Frame: ${perfStats.frameTime.toFixed(2)}ms`, colors.perfValue, colors.bg);
		line++;

		renderText(buffer, textX, line, `Entities: ${perfStats.entityCount}`, colors.perfValue, colors.bg);
		line++;
	}
	line++;

	// System timings
	if (state.showSystemTimings && line < y + h - 1) {
		const timings = getSystemTimings();
		renderText(buffer, textX, line, 'SYSTEM TIMINGS', colors.timingHeader, colors.bg);
		line++;

		const sortedTimings = Object.entries(timings).sort((a, b) => b[1] - a[1]);
		for (const [name, ms] of sortedTimings.slice(0, 5)) {
			if (line >= y + h - 1) break;
			const displayName = name.slice(0, 20);
			const displayMs = ms.toFixed(2);
			const timingText = `${displayName}: ${displayMs}ms`.slice(0, maxWidth);
			renderText(buffer, textX, line, timingText, colors.timingValue, colors.bg);
			line++;
		}
	}
	line++;

	// Entity inspector
	if (state.selectedEntity !== null && line < y + h - 1) {
		renderText(buffer, textX, line, 'ENTITY INSPECTOR', colors.entityHeader, colors.bg);
		line++;

		const inspection = inspectEntity(world, state.selectedEntity);
		const inspectionText = formatEntityInspection(inspection);
		const inspectionLines = inspectionText.split('\n').slice(0, 10);
		for (const textLine of inspectionLines) {
			if (line >= y + h - 1) break;
			const displayText = textLine.slice(0, maxWidth);
			renderText(buffer, textX, line, displayText, colors.entityValue, colors.bg);
			line++;
		}
	}

	// Controls help at bottom
	const helpY = y + h - 7;
	if (helpY > line) {
		renderText(buffer, textX, helpY, 'F12/d: Toggle overlay', colors.help, colors.bg);
		renderText(buffer, textX, helpY + 1, '1/2/3: Workload', colors.help, colors.bg);
		renderText(buffer, textX, helpY + 2, 'b: Burst mode', colors.help, colors.bg);
		renderText(buffer, textX, helpY + 3, 'Tab: Next entity', colors.help, colors.bg);
		renderText(buffer, textX, helpY + 4, 'q: Quit', colors.help, colors.bg);
	}
}

/**
 * Create default overlay colors
 */
export function createOverlayColors(): OverlayColors {
	return {
		bg: packColor(30, 30, 40),
		title: packColor(255, 255, 255),
		worldStats: packColor(200, 200, 255),
		perfHeader: packColor(255, 255, 100),
		perfValue: packColor(200, 255, 200),
		timingHeader: packColor(255, 200, 100),
		timingValue: packColor(255, 200, 150),
		entityHeader: packColor(100, 255, 255),
		entityValue: packColor(150, 255, 255),
		help: packColor(150, 150, 150),
	};
}
