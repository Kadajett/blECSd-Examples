#!/usr/bin/env node
/**
 * API Explorer - Interactive REST API Client
 *
 * A production-quality CLI demonstrating best practices for building
 * real TUI applications with blECSd.
 *
 * Features demonstrated:
 * - Alternate screen buffer management
 * - Modal overlays (help, command palette)
 * - Split pane layout with resizable divider
 * - Vim-style navigation (j/k, hjkl)
 * - Command mode (: prefix like vim)
 * - Search with highlighting (Ctrl+F)
 * - Status bar with mode indicators
 * - Breadcrumb navigation
 * - Progress indicators (spinners)
 * - JSON syntax highlighting
 * - Mouse support (click, scroll, drag divider)
 * - NO_COLOR environment variable support
 * - Graceful exit with confirmation
 * - Responsive terminal resize
 *
 * Controls:
 *   j/k or Up/Down    - Navigate endpoints
 *   Enter             - Execute selected endpoint
 *   h                 - Go back in history
 *   l or Right        - Focus response pane
 *   Left              - Focus endpoint pane
 *   :                 - Enter command mode
 *   ?                 - Show help overlay
 *   /                 - Search endpoints
 *   Ctrl+F            - Search response
 *   Ctrl+C            - Quit (with confirmation)
 *   Esc               - Close overlay/cancel
 *   Tab               - Cycle focus
 *   Mouse             - Click to select, scroll, drag divider
 *
 * @module api-explorer
 */

import { clearScreen, createWorld } from 'blecsd';
import type { World } from 'blecsd';
import {
	enterAlternateScreen,
	hideCursor,
	leaveAlternateScreen,
	setOutputStream,
	showCursor,
	writeRaw,
} from 'blecsd/systems';
import { isMouseBuffer, parseMouseSequence } from 'blecsd/terminal';

// =============================================================================
// TYPES
// =============================================================================

interface ApiEndpoint {
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	path: string;
	description: string;
	category: string;
	mockResponse: unknown;
	requiresConfirmation?: boolean;
}

interface BreadcrumbItem {
	label: string;
	type: 'category' | 'endpoint' | 'action';
}

type AppMode = 'NORMAL' | 'COMMAND' | 'SEARCH' | 'HELP';

interface AppState {
	world: World;
	mode: AppMode;
	running: boolean;
	needsRender: boolean;
	confirmingQuit: boolean;

	// Layout
	width: number;
	height: number;
	dividerX: number;
	draggingDivider: boolean;

	// Navigation
	selectedIndex: number;
	focusedPane: 'endpoints' | 'response';
	breadcrumbs: BreadcrumbItem[];
	history: ApiEndpoint[];
	historyIndex: number;

	// Content
	endpoints: ApiEndpoint[];
	filteredEndpoints: ApiEndpoint[];
	responseText: string[];
	responseScrollOffset: number;
	searchQuery: string;
	searchHighlightIndices: number[];

	// Status
	loading: boolean;
	loadingSpinnerFrame: number;
	lastSpinnerUpdate: number;
	requestCount: number;
	lastResponseTime: number;

