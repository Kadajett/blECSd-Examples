/**
 * Orchestrator agent management.
 *
 * Writes an MCP config file to the workspace before spawning, so the
 * orchestrator agent can discover and call the stdio bridge which proxies
 * to the HTTP-based MCP server.
 *
 * @module agent-orchestrator/agents/orchestrator
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppState, AgentPane, AgentKind } from '../types.js';
import { parseAgentSpec } from '../config.js';
import { spawnAgent } from './lifecycle.js';

/** Filename for the MCP config written into the workspace. */
const MCP_CONFIG_FILENAME = '.blecsd-mcp.json';

/**
 * Resolves the path to the bridge script. In dev mode (tsx) it points at
 * the TypeScript source; after a build it points at the compiled JS.
 *
 * @returns Absolute path to the bridge script
 */
function resolveBridgePath(): string {
	// __dirname equivalent for ESM: use import.meta.url
	const thisDir = path.dirname(new URL(import.meta.url).pathname);
	// Try compiled first, fall back to source
	const compiled = path.resolve(thisDir, '..', 'dist', 'bridge.js');
	if (fs.existsSync(compiled)) return compiled;
	return path.resolve(thisDir, '..', 'mcp', 'bridge.ts');
}

/**
 * Writes an MCP config file that Claude Code / Codex / Gemini can load.
 *
 * The config tells the agent CLI to spawn a bridge process (via tsx or node)
 * that proxies JSON-RPC over stdio to the orchestrator's HTTP MCP server.
 *
 * @param workspacePath - Directory to write the config into
 * @param mcpPort - The HTTP MCP server port
 * @returns Absolute path to the written config file
 */
export function writeMcpConfigFile(workspacePath: string, mcpPort: number): string {
	const bridgePath = resolveBridgePath();
	const configPath = path.join(workspacePath, MCP_CONFIG_FILENAME);

	// Determine runner: tsx for .ts source, node for compiled .js
	const isTsSource = bridgePath.endsWith('.ts');
	const runner = isTsSource ? 'tsx' : 'node';

	const config = {
		mcpServers: {
			'blecsd-orchestrator': {
				command: runner,
				args: [bridgePath],
				env: {
					BLECSD_MCP_PORT: mcpPort.toString(),
				},
			},
		},
	};

	fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
	return configPath;
}

/**
 * Builds MCP-related environment variables for an agent.
 *
 * @param port - MCP server port
 * @returns Environment variables for MCP integration
 */
export function buildMcpEnv(port: number): Record<string, string> {
	return {
		BLECSD_MCP_PORT: port.toString(),
	};
}

/**
 * Spawns the orchestrator agent in the left pane.
 *
 * If an MCP port is provided, writes a config file and passes the
 * appropriate CLI flag so the orchestrator can call MCP tools.
 *
 * @param state - Application state
 * @param mcpPort - MCP server port (0 or undefined to skip MCP)
 * @returns The created orchestrator pane
 */
export function spawnOrchestrator(state: AppState, mcpPort?: number): AgentPane {
	const preset = parseAgentSpec(state.orchestratorKind);
	const args = [...preset.args];
	const extraEnv: Record<string, string> = {};

	// Write MCP config and add CLI flags if MCP is available
	if (mcpPort && mcpPort > 0) {
		const configPath = writeMcpConfigFile(state.workspacePath, mcpPort);
		extraEnv.BLECSD_MCP_PORT = mcpPort.toString();

		if (state.orchestratorKind === 'claude') {
			// Claude Code: --mcp-config <path>
			args.push('--mcp-config', configPath);
		} else if (state.orchestratorKind === 'codex') {
			// Codex: pass config path via env (agent-specific)
			extraEnv.CODEX_MCP_CONFIG = configPath;
		} else if (state.orchestratorKind === 'gemini') {
			// Gemini: pass config path via env (agent-specific)
			extraEnv.GEMINI_MCP_CONFIG = configPath;
		}
	}

	// Spawn the orchestrator
	const pane = spawnAgent(state, {
		kind: state.orchestratorKind,
		label: `${preset.label} (Orchestrator)`,
		command: preset.command,
		args,
		cwd: state.workspacePath,
		env: {
			...preset.env,
			...extraEnv,
		},
		mock: state.mockMode,
	});

	// Assign to state
	state.orchestratorPane = pane;

	return pane;
}
