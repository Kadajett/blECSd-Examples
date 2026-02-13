/**
 * Kingdom - Visual effects
 * Smooth night transitions, wave-incoming flash, coin sparkle, damage flash.
 */

import {
  TimeOfDay,
  WeatherType,
  DUSK_START,
  NIGHT_START,
  DAWN_START,
  DAY_START,
  GROUND_Y,
} from '../types';

interface CellBufferDirect {
  width: number;
  height: number;
  cells: { char: string; fg: number; bg: number }[][];
  setCell: (x: number, y: number, char: string, fg: number, bg: number) => void;
}

function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 24) & 0xff) * factor);
  const g = Math.floor(((color >> 16) & 0xff) * factor);
  const b = Math.floor(((color >> 8) & 0xff) * factor);
  const a = color & 0xff;
  return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | a;
}

function tintColor(color: number, tintR: number, tintG: number, tintB: number, strength: number): number {
  const r = ((color >> 24) & 0xff);
  const g = ((color >> 16) & 0xff);
  const b = ((color >> 8) & 0xff);
  const a = color & 0xff;
  const nr = Math.floor(r * (1 - strength) + tintR * strength);
  const ng = Math.floor(g * (1 - strength) + tintG * strength);
  const nb = Math.floor(b * (1 - strength) + tintB * strength);
  return ((nr & 0xff) << 24) | ((ng & 0xff) << 16) | ((nb & 0xff) << 8) | a;
}

/**
 * Compute a smooth darkening factor based on continuous dayTime.
 * Returns a value between 0.3 (full night) and 1.0 (full day).
 * Transitions smoothly between phases instead of discrete jumps.
 */
function computeDarkenFactor(dayTime: number): number {
  // Dawn transition: DAWN_START -> DAY_START (0.0 -> 0.15), dark to light
  if (dayTime < DAY_START) {
    const t = dayTime / DAY_START; // 0..1 within dawn
    return 0.3 + t * 0.45; // 0.3 -> 0.75
  }
  // Day: full brightness
  if (dayTime < DUSK_START) {
    // Ease in from dawn end
    if (dayTime < DAY_START + 0.05) {
      const t = (dayTime - DAY_START) / 0.05;
      return 0.75 + t * 0.25; // 0.75 -> 1.0
    }
    return 1.0;
  }
  // Dusk transition: DUSK_START -> NIGHT_START (0.65 -> 0.8), light to dark
  if (dayTime < NIGHT_START) {
    const t = (dayTime - DUSK_START) / (NIGHT_START - DUSK_START); // 0..1 within dusk
    return 1.0 - t * 0.7; // 1.0 -> 0.3
  }
  // Night: darkest
  // Very slight variation for atmosphere
  return 0.3;
}

/**
 * Apply smooth darkening overlay to the buffer based on continuous dayTime.
 * Also applies a red tint during blood moon nights.
 */
export function applyNightOverlay(buffer: CellBufferDirect, timeOfDay: TimeOfDay, dayTime: number, isBloodMoon: boolean): void {
  const factor = computeDarkenFactor(dayTime);

  if (factor >= 0.99 && !isBloodMoon) return; // Full day, no overlay needed

  for (let y = 0; y < buffer.height; y++) {
    const row = buffer.cells[y];
    if (!row) continue;
    for (let x = 0; x < buffer.width; x++) {
      const cell = row[x];
      if (!cell) continue;
      cell.fg = darkenColor(cell.fg, factor);
      cell.bg = darkenColor(cell.bg, factor);

      // Blood moon red tint during night
      if (isBloodMoon && timeOfDay === TimeOfDay.Night) {
        cell.fg = tintColor(cell.fg, 180, 20, 20, 0.15);
        cell.bg = tintColor(cell.bg, 120, 10, 10, 0.1);
      }
    }
  }
}

// ─── Wave Incoming Flash ──────────────────────────────────────────

let waveFlashTimer = 0;
const WAVE_FLASH_DURATION = 0.8; // seconds

/**
 * Trigger the wave incoming flash. Call when night begins.
 */
export function triggerWaveFlash(): void {
  waveFlashTimer = WAVE_FLASH_DURATION;
}

/**
 * Update and apply wave incoming flash effect.
 * Pulses the screen border red when a greed wave is starting.
 */