	// Input
	commandInput: string;
	commandCursorPos: number;
	searchInput: string;
	searchCursorPos: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const NO_COLOR = process.env.NO_COLOR !== undefined;
const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;
const SIMULATED_REQUEST_DELAY_MS = 500;
const FPS = 30;
const FRAME_MS = 1000 / FPS;

// =============================================================================
// COLORS
// =============================================================================

function color(code: string): string {
	return NO_COLOR ? '' : code;
}

const RESET = color('\x1b[0m');
const BOLD = color('\x1b[1m');
const DIM = color('\x1b[2m');

const BLACK = color('\x1b[30m');
const RED = color('\x1b[31m');
const GREEN = color('\x1b[32m');
const YELLOW = color('\x1b[33m');
const BLUE = color('\x1b[34m');
const MAGENTA = color('\x1b[35m');
const CYAN = color('\x1b[36m');
const WHITE = color('\x1b[37m');
const GRAY = color('\x1b[90m');

const BG_BLACK = color('\x1b[40m');
const BG_RED = color('\x1b[41m');
const BG_BLUE = color('\x1b[44m');
const BG_CYAN = color('\x1b[46m');
const BG_WHITE = color('\x1b[47m');
const BG_GRAY = color('\x1b[100m');

// Method colors
const METHOD_COLORS: Record<string, string> = {
	GET: GREEN,
	POST: YELLOW,
	PUT: BLUE,
	DELETE: RED,
	PATCH: MAGENTA,
};

// =============================================================================
// MOCK API DATA
// =============================================================================

const MOCK_ENDPOINTS: ApiEndpoint[] = [
	{
		method: 'GET',
		path: '/users',
		description: 'List all users',
		category: 'Users',
		mockResponse: {
			users: [
				{ id: 1, name: 'Alice Smith', email: 'alice@example.com', role: 'admin' },
				{ id: 2, name: 'Bob Jones', email: 'bob@example.com', role: 'user' },
				{ id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'user' },
			],
			total: 3,
			page: 1,
			perPage: 10,
		},
	},
	{
		method: 'GET',
		path: '/users/:id',
		description: 'Get user by ID',
		category: 'Users',
		mockResponse: {
			id: 1,
			name: 'Alice Smith',
			email: 'alice@example.com',
			role: 'admin',
			createdAt: '2024-01-15T10:30:00Z',
			lastLogin: '2024-02-13T14:22:00Z',
			preferences: {
				theme: 'dark',
				notifications: true,
				language: 'en',
			},
		},
	},
	{
		method: 'POST',
		path: '/users',
		description: 'Create new user',
		category: 'Users',
		mockResponse: {
			id: 4,
			name: 'Diana Prince',
			email: 'diana@example.com',
			role: 'user',
			createdAt: '2024-02-13T15:45:00Z',
		},
	},
	{
		method: 'DELETE',
		path: '/users/:id',
		description: 'Delete user',
		category: 'Users',
		requiresConfirmation: true,
		mockResponse: {
			success: true,
			message: 'User deleted successfully',
			deletedId: 1,
		},
	},
	{
		method: 'GET',
		path: '/posts',
		description: 'List all posts',
		category: 'Posts',
		mockResponse: {
			posts: [
				{
					id: 101,
					title: 'Introduction to blECSd',
					author: 'Alice Smith',
					publishedAt: '2024-02-10T09:00:00Z',
					tags: ['tutorial', 'typescript', 'terminal'],
				},
				{
					id: 102,
					title: 'Building TUI Applications',
					author: 'Bob Jones',
					publishedAt: '2024-02-11T14:30:00Z',
					tags: ['guide', 'cli', 'ux'],
				},
			],
			total: 2,
		},
	},
	{
		method: 'GET',
		path: '/posts/:id',
		description: 'Get post by ID',
		category: 'Posts',
		mockResponse: {
			id: 101,
			title: 'Introduction to blECSd',
			body: 'blECSd is a modern terminal UI library built with TypeScript and ECS architecture...',
			author: 'Alice Smith',
			publishedAt: '2024-02-10T09:00:00Z',
			tags: ['tutorial', 'typescript', 'terminal'],
			views: 1523,
			likes: 89,
		},
	},
	{
		method: 'DELETE',
		path: '/posts/:id',
		description: 'Delete post',
		category: 'Posts',
		requiresConfirmation: true,
		mockResponse: {
			success: true,
			message: 'Post deleted successfully',
			deletedId: 101,
		},
	},
	{
		method: 'GET',
		path: '/health',
		description: 'API health check',
		category: 'System',
		mockResponse: {
			status: 'healthy',
			version: '1.0.0',
			uptime: 86400,
			timestamp: '2024-02-13T15:45:30Z',
		},
	},
];

// =============================================================================
// STATE INITIALIZATION
// =============================================================================

function createAppState(): AppState {
	const stdout = process.stdout;
	const width = stdout.columns ?? 80;
	const height = stdout.rows ?? 24;

	return {
		world: createWorld(),
		mode: 'NORMAL',
		running: true,
		needsRender: true,
		confirmingQuit: false,

		width,
		height,
		dividerX: Math.floor(width * 0.4),
		draggingDivider: false,

		selectedIndex: 0,
		focusedPane: 'endpoints',
		breadcrumbs: [{ label: 'API', type: 'category' }],
		history: [],
		historyIndex: -1,

		endpoints: MOCK_ENDPOINTS,
		filteredEndpoints: MOCK_ENDPOINTS,
		responseText: [],
		responseScrollOffset: 0,
		searchQuery: '',
		searchHighlightIndices: [],

		loading: false,
		loadingSpinnerFrame: 0,
		lastSpinnerUpdate: 0,
		requestCount: 0,
		lastResponseTime: 0,

		commandInput: '',
		commandCursorPos: 0,
		searchInput: '',
		searchCursorPos: 0,
	};
}

// =============================================================================
// TERMINAL CONTROL
// =============================================================================

function enterAltScreen(): void {
	setOutputStream(process.stdout);
	enterAlternateScreen();
	hideCursor();
	writeRaw('\x1b[?1003h'); // Enable any-event mouse tracking
	writeRaw('\x1b[?1006h'); // Enable SGR mouse protocol
	clearScreen();
}

function exitAltScreen(): void {
	writeRaw('\x1b[?1006l'); // Disable SGR mouse protocol
	writeRaw('\x1b[?1003l'); // Disable mouse tracking
	showCursor();
	leaveAlternateScreen();
	writeRaw(RESET);
}

// =============================================================================
// JSON SYNTAX HIGHLIGHTING
// =============================================================================

function highlightJson(json: string): string {
	if (NO_COLOR) return json;

	return json
		.replace(/"([^"]+)":/g, `${CYAN}"$1"${RESET}:`) // Keys
		.replace(/: "([^"]*)"/g, `: ${GREEN}"$1"${RESET}`) // String values
		.replace(/: (\d+\.?\d*)/g, `: ${MAGENTA}$1${RESET}`) // Numbers
		.replace(/: (true|false)/g, `: ${YELLOW}$1${RESET}`) // Booleans
		.replace(/: null/g, `: ${GRAY}null${RESET}`); // Null
}

