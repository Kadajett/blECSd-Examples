/**
 * Bomb structure: late-game weapon to permanently destroy portals.
 *
 * Requires Iron Keep (TownCenterTier >= 7) and 18 coins to build.
 * 3 builders push bomb toward nearest active portal at 0.3x speed.
 * Knight escort required (at least 1 knight must accompany).
 * 5 coins to ignite at portal. 20 second escape timer.
 * After timer: portal destroyed permanently, all greed from that portal die.
 * Builders caught in blast radius are lost.
 */

import type { Entity } from 'blecsd/core';
import { getPosition } from 'blecsd/components';
import {
  type GameState,
  TownCenterTier,
  UnitRole,
  AIState,
  GamePhase,
} from '../types';
import { getActivePortals, destroyPortal } from './portal';

const BOMB_COST = 18;
const BOMB_IGNITE_COST = 5;
const BOMB_BUILDER_COUNT = 3;
const BOMB_PUSH_SPEED = 0.3;
const BOMB_ESCAPE_TIME = 20.0;
const BOMB_BLAST_RADIUS = 15;
const MIN_TOWN_CENTER_TIER = TownCenterTier.IronKeep;

interface BombState {
  built: boolean;
  x: number;
  pushers: Entity[];
  escortKnight: Entity | null;
  targetPortalX: number;
  ignited: boolean;
  escapeTimer: number;
  pushing: boolean;
}

let bombState: BombState = {
  built: false,
  x: 0,
  pushers: [],
  escortKnight: null,
  targetPortalX: 0,
  ignited: false,
  escapeTimer: 0,
  pushing: false,
};

/** Check if a bomb is currently active (built or being pushed) */
export function isBombActive(): boolean {
  return bombState.built;
}

/** Get current bomb state (read-only) */
export function getBombState(): Readonly<BombState> {
  return bombState;
}

/** Create a bomb near the town center. Returns true if successful. */
export function createBomb(state: GameState): boolean {
  if (bombState.built) return false;
  if (state.townCenterTier < MIN_TOWN_CENTER_TIER) return false;
  if (state.monarchCoins < BOMB_COST) return false;

  // Need 3 idle builders nearby
  const idleBuilders: Entity[] = [];
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Builder) continue;
    if (unit.aiState !== AIState.Idle && unit.aiState !== AIState.Working) continue;
    idleBuilders.push(unit.eid);
    if (idleBuilders.length >= BOMB_BUILDER_COUNT) break;
  }

  if (idleBuilders.length < BOMB_BUILDER_COUNT) return false;

  state.monarchCoins -= BOMB_COST;

  // Find nearest active portal
  const portals = getActivePortals(state);
  if (portals.length === 0) return false;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  const monarchX = monarchPos?.x ?? 600;
  let nearestPortal = portals[0];
  let nearestDist = Math.abs(monarchX - portals[0]);
  for (let i = 1; i < portals.length; i++) {
    const dist = Math.abs(monarchX - portals[i]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPortal = portals[i];
    }
  }

  bombState = {
    built: true,
    x: monarchX,
    pushers: idleBuilders.slice(0, BOMB_BUILDER_COUNT),
    escortKnight: null,
    targetPortalX: nearestPortal,
    ignited: false,
    escapeTimer: 0,
    pushing: false,
  };

  // Mark builders as working
  for (const eid of bombState.pushers) {
    const unit = state.units.find(u => u.eid === eid);
    if (unit) unit.aiState = AIState.Working;
  }

  state.messages.push('Bomb constructed! Assign a knight escort to begin pushing.');
  return true;
}

/** Start pushing the bomb toward the target portal */
export function startBombPush(state: GameState): boolean {
  if (!bombState.built || bombState.pushing || bombState.ignited) return false;

  // Find nearest knight to escort
  let bestKnight: Entity | null = null;
  let bestDist = Infinity;

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Knight) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const dist = Math.abs(pos.x - bombState.x);
    if (dist < bestDist) {
      bestDist = dist;
      bestKnight = unit.eid;
    }
  }

  if (bestKnight === null) {
    state.messages.push('A knight escort is required to push the bomb!');
    return false;
  }

  bombState.escortKnight = bestKnight;
  bombState.pushing = true;

  const knight = state.units.find(u => u.eid === bestKnight);
  if (knight) knight.aiState = AIState.Working;

  state.messages.push('Bomb push started toward portal!');
  return true;
}

/** Ignite the bomb at the portal. Costs BOMB_IGNITE_COST coins. */
export function igniteBomb(state: GameState): boolean {
  if (!bombState.built || !bombState.pushing || bombState.ignited) return false;
  if (state.monarchCoins < BOMB_IGNITE_COST) return false;

  const distToPortal = Math.abs(bombState.x - bombState.targetPortalX);
  if (distToPortal > 3) return false;

  state.monarchCoins -= BOMB_IGNITE_COST;
  bombState.ignited = true;
  bombState.escapeTimer = BOMB_ESCAPE_TIME;

  state.messages.push(`Bomb ignited! ${BOMB_ESCAPE_TIME}s until detonation. Escape!`);
  return true;
}

/** Update bomb state each frame */
export function updateBomb(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;
  if (!bombState.built) return;

  // Clean up dead pushers
  bombState.pushers = bombState.pushers.filter(eid =>
    state.units.some(u => u.eid === eid && u.hp > 0)
  );

  // Check knight escort is alive
  if (bombState.escortKnight !== null) {
    const knightAlive = state.units.some(
      u => u.eid === bombState.escortKnight && u.hp > 0
    );
    if (!knightAlive) {
      bombState.escortKnight = null;
      if (bombState.pushing && !bombState.ignited) {
        bombState.pushing = false;
        state.messages.push('Knight escort lost! Bomb push halted.');
      }
    }
  }

  // Handle ignited bomb: escape timer
  if (bombState.ignited) {
    bombState.escapeTimer -= dt;

    if (bombState.escapeTimer <= 0) {
      // Detonation: destroy portal permanently
      destroyPortal(state, bombState.targetPortalX);

      // Kill all greed near the portal
      for (const greed of state.greeds) {
        if (greed.hp <= 0) continue;
        const pos = getPosition(state.world, greed.eid);
        if (!pos) continue;
        if (Math.abs(pos.x - bombState.targetPortalX) <= BOMB_BLAST_RADIUS) {
          greed.hp = 0;
        }
      }

      // Builders caught in blast radius are lost
      for (const eid of bombState.pushers) {
        const unit = state.units.find(u => u.eid === eid);
        if (!unit) continue;
        const pos = getPosition(state.world, unit.eid);
        if (!pos) continue;
        if (Math.abs(pos.x - bombState.targetPortalX) <= BOMB_BLAST_RADIUS) {
          unit.hp = 0;
        }
      }

      state.messages.push('BOOM! The portal has been permanently destroyed!');

      // Reset bomb state
      bombState = {
        built: false,
        x: 0,
        pushers: [],
        escortKnight: null,
        targetPortalX: 0,
        ignited: false,
        escapeTimer: 0,
        pushing: false,
      };
    }
    return;
  }

  // Push bomb toward target portal
  if (bombState.pushing && bombState.pushers.length > 0 && bombState.escortKnight !== null) {
    const direction = bombState.x < bombState.targetPortalX ? 1 : -1;
    const distToPortal = Math.abs(bombState.x - bombState.targetPortalX);

    if (distToPortal > 1) {
      bombState.x += BOMB_PUSH_SPEED * direction * dt;
    }
  }
}

/** Check if a builder is assigned to the bomb */
export function isBombBuilder(eid: Entity): boolean {
  return bombState.pushers.includes(eid);
}
