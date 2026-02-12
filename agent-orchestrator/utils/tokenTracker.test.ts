// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface TokenSnapshot {
	readonly paneId: string;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly contextPercent: number;
	readonly timestamp: number;
}

interface TokenHistory {
	readonly paneId: string;
	readonly maxSnapshots: number;
	readonly snapshots: readonly TokenSnapshot[];
}

interface TokenTrackerModule {
	parseTokensFromOutput: (output: string) => {
		inputTokens: number;
		outputTokens: number;
		contextPercent: number;
	};
	captureTokenSnapshot: (session: string, paneId: string) => TokenSnapshot;
	createTokenHistory: (paneId: string, maxSnapshots?: number) => TokenHistory;
	updateTokenHistory: (history: TokenHistory, session: string) => TokenHistory;
}

async function loadTokenTracker(): Promise<TokenTrackerModule> {
	const modulePath = './tokenTracker.js';
	return await import(modulePath) as TokenTrackerModule;
}

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const hasTokenTracker = existsSync(path.resolve(thisDir, 'tokenTracker.ts'));
const describeTokenTracker = hasTokenTracker ? describe : describe.skip;

describeTokenTracker('utils/tokenTracker parseTokensFromOutput', () => {
	it('parses Claude Code token display with down arrow and number', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('status: ↓ 547 tokens consumed');
		expect(result.inputTokens).toBe(547);
		expect(result.outputTokens).toBe(0);
	});

	it('parses k suffix for input tokens', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('usage ↓ 10.2k tokens');
		expect(result.inputTokens).toBe(10200);
	});

	it('parses context percentage', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('67% context left');
		expect(result.contextPercent).toBe(67);
	});

	it('returns zeros when no token info is found', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('no usage data here');
		expect(result).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			contextPercent: 0,
		});
	});

	it('handles multiple token mentions by picking the last mention', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('↓ 500 tokens\\n... later ...\\n↓ 800 tokens');
		expect(result.inputTokens).toBe(800);
	});

	it('parses output tokens from up arrow pattern', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('response ↑ 420 tokens');
		expect(result.outputTokens).toBe(420);
	});

	it('handles decimal k values', async () => {
		const { parseTokensFromOutput } = await loadTokenTracker();
		const result = parseTokensFromOutput('usage ↓ 3.5k tokens');
		expect(result.inputTokens).toBe(3500);
	});
});

describeTokenTracker('utils/tokenTracker createTokenHistory', () => {
	it('creates history with default maxSnapshots of 60', async () => {
		const { createTokenHistory } = await loadTokenTracker();
		const history = createTokenHistory('%1');
		expect(history.paneId).toBe('%1');
		expect(history.maxSnapshots).toBe(60);
		expect(history.snapshots).toEqual([]);
	});

	it('creates history with custom maxSnapshots', async () => {
		const { createTokenHistory } = await loadTokenTracker();
		const history = createTokenHistory('%1', 15);
		expect(history.maxSnapshots).toBe(15);
	});
});

describeTokenTracker('utils/tokenTracker captureTokenSnapshot', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.doUnmock('node:child_process');
	});

	it('captures pane output via tmux and parses token snapshot', async () => {
		vi.doMock('node:child_process', () => ({
			execSync: vi.fn(() => '↓ 1.2k tokens\\n↑ 340 tokens\\n55% context left'),
		}));

		const { captureTokenSnapshot } = await loadTokenTracker();
		const snapshot = captureTokenSnapshot('agent-session', '%3');

		expect(snapshot.paneId).toBe('%3');
		expect(snapshot.inputTokens).toBe(1200);
		expect(snapshot.outputTokens).toBe(340);
		expect(snapshot.contextPercent).toBe(55);
		expect(typeof snapshot.timestamp).toBe('number');
		expect(snapshot.timestamp).toBeGreaterThan(0);
	});
});
