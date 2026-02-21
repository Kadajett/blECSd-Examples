/**
 * Siege weapons: Ballista and Catapult with fire barrel upgrade.
 *
 * Ballista:
 *   Piercing damage: hits ALL greed in path (line)
 *   Range: 25 tiles, Damage: 5 per hit, Reload: 3s (2s with 2 builders)
 *   1-2 builders operate
 *
 * Catapult (from Phase 6):
 *   AoE damage: 15 damage in 3-tile radius
 *   Range: 20 tiles, Reload: 8s (4s with 2 builders)
 *   Auto-target: breeders > floaters > largest greedling cluster
 *   1-2 builders operate
 *
 * Fire Barrel (catapult upgrade):
 *   Requires Iron Keep tier
 *   5 coins per barrel, adds 3s burn to AoE
 *   Ground fire patch (3x3) for 5 seconds, 2 DPS to passing greed
 */

import { addEntity } from 'blecsd/core';
import { setPosition, getPosition } from 'blecsd/components';
import {
  type GameState,
  type StructureData,
  StructureType,
  TimeOfDay,
  GamePhase,
  GreedType,
  UnitRole,
  TownCenterTier,
  GROUND_Y,
} from '../types';
import { applyBurn } from '../systems/combat';

/** Ballista extends StructureType without modifying the shared types file */
const BALLISTA_TYPE = 14 as StructureType;

export const BALLISTA_COST = 12;
const BALLISTA_HP = 15;
const BALLISTA_DAMAGE = 5;
const BALLISTA_RANGE = 25;
const BALLISTA_COOLDOWN = 3.0;
const BALLISTA_COOLDOWN_2_BUILDERS = 2.0;

/** Catapult type */
const CATAPULT_TYPE = 18 as StructureType;

export const CATAPULT_COST = 15;
const CATAPULT_HP = 20;
const CATAPULT_DAMAGE = 15;
const CATAPULT_RANGE = 20;
const CATAPULT_RADIUS = 3;
const CATAPULT_COOLDOWN = 8.0;
const CATAPULT_COOLDOWN_2_BUILDERS = 4.0;

/** Fire barrel constants */
const FIRE_BARREL_COST = 5;
const FIRE_BARREL_BURN_DPS = 2;
const FIRE_BARREL_BURN_DURATION = 3;
const FIRE_GROUND_PATCH_DURATION = 5;
const FIRE_GROUND_PATCH_DPS = 2;
const FIRE_GROUND_PATCH_RADIUS = 3;

/** Per-siege weapon cooldown tracking by x position */
const siegeCooldowns: Map<number, number> = new Map();

/** Track if a siege weapon has fire barrel loaded */
const fireBarrelLoaded: Set<number> = new Set();

/** Ground fire patches: x -> { timer, radius } */
interface FirePatch {
  x: number;
  timer: number;
  radius: number;
  dps: number;
}
const firePatches: FirePatch[] = [];

/** Builder count near a siege weapon */
function countBuildersNear(state: GameState, x: number, radius: number): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Builder) continue;
    if (unit.hp <= 0) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - x) <= radius) count++;
  }
  return Math.min(count, 2); // cap at 2
}

/** Create a ballista at the given x position */
export function createBallista(state: GameState, x: number): StructureData | null {
  if (state.monarchCoins < BALLISTA_COST) return null;
  state.monarchCoins -= BALLISTA_COST;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const ballista: StructureData = {
    eid,
    type: BALLISTA_TYPE,
    x,
    hp: BALLISTA_HP,
    maxHp: BALLISTA_HP,
    level: 1,
    assignedWorkers: [],
  };

  state.structures.set(x, ballista);
  siegeCooldowns.set(x, BALLISTA_COOLDOWN);
  return ballista;
}

/** Check if a structure is a ballista */
export function isBallistaStructure(type: StructureType): boolean {
  return type === BALLISTA_TYPE;
}

/** Check if a structure is a catapult */
export function isCatapultStructure(type: StructureType): boolean {
  return type === CATAPULT_TYPE;
}

/** Load a fire barrel into a catapult. Requires Iron Keep tier. 5 coins. */
export function loadFireBarrel(state: GameState, x: number): boolean {
  const structure = state.structures.get(x);
  if (!structure || structure.type !== CATAPULT_TYPE) return false;
  if (state.townCenterTier < TownCenterTier.IronKeep) return false;
  if (state.monarchCoins < FIRE_BARREL_COST) return false;
  if (fireBarrelLoaded.has(x)) return false;

  state.monarchCoins -= FIRE_BARREL_COST;
  fireBarrelLoaded.add(x);
  state.messages.push('Fire barrel loaded into catapult!');
  return true;
}

/**
 * Auto-target priority: breeders > floaters > largest greedling group.
 * Returns the x position of the best target, or null.
 */
