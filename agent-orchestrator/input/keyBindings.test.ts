// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { parseInput } from './keyBindings.js';

describe('input/keyBindings parseInput', () => {
	it('parses Ctrl+A', () => {
		expect(parseInput('\x01')).toEqual({
			key: 'a',
			ctrl: true,
			shift: false,
			meta: false,
			raw: '\x01',
		});
	});

	it('parses Ctrl+C', () => {
		expect(parseInput('\x03')).toEqual({
			key: 'c',
			ctrl: true,
			shift: false,
			meta: false,
			raw: '\x03',
		});
	});

	it('parses Tab', () => {
		expect(parseInput('\t').key).toBe('tab');
		expect(parseInput('\t').shift).toBe(false);
	});

	it('parses Shift+Tab', () => {
		const parsed = parseInput('\x1b[Z');
		expect(parsed.key).toBe('tab');
		expect(parsed.shift).toBe(true);
	});

	it('parses arrow keys', () => {
		expect(parseInput('\x1b[A').key).toBe('up');
		expect(parseInput('\x1b[B').key).toBe('down');
		expect(parseInput('\x1b[C').key).toBe('right');
		expect(parseInput('\x1b[D').key).toBe('left');
	});

	it('parses Enter', () => {
		expect(parseInput('\r').key).toBe('enter');
	});

	it('parses Escape', () => {
		expect(parseInput('\x1b').key).toBe('escape');
	});

	it('parses SGR mouse sequence', () => {
		expect(parseInput('\x1b[<0;10;20M')).toEqual({
			key: 'mouse',
			ctrl: false,
			shift: false,
			meta: false,
			mouseX: 10,
			mouseY: 20,
			raw: '\x1b[<0;10;20M',
		});
	});

	it('parses regular printable chars', () => {
		expect(parseInput('x')).toEqual({
			key: 'x',
			ctrl: false,
			shift: false,
			meta: false,
			raw: 'x',
		});
	});

	it('handles multi-byte sequences', () => {
		const parsed = parseInput('🙂');
		expect(parsed.key).toBe('unknown');
		expect(parsed.raw).toBe('🙂');
	});
});
