/**
 * Command mode execution (: commands).
 *
 * @module agent-orchestrator/input/commandMode
 */

import type { AppState } from '../types.js';
import { sendToWorker } from '../agents/communication.js';
import { addWorker, removeWorker } from '../agents/worker.js';
import { addToast } from '../ui/toast.js';

/**
 * Executes a command entered in command mode.
 *
 * @param state - Application state
 * @param command - The command string (without leading :)
 *
 * @example
 * ```typescript
 * executeCommand(state, 'send worker-1 hello');
 * executeCommand(state, 'add claude');
 * executeCommand(state, 'quit');
 * ```
 */
export function executeCommand(state: AppState, command: string): void {
	const trimmed = command.trim();

	if (trimmed.length === 0) {
		return; // Empty command
	}

	const parts = trimmed.split(/\s+/);
	const cmd = parts[0];

	if (!cmd) {
		return;
	}

	// :quit - exit the application
	if (cmd === 'quit' || cmd === 'q') {
		state.running = false;
		return;
	}

	// :send <worker-id> <text> - send text to a worker
	if (cmd === 'send') {
		if (parts.length < 3) {
			// Invalid syntax - need worker-id and text
			return;
		}

		const workerId = parts[1];
		const text = parts.slice(2).join(' ');

		if (workerId && text) {
			sendToWorker(state, workerId, text);
		}
		return;
	}

	// :add [kind] - add a new worker
	if (cmd === 'add') {
		const kind = parts[1] ?? 'claude';
		addWorker(state, kind);
		addToast('Worker added', 'success');
		return;
	}

	// :remove [index] - remove a worker by index
	if (cmd === 'remove' || cmd === 'rm') {
		const indexStr = parts[1];

		if (indexStr) {
			const index = Number.parseInt(indexStr, 10);
			if (!Number.isNaN(index) && index >= 0 && index < state.workerPanes.length) {
				removeWorker(state, index);
				addToast('Worker removed', 'info');
			}
		} else {
			// No index provided - remove focused worker
			if (state.workerPanes.length > 0) {
				removeWorker(state, state.focusedWorkerIndex);
				addToast('Worker removed', 'info');
			}
		}
		return;
	}

	// :focus <index> - focus a worker by index
	if (cmd === 'focus' || cmd === 'f') {
		const indexStr = parts[1];

		if (indexStr) {
			const index = Number.parseInt(indexStr, 10);
			if (!Number.isNaN(index) && index >= 0 && index < state.workerPanes.length) {
				state.focusedWorkerIndex = index;
				state.needsRender = true;
			}
		}
		return;
	}

	// :query <text> - RAG query (placeholder for now)
	if (cmd === 'query') {
		const queryText = parts.slice(1).join(' ');

		if (queryText) {
			// TODO: Implement RAG query
			// For now, just log to console (will show in status bar later)
			console.log(`RAG query: ${queryText}`);
		}
		return;
	}

	// Unknown command - silently ignore
	// Could show error in status bar in the future
}