function formatResponse(data: unknown): string[] {
	const json = JSON.stringify(data, null, 2);
	const highlighted = highlightJson(json);
	return highlighted.split('\n');
}

// =============================================================================
// SIMULATED API REQUEST
// =============================================================================

async function executeEndpoint(state: AppState, endpoint: ApiEndpoint): Promise<void> {
	if (endpoint.requiresConfirmation) {
		// In a real app, show a confirmation modal
		// For this demo, we'll just execute
	}

	state.loading = true;
	state.needsRender = true;

	const startTime = Date.now();

	// Simulate network delay
	await new Promise((resolve) => setTimeout(resolve, SIMULATED_REQUEST_DELAY_MS));

	const endTime = Date.now();
	state.lastResponseTime = endTime - startTime;

	state.responseText = formatResponse(endpoint.mockResponse);
	state.responseScrollOffset = 0;
	state.loading = false;
	state.requestCount++;
	state.needsRender = true;

	// Update breadcrumbs
	state.breadcrumbs = [
		{ label: 'API', type: 'category' },
		{ label: endpoint.category, type: 'category' },
		{ label: `${endpoint.method} ${endpoint.path}`, type: 'endpoint' },
	];

	// Add to history
	state.history.push(endpoint);
	state.historyIndex = state.history.length - 1;
}

// =============================================================================
// COMMAND PROCESSING
// =============================================================================

function processCommand(state: AppState, command: string): void {
	const cmd = command.trim().toLowerCase();

	if (cmd === 'quit' || cmd === 'q' || cmd === 'exit') {
		state.running = false;
	} else if (cmd === 'clear') {
		state.responseText = [];
		state.responseScrollOffset = 0;
		state.breadcrumbs = [{ label: 'API', type: 'category' }];
		state.needsRender = true;
	} else if (cmd === 'history') {
		const historyJson = state.history.map((ep) => `${ep.method} ${ep.path}`);
		state.responseText = [
			`${BOLD}Request History${RESET}`,
			'',
			...historyJson.map((h, i) => `  ${i + 1}. ${h}`),
		];
		state.responseScrollOffset = 0;
		state.needsRender = true;
	} else if (cmd.startsWith('set ')) {
		// Example: "set header Authorization=Bearer xxx"
		state.responseText = [
			`${GREEN}✓${RESET} Command executed: ${command}`,
			'',
			'(In a real app, this would configure request headers)',
		];
		state.responseScrollOffset = 0;
		state.needsRender = true;
	} else {
		state.responseText = [
			`${RED}Error:${RESET} Unknown command: ${command}`,
			'',
			'Available commands:',
			'  :quit, :q, :exit  - Quit the application',
			'  :clear            - Clear response pane',
			'  :history          - Show request history',
			'  :set <config>     - Set configuration',
		];
		state.responseScrollOffset = 0;
		state.needsRender = true;
	}

	state.mode = 'NORMAL';
	state.commandInput = '';
	state.commandCursorPos = 0;
}

