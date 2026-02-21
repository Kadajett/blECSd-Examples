/**
 * Kingdom - Sound cues
 * Terminal bell-based audio feedback with multiple patterns.
 */

import { writeRaw, setOutputStream } from 'blecsd/systems';

// Initialize blECSd output stream
setOutputStream(process.stdout);

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
}

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

function bell(): void {
  if (!soundEnabled) return;
  // TODO: blECSd missing bell/BEL API - using writeRaw
  writeRaw('\x07');
}

/**
 * Play a single terminal bell. Used for positive events like coin collection.
 */
export function playBell(): void {
  bell();
}

/**
 * Play a rapid double-bell. Used for alerts like night starting or wall breach.
 */
export function playAlert(): void {
  bell();
  setTimeout(() => bell(), 100);
}

/**
 * Blood moon warning: 3 rapid beeps.
 * Call ~40 seconds before midnight.
 */
export function playBloodMoonWarning(): void {
  bell();
  setTimeout(() => bell(), 80);
  setTimeout(() => bell(), 160);
}

/**
 * Crown drop alert: continuous rapid beeping while crown is on ground.
 * Returns a timer ID that should be cleared when crown is recovered.
 */
export function playCrownAlert(): ReturnType<typeof setInterval> | null {
  if (!soundEnabled) return null;
  bell();
  return setInterval(() => bell(), 300);
}

/**
 * Recruitment sound: single short beep.
 */
export function playRecruit(): void {
  bell();
}

/**
 * Build completion: two short beeps.
 */
export function playBuildComplete(): void {
  bell();
  setTimeout(() => bell(), 150);
}

/**
 * Greed breach: long-ish beep pattern (triple tap, spaced wider).
 */
export function playGreedBreach(): void {
  bell();
  setTimeout(() => bell(), 200);
  setTimeout(() => bell(), 400);
}
