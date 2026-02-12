// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, warn, error } from './logger.js';

describe('utils/logger', () => {
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
	});

	afterEach(() => {
		writeSpy.mockRestore();
	});

	it('log writes INFO to stderr with timestamp', () => {
		log('hello', 'test');
		const out = String(writeSpy.mock.calls[0]?.[0] ?? '');
		expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T.* INFO \[test\] hello\n$/);
	});

	it('warn writes WARN with formatted error message', () => {
		warn('warn-msg', new Error('boom'), 'warn-tag');
		const out = String(writeSpy.mock.calls[0]?.[0] ?? '');
		expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T.* WARN \[warn-tag\] warn-msg: boom\n$/);
	});

	it('error writes ERROR to stderr', () => {
		error('err-msg', 'bad', 'err-tag');
		const out = String(writeSpy.mock.calls[0]?.[0] ?? '');
		expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T.* ERROR \[err-tag\] err-msg: bad\n$/);
	});
});
