/**
 * Type definitions for the Multi-Agent Orchestrator.
 *
 * @module agent-orchestrator/types
 */

import type { TerminalWidget } from 'blecsd/widgets';
import type { World } from 'blecsd';
import type { PaneBackend } from './backend/interface.js';

// =============================================================================
// AGENT TYPES
// =============================================================================

/** Supported agent kinds with their CLI commands and presets. */
export type AgentKind = 'claude' | 'codex' | 'gemini' | 'custom';

/** Agent lifecycle states. */
export type AgentStatus = 'starting' | 'running' | 'idle' | 'error' | 'stopped';

/** Metadata for a running agent (orchestrator or worker). */
export interface AgentInfo {
	readonly id: string;
	readonly kind: AgentKind;
	readonly label: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd: string;
	readonly env: Record<string, string>;
	status: AgentStatus;
	readonly spawnedAt: number;
	lastOutputAt: number;
	outputLineCount: number;
}

/** Configuration for spawning an agent. */
export interface AgentSpawnConfig {
	readonly kind: AgentKind;
	readonly label?: string;
	readonly command?: string;
	readonly args?: readonly string[];
	readonly cwd?: string;
	readonly env?: Record<string, string>;
	readonly mock?: boolean;
}

// =============================================================================
// WORKTREE TYPES
// =============================================================================

/** Git worktree information for a worker agent. */
export interface WorktreeInfo {
	readonly path: string;
	readonly branch: string;
	readonly name: string;
}

// =============================================================================
// PANE / GRID TYPES
// =============================================================================

/** A terminal pane in the grid layout. */
export interface AgentPane {
	terminal: TerminalWidget;
	agent: AgentInfo;
	x: number;
	y: number;
	width: number;
	height: number;
	gridRow: number;
	gridCol: number;
}

/** Grid dimensions for the worker area. */
export interface GridLayout {
	rows: number;
	cols: number;
}

// =============================================================================
// INPUT MODES
// =============================================================================

/** Three distinct input modes (tmux-style prefix key). */
export type InputMode = 'direct' | 'prefix' | 'command';

/** Which pane group is focused. */
export type FocusTarget = 'orchestrator' | 'worker';

/** Parsed input result. */
export interface ParsedInput {
	readonly key: string;
	readonly ctrl: boolean;
	readonly shift: boolean;
	readonly meta: boolean;
	readonly mouseX?: number;
	readonly mouseY?: number;
	readonly raw: string;
}

// =============================================================================
// APP STATE
// =============================================================================

/** Top-level application state. */
export interface AppState {
	readonly world: World;

	// Backend
	backend: PaneBackend | null;

	// Orchestrator
	orchestratorPane: AgentPane | null;

	// Workers
	workerPanes: AgentPane[];
	workerGrid: GridLayout;
	focusedWorkerIndex: number;

	// Focus
	focusTarget: FocusTarget;

	// UI state
	inputMode: InputMode;
	commandBuffer: string;
	screenWidth: number;
	screenHeight: number;
	running: boolean;
	needsRender: boolean;
	showCursor: boolean;

	// Memory sidebar
	sidebar: MemorySidebarState;

	// Overlay
	overlay: OverlayState;

	// Activity tracking for sparklines
	activity: ActivityTracker;

	// Database (optional, populated after DB init)
	db: unknown | null; // BetterSqlite3.Database
	ragIndex: unknown | null; // RagIndex
	dbOps: typeof import('./db/operations.js') | null;

	// Config
	readonly mockMode: boolean;
	readonly useTmux: boolean;
	readonly orchestratorKind: AgentKind;
	readonly workspacePath: string;
	readonly dbPath: string;

	// Counters
	nextAgentId: number;
}

/** CLI arguments parsed from process.argv. */
export interface CliArgs {
	readonly orchestrator: string;
	readonly workers: readonly string[];
	readonly mock: boolean;
	/** Use native blECSd terminal widgets instead of tmux (experimental). */
	readonly blecsd: boolean;
	/** Legacy: tmux is now the default. This flag is a no-op. */
	readonly tmux: boolean;
	readonly noSidebar: boolean;
	readonly workspace: string;
	readonly db: string;
}

// =============================================================================
// MEMORY SIDEBAR STATE
// =============================================================================

/** Which tab is active in the memory sidebar. */
export type SidebarTab = 'rag' | 'context' | 'search';

/** Memory sidebar state. */
export interface MemorySidebarState {
	visible: boolean;
	focused: boolean;
	tab: SidebarTab;
	scrollOffset: number;
	searchQuery: string;
	searchResults: readonly RagSearchResult[];
	width: number;
}

// =============================================================================
// OVERLAY STATE
// =============================================================================

/** Which overlay is active. */
export type OverlayKind = 'none' | 'command-palette' | 'agent-detail';

/** Overlay panel state. */
export interface OverlayState {
	kind: OverlayKind;
	searchQuery: string;
	selectedIndex: number;
	filteredItems: readonly string[];
}

// =============================================================================
// ACTIVITY TRACKING
// =============================================================================

/** Per-pane activity data for sparklines. */
export interface ActivityTracker {
	/** Per-second output counters, keyed by pane agent ID. */
	readonly counters: Map<string, number>;
	/** Last 60 data points per pane agent ID. */
	readonly history: Map<string, number[]>;
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

/** A shared context entry in the SQLite database. */
export interface SharedContextEntry {
	readonly id: number;
	readonly key: string;
	readonly value: string;
	readonly tags: string;
	readonly agentId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** An agent output log entry. */
export interface AgentOutputEntry {
	readonly id: number;
	readonly agentId: string;
	readonly line: string;
	readonly timestamp: string;
}

/** A RAG document chunk. */
export interface RagDocument {
	readonly id: number;
	readonly sourceAgentId: string;
	readonly chunk: string;
	readonly tokens: string;
	readonly createdAt: string;
}

/** An agent session record. */
export interface AgentSession {
	readonly id: number;
	readonly agentId: string;
	readonly kind: string;
	readonly label: string;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly status: string;
}

/** RAG search result with score. */
export interface RagSearchResult {
	readonly chunk: string;
	readonly sourceAgentId: string;
	readonly score: number;
}

// =============================================================================
// MCP TYPES
// =============================================================================

/** MCP JSON-RPC request. */
export interface McpRequest {
	readonly jsonrpc: '2.0';
	readonly id: number | string;
	readonly method: string;
	readonly params?: Record<string, unknown>;
}

/** MCP JSON-RPC response. */
export interface McpResponse {
	readonly jsonrpc: '2.0';
	readonly id: number | string;
	readonly result?: unknown;
	readonly error?: {
		readonly code: number;
		readonly message: string;
		readonly data?: unknown;
	};
}

/** MCP tool definition. */
export interface McpToolDef {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Record<string, unknown>;
}

/** MCP server state. */
export interface McpServerState {
	readonly port: number;
	readonly server: unknown;
}