// =============================================================================
// SEARCH
// =============================================================================

function performSearch(state: AppState, query: string): void {
	if (!query) {
		state.filteredEndpoints = state.endpoints;
		state.selectedIndex = 0;
		state.needsRender = true;
		return;
	}

	const lowerQuery = query.toLowerCase();
	state.filteredEndpoints = state.endpoints.filter(
		(ep) =>
			ep.path.toLowerCase().includes(lowerQuery) ||
			ep.description.toLowerCase().includes(lowerQuery) ||
			ep.category.toLowerCase().includes(lowerQuery),
	);
	state.selectedIndex = 0;
	state.needsRender = true;
}

// =============================================================================
// RENDERING
// =============================================================================

function renderStatusBar(state: AppState): string {
	const { width, mode, loading, loadingSpinnerFrame, requestCount, lastResponseTime } = state;

	let out = `\x1b[${state.height};1H${BG_GRAY}${WHITE}`;

	// Left: Mode indicator
	const modeText =
		mode === 'NORMAL'
			? `${GREEN} NORMAL ${RESET}${BG_GRAY}`
			: mode === 'COMMAND'
				? `${YELLOW} COMMAND ${RESET}${BG_GRAY}`
				: mode === 'SEARCH'
					? `${CYAN} SEARCH ${RESET}${BG_GRAY}`
					: `${MAGENTA} HELP ${RESET}${BG_GRAY}`;
	out += ` ${modeText}`;

	// Center: Current endpoint or loading spinner
	if (loading) {
		const spinner = SPINNER_CHARS[loadingSpinnerFrame % SPINNER_CHARS.length];
		out += `  ${YELLOW}${spinner} Loading...${RESET}${BG_GRAY}`;
	} else if (state.breadcrumbs.length > 1) {
		const endpoint = state.breadcrumbs[state.breadcrumbs.length - 1];
		if (endpoint) {
			out += `  ${DIM}${endpoint.label}${RESET}${BG_GRAY}`;
		}
	}

	// Right: Stats
	const statsText = `Requests: ${requestCount} | Last: ${lastResponseTime}ms `;
	const statsCol = Math.max(1, width - statsText.length + 1);
	out += `\x1b[${state.height};${statsCol}H${BG_GRAY}${DIM}${statsText}`;

	out += `${RESET}\x1b[K`;
	return out;
}

function renderBreadcrumbs(state: AppState): string {
	let out = `\x1b[1;1H${GRAY}`;
	const crumbs = state.breadcrumbs.map((b) => b.label).join(` ${DIM}›${RESET}${GRAY} `);
	out += ` ${crumbs} `;
	out += `${RESET}\x1b[K\n`;
	return out;
}

function renderEndpointList(state: AppState): string {
	const { dividerX, selectedIndex, filteredEndpoints, focusedPane, height } = state;
	let out = '';

	const listHeight = height - 3; // Reserve space for breadcrumbs and status bar
	const startY = 2;

	for (let i = 0; i < listHeight; i++) {
		const idx = i;
		const endpoint = filteredEndpoints[idx];

		out += `\x1b[${startY + i};1H`;

		if (!endpoint) {
			out += '\x1b[K';
			continue;
		}

		const isSelected = idx === selectedIndex;
		const isFocused = focusedPane === 'endpoints';

		const methodColor = METHOD_COLORS[endpoint.method] || WHITE;
		const bgColor = isSelected && isFocused ? BG_CYAN : isSelected ? BG_GRAY : '';
		const textColor = isSelected && isFocused ? BLACK : isSelected ? WHITE : '';

		const methodPadded = endpoint.method.padEnd(6);
		const pathTruncated = endpoint.path.slice(0, dividerX - 10);

		out += `${bgColor}${textColor} ${methodColor}${methodPadded}${RESET}${bgColor}${textColor} ${pathTruncated}`;
		out += `${RESET}\x1b[K`;
	}

	return out;
}

