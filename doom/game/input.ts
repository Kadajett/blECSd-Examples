/**
 * Input state management for the Doom game loop.
 *
 * Sets up raw stdin and tracks keyboard + mouse input per-frame
 * using the blecsd key and mouse parsers.
 *
 * Key hold tracking: Uses a timestamp map to bridge gaps between
 * terminal key repeat events. Keys expire after KEY_HOLD_MS without
 * a new press event, providing smooth held-key movement.
 *
 * Mouse look: Enables SGR 1006 mouse reporting and tracks
 * horizontal mouse delta for turning.
 *
 * @module game/input
 */

import {
	parseKeyBuffer,
	parseMouseSequence,
	isMouseBuffer,
	writeRaw,
	type KeyName,
} from 'blecsd';

/** How long a key stays "held" after last press event (ms). */
const KEY_HOLD_MS = 120;

/** Set of currently pressed key names plus mouse delta. */
export interface InputState {
	readonly keys: Set<KeyName>;
	readonly ctrl: boolean;
	readonly shift: boolean;
	readonly mouseDeltaX: number;
}

/** Mutable state for input tracking between frames. */
interface InputTracker {
	/** Key name -> timestamp of last press. */
	keyTimestamps: Map<KeyName, number>;
	ctrl: boolean;
	shift: boolean;
	mouseDeltaX: number;
	lastMouseX: number;
	mouseInitialized: boolean;
}

const tracker: InputTracker = {
	keyTimestamps: new Map(),
	ctrl: false,
	shift: false,
	mouseDeltaX: 0,
	lastMouseX: 0,
	mouseInitialized: false,
};

/**
 * Set up raw stdin for keyboard and mouse input.
 * Must be called once at startup.
 */
export function setupInput(): void {
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
	}
	process.stdin.resume();

	// Enable SGR 1006 mouse reporting for mouse look
	// TODO: blECSd missing mouse tracking enable/disable API - using writeRaw
	writeRaw('\x1b[?1000h'); // enable mouse tracking
	writeRaw('\x1b[?1003h'); // enable any-event tracking
	writeRaw('\x1b[?1006h'); // enable SGR extended mode

	process.stdin.on('data', (data: Buffer | string) => {
		const buf = typeof data === 'string' ? Buffer.from(data) : data;
		const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

		// Check for mouse sequence first
		if (isMouseBuffer(uint8)) {
			const result = parseMouseSequence(uint8);
			if (result?.type === 'mouse') {
				const event = result.event;
				if (event.action === 'move' || event.action === 'press') {
					if (tracker.mouseInitialized) {
						tracker.mouseDeltaX += event.x - tracker.lastMouseX;
					}
					tracker.lastMouseX = event.x;
					tracker.mouseInitialized = true;
				}
			}
			return;
		}

		const now = Date.now();
		const events = parseKeyBuffer(uint8);

		for (const event of events) {
			tracker.keyTimestamps.set(event.name, now);
			if (event.ctrl) tracker.ctrl = true;
			if (event.shift) tracker.shift = true;
		}
	});
}

/**
 * Poll current input state and clear per-frame accumulators.
 * Call once per frame before processing input.
 *
 * Keys are considered held if they were pressed within KEY_HOLD_MS.
 * This bridges gaps in terminal key repeat for smooth movement.
 *
 * @returns Current input state
 */
export function pollInput(): InputState {
	const now = Date.now();
	const activeKeys = new Set<KeyName>();

	// Collect keys that haven't expired
	for (const [key, timestamp] of tracker.keyTimestamps) {
		if (now - timestamp < KEY_HOLD_MS) {
			activeKeys.add(key);
		} else {
			tracker.keyTimestamps.delete(key);
		}
	}

	const state: InputState = {
		keys: activeKeys,
		ctrl: tracker.ctrl,
		shift: tracker.shift,
		mouseDeltaX: tracker.mouseDeltaX,
	};

	// Clear per-frame accumulators (but keep key timestamps)
	tracker.ctrl = false;
	tracker.shift = false;
	tracker.mouseDeltaX = 0;

	return state;
}

/**
 * Clean up input (restore terminal state).
 */
export function cleanupInput(): void {
	// Disable mouse reporting
	// TODO: blECSd missing mouse tracking enable/disable API - using writeRaw
	writeRaw('\x1b[?1006l');
	writeRaw('\x1b[?1003l');
	writeRaw('\x1b[?1000l');

	if (process.stdin.isTTY) {
		process.stdin.setRawMode(false);
	}
	process.stdin.pause();
}
