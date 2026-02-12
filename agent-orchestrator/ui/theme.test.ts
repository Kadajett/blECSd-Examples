// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import {
	hexToAnsi,
	THEME,
	getBorderChars,
	BORDER_SINGLE,
	BORDER_DOUBLE,
	BORDER_ROUNDED,
} from './theme.js';

describe('hexToAnsi', () => {
	it('converts hex with # prefix to foreground ANSI', () => {
		const result = hexToAnsi('#ff0000', false);
		expect(result).toBe('\x1b[38;2;255;0;0m');
	});

	it('converts hex without # prefix to foreground ANSI', () => {
		const result = hexToAnsi('00ff00', false);
		expect(result).toBe('\x1b[38;2;0;255;0m');
	});

	it('converts hex to background ANSI', () => {
		const result = hexToAnsi('#0000ff', true);
		expect(result).toBe('\x1b[48;2;0;0;255m');
	});

	it('handles mixed-case hex', () => {
		const result = hexToAnsi('#AbCdEf', false);
		expect(result).toBe('\x1b[38;2;171;205;239m');
	});
});

describe('THEME', () => {
	it('has all required color entries', () => {
		const colorKeys = [
			'bg', 'surface', 'overlay', 'text', 'subtext', 'comment',
			'accent1', 'accent2', 'accent3', 'accent4', 'accent5',
			'warning', 'error', 'success',
		] as const;

		for (const key of colorKeys) {
			expect(THEME[key]).toBeDefined();
			expect(THEME[key].fg).toMatch(/^\x1b\[38;2;\d+;\d+;\d+m$/);
			expect(THEME[key].bg).toMatch(/^\x1b\[48;2;\d+;\d+;\d+m$/);
			expect(THEME[key].hex).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('has reset/bold/dim/reverse ANSI codes', () => {
		expect(THEME.reset).toBe('\x1b[0m');
		expect(THEME.bold).toBe('\x1b[1m');
		expect(THEME.dim).toBe('\x1b[2m');
		expect(THEME.reverse).toBe('\x1b[7m');
	});
});

describe('getBorderChars', () => {
	it('returns single border chars', () => {
		expect(getBorderChars('single')).toBe(BORDER_SINGLE);
	});

	it('returns double border chars', () => {
		expect(getBorderChars('double')).toBe(BORDER_DOUBLE);
	});

	it('returns rounded border chars', () => {
		expect(getBorderChars('rounded')).toBe(BORDER_ROUNDED);
	});
});

describe('border character sets', () => {
	it('BORDER_SINGLE has all required characters', () => {
		expect(BORDER_SINGLE.tl).toBe('\u250C');
		expect(BORDER_SINGLE.tr).toBe('\u2510');
		expect(BORDER_SINGLE.bl).toBe('\u2514');
		expect(BORDER_SINGLE.br).toBe('\u2518');
		expect(BORDER_SINGLE.h).toBe('\u2500');
		expect(BORDER_SINGLE.v).toBe('\u2502');
	});

	it('BORDER_DOUBLE has all required characters', () => {
		expect(BORDER_DOUBLE.tl).toBe('\u2554');
		expect(BORDER_DOUBLE.tr).toBe('\u2557');
		expect(BORDER_DOUBLE.bl).toBe('\u255A');
		expect(BORDER_DOUBLE.br).toBe('\u255D');
		expect(BORDER_DOUBLE.h).toBe('\u2550');
		expect(BORDER_DOUBLE.v).toBe('\u2551');
	});

	it('BORDER_ROUNDED has all required characters', () => {
		expect(BORDER_ROUNDED.tl).toBe('\u256D');
		expect(BORDER_ROUNDED.tr).toBe('\u256E');
		expect(BORDER_ROUNDED.bl).toBe('\u2570');
		expect(BORDER_ROUNDED.br).toBe('\u256F');
		expect(BORDER_ROUNDED.h).toBe('\u2500');
		expect(BORDER_ROUNDED.v).toBe('\u2502');
	});
});