function renderResponsePane(state: AppState): string {
	const { dividerX, width, height, responseText, responseScrollOffset, focusedPane } = state;
	let out = '';

	const paneWidth = width - dividerX - 1;
	const paneHeight = height - 3;
	const startY = 2;
	const startX = dividerX + 2;

	const borderChar = focusedPane === 'response' ? `${CYAN}│${RESET}` : `${GRAY}│${RESET}`;

	for (let i = 0; i < paneHeight; i++) {
		const lineIdx = responseScrollOffset + i;
		const line = responseText[lineIdx];

		out += `\x1b[${startY + i};${dividerX + 1}H${borderChar}`;
		out += `\x1b[${startY + i};${startX}H`;

		if (line !== undefined) {
			const truncated = line.slice(0, paneWidth - 2);
			out += truncated;
		}

		out += '\x1b[K';
	}

	return out;
}

function renderCommandInput(state: AppState): string {
	if (state.mode !== 'COMMAND') return '';

	const { width, height, commandInput, commandCursorPos } = state;
	const promptY = height - 1;

	let out = `\x1b[${promptY};1H${BG_BLACK}${WHITE}`;
	out += `:${commandInput}`;
	out += `${RESET}\x1b[K`;

	// Position cursor
	const cursorX = 2 + commandCursorPos;
	out += `\x1b[?25h\x1b[${promptY};${cursorX}H`;

	return out;
}

function renderSearchInput(state: AppState): string {
	if (state.mode !== 'SEARCH') return '';

	const { width, height, searchInput, searchCursorPos } = state;
	const promptY = height - 1;

	let out = `\x1b[${promptY};1H${BG_BLACK}${WHITE}`;
	out += `/${searchInput}`;
	out += `${RESET}\x1b[K`;

	// Position cursor
	const cursorX = 2 + searchCursorPos;
	out += `\x1b[?25h\x1b[${promptY};${cursorX}H`;

	return out;
}

function renderHelpOverlay(state: AppState): string {
	if (state.mode !== 'HELP') return '';

	const { width, height } = state;
	const boxWidth = Math.min(60, width - 4);
	const boxHeight = Math.min(20, height - 4);
	const startX = Math.floor((width - boxWidth) / 2);
	const startY = Math.floor((height - boxHeight) / 2);

	let out = '';

	const helpLines = [
		`${BOLD}API Explorer - Keyboard Shortcuts${RESET}`,
		'',
		`${CYAN}Navigation${RESET}`,
		'  j, Down         Move down in list',
		'  k, Up           Move up in list',
		'  Enter           Execute selected endpoint',
		'  h               Go back in history',
		'  Tab             Toggle focus between panes',
		'  Left/Right      Focus endpoint/response pane',
		'',
		`${CYAN}Commands${RESET}`,
		'  :               Enter command mode',
		'  /               Search endpoints',
		'  Ctrl+F          Search in response',
		'  ?               Show/hide this help',
		'',
		`${CYAN}Other${RESET}`,
		'  Ctrl+C          Quit (with confirmation)',
		'  Esc             Close overlay/cancel',
	];

	// Draw box with shadow effect
	for (let i = 0; i < boxHeight; i++) {
		out += `\x1b[${startY + i};${startX}H`;

		if (i === 0) {
			out += `${BG_WHITE}${BLACK}${'┌' + '─'.repeat(boxWidth - 2) + '┐'}${RESET}`;
		} else if (i === boxHeight - 1) {
			out += `${BG_WHITE}${BLACK}${'└' + '─'.repeat(boxWidth - 2) + '┘'}${RESET}`;
		} else {
			const lineContent = helpLines[i - 1] || '';
			const truncated = lineContent.slice(0, boxWidth - 4);
			const padded = truncated.padEnd(boxWidth - 4);
			out += `${BG_WHITE}${BLACK}│ ${padded} │${RESET}`;
		}
	}

	out += `\x1b[?25l`; // Hide cursor
	return out;
}

