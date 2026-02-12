/**
 * Main input router with tmux-style prefix key (Ctrl+A).
 *
 * Modes:
 *   - direct:  ALL input forwarded to focused terminal (default)
 *   - prefix:  After Ctrl+A, awaiting one orchestrator command key
 *   - command: After Ctrl+A :, typing a command string
 *
 * @module agent-orchestrator/input/handlers
 */

import type { AppState, AgentPane } from '../types.js';
import { parseInput } from './keyBindings.js';
import { executeCommand } from './commandMode.js';
import { addWorker, removeFocusedWorker } from '../agents/worker.js';
import { resizeAllPanes } from '../ui/layout.js';

// =============================================================================
// COMMAND PALETTE DEFINITIONS
// =============================================================================

/**
 * A command palette entry: a label shown in the list, and an action to execute.
 */
interface PaletteCommand {
	readonly label: string;
	readonly action: (state: AppState) => void;
}

/**
 * All available command palette commands.
 * Each maps to an action that mirrors prefix-mode shortcuts.
 */
const PALETTE_COMMANDS: readonly PaletteCommand[] = [
	{
		label: 'Add Worker',
		action: (state) => { addWorker(state, 'claude'); },
	},
	{
		label: 'Remove Focused Worker',
		action: (state) => {
			if (state.focusTarget === 'worker') {
				removeFocusedWorker(state);
			}
		},
	},
	{
		label: 'Toggle Memory Sidebar',
		action: (state) => {
			state.sidebar.visible = !state.sidebar.visible;
			resizeAllPanes(state);
		},
	},
	{
		label: 'Focus Sidebar',
		action: (state) => {
			if (state.sidebar.visible) {
				state.sidebar.focused = true;
			}
		},
	},
	{
		label: 'Focus Orchestrator',
		action: (state) => {
			state.focusTarget = 'orchestrator';
		},
	},
	{
		label: 'Agent Detail',
		action: (state) => {
			state.overlay.kind = 'agent-detail';
		},
	},
	{
		label: 'Next Pane',
		action: (state) => { cycleFocus(state, 1); },
	},
	{
		label: 'Previous Pane',
		action: (state) => { cycleFocus(state, -1); },
	},
	{
		label: 'Command Mode',
		action: (state) => {
			state.inputMode = 'command';
			state.commandBuffer = '';
		},
	},
	{
		label: 'Quit',
		action: (state) => { state.running = false; },
	},
];

/**
 * Filters palette commands by a search query (case-insensitive substring match).
 * Returns the matching labels as strings (for overlay.filteredItems).
 */
function filterPaletteItems(query: string): string[] {
	const lower = query.toLowerCase();
	if (lower.length === 0) {
		return PALETTE_COMMANDS.map((cmd) => cmd.label);
	}
	return PALETTE_COMMANDS
		.filter((cmd) => cmd.label.toLowerCase().includes(lower))
		.map((cmd) => cmd.label);
}

/**
 * Finds and executes a palette command by its label.
 */
function executePaletteItem(state: AppState, label: string): void {
	const cmd = PALETTE_COMMANDS.find((c) => c.label === label);
	if (cmd) {
		cmd.action(state);
	}
}

// =============================================================================
// FOCUSED PANE
// =============================================================================

/**
 * Returns the currently focused pane (orchestrator or worker).
 */
function getFocusedPane(state: AppState): AgentPane | null {
	if (state.focusTarget === 'orchestrator') {
		return state.orchestratorPane;
	}
	return state.workerPanes[state.focusedWorkerIndex] ?? null;
}

// =============================================================================
// MAIN INPUT HANDLER
// =============================================================================

/**
 * Handles all user input based on current input mode.
 */