export function updateWaveFlash(buffer: CellBufferDirect, dt: number): void {
  if (waveFlashTimer <= 0) return;
  waveFlashTimer -= dt;

  const intensity = Math.max(0, waveFlashTimer / WAVE_FLASH_DURATION);
  const pulse = Math.sin(intensity * Math.PI * 4) * 0.5 + 0.5; // Pulsing effect
  const flashColor = ((Math.floor(200 * pulse) & 0xff) << 24) | (0x10 << 16) | (0x10 << 8) | 0xff;

  // Flash top and bottom borders
  for (let x = 0; x < buffer.width; x++) {
    const topCell = buffer.cells[0]?.[x];
    const botCell = buffer.cells[buffer.height - 1]?.[x];
    if (topCell) topCell.bg = flashColor;
    if (botCell) botCell.bg = flashColor;
  }
  // Flash left and right borders
  for (let y = 0; y < buffer.height; y++) {
    const leftCell = buffer.cells[y]?.[0];
    const rightCell = buffer.cells[y]?.[buffer.width - 1];
    if (leftCell) leftCell.bg = flashColor;
    if (rightCell) rightCell.bg = flashColor;
  }
}

// ─── Coin Sparkle Effect ──────────────────────────────────────────

interface Sparkle {
  x: number;
  y: number;
  timer: number;
}

const sparkles: Sparkle[] = [];
const SPARKLE_DURATION = 0.5;
const SPARKLE_CHARS = ['\u2727', '\u2729', '\u00B7', ' ']; // star, star, dot, gone

/**
 * Queue a sparkle effect at screen coordinates.
 */
export function addSparkle(screenX: number, screenY: number): void {
  sparkles.push({ x: screenX, y: screenY, timer: SPARKLE_DURATION });
}

/**
 * Update and render sparkle effects onto the buffer.
 */
export function updateSparkles(buffer: CellBufferDirect, dt: number): void {
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i]!;
    s.timer -= dt;
    if (s.timer <= 0) {
      sparkles.splice(i, 1);
      continue;
    }

    const progress = 1 - (s.timer / SPARKLE_DURATION);
    const charIdx = Math.min(Math.floor(progress * SPARKLE_CHARS.length), SPARKLE_CHARS.length - 1);
    const ch = SPARKLE_CHARS[charIdx]!;

    // Draw sparkle at position and slightly above (floats up)
    const drawY = s.y - Math.floor(progress * 2);
    if (s.x >= 0 && s.x < buffer.width && drawY >= 0 && drawY < buffer.height) {
      const brightness = Math.floor(255 * (1 - progress * 0.6));
      const fg = ((brightness & 0xff) << 24) | ((brightness & 0xff) << 16) | (0x00 << 8) | 0xff;
      buffer.setCell(s.x, drawY, ch, fg, buffer.cells[drawY]![s.x]!.bg);
    }
  }
}

/**
 * Brief color inversion flash at a screen position for damage feedback.
 */
export function flashEffect(buffer: CellBufferDirect, x: number, y: number): void {
  if (x < 0 || x >= buffer.width || y < 0 || y >= buffer.height) return;
  const row = buffer.cells[y];
  if (!row) return;
  const cell = row[x];
  if (!cell) return;

  const tmpFg = cell.fg;
  cell.fg = cell.bg;
  cell.bg = tmpFg;
}

// ─── Weather Effects ─────────────────────────────────────────────

let stormFlashFrames = 0;

// Deterministic pseudo-random for weather particles
function weatherRand(seed: number): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >> 16) / 32768.0;
}

/**
 * Render weather overlay onto the buffer.
 * Call after sky/terrain but before entities.
 */
