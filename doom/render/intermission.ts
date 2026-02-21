/**
 * Intermission screen rendering.
 *
 * Draws the level completion screen showing kill percentage,
 * completion time, and par time. Matches Doom's WI_drawStats.
 *
 * @module render/intermission
 */

import type { PixelFramebuffer } from '@blecsd/3d';
import type { TransitionState } from '../game/levelTransition.js';
import { PAR_TIMES, formatTime } from '../game/levelTransition.js';
import type { Palette } from '../wad/types.js';

// ─── Constants ───────────────────────────────────────────────────

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 200;

// ─── Intermission Rendering ──────────────────────────────────────

/**
 * Draw the intermission screen.
 *
 * @param fb - Pixel framebuffer to draw into
 * @param palette - Color palette
 * @param ts - Current transition state with stats and animation counters
 */
export function drawIntermission(
	fb: PixelFramebuffer,
	palette: Palette,
	ts: TransitionState,
): void {
	// Dark background - clear entire framebuffer to black
	const buf = fb.colorBuffer;
	const totalPixels = SCREEN_WIDTH * SCREEN_HEIGHT;
	for (let i = 0; i < totalPixels; i++) {
		const off = i << 2;
		buf[off] = 0;
		buf[off + 1] = 0;
		buf[off + 2] = 0;
		buf[off + 3] = 255;
	}

	const cx = Math.floor(SCREEN_WIDTH / 2);

	// Title: "FINISHED"
	drawText(buf, cx - 28, 16, 'FINISHED', 200, 200, 200);

	// Map name
	const mapLabel = ts.currentMap;
	drawText(buf, cx - (mapLabel.length * 4) / 2, 30, mapLabel, 255, 200, 50);

	// Divider line
	let divOff = (44 * SCREEN_WIDTH + 40) << 2;
	for (let x = 40; x < SCREEN_WIDTH - 40; x++) {
		buf[divOff] = 80;
		buf[divOff + 1] = 80;
		buf[divOff + 2] = 80;
		buf[divOff + 3] = 255;
		divOff += 4;
	}

	// Kill percentage
	const killPctStr = `${ts.displayKillPct}`;
	drawText(buf, 60, 56, 'KILLS', 200, 200, 200);
	drawRightAlignedText(buf, 240, 56, `${killPctStr}%`, 255, 255, 100);

	// Time
	const timeStr = formatTime(ts.displayTime);
	drawText(buf, 60, 74, 'TIME', 200, 200, 200);
	drawRightAlignedText(buf, 240, 74, timeStr, 255, 255, 100);

	// Par time
	const parTime = PAR_TIMES[ts.currentMap];
	if (parTime !== undefined) {
		const parStr = formatTime(parTime);
		drawText(buf, 60, 92, 'PAR', 200, 200, 200);
		drawRightAlignedText(buf, 240, 92, parStr, 255, 255, 100);
	}

	// Divider line
	divOff = (110 * SCREEN_WIDTH + 40) << 2;
	for (let x = 40; x < SCREEN_WIDTH - 40; x++) {
		buf[divOff] = 80;
		buf[divOff + 1] = 80;
		buf[divOff + 2] = 80;
		buf[divOff + 3] = 255;
		divOff += 4;
	}

	// Next map
	if (ts.nextMap) {
		drawText(buf, 60, 122, 'ENTERING', 200, 200, 200);
		const nextLabel = ts.nextMap;
		drawText(buf, cx - (nextLabel.length * 4) / 2, 136, nextLabel, 255, 200, 50);
	} else {
		drawText(buf, cx - 40, 122, 'EPISODE COMPLETE', 255, 100, 100);
	}

	// Prompt
	if (ts.countsFinished) {
		// Blink the prompt
		if ((ts.intermissionTics >> 4) & 1) {
			drawText(buf, cx - 48, 170, 'PRESS SPACE TO CONTINUE', 160, 160, 160);
		}
	}
}