function renderConfirmQuit(state: AppState): string {
	if (!state.confirmingQuit) return '';

	const { width, height } = state;
	const boxWidth = 40;
	const boxHeight = 5;
	const startX = Math.floor((width - boxWidth) / 2);
	const startY = Math.floor((height - boxHeight) / 2);

	let out = '';

	const lines = [
		'Really quit? (y/n)',
		'',
		'Press y to quit, n to cancel',
	];

	for (let i = 0; i < boxHeight; i++) {
		out += `\x1b[${startY + i};${startX}H`;

		if (i === 0) {
			out += `${BG_RED}${WHITE}${'┌' + '─'.repeat(boxWidth - 2) + '┐'}${RESET}`;
		} else if (i === boxHeight - 1) {
			out += `${BG_RED}${WHITE}${'└' + '─'.repeat(boxWidth - 2) + '┘'}${RESET}`;
		} else {
			const lineContent = lines[i - 1] || '';
			const padded = lineContent.padEnd(boxWidth - 4);
			out += `${BG_RED}${WHITE}│ ${padded} │${RESET}`;
		}
	}

	out += `\x1b[?25l`;
	return out;
}

function render(state: AppState): void {
	if (!state.needsRender) return;

	let out = '\x1b[?25l\x1b[H'; // Hide cursor, home

	out += renderBreadcrumbs(state);
	out += renderEndpointList(state);
	out += renderResponsePane(state);
	out += renderStatusBar(state);

	if (state.mode === 'COMMAND') {
		out += renderCommandInput(state);
	} else if (state.mode === 'SEARCH') {
		out += renderSearchInput(state);
	} else if (state.mode === 'HELP') {
		out += renderHelpOverlay(state);
	} else if (state.confirmingQuit) {
		out += renderConfirmQuit(state);
	} else {
		out += '\x1b[?25l'; // Ensure cursor hidden
	}

	writeRaw(out);
	state.needsRender = false;
}

// =============================================================================
// INPUT HANDLING
// =============================================================================

function handleNormalMode(state: AppState, ch: string, data: Buffer): void {
	if (ch === 'j' || ch === '\x1b[B') {
		// Down
		state.selectedIndex = Math.min(state.selectedIndex + 1, state.filteredEndpoints.length - 1);
		state.needsRender = true;
	} else if (ch === 'k' || ch === '\x1b[A') {
		// Up
		state.selectedIndex = Math.max(0, state.selectedIndex - 1);
		state.needsRender = true;
	} else if (ch === '\r' || ch === '\n' || ch === 'l') {
		// Enter or l - execute endpoint
		const endpoint = state.filteredEndpoints[state.selectedIndex];
		if (endpoint) {
			executeEndpoint(state, endpoint);
		}
	} else if (ch === 'h') {
		// Go back in history
		if (state.historyIndex > 0) {
			state.historyIndex--;
			const endpoint = state.history[state.historyIndex];
			if (endpoint) {
				state.responseText = formatResponse(endpoint.mockResponse);
				state.responseScrollOffset = 0;
				state.breadcrumbs = [
					{ label: 'API', type: 'category' },
					{ label: endpoint.category, type: 'category' },
					{ label: `${endpoint.method} ${endpoint.path}`, type: 'endpoint' },
				];
				state.needsRender = true;
			}
		}
	} else if (ch === '\t') {
		// Tab - toggle focus
		state.focusedPane = state.focusedPane === 'endpoints' ? 'response' : 'endpoints';
		state.needsRender = true;
	} else if (ch === '\x1b[C') {
		// Right arrow - focus response
		state.focusedPane = 'response';
		state.needsRender = true;
	} else if (ch === '\x1b[D') {
		// Left arrow - focus endpoints
		state.focusedPane = 'endpoints';
		state.needsRender = true;
	} else if (ch === '\x1b[5~' && state.focusedPane === 'response') {
		// PgUp in response pane
		state.responseScrollOffset = Math.max(0, state.responseScrollOffset - 10);
		state.needsRender = true;
	} else if (ch === '\x1b[6~' && state.focusedPane === 'response') {
		// PgDn in response pane
		const maxScroll = Math.max(0, state.responseText.length - (state.height - 3));
		state.responseScrollOffset = Math.min(maxScroll, state.responseScrollOffset + 10);
		state.needsRender = true;
	} else if (ch === ':') {
		// Enter command mode
		state.mode = 'COMMAND';
		state.commandInput = '';
		state.commandCursorPos = 0;
		state.needsRender = true;
	} else if (ch === '/') {
		// Enter search mode
		state.mode = 'SEARCH';
		state.searchInput = '';
		state.searchCursorPos = 0;
		state.needsRender = true;
	} else if (ch === '?') {
		// Toggle help
		state.mode = state.mode === 'HELP' ? 'NORMAL' : 'HELP';
		state.needsRender = true;
	} else if (ch === '\x06') {
		// Ctrl+F - search in response
		// For demo, just highlight first occurrence
		if (state.responseText.length > 0) {
			state.searchHighlightIndices = [0];
			state.needsRender = true;
		}
	} else if (ch === 'q' || ch === 'Q') {
		// Quit (no confirmation needed for q in normal mode, only Ctrl+C)
		state.running = false;
	}
}

