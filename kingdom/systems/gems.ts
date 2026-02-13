/**
 * Gem currency system: secondary currency that persists across islands.
 * Gems are earned from portal destruction and gem chests.
 * Used for unlocking mounts, statues, and hermits.
 */

import type { GameState } from '../types';

const DEFAULT_GEM_CAPACITY = 10;

/** Add gems to the player's gem count, capped at capacity */
export function addGems(state: GameState, amount: number): void {
  const capacity = state.gemCapacity ?? DEFAULT_GEM_CAPACITY;
  state.gems = Math.min(state.gems + amount, capacity);
}

/** Spend gems. Returns true if the player had enough gems. */
export function spendGems(state: GameState, amount: number): boolean {
  if (state.gems < amount) return false;
  state.gems -= amount;
  return true;
}

/** Get current gem count */
export function getGems(state: GameState): number {
  return state.gems;
}

/** Check if player can afford a gem cost */
export function canAffordGems(state: GameState, cost: number): boolean {
  return state.gems >= cost;
}

/**
 * Drop gems when a portal is destroyed.
 * Small portals drop 1-2 gems.
 * Returns the number of gems dropped.
 */
export function dropGemsOnPortalDestruction(state: GameState, _portalX: number): number {
  const amount = 1 + Math.floor(Math.random() * 2); // 1-2
  addGems(state, amount);
  return amount;
}
