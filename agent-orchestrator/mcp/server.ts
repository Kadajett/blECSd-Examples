/**
 * HTTP-based MCP server for the agent orchestrator.
 *
 * Serves JSON-RPC 2.0 requests on localhost with dynamically assigned port.
 *
 * @module agent-orchestrator/mcp/server
 */

import * as http from 'node:http';
import { warn } from '../utils/logger.js';
import type {
	McpRequest,
	McpResponse,
	McpServerState,
	McpToolDef,
} from '../types.js';

/** Maximum number of port binding retries before giving up. */
const MAX_PORT_RETRIES = 5;

/** Parse JSON body from HTTP request. */
function parseRequestBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];

		req.on('data', (chunk: Buffer) => {
			chunks.push(chunk);
		});

		req.on('end', () => {
			try {
				const body = Buffer.concat(chunks).toString('utf8');
				if (body.length === 0) {
					resolve({});
					return;
				}
				resolve(JSON.parse(body));
			} catch (err) {
				reject(err);
			}
		});

		req.on('error', (err) => {
			reject(err);
		});
	});
}

/** Create a JSON-RPC success response. */
export function createJsonRpcResponse(
	id: number | string,
	result: unknown,
): McpResponse {
	return {
		jsonrpc: '2.0',
		id,
		result,
	};
}

/** Create a JSON-RPC error response. */
export function createJsonRpcError(
	id: number | string,
	code: number,
	message: string,
): McpResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: {
			code,
			message,
		},
	};
}

/** Handle a tools/list request. */
function handleToolsList(
	id: number | string,
	toolDefinitions: readonly McpToolDef[],
): McpResponse {
	return createJsonRpcResponse(id, { tools: toolDefinitions });
}

/** Handle a tools/call request. */
async function handleToolsCall(
	id: number | string,
	params: Record<string, unknown>,
	toolHandlers: ReadonlyMap<string, (params: Record<string, unknown>) => unknown>,
): Promise<McpResponse> {
	const name = params['name'];
	if (typeof name !== 'string') {
		return createJsonRpcError(id, -32602, 'Missing or invalid tool name');
	}

	const handler = toolHandlers.get(name);
	if (!handler) {
		return createJsonRpcError(id, -32601, `Unknown tool: ${name}`);
	}

	const args = params['arguments'];
	if (!args || typeof args !== 'object' || Array.isArray(args)) {
		return createJsonRpcError(id, -32602, 'Invalid arguments');
	}

	try {
		const result = await handler(args as Record<string, unknown>);
		return createJsonRpcResponse(id, result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Tool execution failed';
		return createJsonRpcError(id, -32000, message);
	}
}

/** Handle the MCP initialize handshake. */
function handleInitialize(id: number | string): McpResponse {
	return createJsonRpcResponse(id, {
		protocolVersion: '2024-11-05',
		capabilities: {
			tools: {},
		},
		serverInfo: {
			name: 'blecsd-orchestrator',
			version: '0.1.0',
		},
	});
}

/** Handle a JSON-RPC request. */
async function handleRequest(
	req: McpRequest,
	toolDefinitions: readonly McpToolDef[],
	toolHandlers: ReadonlyMap<string, (params: Record<string, unknown>) => unknown>,
): Promise<McpResponse> {
	const { id, method, params = {} } = req;

	// MCP protocol handshake
	if (method === 'initialize') {
		return handleInitialize(id);
	}

	// Notifications that don't need a response (return empty success)
	if (method === 'notifications/initialized') {
		return createJsonRpcResponse(id, {});
	}

	if (method === 'tools/list') {
		return handleToolsList(id, toolDefinitions);
	}

	if (method === 'tools/call') {
		return await handleToolsCall(id, params, toolHandlers);
	}

	return createJsonRpcError(id, -32601, `Unknown method: ${method}`);
}

/** Create HTTP request listener for the MCP server. */
function createRequestListener(
	toolDefinitions: readonly McpToolDef[],
	toolHandlers: ReadonlyMap<string, (params: Record<string, unknown>) => unknown>,
): (req: http.IncomingMessage, res: http.ServerResponse) => void {
	return (req, res) => {
		// CORS headers for potential browser clients
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

		// Handle OPTIONS preflight
		if (req.method === 'OPTIONS') {
			res.writeHead(204);
			res.end();
			return;
		}

		// Only accept POST to /mcp
		if (req.method !== 'POST' || req.url !== '/mcp') {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}

		// Parse and handle request
		parseRequestBody(req)
			.then(async (body) => {
				// Validate JSON-RPC request structure
				if (
					!body ||
					typeof body !== 'object' ||
					Array.isArray(body) ||
					(body as Record<string, unknown>)['jsonrpc'] !== '2.0'
				) {
					const response = createJsonRpcError(
						0,
						-32600,
						'Invalid JSON-RPC request',
					);
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(response));
					return;
				}

				const mcpRequest = body as McpRequest;
				const response = await handleRequest(mcpRequest, toolDefinitions, toolHandlers);

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			})
			.catch((err) => {
				const message = err instanceof Error ? err.message : 'Failed to parse request';
				const response = createJsonRpcError(0, -32700, message);
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(response));
			});
	};
}

/**
 * Attempts to bind an HTTP server to a specific port.
 *
 * @param listener - HTTP request listener
 * @param port - Port to bind (0 for OS-assigned)
 * @returns Server state with assigned port
 */
function tryBindPort(
	listener: (req: http.IncomingMessage, res: http.ServerResponse) => void,
	port: number,
): Promise<McpServerState> {
	return new Promise((resolve, reject) => {
		const server = http.createServer(listener);

		server.on('error', (err) => {
			// Close the server to free resources before rejecting
			server.close();
			reject(err);
		});

		server.listen(port, '127.0.0.1', () => {
			const addr = server.address();
			if (!addr || typeof addr === 'string') {
				server.close();
				reject(new Error('Failed to get server address'));
				return;
			}

			resolve({
				port: addr.port,
				server,
			});
		});
	});
}

/**
 * Start an MCP server on localhost with a dynamically assigned port.
 * Retries up to 5 times on EADDRINUSE before giving up.
 *
 * @param toolDefinitions - Array of tool definitions to expose
 * @param toolHandlers - Map of tool names to handler functions
 * @returns Server state with assigned port
 */
export async function startMcpServer(
	toolDefinitions: readonly McpToolDef[],
	toolHandlers: ReadonlyMap<string, (params: Record<string, unknown>) => unknown>,
): Promise<McpServerState> {
	const listener = createRequestListener(toolDefinitions, toolHandlers);
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
		try {
			// Port 0 lets the OS assign a free port
			const state = await tryBindPort(listener, 0);
			return state;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			const code = (err as NodeJS.ErrnoException).code;

			if (code !== 'EADDRINUSE' && code !== 'EACCES') {
				throw lastError;
			}

			warn(
				`MCP server port bind failed (attempt ${attempt + 1}/${MAX_PORT_RETRIES})`,
				lastError,
				'mcp',
			);
		}
	}

	throw lastError ?? new Error('MCP server failed to bind after retries');
}

/**
 * Stop the MCP server.
 *
 * @param serverState - Server state from startMcpServer
 */
export function stopMcpServer(serverState: McpServerState): Promise<void> {
	return new Promise((resolve, reject) => {
		const server = serverState.server as http.Server;
		server.close((err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