export function handleInput(state: AppState, data: string): void {
	const parsed = parseInput(data);

	// Global: Ctrl+Q always quits
	if (parsed.ctrl && parsed.key === 'q') {
		state.running = false;
		return;
	}

	// Handle overlay-mode input first (consumes all keys when active)
	if (state.overlay.kind !== 'none') {
		handleOverlayMode(state, data, parsed);
		return;
	}

	// Handle sidebar-focused input
	if (state.sidebar.focused) {
		handleSidebarMode(state, data, parsed);
		return;
	}

	if (state.inputMode === 'prefix') {
		handlePrefixMode(state, data, parsed);
	} else if (state.inputMode === 'command') {
		handleCommandMode(state, data, parsed);
	} else {
		// 'direct' mode (default)
		handleDirectMode(state, data, parsed);
	}
}

// =============================================================================
// DIRECT MODE
// =============================================================================

/**
 * Handles input in direct mode (default).
 * Keyboard input is forwarded to the focused terminal.
 * Mouse events are consumed by the orchestrator for pane focus only.
 */
function handleDirectMode(
	state: AppState,
	data: string,
	parsed: ReturnType<typeof parseInput>,
): void {
	// Ctrl+A: Enter prefix mode
	if (parsed.ctrl && parsed.key === 'a') {
		state.inputMode = 'prefix';
		state.needsRender = true;
		return;
	}

	// Mouse events: Handle for focus only, never forward to terminals
	if (parsed.key === 'mouse' && parsed.mouseX !== undefined && parsed.mouseY !== undefined) {
		handleMouseClick(state, parsed.mouseX, parsed.mouseY);
		return;
	}

	// Guard: Drop raw data that contains mouse escape sequences.
	if (looksLikeMouseData(data)) {
		return;
	}

	// Forward keyboard input to focused pane
	const focusedPane = getFocusedPane(state);
	if (focusedPane?.terminal.isRunning()) {
		focusedPane.terminal.input(data);
	}
}

// =============================================================================
// PREFIX MODE
// =============================================================================

/**
 * Handles input in prefix mode (after Ctrl+A).
 * One keystroke is consumed as an orchestrator command.
 */
function handlePrefixMode(
	state: AppState,
	data: string,
	parsed: ReturnType<typeof parseInput>,
): void {
	// Tab: Cycle focus forward
	if (parsed.key === 'tab' && !parsed.shift) {
		cycleFocus(state, 1);
		state.inputMode = 'direct';
		return;
	}

	// Shift+Tab: Cycle focus backward
	if (parsed.key === 'tab' && parsed.shift) {
		cycleFocus(state, -1);
		state.inputMode = 'direct';
		return;
	}

	// n: Add new worker
	if (parsed.key === 'n' && !parsed.ctrl && !parsed.meta) {
		addWorker(state, 'claude');
		state.inputMode = 'direct';
		return;
	}

	// d: Agent detail overlay
	if (parsed.key === 'd' && !parsed.ctrl && !parsed.meta) {
		state.overlay.kind = 'agent-detail';
		state.inputMode = 'direct';
		state.needsRender = true;
		return;
	}

	// x: Remove focused worker
	if (parsed.key === 'x' && !parsed.ctrl && !parsed.meta) {
		if (state.focusTarget === 'worker') {
			removeFocusedWorker(state);
		}
		state.inputMode = 'direct';
		return;
	}

	// m: Toggle memory sidebar
	if (parsed.key === 'm' && !parsed.ctrl && !parsed.meta) {
		state.sidebar.visible = !state.sidebar.visible;
		resizeAllPanes(state);
		state.inputMode = 'direct';
		return;
	}

	// p: Command palette
	if (parsed.key === 'p' && !parsed.ctrl && !parsed.meta) {
		openCommandPalette(state);
		state.inputMode = 'direct';
		return;
	}

	// 0-9: Focus pane by index (0 = orchestrator, 1-9 = workers)
	if (parsed.key >= '0' && parsed.key <= '9' && !parsed.ctrl && !parsed.meta) {
		const digit = Number.parseInt(parsed.key, 10);
		if (digit === 0) {
			state.focusTarget = 'orchestrator';
		} else {
			const index = digit - 1;
			if (index < state.workerPanes.length) {
				state.focusTarget = 'worker';
				state.focusedWorkerIndex = index;
			}
		}
		state.inputMode = 'direct';
		state.needsRender = true;
		return;
	}

	// :: Enter command mode
	if (parsed.key === ':' && !parsed.ctrl && !parsed.meta) {
		state.inputMode = 'command';
		state.commandBuffer = '';
		state.needsRender = true;
		return;
	}

	// Escape: Cancel prefix, back to direct
	if (parsed.key === 'escape') {
		state.inputMode = 'direct';
		state.needsRender = true;
		return;
	}

	// Ctrl+A in prefix mode: Send literal Ctrl+A to terminal
	if (parsed.ctrl && parsed.key === 'a') {
		const focusedPane = getFocusedPane(state);
		if (focusedPane?.terminal.isRunning()) {
			focusedPane.terminal.input('\x01');
		}
		state.inputMode = 'direct';
		return;
	}

	// s: Focus sidebar (if visible)
	if (parsed.key === 's' && !parsed.ctrl && !parsed.meta) {
		if (state.sidebar.visible) {
			state.sidebar.focused = true;
		}
		state.inputMode = 'direct';
		state.needsRender = true;
		return;
	}

	// Any other key: Cancel prefix, forward to terminal
	state.inputMode = 'direct';
	state.needsRender = true;
	const focusedPane = getFocusedPane(state);
	if (focusedPane?.terminal.isRunning()) {
		focusedPane.terminal.input(data);
	}
}

