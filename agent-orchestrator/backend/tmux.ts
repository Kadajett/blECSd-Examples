/**
 * Tmux-backed pane backend.
 *
 * Wraps tmux/controller.ts to implement the PaneBackend interface.
 * Used when the orchestrator runs with `--tmux` flag.
 *
 * @module agent-orchestrator/backend/tmux
 */

import type { PaneBackend, PaneInfo } from './interface.js';
import * as tmux from '../tmux/controller.js';
import { parseAgentSpec } from '../config.js';

/**
 * Creates a tmux-backed pane backend.
 *
 * @param session - Tmux session name
 * @param workspace - Default workspace directory
 * @param mockMode - Whether to use mock mode for new agents
 * @param orchestratorPane - The orchestrator pane address
 * @returns PaneBackend implementation
 */
export function createTmuxBackend(
	session: string,
	workspace: string,
	mockMode: boolean,
	orchestratorPane: string,
): PaneBackend {
	return {
		sendInput(paneId: string, text: string): void {
			tmux.sendKeys(session, paneId, text);
		},

		sendEnter(paneId: string): void {
			tmux.sendEnter(session, paneId);
		},

		sendPrompt(paneId: string, text: string): void {
			tmux.sendCommand(session, paneId, text);
		},

		captureOutput(paneId: string): string {
			return tmux.capturePane(session, paneId);
		},

		listPanes(): readonly PaneInfo[] {
			const raw = tmux.tryRun(
				`list-panes -t ${session} -F "#{window_index}.#{pane_index}|#{pane_title}|#{pane_width}x#{pane_height}"`,
			);

			return raw
				.split('\n')
				.filter(Boolean)
				.map((line) => {
					const [address, title, size] = line.split('|');
					const [widthStr, heightStr] = (size ?? '80x24').split('x');

					return {
						id: address ?? '',
						label: title ?? '',
						kind: 'custom' as const,
						status: 'running' as const,
						width: Number.parseInt(widthStr ?? '80', 10),
						height: Number.parseInt(heightStr ?? '24', 10),
						isOrchestrator: address === orchestratorPane,
					};
				});
		},

		addPane(kind: string, ws: string, mock: boolean): string {
			const allPanes = tmux.listPanes(session);
			const targetPane = allPanes[allPanes.length - 1] ?? orchestratorPane;

			tmux.splitWindow(session, targetPane, false, 50);

			const panesAfter = tmux.listPanes(session);
			const newPane = panesAfter[panesAfter.length - 1] ?? '';

			const spec = parseAgentSpec(kind);
			if (mock || mockMode) {
				tmux.sendCommand(
					session,
					newPane,
					`printf '\\033[1;33m=== ${spec.label} ===\\033[0m\\n' && bash`,
				);
			} else {
				const args = spec.args.length > 0 ? ` ${spec.args.join(' ')}` : '';
				tmux.sendCommand(
					session,
					newPane,
					`cd "${ws}" && ${spec.command}${args}`,
				);
			}

			tmux.tryRun(
				`select-pane -t ${session}:${newPane} -T "${spec.label}"`,
			);

			return newPane;
		},

		removePane(paneId: string): void {
			if (paneId === orchestratorPane) {
				return; // Safety: never kill the orchestrator
			}
			tmux.killPane(session, paneId);
		},

		resizePane(paneId: string, width: number, height: number): void {
			tmux.resizePane(session, paneId, width, height);
		},

		findPaneByName(name: string): string | undefined {
			const raw = tmux.tryRun(
				`list-panes -t ${session} -F "#{window_index}.#{pane_index}|#{pane_title}"`,
			);

			for (const line of raw.split('\n').filter(Boolean)) {
				const [address, title] = line.split('|');
				if (title && title.toLowerCase().includes(name.toLowerCase())) {
					return address;
				}
			}

			return undefined;
		},
	};
}