export function getTargetPriority(state: GameState, weaponX: number, range: number): number | null {
  if (state.greeds.length === 0) return null;

  // Priority 1: Breeders in range
  for (const greed of state.greeds) {
    if (greed.hp <= 0 || greed.type !== GreedType.Breeder) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - weaponX) <= range) return pos.x;
  }

  // Priority 2: Floaters in range
  for (const greed of state.greeds) {
    if (greed.hp <= 0 || greed.type !== GreedType.Floater) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - weaponX) <= range) return pos.x;
  }

  // Priority 3: Largest greedling cluster in range
  const positions: number[] = [];
  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - weaponX) <= range) positions.push(pos.x);
  }

  if (positions.length === 0) return null;

  let bestX = positions[0];
  let bestCount = 0;
  for (const px of positions) {
    let count = 0;
    for (const qx of positions) {
      if (Math.abs(px - qx) <= CATAPULT_RADIUS) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestX = px;
    }
  }

  return bestX;
}

/** Fire a ballista at a target. Piercing: hits all greed in line. */
export function fireBallista(state: GameState, weaponX: number): number {
  const targetX = getTargetPriority(state, weaponX, BALLISTA_RANGE);
  if (targetX === null) return 0;

  const direction = targetX > weaponX ? 1 : -1;
  let hitCount = 0;

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    const dx = pos.x - weaponX;
    if (dx * direction >= 0 && Math.abs(dx) <= BALLISTA_RANGE) {
      greed.hp -= BALLISTA_DAMAGE;
      hitCount++;
    }
  }

  return hitCount;
}

/** Fire a catapult at a target. AoE: damages all greed in radius. */
export function fireCatapult(state: GameState, weaponX: number): number {
  const targetX = getTargetPriority(state, weaponX, CATAPULT_RANGE);
  if (targetX === null) return 0;

  let hitCount = 0;
  const hasFire = fireBarrelLoaded.has(weaponX);

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    if (Math.abs(pos.x - targetX) <= CATAPULT_RADIUS) {
      greed.hp -= CATAPULT_DAMAGE;
      if (hasFire) {
        applyBurn(greed, FIRE_BARREL_BURN_DPS, FIRE_BARREL_BURN_DURATION);
      }
      hitCount++;
    }
  }

  // Fire barrel: create ground fire patch
  if (hasFire) {
    fireBarrelLoaded.delete(weaponX);
    firePatches.push({
      x: targetX,
      timer: FIRE_GROUND_PATCH_DURATION,
      radius: FIRE_GROUND_PATCH_RADIUS,
      dps: FIRE_GROUND_PATCH_DPS,
    });
  }

  return hitCount;
}

/** Update ground fire patches: damage greeds walking through them */
function updateFirePatches(state: GameState, dt: number): void {
  for (let i = firePatches.length - 1; i >= 0; i--) {
    const patch = firePatches[i];
    patch.timer -= dt;

    if (patch.timer <= 0) {
      firePatches.splice(i, 1);
      continue;
    }

    // Damage greeds in the fire patch
    for (const greed of state.greeds) {
      if (greed.hp <= 0) continue;
      const pos = getPosition(state.world, greed.eid);
      if (!pos) continue;
      if (Math.abs(pos.x - patch.x) <= patch.radius) {
        greed.hp -= patch.dps * dt;
      }
    }
  }
}

/** Update all siege weapons. Call once per frame. */
export function updateSiegeWeapons(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  // Update fire patches regardless of time of day
  updateFirePatches(state, dt);

  if (state.timeOfDay !== TimeOfDay.Night) return;

  for (const [x, structure] of state.structures) {
    const isBallista = structure.type === BALLISTA_TYPE;
    const isCatapult = structure.type === CATAPULT_TYPE;
    if (!isBallista && !isCatapult) continue;

    // Tick cooldown
    const builders = countBuildersNear(state, x, 3);
    if (builders === 0) continue; // need at least 1 builder to operate

    const cooldown = (siegeCooldowns.get(x) ?? 0) - dt;
    if (cooldown > 0) {
      siegeCooldowns.set(x, cooldown);
      continue;
    }

    if (isBallista) {
      const hits = fireBallista(state, x);
      if (hits > 0) {
        state.messages.push(`Ballista pierces ${hits} greeds!`);
      }
      siegeCooldowns.set(x, builders >= 2 ? BALLISTA_COOLDOWN_2_BUILDERS : BALLISTA_COOLDOWN);
    } else {
      const hits = fireCatapult(state, x);
      if (hits > 0) {
        state.messages.push(`Catapult hits ${hits} greeds!`);
      }
      siegeCooldowns.set(x, builders >= 2 ? CATAPULT_COOLDOWN_2_BUILDERS : CATAPULT_COOLDOWN);
    }
  }
}

/** Update legacy ballista function (delegates to updateSiegeWeapons) */
export function updateBallista(state: GameState, dt: number): void {
  updateSiegeWeapons(state, dt);
}
