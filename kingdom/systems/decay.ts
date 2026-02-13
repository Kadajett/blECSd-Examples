/**
 * Decay system: walls deteriorate when the monarch leaves an island.
 *
 * Decay rates per wall tier (days until removal):
 *   Spikes: 2 days
 *   WallWood: 4 days
 *   WallStone: 8 days
 *   TallStone: 12 days
 *   WallIron: 20 days
 *
 * Lighthouse adds protection days (additive).
 * Walls decay from outermost to innermost.
 * Completed islands (all portals destroyed) do NOT decay.
 * Banker coins persist through decay. Gems never decay.
 */

import {
  type GameState,
  StructureType,
} from '../types';
import {
  isWallStructure,
  isTowerStructure,
  isGateStructure,
  isDefensiveStructure,
} from '../structures/wall';
import { isPortalCleared, PORTAL_POSITIONS_WORLD } from '../structures/portal';

/** Decay rates in days per wall tier */
const DECAY_RATES: Partial<Record<number, number>> = {
  [StructureType.Spikes]: 2,
  [StructureType.WallWood]: 4,
  [StructureType.WallStone]: 8,
  [StructureType.TallStone]: 12,
  [StructureType.WallIron]: 20,
};

/** Tower decay rate (iron-tier equivalent) */
const TOWER_DECAY_RATE = 20;

/** Gate decay rate (wood-tier equivalent) */
const GATE_DECAY_RATE = 4;

/** Per-island last visit day tracking */
const islandLastVisit: Map<number, number> = new Map();

/** Get the decay rate in days for a wall type */
export function getDecayRate(type: StructureType): number {
  if (isTowerStructure(type)) return TOWER_DECAY_RATE;
  if (isGateStructure(type)) return GATE_DECAY_RATE;
  return DECAY_RATES[type] ?? 4;
}

/** Record when the monarch leaves an island */
export function recordIslandDeparture(islandIndex: number, dayCount: number): void {
  islandLastVisit.set(islandIndex, dayCount);
}

/** Get the last visit day for an island, or 0 if never visited */
export function getLastVisitDay(islandIndex: number): number {
  return islandLastVisit.get(islandIndex) ?? 0;
}

/**
 * Check if an island is completed (all portals destroyed).
 * Completed islands do NOT decay.
 */
function isIslandCompleted(_islandIndex: number): boolean {
  // Check if all portal positions are cleared
  for (const px of PORTAL_POSITIONS_WORLD) {
    if (!isPortalCleared(px)) return false;
  }
  return true;
}

/**
 * Apply accumulated decay to an island's structures when the monarch returns.
 * Walls that exceed their decay threshold are removed.
 * Outermost walls decay first.
 *
 * @param state - Current game state (structures will be modified)
 * @param daysAway - Number of days the monarch was away
 * @param lighthouseProtection - Additional protection days from lighthouse
 */
export function applyDecay(
  state: GameState,
  daysAway: number,
  lighthouseProtection: number,
): void {
  // Completed islands don't decay
  if (isIslandCompleted(state.islandIndex)) return;

  const effectiveDaysAway = Math.max(0, daysAway - lighthouseProtection);
  if (effectiveDaysAway <= 0) return;

  // Collect all defensive structures and sort by distance from center (outermost first)
  const centerX = 600;
  const defensiveStructures: { x: number; type: StructureType }[] = [];

  for (const [x, structure] of state.structures) {
    if (!isDefensiveStructure(structure.type)) continue;
    defensiveStructures.push({ x, type: structure.type });
  }

  // Sort outermost first (furthest from center)
  defensiveStructures.sort((a, b) =>
    Math.abs(b.x - centerX) - Math.abs(a.x - centerX)
  );

  // Remove walls that exceed their decay threshold
  const toRemove: number[] = [];
  for (const { x, type } of defensiveStructures) {
    const decayDays = getDecayRate(type);
    if (effectiveDaysAway >= decayDays) {
      toRemove.push(x);
    }
  }

  for (const x of toRemove) {
    state.structures.delete(x);
  }

  if (toRemove.length > 0) {
    state.messages.push(`${toRemove.length} structures decayed while you were away.`);
  }
}

/**
 * Apply decay when returning to an island.
 * Call this when the monarch arrives at a previously visited island.
 */
export function applyDecayOnReturn(
  state: GameState,
  lighthouseProtection: number,
): void {
  const lastVisit = getLastVisitDay(state.islandIndex);
  if (lastVisit <= 0) return;

  const daysAway = state.dayCount - lastVisit;
  if (daysAway <= 0) return;

  applyDecay(state, daysAway, lighthouseProtection);
}
