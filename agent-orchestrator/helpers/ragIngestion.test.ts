// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { filterNoiseLines } from './ragIngestion.js';

describe('helpers/ragIngestion filterNoiseLines', () => {
	it('filters ANSI-only, box-drawing, and blank lines while keeping meaningful content', () => {
		const lines = [
			'',
			'   ',
			'──────────────',
			'╔════════════╗',
			'\x1b[31m\x1b[0m',
			'$ ls',
			'[pane-1]',
			'This is a meaningful line with enough content to keep.',
			'Another useful diagnostic explanation appears right here.',
		];

		const filtered = filterNoiseLines(lines);
		expect(filtered).toEqual([
			'This is a meaningful line with enough content to keep.',
			'Another useful diagnostic explanation appears right here.',
		]);
	});

	it('filters path-only and short shell prompt patterns', () => {
		const lines = [
			'/tmp/some/file.txt',
			'$ short command',
			'cd /tmp',
			'Useful output describing why the operation failed in detail.',
		];
		const filtered = filterNoiseLines(lines);
		expect(filtered).toEqual(['Useful output describing why the operation failed in detail.']);
	});

	it('filters repeated punctuation noise', () => {
		const lines = ['..........', '=====-----=====', 'Useful explanation line with many words included.'];
		const filtered = filterNoiseLines(lines);
		expect(filtered).toEqual(['Useful explanation line with many words included.']);
	});
});