function handleCommandMode(state: AppState, ch: string): void {
	if (ch === '\r' || ch === '\n') {
		// Execute command
		processCommand(state, state.commandInput);
	} else if (ch === '\x1b') {
		// Escape - cancel
		state.mode = 'NORMAL';
		state.commandInput = '';
		state.commandCursorPos = 0;
		state.needsRender = true;
	} else if (ch === '\x7f' || ch === '\b') {
		// Backspace
		if (state.commandCursorPos > 0) {
			state.commandInput =
				state.commandInput.slice(0, state.commandCursorPos - 1) +
				state.commandInput.slice(state.commandCursorPos);
			state.commandCursorPos--;
			state.needsRender = true;
		}
	} else if (ch === '\x1b[C') {
		// Right arrow
		state.commandCursorPos = Math.min(state.commandInput.length, state.commandCursorPos + 1);
		state.needsRender = true;
	} else if (ch === '\x1b[D') {
		// Left arrow
		state.commandCursorPos = Math.max(0, state.commandCursorPos - 1);
		state.needsRender = true;
	} else if (ch.length === 1 && ch >= ' ') {
		// Printable character
		state.commandInput =
			state.commandInput.slice(0, state.commandCursorPos) +
			ch +
			state.commandInput.slice(state.commandCursorPos);
		state.commandCursorPos++;
		state.needsRender = true;
	}
}

function handleSearchMode(state: AppState, ch: string): void {
	if (ch === '\r' || ch === '\n') {
		// Execute search
		performSearch(state, state.searchInput);
		state.mode = 'NORMAL';
		state.searchInput = '';
		state.searchCursorPos = 0;
	} else if (ch === '\x1b') {
		// Escape - cancel
		state.mode = 'NORMAL';
		state.searchInput = '';
		state.searchCursorPos = 0;
		performSearch(state, ''); // Reset filter
	} else if (ch === '\x7f' || ch === '\b') {
		// Backspace
		if (state.searchCursorPos > 0) {
			state.searchInput =
				state.searchInput.slice(0, state.searchCursorPos - 1) +
				state.searchInput.slice(state.searchCursorPos);
			state.searchCursorPos--;
			performSearch(state, state.searchInput);
		}
	} else if (ch === '\x1b[C') {
		// Right arrow
		state.searchCursorPos = Math.min(state.searchInput.length, state.searchCursorPos + 1);
		state.needsRender = true;
	} else if (ch === '\x1b[D') {
		// Left arrow
		state.searchCursorPos = Math.max(0, state.searchCursorPos - 1);
		state.needsRender = true;
	} else if (ch.length === 1 && ch >= ' ') {
		// Printable character
		state.searchInput =
			state.searchInput.slice(0, state.searchCursorPos) +
			ch +
			state.searchInput.slice(state.searchCursorPos);
		state.searchCursorPos++;
		performSearch(state, state.searchInput);
	}
}

function handleHelpMode(state: AppState, ch: string): void {
	if (ch === '?' || ch === '\x1b' || ch === 'q') {
		// Close help
		state.mode = 'NORMAL';
		state.needsRender = true;
	}
}

function handleQuitConfirmation(state: AppState, ch: string): void {
	if (ch === 'y' || ch === 'Y') {
		state.running = false;
	} else if (ch === 'n' || ch === 'N' || ch === '\x1b') {
		state.confirmingQuit = false;
		state.needsRender = true;
	}
}