export function renderWeather(
  buffer: CellBufferDirect,
  width: number,
  height: number,
  weather: WeatherType,
  time: number,
  groundScreenY?: number,
): void {
  if (weather === WeatherType.Clear) return;

  const effectiveGroundY = groundScreenY ?? GROUND_Y;
  const maxY = Math.min(effectiveGroundY, height);

  if (weather === WeatherType.Rain || weather === WeatherType.Storm) {
    const dropCount = weather === WeatherType.Storm ? 40 : 20;
    const COLOR_RAIN = 0x4488bbff;
    const rainChars = ['|', '/'];

    for (let i = 0; i < dropCount; i++) {
      // Time-based position: each drop has a unique phase offset
      const seed = i * 997 + Math.floor(time * 15);
      const rx = Math.floor(weatherRand(seed) * width);
      const baseY = (Math.floor(time * 12 + i * 3.7) % maxY);
      const ry = baseY;
      if (rx >= 0 && rx < width && ry >= 2 && ry < maxY) {
        const ch = rainChars[i % 2]!;
        const cell = buffer.cells[ry]?.[rx];
        if (cell) {
          buffer.setCell(rx, ry, ch, COLOR_RAIN, cell.bg);
        }
      }
    }

    // Storm lightning flash
    if (weather === WeatherType.Storm) {
      // Random flash: ~5% chance per frame
      if (stormFlashFrames > 0) {
        stormFlashFrames--;
        for (let y = 0; y < Math.min(effectiveGroundY - 4, height); y++) {
          const row = buffer.cells[y];
          if (!row) continue;
          for (let x = 0; x < width; x++) {
            const cell = row[x];
            if (cell) {
              cell.bg = 0xffffffaaff;
            }
          }
        }
      } else if (weatherRand(Math.floor(time * 30)) < 0.05) {
        stormFlashFrames = 2;
      }
    }
  }

  if (weather === WeatherType.Snow) {
    const flakeCount = 15;
    const COLOR_SNOW = 0xddddffff;
    const snowChars = ['*', '.', '\u00B7'];

    for (let i = 0; i < flakeCount; i++) {
      const seed = i * 1013;
      const baseX = Math.floor(weatherRand(seed) * width);
      // Slow drift down, slight sinusoidal x wobble
      const fy = (Math.floor(time * 3 + i * 4.1) % maxY);
      const xWobble = Math.floor(Math.sin(time * 0.8 + i * 1.3) * 2);
      const fx = ((baseX + xWobble) % width + width) % width;
      if (fx >= 0 && fx < width && fy >= 2 && fy < maxY) {
        const ch = snowChars[i % 3]!;
        const cell = buffer.cells[fy]?.[fx];
        if (cell) {
          buffer.setCell(fx, fy, ch, COLOR_SNOW, cell.bg);
        }
      }
    }
  }
}

// ─── Coin Burst Sparkle ────────────────────────────────────────

interface CoinSpark {
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  timer: number;
}

const coinSparks: CoinSpark[] = [];
const COIN_SPARK_DURATION = 0.3;

/**
 * Create a coin pickup/drop burst of 3-5 sparks radiating outward.
 */
export function createCoinSparkle(screenX: number, screenY: number): void {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    coinSparks.push({
      originX: screenX,
      originY: screenY,
      dx: Math.round(Math.cos(angle)),
      dy: Math.round(Math.sin(angle)),
      timer: COIN_SPARK_DURATION,
    });
  }
}

/**
 * Update coin sparkle timers. Call once per frame.
 */
export function updateCoinSparkles(dt: number): void {
  for (let i = coinSparks.length - 1; i >= 0; i--) {
    const s = coinSparks[i]!;
    s.timer -= dt;
    if (s.timer <= 0) {
      coinSparks.splice(i, 1);
    }
  }
}

/**
 * Render coin sparkles onto the buffer. Gold stars radiating outward.
 */
export function renderCoinSparkles(buffer: CellBufferDirect): void {
  for (const s of coinSparks) {
    const elapsed = COIN_SPARK_DURATION - s.timer;
    const step = Math.floor(elapsed / 0.1);
    const x = s.originX + s.dx * step;
    const y = s.originY + s.dy * step;
    if (x < 0 || x >= buffer.width || y < 0 || y >= buffer.height) continue;
    const fade = s.timer / COIN_SPARK_DURATION;
    const r = Math.floor(0xff * fade);
    const g = Math.floor(0xcc * fade);
    const fg = ((r & 0xff) << 24) | ((g & 0xff) << 16) | (0x00 << 8) | 0xff;
    const cell = buffer.cells[y]?.[x];
    if (cell) {
      buffer.setCell(x, y, '*', fg, cell.bg);
    }
  }
}