// =============================================================================
// COMMAND MODE
// =============================================================================

/**
 * Handles input in command mode (Ctrl+A : commands).
 */
function handleCommandMode(
	state: AppState,
	_data: string,
	parsed: ReturnType<typeof parseInput>,
): void {
	// Enter: Execute command and return to direct mode
	if (parsed.key === 'enter') {
		executeCommand(state, state.commandBuffer);
		state.inputMode = 'direct';
		state.commandBuffer = '';
		state.needsRender = true;
		return;
	}

	// Escape: Cancel command mode
	if (parsed.key === 'escape') {
		state.inputMode = 'direct';
		state.commandBuffer = '';
		state.needsRender = true;
		return;
	}

	// Backspace: Delete last character
	if (parsed.key === 'backspace') {
		if (state.commandBuffer.length > 0) {
			state.commandBuffer = state.commandBuffer.slice(0, -1);
			state.needsRender = true;
		}
		return;
	}

	// Printable characters: Append to buffer
	if (parsed.key.length === 1 && !parsed.ctrl && !parsed.meta) {
		state.commandBuffer += parsed.key;
		state.needsRender = true;
		return;
	}
}

// =============================================================================
// SIDEBAR MODE
// =============================================================================

/**
 * Handles input when the sidebar is focused.
 */
