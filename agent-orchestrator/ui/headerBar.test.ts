// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHeaderBar } from './headerBar.js';

describe('renderHeaderBar', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 0, 15, 14, 30));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns a string', () => {
		const result = renderHeaderBar(120, 'test-session');
		expect(typeof result).toBe('string');
	});

	it('includes the app title', () => {
		const result = renderHeaderBar(120, '');
		expect(result).toContain('blECSd Orchestrator');
	});

	it('includes the session name when provided', () => {
		const result = renderHeaderBar(120, 'my-session');
		expect(result).toContain('my-session');
	});

	it('includes formatted time', () => {
		const result = renderHeaderBar(120, '');
		expect(result).toContain('14:30');
	});

	it('positions at row 1', () => {
		const result = renderHeaderBar(120, '');
		expect(result).toMatch(/\x1b\[1;1H/);
	});

	it('handles narrow widths without crashing', () => {
		// Should not throw even with very narrow width
		const result = renderHeaderBar(30, 'session');
		expect(typeof result).toBe('string');
	});

	it('handles empty session name', () => {
		const result = renderHeaderBar(120, '');
		expect(result).toContain('blECSd Orchestrator');
		// No session name in the output
		expect(result).not.toContain('undefined');
	});
});