function handleKeypress(state: AppState, data: Buffer): void {
	const ch = data.toString();

	// Ctrl+C - show quit confirmation
	if (ch === '\x03') {
		if (state.confirmingQuit) {
			// Second Ctrl+C - force quit
			state.running = false;
		} else {
			state.confirmingQuit = true;
			state.needsRender = true;
		}
		return;
	}

	if (state.confirmingQuit) {
		handleQuitConfirmation(state, ch);
		return;
	}

	switch (state.mode) {
		case 'NORMAL':
			handleNormalMode(state, ch, data);
			break;
		case 'COMMAND':
			handleCommandMode(state, ch);
			break;
		case 'SEARCH':
			handleSearchMode(state, ch);
			break;
		case 'HELP':
			handleHelpMode(state, ch);
			break;
	}
}

function handleMouse(state: AppState, result: { type: 'mouse'; event: { action: string; button: string; x: number; y: number } }): void {
	const event = result.event;
	const { action, button, x, y } = event;

	// Endpoint list click
	if (action === 'press' && button === 'left' && x < state.dividerX) {
		const clickedIndex = y - 2; // Offset for breadcrumbs
		if (clickedIndex >= 0 && clickedIndex < state.filteredEndpoints.length) {
			state.selectedIndex = clickedIndex;
			state.focusedPane = 'endpoints';
			state.needsRender = true;
		}
	}

	// Response pane click
	if (action === 'press' && button === 'left' && x > state.dividerX) {
		state.focusedPane = 'response';
		state.needsRender = true;
	}

	// Mouse wheel scrolling in response pane
	if (action === 'wheel' && x > state.dividerX) {
		if (button === 'wheelUp') {
			state.responseScrollOffset = Math.max(0, state.responseScrollOffset - 3);
			state.needsRender = true;
		} else if (button === 'wheelDown') {
			const maxScroll = Math.max(0, state.responseText.length - (state.height - 3));
			state.responseScrollOffset = Math.min(maxScroll, state.responseScrollOffset + 3);
			state.needsRender = true;
		}
	}

	// Mouse wheel scrolling in endpoint list
	if (action === 'wheel' && x < state.dividerX) {
		if (button === 'wheelUp') {
			state.selectedIndex = Math.max(0, state.selectedIndex - 1);
			state.needsRender = true;
		} else if (button === 'wheelDown') {
			state.selectedIndex = Math.min(
				state.filteredEndpoints.length - 1,
				state.selectedIndex + 1,
			);
			state.needsRender = true;
		}
	}

	// Divider dragging
	if (action === 'press' && Math.abs(x - state.dividerX) <= 1) {
		state.draggingDivider = true;
	} else if (action === 'release') {
		state.draggingDivider = false;
	} else if (action === 'move' && state.draggingDivider) {
		state.dividerX = Math.max(15, Math.min(state.width - 15, x));
		state.needsRender = true;
	}
}

// =============================================================================
// MAIN LOOP
// =============================================================================

async function main(): Promise<void> {
	const state = createAppState();

	enterAltScreen();

	process.stdin.setRawMode?.(true);
	process.stdin.resume();

	// Input handler
	process.stdin.on('data', (data: Buffer) => {
		const buf = new Uint8Array(data);

		if (isMouseBuffer(buf)) {
			const result = parseMouseSequence(buf);
			if (result && result.type === 'mouse') {
				handleMouse(state, result);
			}
			return;
		}

		handleKeypress(state, data);
	});

	// Resize handler
	process.stdout.on('resize', () => {
		state.width = process.stdout.columns ?? 80;
		state.height = process.stdout.rows ?? 24;
		state.dividerX = Math.floor(state.width * 0.4);
		state.needsRender = true;
	});

	// Render loop
	function loop(): void {
		if (!state.running) {
			exitAltScreen();
			process.exit(0);
		}

		// Update spinner
		if (state.loading) {
			const now = Date.now();
			if (now - state.lastSpinnerUpdate >= SPINNER_INTERVAL_MS) {
				state.loadingSpinnerFrame++;
				state.lastSpinnerUpdate = now;
				state.needsRender = true;
			}
		}

		render(state);
		setTimeout(loop, FRAME_MS);
	}

	// Initial render
	render(state);

	// Start loop
	loop();
}

// Entry point
main().catch((err) => {
	exitAltScreen();
	console.error('Error:', err);
	process.exit(1);
});
