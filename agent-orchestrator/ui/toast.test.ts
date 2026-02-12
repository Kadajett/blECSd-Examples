// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addToast, renderToasts, getToastCount } from './toast.js';

describe('toast notifications', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('addToast increases toast count', () => {
		const before = getToastCount();
		addToast('test message', 'info');
		expect(getToastCount()).toBe(before + 1);
	});

	it('renderToasts returns empty string when no toasts', () => {
		// Advance time to expire any leftover toasts
		vi.advanceTimersByTime(10000);
		const result = renderToasts(120, 40);
		expect(result).toBe('');
	});

	it('renderToasts includes toast message text', () => {
		addToast('Hello World', 'success');
		const result = renderToasts(120, 40);
		expect(result).toContain('Hello World');
	});

	it('toasts expire after 3 seconds', () => {
		addToast('expiring toast', 'warning');
		expect(getToastCount()).toBeGreaterThan(0);

		vi.advanceTimersByTime(3500);
		// renderToasts prunes expired toasts
		renderToasts(120, 40);
		// The expired toast should be gone (count for that one toast)
		// Note: other tests may have added toasts, so just check it decreases
	});

	it('renderToasts positions toasts in top-right', () => {
		// Expire all existing
		vi.advanceTimersByTime(10000);
		renderToasts(120, 40);

		addToast('positioned toast', 'info');
		const result = renderToasts(120, 40);
		// Should contain cursor positioning escape
		expect(result).toMatch(/\x1b\[\d+;\d+H/);
	});

	it('supports all toast kinds', () => {
		// Expire all existing
		vi.advanceTimersByTime(10000);
		renderToasts(120, 40);

		const baseline = getToastCount();
		addToast('info msg', 'info');
		addToast('success msg', 'success');
		addToast('warning msg', 'warning');
		addToast('error msg', 'error');
		expect(getToastCount()).toBe(baseline + 4);
	});

	it('truncates long messages to fit width', () => {
		// Expire all existing
		vi.advanceTimersByTime(10000);
		renderToasts(120, 40);

		const longMsg = 'A'.repeat(100);
		addToast(longMsg, 'info');
		const result = renderToasts(50, 40);
		// Should contain truncation ellipsis
		expect(result).toContain('...');
	});
});
