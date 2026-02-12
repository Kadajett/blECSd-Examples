/**
 * Grid layout calculation for worker panes.
 *
 * @module agent-orchestrator/state/gridState
 */

import type { AppState, GridLayout } from '../types.js';
import { calculateGridDimensions, ORCHESTRATOR_WIDTH_RATIO } from '../config.js';

/**
 * Bounds for a rectangular area.
 */
interface Bounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Recalculates the worker grid layout when workers are added or removed.
 *
 * @param state - Application state
 * @param sidebarOffset - Width offset from sidebar (default 0)
 */
export function recalculateGrid(state: AppState, sidebarOffset = 0): void {
	const workerCount = state.workerPanes.length;
	if (workerCount === 0) {
		state.workerGrid = { rows: 1, cols: 1 };
		return;
	}

	state.workerGrid = calculateGridDimensions(workerCount);

	// Update each worker pane's grid position and bounds
	const usableWidth = state.screenWidth - sidebarOffset;
	for (let i = 0; i < state.workerPanes.length; i++) {
		const pane = state.workerPanes[i];
		if (!pane) continue;

		const bounds = calculatePaneBounds(
			usableWidth,
			state.screenHeight,
			ORCHESTRATOR_WIDTH_RATIO,
			state.workerGrid,
			i,
			sidebarOffset,
		);

		pane.x = bounds.x;
		pane.y = bounds.y;
		pane.width = bounds.width;
		pane.height = bounds.height;
		pane.gridRow = Math.floor(i / state.workerGrid.cols);
		pane.gridCol = i % state.workerGrid.cols;

		// Resize terminal widget (account for border)
		const innerWidth = Math.max(1, bounds.width - 2);
		const innerHeight = Math.max(1, bounds.height - 2);
		pane.terminal.resize(innerWidth, innerHeight);
	}
}

/**
 * Calculates bounds for a worker pane at the given grid index.
 *
 * @param screenWidth - Terminal screen width
 * @param screenHeight - Terminal screen height
 * @param orchestratorRatio - Width ratio for orchestrator pane (0-1)
 * @param gridLayout - Grid dimensions
 * @param gridIndex - Linear index in the grid
 * @returns Bounds for the pane
 */
export function calculatePaneBounds(
	screenWidth: number,
	screenHeight: number,
	orchestratorRatio: number,
	gridLayout: GridLayout,
	gridIndex: number,
	sidebarOffset = 0,
): Bounds {
	const orchestratorWidth = Math.floor(screenWidth * orchestratorRatio);
	const workerAreaWidth = screenWidth - orchestratorWidth;
	const workerAreaHeight = screenHeight - 1; // Reserve 1 line for status bar

	const paneWidth = Math.floor(workerAreaWidth / gridLayout.cols);
	const paneHeight = Math.floor(workerAreaHeight / gridLayout.rows);

	const gridRow = Math.floor(gridIndex / gridLayout.cols);
	const gridCol = gridIndex % gridLayout.cols;

	return {
		x: orchestratorWidth + gridCol * paneWidth + sidebarOffset,
		y: gridRow * paneHeight,
		width: paneWidth,
		height: paneHeight,
	};
}

/**
 * Calculates bounds for the orchestrator pane.
 *
 * @param screenWidth - Terminal screen width
 * @param screenHeight - Terminal screen height
 * @param ratio - Width ratio for orchestrator (0-1)
 * @returns Bounds for the orchestrator pane
 */
export function calculateOrchestratorBounds(
	screenWidth: number,
	screenHeight: number,
	ratio: number,
): Bounds {
	const width = Math.floor(screenWidth * ratio);
	const height = screenHeight - 1; // Reserve 1 line for status bar

	return { x: 0, y: 0, width, height };
}