function handleSidebarMode(
	state: AppState,
	_data: string,
	parsed: ReturnType<typeof parseInput>,
): void {
	// Escape: Unfocus sidebar
	if (parsed.key === 'escape') {
		state.sidebar.focused = false;
		state.needsRender = true;
		return;
	}

	// Ctrl+A: Enter prefix mode (even from sidebar)
	if (parsed.ctrl && parsed.key === 'a') {
		state.sidebar.focused = false;
		state.inputMode = 'prefix';
		state.needsRender = true;
		return;
	}

	// Tab: Switch sidebar tabs
	if (parsed.key === 'tab' && !parsed.shift) {
		const tabs = ['rag', 'context', 'search'] as const;
		const currentIdx = tabs.indexOf(state.sidebar.tab);
		state.sidebar.tab = tabs[(currentIdx + 1) % tabs.length]!;
		state.sidebar.scrollOffset = 0;
		state.needsRender = true;
		return;
	}

	// Shift+Tab: Switch sidebar tabs backward
	if (parsed.key === 'tab' && parsed.shift) {
		const tabs = ['rag', 'context', 'search'] as const;
		const currentIdx = tabs.indexOf(state.sidebar.tab);
		state.sidebar.tab = tabs[(currentIdx + tabs.length - 1) % tabs.length]!;
		state.sidebar.scrollOffset = 0;
		state.needsRender = true;
		return;
	}

	// Arrow up: Scroll up
	if (parsed.key === 'up') {
		if (state.sidebar.scrollOffset > 0) {
			state.sidebar.scrollOffset--;
			state.needsRender = true;
		}
		return;
	}

	// Arrow down: Scroll down
	if (parsed.key === 'down') {
		state.sidebar.scrollOffset++;
		state.needsRender = true;
		return;
	}

	// Page up
	if (parsed.key === 'pageup') {
		state.sidebar.scrollOffset = Math.max(0, state.sidebar.scrollOffset - 10);
		state.needsRender = true;
		return;
	}

	// Page down
	if (parsed.key === 'pagedown') {
		state.sidebar.scrollOffset += 10;
		state.needsRender = true;
		return;
	}

	// / key: Start search mode
	if (parsed.key === '/' && state.sidebar.tab !== 'search') {
		state.sidebar.tab = 'search';
		state.sidebar.searchQuery = '';
		state.sidebar.scrollOffset = 0;
		state.needsRender = true;
		return;
	}

	// In search tab: handle search query input
	if (state.sidebar.tab === 'search') {
		if (parsed.key === 'backspace') {
			if (state.sidebar.searchQuery.length > 0) {
				state.sidebar.searchQuery = state.sidebar.searchQuery.slice(0, -1);
				state.needsRender = true;
			}
			return;
		}

		if (parsed.key.length === 1 && !parsed.ctrl && !parsed.meta) {
			state.sidebar.searchQuery += parsed.key;
			state.needsRender = true;
			return;
		}
	}
}

// =============================================================================
// OVERLAY MODE (Command Palette, Agent Detail)
// =============================================================================

/**
 * Opens the command palette overlay with all available commands.
 */
function openCommandPalette(state: AppState): void {
	state.overlay.kind = 'command-palette';
	state.overlay.searchQuery = '';
	state.overlay.selectedIndex = 0;
	state.overlay.filteredItems = filterPaletteItems('');
	state.needsRender = true;
}

/**
 * Updates filtered items and clamps the selection index after a search change.
 */
function updatePaletteFilter(state: AppState): void {
	const filtered = filterPaletteItems(state.overlay.searchQuery);
	state.overlay.filteredItems = filtered;
	// Clamp selection to valid range
	if (state.overlay.selectedIndex >= filtered.length) {
		state.overlay.selectedIndex = Math.max(0, filtered.length - 1);
	}
}

/**
 * Handles input when an overlay is active.
 */
function handleOverlayMode(
	state: AppState,
	_data: string,
	parsed: ReturnType<typeof parseInput>,
): void {
	// Escape: Close overlay
	if (parsed.key === 'escape') {
		state.overlay.kind = 'none';
		state.overlay.searchQuery = '';
		state.overlay.selectedIndex = 0;
		state.overlay.filteredItems = [];
		state.needsRender = true;
		return;
	}

	if (state.overlay.kind === 'command-palette') {
		// Arrow up/down: Navigate
		if (parsed.key === 'up') {
			if (state.overlay.selectedIndex > 0) {
				state.overlay.selectedIndex--;
				state.needsRender = true;
			}
			return;
		}

		if (parsed.key === 'down') {
			if (state.overlay.selectedIndex < state.overlay.filteredItems.length - 1) {
				state.overlay.selectedIndex++;
				state.needsRender = true;
			}
			return;
		}

		// Enter: Execute selected item
		if (parsed.key === 'enter') {
			const selectedLabel = state.overlay.filteredItems[state.overlay.selectedIndex];
			// Close the palette first
			state.overlay.kind = 'none';
			state.overlay.searchQuery = '';
			state.overlay.selectedIndex = 0;
			state.overlay.filteredItems = [];
			// Execute the selected command
			if (selectedLabel) {
				executePaletteItem(state, selectedLabel);
			}
			state.needsRender = true;
			return;
		}

		// Backspace
		if (parsed.key === 'backspace') {
			if (state.overlay.searchQuery.length > 0) {
				state.overlay.searchQuery = state.overlay.searchQuery.slice(0, -1);
				updatePaletteFilter(state);
				state.needsRender = true;
			}
			return;
		}

		// Printable characters for search
		if (parsed.key.length === 1 && !parsed.ctrl && !parsed.meta) {
			state.overlay.searchQuery += parsed.key;
			updatePaletteFilter(state);
			state.needsRender = true;
			return;
		}
	}
}

