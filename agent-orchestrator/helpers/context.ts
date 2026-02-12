/**
 * Context file and MCP config generation for orchestrator sessions.
 *
 * These files are written to the workspace directory so agents can
 * discover pane addresses, MCP endpoints, and available tools.
 *
 * @module agent-orchestrator/helpers/context
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { AppState } from '../types.js';

/**
 * Writes the MCP config file that agents use to discover the MCP server.
 *
 * @param workspace - Workspace directory path
 * @param port - MCP server port
 * @returns Path to the written config file
 */
export function writeMcpConfig(workspace: string, port: number): string {
	const bridgePath = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'..',
		'mcp',
		'bridge.ts',
	);

	const config = {
		mcpServers: {
			'blecsd-orchestrator': {
				command: 'npx',
				args: ['tsx', bridgePath],
				env: {
					BLECSD_MCP_PORT: String(port),
				},
			},
		},
	};

	const configPath = path.join(workspace, '.blecsd-mcp.json');
	fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
	return configPath;
}

/**
 * Writes the orchestrator context file for tmux mode.
 * Contains session info, pane addresses, and MCP tool documentation.
 *
 * @param session - Tmux session name
 * @param workspace - Workspace directory path
 * @param orchPane - Orchestrator pane ID
 * @param workerPanes - Worker pane IDs
 * @param mcpPort - MCP server port
 */
export function writeOrchestratorContext(
	session: string,
	workspace: string,
	orchPane: string,
	workerPanes: string[],
	mcpPort: number,
): void {
	const ctx = `# blECSd Orchestrator Context

## Session Info
- Tmux session: \`${session}\`
- Socket: \`blecsd\` (use \`tmux -L blecsd\` for raw commands)
- MCP server: \`http://127.0.0.1:${mcpPort}/mcp\`

## Pane Layout
- Orchestrator: \`${orchPane}\` (you are here)
${workerPanes.map((p, i) => `- Worker ${i + 1}: \`${p}\``).join('\n')}

## MCP Tools (preferred method)

You have MCP tools for controlling workers. Use these instead of raw tmux commands.

### send_prompt
Send text to a worker pane. **Enter is pressed automatically.**
\`\`\`json
{ "pane": "${workerPanes[0] ?? orchPane}", "text": "your prompt here" }
\`\`\`

### read_output
Capture the visible content of a pane.
\`\`\`json
{ "pane": "${workerPanes[0] ?? orchPane}" }
\`\`\`

### list_panes
List all panes with addresses, titles, and sizes. No arguments needed.

### add_worker
Split a pane to create a new worker agent.
\`\`\`json
{
	"agent": "claude",
	"name": "worker-research",
	"worktree": true
}
\`\`\`

### remove_worker
Kill a worker pane (cannot kill the orchestrator pane).
\`\`\`json
{
	"name": "worker-research",
	"cleanup_worktree": true
}
\`\`\`

### write_memory
Store a shared context key/value for all agents.
\`\`\`json
{
	"key": "decision:use-query-cache",
	"value": "Cache query results for 30s in worker loop.",
	"tags": "decision performance",
	"agent_id": "agent-2"
}
\`\`\`

### delete_memory
Delete obsolete shared context entries by key.
\`\`\`json
{ "key": "blocker:old-db-lock" }
\`\`\`

Memory tools support a full cycle: \`write_memory\`, \`list_memories\`, \`get_memory\`, \`query_memory\`, and \`delete_memory\`.

## Fallback: Raw Tmux Commands

\`\`\`bash
tmux -L blecsd send-keys -t ${session}:${workerPanes[0] ?? orchPane} -l "prompt" && tmux -L blecsd send-keys -t ${session}:${workerPanes[0] ?? orchPane} Enter
tmux -L blecsd capture-pane -t ${session}:${workerPanes[0] ?? orchPane} -p
tmux -L blecsd list-panes -t ${session} -F "#{window_index}.#{pane_index}: #{pane_title}"
\`\`\`
`;

	const contextPath = path.join(workspace, '.blecsd-orchestrator.md');
	fs.writeFileSync(contextPath, ctx, 'utf8');
}

/**
 * Writes the orchestrator context file for blECSd native mode.
 * Contains pane info, MCP tools, and keyboard shortcuts.
 *
 * @param workspace - Workspace directory path
 * @param state - Application state
 * @param mcpPort - MCP server port
 */
export function writeBlecsdOrchestratorContext(
	workspace: string,
	state: AppState,
	mcpPort: number,
): void {
	const workerIds = state.workerPanes.map((p) => p.agent.id);

	const ctx = `# blECSd Orchestrator Context

## Session Info
- Mode: blECSd native TUI
- MCP server: \`http://127.0.0.1:${mcpPort}/mcp\`

## Pane Layout
- Orchestrator: \`${state.orchestratorPane?.agent.id ?? 'none'}\`
${workerIds.map((id, i) => `- Worker ${i + 1}: \`${id}\``).join('\n')}

## MCP Tools

### send_prompt
Send text to a worker pane. **Enter is pressed automatically.**
\`\`\`json
{ "pane": "${workerIds[0] ?? ''}", "text": "your prompt here" }
\`\`\`

### read_output
Capture the visible content of a pane.
\`\`\`json
{ "pane": "${workerIds[0] ?? ''}" }
\`\`\`

### list_panes
List all panes. No arguments needed.

### add_worker
Create a new worker agent.
\`\`\`json
{
	"agent": "claude",
	"name": "worker-research",
	"worktree": true
}
\`\`\`

### remove_worker
Kill a worker pane (cannot kill the orchestrator pane).
\`\`\`json
{
	"name": "worker-research",
	"cleanup_worktree": true
}
\`\`\`

### write_memory
Store a shared context key/value for all agents.
\`\`\`json
{
	"key": "decision:use-query-cache",
	"value": "Cache query results for 30s in worker loop.",
	"tags": "decision performance",
	"agent_id": "${workerIds[0] ?? 'agent-1'}"
}
\`\`\`

### delete_memory
Delete obsolete shared context entries by key.
\`\`\`json
{ "key": "blocker:old-db-lock" }
\`\`\`

Memory tools support a full cycle: \`write_memory\`, \`list_memories\`, \`get_memory\`, \`query_memory\`, and \`delete_memory\`.

## Keyboard Shortcuts (tmux-style prefix: Ctrl+A)
- Ctrl+A: Enter prefix mode (one command key follows)
- Ctrl+A Tab: Cycle focus forward
- Ctrl+A Shift+Tab: Cycle focus backward
- Ctrl+A n: Add worker
- Ctrl+A d: Remove focused worker
- Ctrl+A m: Toggle memory sidebar
- Ctrl+A s: Focus sidebar
- Ctrl+A p: Command palette
- Ctrl+A i: Agent detail overlay
- Ctrl+A 0-9: Focus pane by index
- Ctrl+A :: Command mode
- Ctrl+A Ctrl+A: Send literal Ctrl+A
- Ctrl+Q: Quit (global)
- Mouse click: Focus pane (no prefix needed)
`;

	const contextPath = path.join(workspace, '.blecsd-orchestrator.md');
	fs.writeFileSync(contextPath, ctx, 'utf8');
}
