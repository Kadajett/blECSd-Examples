#!/usr/bin/env node
/**
 * MCP Stdio-to-HTTP Bridge
 *
 * Standalone script that bridges the MCP stdio transport to the orchestrator's
 * HTTP-based MCP server. Agent CLIs (Claude Code, Codex, etc.) spawn this as
 * their MCP server process, and it forwards tool calls to the orchestrator.
 *
 * Protocol: Reads newline-delimited JSON-RPC from stdin, writes responses to stdout.
 * The MCP `initialize` handshake is handled locally; `tools/list` and `tools/call`
 * are forwarded to the HTTP server.
 *
 * Env: BLECSD_MCP_PORT must be set to the orchestrator's HTTP server port.
 *
 * @module agent-orchestrator/mcp/bridge
 */

import { writeRaw } from 'blecsd';
import * as http from 'node:http';
import * as readline from 'node:readline';

const MCP_PORT_RAW = process.env['BLECSD_MCP_PORT'];
if (!MCP_PORT_RAW) {
	process.stderr.write('BLECSD_MCP_PORT not set\n');
	process.exit(1);
}
const MCP_PORT: string = MCP_PORT_RAW;

const BASE_URL = `http://127.0.0.1:${MCP_PORT}`;

// =============================================================================
// JSON-RPC HELPERS
// =============================================================================

interface JsonRpcMessage {
	jsonrpc: '2.0';
	id?: number | string;
	method?: string;
	params?: Record<string, unknown>;
	result?: unknown;
	error?: { code: number; message: string };
}

function sendResponse(id: number | string, result: unknown): void {
	const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
	writeRaw(msg + '\n');
}

function sendError(id: number | string, code: number, message: string): void {
	const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
	writeRaw(msg + '\n');
}

// =============================================================================
// HTTP FORWARDING
// =============================================================================

function forwardToServer(request: JsonRpcMessage): Promise<JsonRpcMessage> {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify(request);
		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: Number.parseInt(MCP_PORT, 10),
			path: '/mcp',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body),
			},
		};

		const req = http.request(options, (res) => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				try {
					const text = Buffer.concat(chunks).toString('utf8');
					resolve(JSON.parse(text) as JsonRpcMessage);
				} catch (err) {
					reject(err);
				}
			});
		});

		req.on('error', (err) => reject(err));
		req.write(body);
		req.end();
	});
}

// =============================================================================
// MCP PROTOCOL HANDLING
// =============================================================================

/** Handle the MCP initialize handshake locally. */
function handleInitialize(id: number | string): void {
	sendResponse(id, {
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

/** Handle an incoming JSON-RPC message. */
async function handleMessage(raw: string): Promise<void> {
	let msg: JsonRpcMessage;
	try {
		msg = JSON.parse(raw) as JsonRpcMessage;
	} catch (err) {
		process.stderr.write(`MCP bridge: malformed JSON-RPC message: ${err instanceof Error ? err.message : String(err)}\n`);
		return;
	}

	// Notifications (no id) don't need a response
	if (msg.id === undefined) {
		return;
	}

	const id = msg.id;
	const method = msg.method ?? '';

	// Handle initialize locally (MCP handshake)
	if (method === 'initialize') {
		handleInitialize(id);
		return;
	}

	// Forward tools/list and tools/call to the HTTP server
	if (method === 'tools/list' || method === 'tools/call') {
		try {
			const response = await forwardToServer(msg);
			// Relay the response with the original id
			if (response.error) {
				sendError(id, response.error.code, response.error.message);
			} else {
				sendResponse(id, response.result);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Bridge forwarding failed';
			sendError(id, -32000, message);
		}
		return;
	}

	// Unknown method
	sendError(id, -32601, `Method not found: ${method}`);
}

// =============================================================================
// MAIN LOOP
// =============================================================================

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return;
	handleMessage(trimmed).catch((err) => {
		process.stderr.write(`Bridge error: ${err}\n`);
	});
});

rl.on('close', () => {
	process.exit(0);
});
