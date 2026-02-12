#!/usr/bin/env node
/**
 * Standalone 1-line tmux header renderer.
 *
 * @module agent-orchestrator/tmux-header
 */

import { THEME } from './ui/theme.js';

interface HeaderOptions {
	session: string;
	workers: number;
}

const ESC = '\x1b';
const RESET = THEME.reset;

const startTime = Date.now();
let width = process.stdout.columns ?? 120;

function parseArgs(argv: readonly string[]): HeaderOptions {
	let session = process.env['BLECSD_SESSION'] ?? 'blecsd';
	let workers = Number.parseInt(process.env['BLECSD_WORKERS'] ?? '0', 10);

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--session' && argv[i + 1]) {
			session = argv[i + 1] as string;
			i++;
			continue;
		}
		if (arg === '--workers' && argv[i + 1]) {
			workers = Number.parseInt(argv[i + 1] as string, 10);
			i++;
		}
	}

	if (!Number.isFinite(workers) || workers < 0) {
		workers = 0;
	}

	return { session, workers };
}

function formatUptime(ms: number): string {
	const totalMinutes = Math.max(0, Math.floor(ms / 60000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return `${hours}h ${minutes}m`;
}

function formatClock(now: Date): string {
	const hh = now.getHours().toString().padStart(2, '0');
	const mm = now.getMinutes().toString().padStart(2, '0');
	const ss = now.getSeconds().toString().padStart(2, '0');
	return `${hh}:${mm}:${ss}`;
}

function stripAnsi(input: string): string {
	return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function padToWidth(text: string, targetWidth: number): string {
	const visible = stripAnsi(text).length;
	if (visible >= targetWidth) {
		return text;
	}
	return `${text}${' '.repeat(targetWidth - visible)}`;
}

function render(options: HeaderOptions): void {
	const now = new Date();
	const uptime = formatUptime(Date.now() - startTime);
	const clock = formatClock(now);
	const sep = `${THEME.subtext.fg} | ${RESET}`;

	const content = [
		`${THEME.bold}${THEME.accent2.fg}blECSd Orchestrator${RESET}`,
		`${THEME.accent1.fg}Session: ${options.session}${RESET}`,
		`${THEME.accent1.fg}Workers: ${options.workers}${RESET}`,
		`${THEME.accent1.fg}Uptime: ${uptime}${RESET}`,
		`${THEME.accent1.fg}${clock}${RESET}`,
	].join(sep);

	const line = padToWidth(`${THEME.surface.bg}  ${content}${RESET}`, width);
	process.stdout.write(`${ESC}[H${THEME.surface.bg}${line}${RESET}`);
}

function main(): void {
	const options = parseArgs(process.argv.slice(2));

	if (process.stdout.isTTY) {
		process.stdout.write(`${ESC}[?25l`);
	}

	render(options);

	const timer = setInterval(() => {
		render(options);
	}, 1000);

	process.stdout.on('resize', () => {
		width = process.stdout.columns ?? 120;
		render(options);
	});

	const cleanup = (): void => {
		clearInterval(timer);
		if (process.stdout.isTTY) {
			process.stdout.write(`${ESC}[?25h${RESET}`);
		}
		process.exit(0);
	};

	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);
}

main();
