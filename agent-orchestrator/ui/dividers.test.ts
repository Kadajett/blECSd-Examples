// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { renderHorizontalDivider, renderSectionHeader } from './dividers.js';
import { THEME } from './theme.js';

describe('renderHorizontalDivider', () => {
	it('returns empty string for zero width', () => {
		expect(renderHorizontalDivider(1, 1, 0, THEME.subtext.fg, 'single')).toBe('');
	});

	it('returns empty string for negative width', () => {
		expect(renderHorizontalDivider(1, 1, -5, THEME.subtext.fg, 'single')).toBe('');
	});

	it('renders a single-style divider', () => {
		const result = renderHorizontalDivider(1, 5, 20, THEME.subtext.fg, 'single');
		expect(result).toContain('\u2500'); // Single horizontal line char
		expect(result).toContain('\x1b[5;1H'); // Cursor positioning
	});

	it('renders a double-style divider', () => {
		const result = renderHorizontalDivider(1, 5, 20, THEME.accent1.fg, 'double');
		expect(result).toContain('\u2550'); // Double horizontal line char
	});

	it('renders a bold-style divider', () => {
		const result = renderHorizontalDivider(1, 5, 20, THEME.accent1.fg, 'bold');
		expect(result).toContain('\u2501'); // Bold horizontal line char
	});

	it('includes label text when provided', () => {
		const result = renderHorizontalDivider(1, 5, 30, THEME.subtext.fg, 'single', 'Test');
		expect(result).toContain('Test');
	});

	it('renders without label when label is empty', () => {
		const result = renderHorizontalDivider(1, 5, 20, THEME.subtext.fg, 'single', '');
		// Should just be line chars without any label text
		expect(result).not.toContain(' ');
	});

	it('ends with THEME.reset', () => {
		const result = renderHorizontalDivider(1, 5, 20, THEME.subtext.fg, 'single');
		expect(result).toMatch(/\x1b\[0m$/);
	});
});

describe('renderSectionHeader', () => {
	it('delegates to renderHorizontalDivider with single style', () => {
		const result = renderSectionHeader(2, 10, 40, 'Section', THEME.accent3.fg);
		expect(result).toContain('Section');
		expect(result).toContain('\u2500'); // Single style chars
	});

	it('positions at given coordinates', () => {
		const result = renderSectionHeader(5, 15, 30, 'Header', THEME.text.fg);
		expect(result).toContain('\x1b[15;5H');
	});
});
