/**
 * Side effects for the reactive dashboard.
 *
 * Logs alerts when thresholds are exceeded.
 */

import type { CpuData, MemoryData } from './data';

// =============================================================================
// ALERT THRESHOLDS
// =============================================================================

const CPU_WARNING_THRESHOLD = 80;
const MEMORY_WARNING_THRESHOLD = 80;
const ALERT_COOLDOWN_MS = 10000; // Only alert once per 10 seconds

// =============================================================================
// ALERT STATE
// =============================================================================

let lastCpuAlertTime = 0;
let lastMemoryAlertTime = 0;

// =============================================================================
// ALERT FUNCTIONS
// =============================================================================

/**
 * Check CPU usage and log alert if threshold exceeded.
 */
export function checkCpuAlert(cpu: CpuData): void {
	const now = Date.now();

	if (cpu.average >= CPU_WARNING_THRESHOLD && now - lastCpuAlertTime > ALERT_COOLDOWN_MS) {
		console.error(`[ALERT] CPU usage high: ${cpu.average.toFixed(1)}%`);
		lastCpuAlertTime = now;
	}
}

/**
 * Check memory usage and log alert if threshold exceeded.
 */
export function checkMemoryAlert(memory: MemoryData): void {
	const now = Date.now();

	if (memory.percent >= MEMORY_WARNING_THRESHOLD && now - lastMemoryAlertTime > ALERT_COOLDOWN_MS) {
		console.error(`[ALERT] Memory usage high: ${memory.percent.toFixed(1)}%`);
		lastMemoryAlertTime = now;
	}
}
