// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execSyncMock } = vi.hoisted(() => ({ execSyncMock: vi.fn() }));

vi.mock('node:child_process', () => ({
	execSync: execSyncMock,
}));

import { displayPopup, displayMessage, displayMenu, type PopupOptions } from './controller.js';

function lastCommandCall(): string {
	const calls = execSyncMock.mock.calls as unknown[][];
	const last = calls[calls.length - 1];
	return (last?.[0] as string) ?? '';
}

describe('tmux/controller popup and menu helpers', () => {
	beforeEach(() => {
		execSyncMock.mockReset();
		execSyncMock.mockReturnValue(Buffer.from(''));
	});

	it('displayPopup builds expected tmux command string', () => {
		displayPopup('sess-1', {
			width: 60,
			height: 20,
			title: 'Command Palette',
			borderStyle: 'rounded',
			style: 'bg=#1a1b26',
			borderStyle_fg: '#7aa2f7',
			command: 'npx tsx popups/command-palette.ts',
		});

		const cmd = lastCommandCall();
		expect(cmd).toContain('tmux -L blecsd display-popup -t sess-1');
		expect(cmd).toContain('-w 60');
		expect(cmd).toContain('-h 20');
		expect(cmd).toContain('-b rounded');
		expect(cmd).toContain('-T " Command Palette "');
		expect(cmd).toContain('-s "bg=#1a1b26"');
		expect(cmd).toContain('-S "fg=#7aa2f7"');
		expect(cmd).toContain('"npx tsx popups/command-palette.ts"');
	});

	it('displayMessage sets display-time and calls display-message', () => {
		displayMessage('sess-2', '#[fg=green]Worker added: w1', 4200);

		const calls = execSyncMock.mock.calls as unknown[][];
		expect(calls.length).toBe(2);
		expect((calls[0]?.[0] as string) ?? '').toContain('set-option -t sess-2 display-time "5000"');
		expect((calls[1]?.[0] as string) ?? '').toContain('display-message -t sess-2 "#[fg=green]Worker added: w1"');
	});

	it('displayMenu formats items and separators correctly', () => {
		displayMenu('sess-3', 'Quit?', [
			['Confirm quit', 'q', 'kill-session -t sess-3'],
			['', '', ''],
			['Cancel', 'c', ''],
		]);

		const cmd = lastCommandCall();
		expect(cmd).toContain('display-menu -t sess-3 -T " Quit? "');
		expect(cmd).toContain('"Confirm quit" "q" "kill-session -t sess-3"');
		expect(cmd).toContain('""');
		expect(cmd).toContain('"Cancel" "c" ""');
	});

	it('supports all PopupOptions border styles', () => {
		const styles: PopupOptions['borderStyle'][] = ['single', 'double', 'heavy', 'rounded', 'none'];
		const expectedBorders = ['simple', 'double', 'heavy', 'rounded', 'none'];

		for (let i = 0; i < styles.length; i++) {
			execSyncMock.mockClear();
			const borderStyle = styles[i];
			displayPopup('sess-4', {
				width: 40,
				height: 12,
				borderStyle,
				command: 'echo ok',
			});
			const cmd = lastCommandCall();
			expect(cmd).toContain(`-b ${expectedBorders[i]}`);
		}
	});

	it('handles empty title and escapes special quotes in commands', () => {
		displayPopup('sess-5', {
			width: 50,
			height: 16,
			title: '',
			command: 'printf "hello \"world\""',
		});

		const cmd = lastCommandCall();
		expect(cmd).not.toContain('-T "  "');
		expect(cmd).toContain('printf');
		expect(cmd).toContain('\\"hello');
		expect(cmd).toContain('\\"world\\"');
	});
});
