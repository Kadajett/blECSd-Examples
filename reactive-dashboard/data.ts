/**
 * Data collection functions for the reactive dashboard.
 *
 * Provides system metrics collection:
 * - CPU usage per core
 * - Memory usage
 * - System uptime and load average
 * - Network I/O (simulated)
 */

import * as os from 'node:os';

// =============================================================================
// TYPES
// =============================================================================

export interface CpuData {
	perCore: number[];
	average: number;
	loadAvg: number[];
}

export interface MemoryData {
	used: number;
	total: number;
	percent: number;
}

export interface NetworkData {
	rx: number;
	tx: number;
	rxRate: number;
	txRate: number;
}

export interface SystemData {
	uptime: number;
	hostname: string;
	platform: string;
	arch: string;
}

// =============================================================================
// CPU TRACKING
// =============================================================================

interface CpuTimes {
	user: number;
	nice: number;
	sys: number;
	idle: number;
	irq: number;
}

let previousCpuTimes: CpuTimes[] = [];

/**
 * Calculate CPU usage percentage from current and previous times.
 */
export function calculateCpuUsage(): CpuData {
	const cpus = os.cpus();
	const perCore: number[] = [];

	for (let i = 0; i < cpus.length; i++) {
		const cpu = cpus[i];
		if (!cpu) continue;

		const current: CpuTimes = {
			user: cpu.times.user,
			nice: cpu.times.nice,
			sys: cpu.times.sys,
			idle: cpu.times.idle,
			irq: cpu.times.irq,
		};

		const previous = previousCpuTimes[i] || current;
		previousCpuTimes[i] = current;

		const userDiff = current.user - previous.user;
		const niceDiff = current.nice - previous.nice;
		const sysDiff = current.sys - previous.sys;
		const idleDiff = current.idle - previous.idle;
		const irqDiff = current.irq - previous.irq;

		const total = userDiff + niceDiff + sysDiff + idleDiff + irqDiff;
		const active = userDiff + niceDiff + sysDiff + irqDiff;

		perCore.push(total > 0 ? (active / total) * 100 : 0);
	}

	const average = perCore.length > 0 ? perCore.reduce((a, b) => a + b, 0) / perCore.length : 0;
	const loadAvg = os.loadavg();

	return { perCore, average, loadAvg };
}

// =============================================================================
// MEMORY DATA
// =============================================================================

/**
 * Get memory usage data.
 */
export function getMemoryData(): MemoryData {
	const total = os.totalmem();
	const free = os.freemem();
	const used = total - free;
	const percent = (used / total) * 100;
	return { used, total, percent };
}

// =============================================================================
// SYSTEM INFO
// =============================================================================

/**
 * Get system information.
 */
export function getSystemData(): SystemData {
	return {
		uptime: os.uptime(),
		hostname: os.hostname(),
		platform: os.platform(),
		arch: os.arch(),
	};
}

// =============================================================================
// NETWORK DATA (SIMULATED)
// =============================================================================

let lastRx = 0;
let lastTx = 0;
let lastTime = Date.now();

/**
 * Get simulated network I/O data.
 * In a real app, this would read from /proc/net/dev or similar.
 */
export function getNetworkData(): NetworkData {
	const now = Date.now();
	const elapsed = (now - lastTime) / 1000;

	// Simulate network traffic (random walk)
	const rx = lastRx + Math.random() * 1024 * 100;
	const tx = lastTx + Math.random() * 1024 * 50;
	const rxRate = elapsed > 0 ? (rx - lastRx) / elapsed : 0;
	const txRate = elapsed > 0 ? (tx - lastTx) / elapsed : 0;

	lastRx = rx;
	lastTx = tx;
	lastTime = now;

	return { rx, tx, rxRate, txRate };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
	const units = ['B', 'K', 'M', 'G', 'T'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)}${units[unit]}`;
}

/**
 * Format duration to human-readable string.
 */
export function formatDuration(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (days > 0) {
		return `${days}d ${hours}h ${mins}m`;
	}
	if (hours > 0) {
		return `${hours}h ${mins}m ${secs}s`;
	}
	if (mins > 0) {
		return `${mins}m ${secs}s`;
	}
	return `${secs}s`;
}