// ─── Text Drawing ────────────────────────────────────────────────

/**
 * Draw text using a 3x5 bitmap font (4px per character with gap).
 */
function drawText(
	buf: Uint8ClampedArray,
	x: number,
	y: number,
	text: string,
	r: number,
	g: number,
	b: number,
): void {
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (!ch || ch === ' ') continue;
		const pattern = FONT[ch];
		if (!pattern) continue;
		const cx = x + i * 4;
		for (let row = 0; row < pattern.length; row++) {
			const line = pattern[row];
			if (!line) continue;
			for (let col = 0; col < line.length; col++) {
				if (line[col] !== '#') continue;
				const px = cx + col;
				const py = y + row;
				if (px >= 0 && px < SCREEN_WIDTH && py >= 0 && py < SCREEN_HEIGHT) {
					const offset = (py * SCREEN_WIDTH + px) << 2;
					buf[offset] = r;
					buf[offset + 1] = g;
					buf[offset + 2] = b;
					buf[offset + 3] = 255;
				}
			}
		}
	}
}

/**
 * Draw text right-aligned to the given X position.
 */
function drawRightAlignedText(
	buf: Uint8ClampedArray,
	rightX: number,
	y: number,
	text: string,
	r: number,
	g: number,
	b: number,
): void {
	const textWidth = text.length * 4;
	drawText(buf, rightX - textWidth, y, text, r, g, b);
}

/** Minimal 3x5 font for intermission text. */
const FONT: Readonly<Record<string, readonly string[]>> = {
	A: ['###', '# #', '###', '# #', '# #'],
	B: ['## ', '# #', '## ', '# #', '## '],
	C: ['###', '#  ', '#  ', '#  ', '###'],
	D: ['## ', '# #', '# #', '# #', '## '],
	E: ['###', '#  ', '## ', '#  ', '###'],
	F: ['###', '#  ', '## ', '#  ', '#  '],
	G: ['###', '#  ', '# #', '# #', '###'],
	H: ['# #', '# #', '###', '# #', '# #'],
	I: ['###', ' # ', ' # ', ' # ', '###'],
	K: ['# #', '##-', '#  ', '## ', '# #'],
	L: ['#  ', '#  ', '#  ', '#  ', '###'],
	M: ['# #', '###', '###', '# #', '# #'],
	N: ['# #', '## ', '###', '# #', '# #'],
	O: ['###', '# #', '# #', '# #', '###'],
	P: ['###', '# #', '###', '#  ', '#  '],
	R: ['###', '# #', '## ', '# #', '# #'],
	S: ['###', '#  ', '###', '  #', '###'],
	T: ['###', ' # ', ' # ', ' # ', ' # '],
	U: ['# #', '# #', '# #', '# #', '###'],
	W: ['# #', '# #', '###', '###', '# #'],
	X: ['# #', '# #', ' # ', '# #', '# #'],
	Y: ['# #', '# #', '###', ' # ', ' # '],
	'0': ['###', '# #', '# #', '# #', '###'],
	'1': [' # ', '## ', ' # ', ' # ', '###'],
	'2': ['###', '  #', '###', '#  ', '###'],
	'3': ['###', '  #', '###', '  #', '###'],
	'4': ['# #', '# #', '###', '  #', '  #'],
	'5': ['###', '#  ', '###', '  #', '###'],
	'6': ['###', '#  ', '###', '# #', '###'],
	'7': ['###', '  #', ' # ', ' # ', ' # '],
	'8': ['###', '# #', '###', '# #', '###'],
	'9': ['###', '# #', '###', '  #', '###'],
	':': ['   ', ' # ', '   ', ' # ', '   '],
	'%': ['# #', '  #', ' # ', '#  ', '# #'],
	'/': ['  #', '  #', ' # ', '#  ', '#  '],
	'-': ['   ', '   ', '###', '   ', '   '],
};
