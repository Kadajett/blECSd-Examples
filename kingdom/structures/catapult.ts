/**
 * Catapult siege weapon: heavy AoE damage.
 * Requires TownCenterTier >= 5 (Stone Fort).
 * One per side maximum. 1-2 builders operate.
 * 15 damage, 3-tile AoE radius, 15-tile range.
 * Reload: 8s (1 builder), 4s (2 builders).
 * Auto-fires when loaded and greed in range during night.
 */

import { getPosition } from 'blecsd';
import type { Entity } from 'blecsd';
import {
  type GameState,
  StructureType,
  TownCenterTier,
  TimeOfDay,
  GamePhase,
  AIState,
  UnitRole,
} from '../types';
import { getOutermostWalls } from './wall';

export const CATAPULT_TYPE = 18 as StructureType;
export const CATAPULT_COST = 6;

const CATAPULT_DAMAGE = 15;
const CATAPULT_AOE_RADIUS = 3;
const CATAPULT_RANGE = 15;
const CATAPULT_RELOAD_BASE = 8.0;
const CATAPULT_RELOAD_DUAL = 4.0;
const MAX_CATAPULT_BUILDERS = 2;
const PLACEMENT_RADIUS = 5;
const MIN_TOWN_CENTER_TIER = TownCenterTier.StoneFort;

export interface CatapultData {
  x: number;
  loaded: boolean;
  reloadTimer: number;
  builders: Entity[];
}

/** Module-level catapult state: one per side */
const catapults: Map<string, CatapultData> = new Map();

/**
 * Create a catapult on the given side ('left' or 'right').
 * Placed near the outermost wall. Returns null if requirements not met.
 */
export function createCatapult(state: GameState, side: 'left' | 'right'): CatapultData | null {
  if (catapults.has(side)) return null;
  if (state.townCenterTier < MIN_TOWN_CENTER_TIER) return null;
  if (state.monarchCoins < CATAPULT_COST) return null;

  const walls = getOutermostWalls(state);
  const wallX = side === 'left' ? walls.left : walls.right;
  if (wallX === null) return null;

  state.monarchCoins -= CATAPULT_COST;

  const offset = side === 'left' ? -PLACEMENT_RADIUS : PLACEMENT_RADIUS;
  const x = wallX + offset;

  const data: CatapultData = {
    x,
    loaded: false,
    reloadTimer: CATAPULT_RELOAD_BASE,
    builders: [],
  };

  catapults.set(side, data);
  state.messages.push(`Catapult built on ${side} flank!`);
  return data;
}

/** Check if a builder entity is assigned to a catapult */
export function isCatapultBuilder(eid: Entity): boolean {
  for (const [, cat] of catapults) {
    if (cat.builders.includes(eid)) return true;
  }
  return false;
}

/** Assign a builder to a catapult. Returns true if assigned. */
export function assignBuilderToCatapult(_state: GameState, side: string, builderEid: Entity): boolean {
  const catapult = catapults.get(side);
  if (!catapult) return false;
  if (catapult.builders.length >= MAX_CATAPULT_BUILDERS) return false;
  if (catapult.builders.includes(builderEid)) return false;

  catapult.builders.push(builderEid);
  return true;
}

/** Find the nearest greed within catapult range */
function findNearestGreedInRange(state: GameState, catapultX: number): number | null {
  let nearestX: number | null = null;
  let nearestDist = Infinity;

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    const dist = Math.abs(pos.x - catapultX);
    if (dist <= CATAPULT_RANGE && dist < nearestDist) {
      nearestDist = dist;
      nearestX = pos.x;
    }
  }

  return nearestX;
}

/** Fire catapult at target position, dealing AoE damage */
function fireCatapult(state: GameState, catapult: CatapultData, targetX: number): void {
  let hitCount = 0;

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    if (Math.abs(pos.x - targetX) <= CATAPULT_AOE_RADIUS) {
      greed.hp -= CATAPULT_DAMAGE;
      hitCount++;
    }
  }

  catapult.loaded = false;
  const reloadTime = catapult.builders.length >= 2 ? CATAPULT_RELOAD_DUAL : CATAPULT_RELOAD_BASE;
  catapult.reloadTimer = reloadTime;

  if (hitCount > 0) {
    state.messages.push(`Catapult fires! ${hitCount} greeds hit for ${CATAPULT_DAMAGE} damage.`);
  }
}

/** Update all catapults: auto-assign idle builders, reload, fire */
export function updateCatapults(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  for (const [, catapult] of catapults) {
    // Clean up dead/gone builders
    catapult.builders = catapult.builders.filter(eid => {
      return state.units.some(u => u.eid === eid && u.hp > 0);
    });

    // Auto-assign nearby idle builders
    if (catapult.builders.length < MAX_CATAPULT_BUILDERS) {
      for (const unit of state.units) {
        if (unit.role !== UnitRole.Builder) continue;
        if (unit.aiState !== AIState.Idle) continue;
        if (catapult.builders.includes(unit.eid)) continue;

        const pos = getPosition(state.world, unit.eid);
        if (!pos) continue;

        if (Math.abs(pos.x - catapult.x) <= PLACEMENT_RADIUS) {
          catapult.builders.push(unit.eid);
          unit.aiState = AIState.Working;
          if (catapult.builders.length >= MAX_CATAPULT_BUILDERS) break;
        }
      }
    }

    // Only fire during night
    if (state.timeOfDay !== TimeOfDay.Night) continue;
    if (catapult.builders.length === 0) continue;

    if (!catapult.loaded) {
      catapult.reloadTimer -= dt;
      if (catapult.reloadTimer <= 0) {
        catapult.loaded = true;
      }
      continue;
    }

    // Find target and fire
    const targetX = findNearestGreedInRange(state, catapult.x);
    if (targetX !== null) {
      fireCatapult(state, catapult, targetX);
    }
  }
}

/** Get all catapults (read-only) */
export function getCatapults(): ReadonlyMap<string, CatapultData> {
  return catapults;
}
