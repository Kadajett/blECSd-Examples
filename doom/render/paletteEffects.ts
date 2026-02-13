/**
 * Palette effects: damage tint, item pickup, radiation suit, berserk.
 *
 * The PLAYPAL lump contains 14 palettes. Palette 0 is the normal
 * palette; palettes 1-13 provide screen-wide color effects:
 *
 *   0      Normal
 *   1-8    Damage tint (increasing red intensity)
 *   9      Item pickup (gold tint)
 *   10-12  Radiation suit (green tint, cycling)
 *   13     Berserk (deep red)
 *
 * This module manages a PaletteState that tracks active effects
 * and returns the correct palette index each tic.
 *
 * @module render/paletteEffects
 */

// ─── Types ──────────────────────────────────────────────────────

export interface PaletteState {
	/** Remaining tics of damage red flash (0 = no damage tint). */
	damageCount: number;
	/** Remaining tics of bonus gold flash (0 = no pickup tint). */
	bonusCount: number;
	/** Whether radiation suit is active. */
	radSuit: boolean;
	/** Radiation suit palette cycling counter. */
	radTic: number;
	/** Whether berserk is active. */
	berserk: boolean;
}

// ─── Constants ──────────────────────────────────────────────────

/** How quickly damage tint fades per tic. */
const DAMAGE_FADE_RATE = 1;

/** How quickly bonus tint fades per tic. */
const BONUS_FADE_RATE = 1;

/** Maximum damage count (maps to palette 8). */
const MAX_DAMAGE_COUNT = 64;

/** Maximum bonus count (maps to palette 9). */
const MAX_BONUS_COUNT = 16;

/** Radiation suit palette cycle length. */
const RAD_CYCLE = 3;

// ─── State Management ───────────────────────────────────────────

/**
 * Create a default palette state with no active effects.
 */
export function createPaletteState(): PaletteState {
	return {
		damageCount: 0,
		bonusCount: 0,
		radSuit: false,
		radTic: 0,
		berserk: false,
	};
}

/**
 * Tick the palette state and return the current palette index (0-13).
 *
 * Priority order (highest to lowest):
 *   1. Damage red flash (palettes 1-8)
 *   2. Item pickup gold flash (palette 9)
 *   3. Radiation suit green tint (palettes 10-12)
 *   4. Berserk red tint (palette 13)
 *   5. Normal (palette 0)
 */
export function tickPalette(state: PaletteState): number {
	// Fade active effects
	if (state.damageCount > 0) {
		state.damageCount = Math.max(0, state.damageCount - DAMAGE_FADE_RATE);
	}
	if (state.bonusCount > 0) {
		state.bonusCount = Math.max(0, state.bonusCount - BONUS_FADE_RATE);
	}

	// Tick radiation suit cycling
	if (state.radSuit) {
		state.radTic++;
	}

	// Determine palette index by priority
	if (state.damageCount > 0) {
		// Map damageCount (1-64) to palette (1-8)
		const palIdx = Math.ceil((state.damageCount / MAX_DAMAGE_COUNT) * 8);
		return Math.min(8, Math.max(1, palIdx));
	}

	if (state.bonusCount > 0) {
		return 9;
	}

	if (state.radSuit) {
		// Cycle through palettes 10, 11, 12
		return 10 + (Math.floor(state.radTic / 8) % RAD_CYCLE);
	}

	if (state.berserk) {
		return 13;
	}

	return 0;
}

/**
 * Get the current palette index without ticking (read-only).
 * Use this in rendering code to select the active palette.
 */
export function getPaletteIndex(state: PaletteState): number {
	if (state.damageCount > 0) {
		const palIdx = Math.ceil((state.damageCount / MAX_DAMAGE_COUNT) * 8);
		return Math.min(8, Math.max(1, palIdx));
	}
	if (state.bonusCount > 0) {
		return 9;
	}
	if (state.radSuit) {
		return 10 + (Math.floor(state.radTic / 8) % RAD_CYCLE);
	}
	if (state.berserk) {
		return 13;
	}
	return 0;
}

// ─── Effect Triggers ────────────────────────────────────────────

/**
 * Apply damage to the palette effect state.
 * Higher damage values produce a more intense red flash.
 *
 * @param state - Palette state to modify
 * @param damage - Amount of damage taken
 */
export function applyDamage(state: PaletteState, damage: number): void {
	state.damageCount = Math.min(MAX_DAMAGE_COUNT, state.damageCount + damage);
}

/**
 * Trigger the item pickup gold flash.
 */
export function applyBonus(state: PaletteState): void {
	state.bonusCount = MAX_BONUS_COUNT;
}

/**
 * Set the radiation suit effect on or off.
 */
export function setRadSuit(state: PaletteState, active: boolean): void {
	state.radSuit = active;
	if (!active) {
		state.radTic = 0;
	}
}

/**
 * Set the berserk effect on or off.
 */
export function setBerserk(state: PaletteState, active: boolean): void {
	state.berserk = active;
}