// =============================================================================
// FOCUS CYCLING
// =============================================================================

/**
 * Cycles focus forward or backward through all panes.
 * Order: orchestrator, worker-0, worker-1, ... worker-N, wrap.
 */
function cycleFocus(state: AppState, direction: number): void {
	const totalPanes = 1 + state.workerPanes.length; // orchestrator + workers
	if (totalPanes <= 1 && state.workerPanes.length === 0) return;

	// Current position: 0 = orchestrator, 1..N = workers
	let current = state.focusTarget === 'orchestrator' ? 0 : state.focusedWorkerIndex + 1;
	current = (current + direction + totalPanes) % totalPanes;

	if (current === 0) {
		state.focusTarget = 'orchestrator';
	} else {
		state.focusTarget = 'worker';
		state.focusedWorkerIndex = current - 1;
	}
	state.needsRender = true;
}

// =============================================================================
// MOUSE HANDLING
// =============================================================================

/**
 * Handles mouse clicks for pane focus.
 */
function handleMouseClick(state: AppState, mouseX: number, mouseY: number): void {
	// 1-indexed mouse coordinates to 0-indexed
	const x = mouseX - 1;
	const y = mouseY - 1;

	// Check sidebar click
	if (state.sidebar.visible && x < state.sidebar.width) {
		state.sidebar.focused = true;
		state.needsRender = true;
		return;
	}

	// Unfocus sidebar if clicking elsewhere
	if (state.sidebar.focused) {
		state.sidebar.focused = false;
	}

	// Check orchestrator pane
	if (state.orchestratorPane) {
		const op = state.orchestratorPane;
		if (x >= op.x && x < op.x + op.width && y >= op.y && y < op.y + op.height) {
			if (state.focusTarget !== 'orchestrator') {
				state.focusTarget = 'orchestrator';
				state.needsRender = true;
			}
			return;
		}
	}

	// Check worker panes
	for (let i = 0; i < state.workerPanes.length; i++) {
		const pane = state.workerPanes[i];
		if (pane && x >= pane.x && x < pane.x + pane.width && y >= pane.y && y < pane.y + pane.height) {
			if (state.focusTarget !== 'worker' || state.focusedWorkerIndex !== i) {
				state.focusTarget = 'worker';
				state.focusedWorkerIndex = i;
				state.needsRender = true;
			}
			return;
		}
	}
}

// =============================================================================
// MOUSE DETECTION
// =============================================================================

/**
 * Checks if raw stdin data looks like it contains mouse escape sequences.
 * This catches both complete and fragmented SGR/legacy mouse sequences
 * that may arrive split across data events.
 */
function looksLikeMouseData(data: string): boolean {
	// SGR mouse: \x1b[<digits;digits;digitsM or m
	if (data.includes('\x1b[<')) return true;

	// Legacy mouse: \x1b[M followed by 3 bytes
	if (data.includes('\x1b[M')) return true;

	// Partial SGR mouse sequence (tail fragment from a split): ;digits;digitsM
	if (/^\[<\d/.test(data)) return true;
	if (/;\d+;\d+[Mm]$/.test(data) && data.length < 20) return true;

	return false;
}
