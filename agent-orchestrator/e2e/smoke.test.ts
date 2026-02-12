// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import { createTmuxBackend } from '../backend/tmux.js';

describe('e2e smoke: tmux backend export surface', () => {
	it('creates a backend with expected interface methods/signatures', () => {
		const backend = createTmuxBackend('session-x', '/tmp/workspace', false, '0.0');

		expect(typeof backend.sendInput).toBe('function');
		expect(typeof backend.sendEnter).toBe('function');
		expect(typeof backend.sendPrompt).toBe('function');
		expect(typeof backend.captureOutput).toBe('function');
		expect(typeof backend.listPanes).toBe('function');
		expect(typeof backend.addPane).toBe('function');
		expect(typeof backend.removePane).toBe('function');
		expect(typeof backend.resizePane).toBe('function');

		expect(backend.sendInput.length).toBe(2);
		expect(backend.sendEnter.length).toBe(1);
		expect(backend.sendPrompt.length).toBe(2);
		expect(backend.captureOutput.length).toBe(1);
		expect(backend.addPane.length).toBe(3);
		expect(backend.removePane.length).toBe(1);
		expect(backend.resizePane.length).toBe(3);
	});
});
