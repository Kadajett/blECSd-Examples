/**
 * Inter-agent communication - send text, update context files.
 *
 * @module agent-orchestrator/agents/communication
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppState, AgentPane } from '../types.js';

/**
 * Sends text input to an agent's terminal.
 *
 * @param pane - The agent pane to send text to
 * @param text - The text to send (newline will be appended)
 */
export function sendToAgent(pane: AgentPane, text: string): void {
	if (!pane.terminal.isRunning()) {
		return; // PTY is not running
	}

	pane.terminal.input(`${text}\n`);
}

/**
 * Sends text to a specific worker by ID.
 *
 * @param state - Application state
 * @param workerId - Worker agent ID
 * @param text - Text to send
 * @returns True if worker was found and text was sent
 */
export function sendToWorker(state: AppState, workerId: string, text: string): boolean {
	const pane = state.workerPanes.find((p) => p.agent.id === workerId);

	if (!pane) {
		return false; // Worker not found
	}

	sendToAgent(pane, text);
	return true;
}

/**
 * Sends text to the orchestrator.
 *
 * @param state - Application state
 * @param text - Text to send
 * @returns True if orchestrator exists and text was sent
 */
export function sendToOrchestrator(state: AppState, text: string): boolean {
	if (!state.orchestratorPane) {
		return false; // No orchestrator
	}

	sendToAgent(state.orchestratorPane, text);
	return true;
}

/**
 * Updates a context file in a worker's working directory.
 *
 * @param cwd - Working directory path
 * @param filename - Name of the context file
 * @param content - File content to write
 */
export function updateWorkerContextFile(cwd: string, filename: string, content: string): void {
	const filePath = path.join(cwd, filename);

	try {
		fs.writeFileSync(filePath, content, 'utf-8');
	} catch (err) {
		// Silently fail - worker will handle missing context gracefully
		console.error(`Failed to write context file: ${filePath}`, err);
	}
}

/**
 * Writes worker memory instructions to .blecsd-worker-context.md.
 *
 * @param cwd - Working directory path for the worker
 * @param workerName - Human-readable worker name
 * @param agentId - Worker agent ID
 */
export function writeWorkerMemoryContextFile(cwd: string, workerName: string, agentId: string): void {
	const content = `# blECSd Worker Memory Context

## Worker Identity
- Worker name: \`${workerName}\`
- Agent ID: \`${agentId}\`

Use \`agent_id: "${agentId}"\` when writing memory so ownership is attributed correctly.

## Memory Tools

### list_memories
Call this first to see existing shared context entries.
\`\`\`json
{ "limit": 50 }
\`\`\`

### query_memory
After listing, query task-relevant context and prior discoveries.
\`\`\`json
{ "query": "current task objective blockers decisions", "limit": 10 }
\`\`\`

### get_memory
Read one key directly when you know its exact name.
\`\`\`json
{ "key": "decision:phase-5-doc-format" }
\`\`\`

### write_memory
Persist important findings for all agents.
\`\`\`json
{
	"key": "discovery:worker-sync-issue",
	"value": "Worker output parser needs to ignore ANSI cursor sequences.",
	"tags": "parser output ansi",
	"agent_id": "${agentId}"
}
\`\`\`

### delete_memory
Remove obsolete or incorrect entries.
\`\`\`json
{ "key": "blocker:stale-path-config" }
\`\`\`

## Key Conventions
- Prefix keys with \`discovery:\` for facts learned while implementing.
- Prefix keys with \`decision:\` for architecture or implementation choices.
- Prefix keys with \`blocker:\` for issues preventing progress.

## Startup Instructions
1. Run \`list_memories\` first to scan current context.
2. Run \`query_memory\` next for your task, subsystem, and active blockers.
`;

	updateWorkerContextFile(cwd, '.blecsd-worker-context.md', content);
}
