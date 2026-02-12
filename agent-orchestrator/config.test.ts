// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { parseAgentSpec, calculateGridDimensions } from './config.js';

describe('config parseAgentSpec', () => {
	it('parses claude preset', () => {
		const spec = parseAgentSpec('claude');
		expect(spec.kind).toBe('claude');
		expect(spec.command).toBe('claude');
	});

	it('parses codex preset', () => {
		const spec = parseAgentSpec('codex');
		expect(spec.kind).toBe('codex');
		expect(spec.command).toBe('codex');
	});

	it('parses gemini preset', () => {
		const spec = parseAgentSpec('gemini');
		expect(spec.kind).toBe('gemini');
		expect(spec.command).toBe('gemini');
	});

	it('parses custom command with args', () => {
		const spec = parseAgentSpec('custom:my-agent --flag');
		expect(spec).toMatchObject({
			kind: 'custom',
			command: 'my-agent',
			args: ['--flag'],
			label: 'Custom (my-agent)',
		});
	});

	it('defaults invalid spec to claude preset', () => {
		const spec = parseAgentSpec('not-a-real-agent');
		expect(spec.kind).toBe('claude');
		expect(spec.command).toBe('claude');
	});
});

describe('config calculateGridDimensions', () => {
	it('returns expected rows/cols for worker counts 1-10', () => {
		const expected: Record<number, { rows: number; cols: number }> = {
			1: { rows: 1, cols: 1 },
			2: { rows: 1, cols: 2 },
			3: { rows: 2, cols: 2 },
			4: { rows: 2, cols: 2 },
			5: { rows: 2, cols: 3 },
			6: { rows: 2, cols: 3 },
			7: { rows: 3, cols: 3 },
			8: { rows: 3, cols: 3 },
			9: { rows: 3, cols: 3 },
			10: { rows: 3, cols: 4 },
		};

		for (let count = 1; count <= 10; count++) {
			expect(calculateGridDimensions(count)).toEqual(expected[count]);
		}
	});
});
