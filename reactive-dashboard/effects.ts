/**
 * Side effects for the reactive dashboard.
 *
 * Demonstrates using createEffect for logging alerts when thresholds are exceeded.
 */

import { createEffect } from 'blecsd';
import type { SignalGetter } from 'blecsd';
import type { CpuData, MemoryData } from './data';

// =============================================================================
// ALERT THRESHOLDS
// =============================================================================

const CPU_WARNING_THRESHOLD = 80;
const MEMORY_WARNING_THRESHOLD = 80;
const ALERT_COOLDOWN_MS = 10000; // Only alert once per 10 seconds

// =============================================================================
// EFFECT SETUP
// =============================================================================

/**
 * Create an effect that logs CPU warnings when usage exceeds threshold.
 */
export function createCpuAlertEffect(cpuGetter: SignalGetter<CpuData>): void {
	let lastAlertTime = 0;

	createEffect(() => {
		const cpu = cpuGetter();
		const now = Date.now();

		if (cpu.average >= CPU_WARNING_THRESHOLD && now - lastAlertTime > ALERT_COOLDOWN_MS) {
			console.error(`[ALERT] CPU usage high: ${cpu.average.toFixed(1)}%`);
			lastAlertTime = now;
		}
	});
}

/**
 * Create an effect that logs memory warnings when usage exceeds threshold.
 */
export function createMemoryAlertEffect(memoryGetter: SignalGetter<MemoryData>): void {
	let lastAlertTime = 0;

	createEffect(() => {
		const mem = memoryGetter();
		const now = Date.now();

		if (mem.percent >= MEMORY_WARNING_THRESHOLD && now - lastAlertTime > ALERT_COOLDOWN_MS) {
			console.error(`[ALERT] Memory usage high: ${mem.percent.toFixed(1)}%`);
			lastAlertTime = now;
		}
	});
}
