/**
 * Lighthouse structure: decay protection for islands.
 *
 * Located at island edge (x = 10 or x = MAP_WIDTH - 10).
 * 3 upgrade tiers:
 *   Wooden (6 coins): 10 days decay protection
 *   Stone (12 coins): 20 days decay protection
 *   Iron (18 coins): 30 days decay protection
 *
 * With lighthouse: safe landing when monarch returns.
 * Without lighthouse: boat crashes, lose some coins.
 */

import {
  type GameState,
  MAP_WIDTH,
} from '../types';

export enum LighthouseTier {
  Ruins = 0,
  Wooden = 1,
  Stone = 2,
  Iron = 3,
}

const LIGHTHOUSE_COSTS: Record<number, number> = {
  [LighthouseTier.Wooden]: 6,
  [LighthouseTier.Stone]: 12,
  [LighthouseTier.Iron]: 18,
};

const LIGHTHOUSE_PROTECTION_DAYS: Record<number, number> = {
  [LighthouseTier.Ruins]: 0,
  [LighthouseTier.Wooden]: 10,
  [LighthouseTier.Stone]: 20,
  [LighthouseTier.Iron]: 30,
};

const LIGHTHOUSE_NAMES: Record<number, string> = {
  [LighthouseTier.Ruins]: 'Ruins',
  [LighthouseTier.Wooden]: 'Wooden Lighthouse',
  [LighthouseTier.Stone]: 'Stone Lighthouse',
  [LighthouseTier.Iron]: 'Iron Lighthouse',
};

/** Per-island lighthouse state */
interface LighthouseState {
  tier: LighthouseTier;
  x: number;
}

/** Lighthouse state per island index */
const lighthouseStates: Map<number, LighthouseState> = new Map();

/** Get default lighthouse positions */
const LIGHTHOUSE_LEFT_X = 10;
const LIGHTHOUSE_RIGHT_X = MAP_WIDTH - 10;

/** Get the lighthouse state for the current island */
function getLighthouseState(state: GameState): LighthouseState {
  let ls = lighthouseStates.get(state.islandIndex);
  if (!ls) {
    ls = { tier: LighthouseTier.Ruins, x: LIGHTHOUSE_LEFT_X };
    lighthouseStates.set(state.islandIndex, ls);
  }
  return ls;
}

/** Build or upgrade the lighthouse. Deducts coins. */
export function upgradeLighthouse(state: GameState): boolean {
  const ls = getLighthouseState(state);
  const nextTier = ls.tier + 1;
  if (nextTier > LighthouseTier.Iron) return false;

  const cost = LIGHTHOUSE_COSTS[nextTier];
  if (cost === undefined || state.monarchCoins < cost) return false;

  state.monarchCoins -= cost;
  ls.tier = nextTier;

  const name = LIGHTHOUSE_NAMES[nextTier] ?? 'Lighthouse';
  state.messages.push(`${name} built! ${LIGHTHOUSE_PROTECTION_DAYS[nextTier]} days of decay protection.`);
  return true;
}

/** Check if the lighthouse can be upgraded */
export function canUpgradeLighthouse(state: GameState): boolean {
  const ls = getLighthouseState(state);
  const nextTier = ls.tier + 1;
  if (nextTier > LighthouseTier.Iron) return false;
  const cost = LIGHTHOUSE_COSTS[nextTier];
  return cost !== undefined && state.monarchCoins >= cost;
}

/** Get the number of days of decay protection from the lighthouse */
export function getLighthouseDecayProtection(state: GameState): number {
  const ls = getLighthouseState(state);
  return LIGHTHOUSE_PROTECTION_DAYS[ls.tier] ?? 0;
}

/** Get the current lighthouse tier for an island */
export function getLighthouseTier(state: GameState): LighthouseTier {
  return getLighthouseState(state).tier;
}

/** Get the lighthouse x position for the current island */
export function getLighthouseX(state: GameState): number {
  return getLighthouseState(state).x;
}

/** Create the lighthouse (place at island edge) */
export function createLighthouse(state: GameState, x?: number): void {
  const ls = getLighthouseState(state);
  ls.x = x ?? LIGHTHOUSE_LEFT_X;
}

/** Update lighthouse (no per-frame updates needed currently) */
export function updateLighthouse(_state: GameState, _dt: number): void {
  // Reserved for future lighthouse animations or effects
}
