/**
 * blECSd-backed pane backend.
 *
 * Manages TerminalWidget instances directly for native TUI rendering.
 * Used by default (no --tmux flag).
 *
 * @module agent-orchestrator/backend/blecsd
 */

import type { World } from 'blecsd';
import { createTerminal, type TerminalWidget } from 'blecsd/widgets';
import type { PaneBackend, PaneInfo } from './interface.js';
import type { AgentKind, AgentStatus } from '../types.js';
import { parseAgentSpec, getMockBanner, SCROLLBACK_LINES } from '../config.js';

/**
 * Internal tracking for a blECSd-managed terminal pane.
 */
interface ManagedPane {
	readonly terminal: TerminalWidget;
	readonly id: string;
	readonly label: string;
	readonly kind: AgentKind;
	status: AgentStatus;
	readonly isOrchestrator: boolean;
}

/**
 * Creates a blECSd-backed pane backend.
 *
 * @param world - The bitecs world instance
 * @param workspace - Default workspace directory
 * @param mockMode - Whether to use mock mode for new agents
 * @param onRender - Callback to flag that a render is needed
 * @returns PaneBackend implementation plus direct terminal access
 */
export function createBlecsdBackend(
	world: World,
	workspace: string,
	mockMode: boolean,
	onRender: () => void,
): PaneBackend & {
	/** Direct access to managed panes for rendering. */
	readonly panes: ReadonlyMap<string, ManagedPane>;
	/** Get a terminal widget by pane ID. */
	getTerminal(paneId: string): TerminalWidget | undefined;
} {
	const panes = new Map<string, ManagedPane>();
	let nextId = 0;

	function generateId(): string {
		return `blecsd-${nextId++}`;
	}

	function spawnInTerminal(
		terminal: TerminalWidget,
		kind: string,
		label: string,
		ws: string,
		mock: boolean,
		id: string,
	): void {
		const spec = parseAgentSpec(kind);

		const baseEnv = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

		if (mock || mockMode) {
			terminal.writeln(getMockBanner(label, id));
			terminal.spawn({
				shell: '/bin/bash',
				args: [],
				cwd: ws,
				env: baseEnv,
			});
		} else {
			terminal.writeln(`\x1b[90mStarting ${label}...\x1b[0m`);
			try {
				terminal.spawn({
					shell: spec.command,
					args: [...spec.args],
					cwd: ws,
					env: { ...baseEnv, ...spec.env },
				});
			} catch (err) {
				terminal.writeln(`\x1b[31mError: ${String(err)}\x1b[0m`);
			}
		}
	}

	const backend: PaneBackend & {
		readonly panes: ReadonlyMap<string, ManagedPane>;
		getTerminal(paneId: string): TerminalWidget | undefined;
	} = {
		panes,

		getTerminal(paneId: string): TerminalWidget | undefined {
			return panes.get(paneId)?.terminal;
		},

		sendInput(paneId: string, text: string): void {
			const managed = panes.get(paneId);
			if (managed?.terminal.isRunning()) {
				managed.terminal.input(text);
			}
		},

		sendEnter(paneId: string): void {
			const managed = panes.get(paneId);
			if (managed?.terminal.isRunning()) {
				managed.terminal.input('\r');
			}
		},

		sendPrompt(paneId: string, text: string): void {
			const managed = panes.get(paneId);
			if (managed?.terminal.isRunning()) {
				managed.terminal.input(text);
				managed.terminal.input('\r');
			}
		},

		captureOutput(paneId: string): string {
			const managed = panes.get(paneId);
			if (!managed) return '';

			const dims = managed.terminal.getDimensions();
			const cells = managed.terminal.getCells();
			if (!cells) return '';

			const lines: string[] = [];
			for (let row = 0; row < dims.height; row++) {
				let line = '';
				for (let col = 0; col < dims.width; col++) {
					const idx = row * dims.width + col;
					const cell = cells[idx];
					line += cell?.char || ' ';
				}
				lines.push(line.trimEnd());
			}

			// Trim trailing empty lines
			while (lines.length > 0 && lines[lines.length - 1] === '') {
				lines.pop();
			}

			return lines.join('\n');
		},

		listPanes(): readonly PaneInfo[] {
			const result: PaneInfo[] = [];
			for (const [id, managed] of panes) {
				const dims = managed.terminal.getDimensions();
				result.push({
					id,
					label: managed.label,
					kind: managed.kind,
					status: managed.status,
					width: dims.width,
					height: dims.height,
					isOrchestrator: managed.isOrchestrator,
				});
			}
			return result;
		},

		addPane(kind: string, ws: string, mock: boolean): string {
			const id = generateId();
			const spec = parseAgentSpec(kind);

			const terminal = createTerminal(world, {
				width: 80,
				height: 24,
				scrollback: SCROLLBACK_LINES,
				cursorBlink: false, // Orchestrator manages cursor position
			});

			const managed: ManagedPane = {
				terminal,
				id,
				label: spec.label,
				kind: spec.kind,
				status: 'starting',
				isOrchestrator: false,
			};

			terminal.onData(() => {
				managed.status = 'running';
				// Note: We do NOT call onRender() here. PTY onData fires per-byte.
				// The 30fps render loop picks up changes automatically.
			});

			terminal.onExit((code) => {
				managed.status = code === 0 ? 'stopped' : 'error';
				onRender();
			});

			panes.set(id, managed);
			spawnInTerminal(terminal, kind, spec.label, ws, mock, id);
			managed.status = terminal.isRunning() ? 'running' : 'error';

			return id;
		},

		removePane(paneId: string): void {
			const managed = panes.get(paneId);
			if (!managed) return;
			if (managed.isOrchestrator) return; // Safety

			managed.terminal.kill();
			managed.terminal.destroy();
			panes.delete(paneId);
			onRender();
		},

		resizePane(paneId: string, width: number, height: number): void {
			const managed = panes.get(paneId);
			if (managed) {
				managed.terminal.resize(width, height);
			}
		},

		findPaneByName(name: string): string | undefined {
			for (const [id, managed] of panes) {
				if (managed.label.toLowerCase().includes(name.toLowerCase())) {
					return id;
				}
			}
			return undefined;
		},
	};

	return backend;
}
