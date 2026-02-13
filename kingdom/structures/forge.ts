/**
 * Forge structure: produces iron swords for squires to become knights.
 *
 * Found on islands 3+ as ruins at a fixed position (x = 400).
 * 8 coins to repair from ruins.
 * Produces iron swords: 12 coins per sword.
 * Sword appears at forge position; squire walks to forge, picks up sword, becomes Knight.
 * One sword produced at a time, 30-second production time.
 * Requires TownCenterTier >= 7 (Iron Keep).
 */

import { getPosition } from 'blecsd';
import {
  type GameState,
  TownCenterTier,
  UnitRole,
  AIState,
  GamePhase,
} from '../types';

const FORGE_REPAIR_COST = 8;
const FORGE_SWORD_COST = 12;
const FORGE_PRODUCTION_TIME = 30.0;
const FORGE_X_DEFAULT = 400;
const MIN_ISLAND = 3;
const MIN_TOWN_CENTER_TIER = TownCenterTier.IronKeep;

interface ForgeState {
  built: boolean;
  x: number;
  swordReady: boolean;
  swordTimer: number;
  producing: boolean;
}

let forgeState: ForgeState = {
  built: false,
  x: FORGE_X_DEFAULT,
  swordReady: false,
  swordTimer: 0,
  producing: false,
};

/** Check if the forge is built */
export function isForgeBuilt(): boolean {
  return forgeState.built;
}

/** Check if a sword is ready for pickup */
export function isSwordReady(): boolean {
  return forgeState.swordReady;
}

/** Get forge position */
export function getForgeX(): number {
  return forgeState.x;
}

/** Get forge state (read-only) */
export function getForgeState(): Readonly<ForgeState> {
  return forgeState;
}

/** Repair the forge from ruins. Costs 8 coins. */
export function buildForge(state: GameState): boolean {
  if (forgeState.built) return false;
  if (state.islandIndex < MIN_ISLAND) return false;
  if (state.townCenterTier < MIN_TOWN_CENTER_TIER) return false;
  if (state.monarchCoins < FORGE_REPAIR_COST) return false;

  state.monarchCoins -= FORGE_REPAIR_COST;
  forgeState.built = true;
  forgeState.x = FORGE_X_DEFAULT;

  state.messages.push('Forge repaired! Drop coins to begin producing swords.');
  return true;
}

/** Start producing a sword. Costs 12 coins. */
export function startSwordProduction(state: GameState): boolean {
  if (!forgeState.built) return false;
  if (forgeState.producing || forgeState.swordReady) return false;
  if (state.monarchCoins < FORGE_SWORD_COST) return false;

  state.monarchCoins -= FORGE_SWORD_COST;
  forgeState.producing = true;
  forgeState.swordTimer = FORGE_PRODUCTION_TIME;

  state.messages.push('Forge begins producing an iron sword...');
  return true;
}

/** Collect the sword: nearest squire becomes a knight */
export function collectSword(state: GameState): boolean {
  if (!forgeState.swordReady) return false;

  // Find nearest squire to forge
  let bestSquire = -1;
  let bestDist = Infinity;

  for (let i = 0; i < state.units.length; i++) {
    const unit = state.units[i];
    if (unit.role !== UnitRole.Squire) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const dist = Math.abs(pos.x - forgeState.x);
    if (dist < bestDist) {
      bestDist = dist;
      bestSquire = i;
    }
  }

  if (bestSquire === -1) return false;

  // Promote squire to knight
  const squire = state.units[bestSquire];
  squire.role = UnitRole.Knight;
  squire.hp = 5;
  squire.maxHp = 5;
  squire.aiState = AIState.Idle;

  forgeState.swordReady = false;
  state.messages.push('Squire picks up iron sword and becomes a Knight!');
  return true;
}

/** Update forge production timer */
export function updateForge(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;
  if (!forgeState.built) return;
  if (!forgeState.producing) return;

  forgeState.swordTimer -= dt;
  if (forgeState.swordTimer <= 0) {
    forgeState.producing = false;
    forgeState.swordReady = true;
    state.messages.push('Iron sword ready at the forge!');

    // Auto-collect if a squire is nearby
    collectSword(state);
  }
}

/** Reset forge state (for island transitions) */
export function resetForge(): void {
  forgeState = {
    built: false,
    x: FORGE_X_DEFAULT,
    swordReady: false,
    swordTimer: 0,
    producing: false,
  };
}
