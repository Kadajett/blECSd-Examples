/**
 * Layout calculation for panes and status bar.
 *
 * @module agent-orchestrator/ui/layout
 */

import type { AppState } from '../types.js';
import { ORCHESTRATOR_WIDTH_RATIO } from '../config.js';
import { calculateOrchestratorBounds, recalculateGrid } from '../state/gridState.js';

/**
 * Area bounds.
 */
interface Area {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Returns the sidebar offset (0 if sidebar is not visible).
 *
 * @param state - Application state
 * @returns Sidebar width offset
 */
function getSidebarOffset(state: AppState): number {
	return state.sidebar.visible ? state.sidebar.width : 0;
}

/**
 * Returns the orchestrator pane area.
 *
 * @param screenWidth - Terminal screen width
 * @param screenHeight - Terminal screen height
 * @param sidebarOffset - Width taken by sidebar (0 if hidden)
 * @returns Orchestrator area bounds
 */
export function getOrchestratorArea(screenWidth: number, screenHeight: number, sidebarOffset = 0): Area {
	const usableWidth = screenWidth - sidebarOffset;
	const bounds = calculateOrchestratorBounds(usableWidth, screenHeight, ORCHESTRATOR_WIDTH_RATIO);
	return {
		x: bounds.x + sidebarOffset,
		y: bounds.y,
		width: bounds.width,
		height: bounds.height,
	};
}

/**
 * Returns the worker grid area (to the right of orchestrator).
 *
 * @param screenWidth - Terminal screen width
 * @param screenHeight - Terminal screen height
 * @param sidebarOffset - Width taken by sidebar (0 if hidden)
 * @returns Worker area bounds
 */
export function getWorkerArea(screenWidth: number, screenHeight: number, sidebarOffset = 0): Area {
	const usableWidth = screenWidth - sidebarOffset;
	const orchestratorWidth = Math.floor(usableWidth * ORCHESTRATOR_WIDTH_RATIO);
	return {
		x: orchestratorWidth + sidebarOffset,
		y: 0,
		width: usableWidth - orchestratorWidth,
		height: screenHeight - 1, // Reserve 1 line for status bar
	};
}

/**
 * Returns the status bar area at the bottom.
 *
 * @param screenWidth - Terminal screen width
 * @param screenHeight - Terminal screen height
 * @returns Status bar area bounds
 */
export function getStatusBarArea(screenWidth: number, screenHeight: number): Area {
	return {
		x: 0,
		y: screenHeight - 1,
		width: screenWidth,
		height: 1,
	};
}

/**
 * Resizes all panes when screen dimensions change.
 *
 * @param state - Application state
 */
export function resizeAllPanes(state: AppState): void {
	const sidebarOffset = getSidebarOffset(state);

	// Resize orchestrator pane
	if (state.orchestratorPane) {
		const bounds = getOrchestratorArea(state.screenWidth, state.screenHeight, sidebarOffset);
		state.orchestratorPane.x = bounds.x;
		state.orchestratorPane.y = bounds.y;
		state.orchestratorPane.width = bounds.width;
		state.orchestratorPane.height = bounds.height;

		// Resize terminal widget (account for border)
		const innerWidth = Math.max(1, bounds.width - 2);
		const innerHeight = Math.max(1, bounds.height - 2);
		state.orchestratorPane.terminal.resize(innerWidth, innerHeight);
	}

	// Resize worker panes
	recalculateGrid(state, sidebarOffset);

	state.needsRender = true;
}
