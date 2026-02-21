/**
 * Archer entity - hunts animals during day, defends walls at night.
 * Tracks kills for leveling: +3 range at 5 kills, 0.8x cooldown at 10 kills.
 * Prioritizes CrownStealers over other greed at night.
 * Targets animals (rabbits/deer) during day before targeting greed.
 * Scout-origin archers gain an additional +3 range bonus.
 *
 * Tower archers: assigned to towers, stationary, +5 range/tier, 100% accuracy.
 * Ground archers: hunt/defend as usual, patrol, ~33% accuracy (existing).
 * Recruitment distributes archers evenly left/right.
 */
import { addEntity } from 'blecsd/core';
import { getPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  type UnitData,
  type ProjectileData,
  type StructureData,
  AIState,
  UnitRole,
  TimeOfDay,
  StructureType,
  GreedType,
  TowerTier,
  TOWER_ARCHER_CAPACITY,
  ARCHER_SPEED,
  ARROW_RANGE,
  ARROW_COOLDOWN,
  ARROW_DAMAGE,
  CAMP_CENTER_X,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';
import { getAnimals, killAnimal } from './animals';
import { getRecruitBonus, NpcOrigin } from './villager';

// ─── Archer Leveling ──────────────────────────────────────────────
const RANGE_BONUS_THRESHOLD = 5;
const RANGE_BONUS = 3;
const COOLDOWN_BONUS_THRESHOLD = 10;
const COOLDOWN_MULTIPLIER = 0.8;
const SCOUT_RANGE_BONUS = 3;
const TOWER_RANGE_PER_TIER = 5;

// Per-archer kill counts (keyed by entity id)
const archerKills = new Map<number, number>();
// Tower assignments (archer eid -> structure x key)
const towerAssignments = new Map<number, number>();

/** Get total kills for an archer. */
export function getArcherKills(eid: number): number {
  return archerKills.get(eid) ?? 0;
}

export function recordKill(eid: number): void {
  archerKills.set(eid, (archerKills.get(eid) ?? 0) + 1);
}

/** Check if an archer is assigned to a tower. */
export function isArcherInTower(archerId: number): boolean {
  return towerAssignments.has(archerId);
}

/**
 * Assign an archer to a tower structure.
 * Returns true if successful.
 */
export function assignArcherToTower(
  state: GameState,
  archerId: number,
  towerX: number,
): boolean {
  const struct = state.structures.get(towerX);
  if (!struct) return false;
  if (!struct.towerTier) return false;

  towerAssignments.set(archerId, towerX);
  return true;
}

/** Remove archer from tower (e.g. tower destroyed). */
export function removeArcherFromTower(archerId: number): void {
  towerAssignments.delete(archerId);
}

function getEffectiveRange(eid: number, state?: GameState): number {
  const kills = getArcherKills(eid);
  let range = kills >= RANGE_BONUS_THRESHOLD ? ARROW_RANGE + RANGE_BONUS : ARROW_RANGE;
  // Scout-origin archers get additional range
  if (getRecruitBonus(eid) === NpcOrigin.Scout) {
    range += SCOUT_RANGE_BONUS;
  }
  // Tower range bonus
  if (state && towerAssignments.has(eid)) {
    const towerX = towerAssignments.get(eid)!;
    const struct = state.structures.get(towerX);
    if (struct && struct.towerTier) {
      range += struct.towerTier * TOWER_RANGE_PER_TIER;
    }
  }
  return range;
}

function getEffectiveCooldown(eid: number): number {
  const kills = getArcherKills(eid);
  return kills >= COOLDOWN_BONUS_THRESHOLD ? ARROW_COOLDOWN * COOLDOWN_MULTIPLIER : ARROW_COOLDOWN;
}

/**
 * Get the side (left/right) with fewer archers, for balanced recruitment.
 * Returns the x offset direction: -1 for left, 1 for right.
 */
export function getArcherRecruitSide(state: GameState): number {
  let leftCount = 0;
  let rightCount = 0;

  for (const unit of state.units) {
    if (unit.role !== 'archer') continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (pos.x < CAMP_CENTER_X) leftCount++;
    else rightCount++;
  }

  return leftCount <= rightCount ? -1 : 1;
}

export function updateArcher(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  if (unit.attackCooldown > 0) {
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
  }

  // Tower archers have special behavior
  if (towerAssignments.has(unit.eid)) {
    updateTowerArcher(state, unit, pos, dt);
    return;
  }

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updateArcherDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
      updateArcherDusk(state, unit, pos, dt);
      break;
    case TimeOfDay.Night:
      updateArcherNight(state, unit, pos, dt);
      break;
  }
}

/**
 * Tower archer: stays at tower position, shoots with 100% accuracy and bonus range.
 * Active day and night.
 */
function updateTowerArcher(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  const towerX = towerAssignments.get(unit.eid)!;
  const struct = state.structures.get(towerX);

  // If tower destroyed, revert to ground archer
  if (!struct || !struct.towerTier) {
    towerAssignments.delete(unit.eid);
    return;
  }

  // Move to tower position if not there
  const distToTower = distance(pos.x, struct.x);
  if (distToTower > 1.0) {
    unit.aiState = AIState.MovingTo;
    const dir = struct.x > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * ARCHER_SPEED, 0);
    return;
  }

  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);

  if (unit.attackCooldown > 0) return;

  const range = getEffectiveRange(unit.eid, state);

  // During day: shoot animals first
  if (state.timeOfDay === TimeOfDay.Day || state.timeOfDay === TimeOfDay.Dawn) {
    const animalTarget = findNearestAnimal(pos.x, range);
    if (animalTarget !== undefined) {
      const animals = getAnimals();
      const animal = animals[animalTarget];
      const direction = animal.x > pos.x ? 1 : -1;
      createArrow(state, pos.x, pos.y, direction);
      unit.attackCooldown = getEffectiveCooldown(unit.eid);
      // Tower archers have 100% accuracy
      killAnimal(state, animalTarget);
      recordKill(unit.eid);
      checkLevelUpMessage(state, unit.eid);
      return;
    }
  }

  // Shoot greed (priority: crown stealers)
  const targetX = findGreedTarget(state, pos.x, range);
  if (targetX !== undefined) {
    const direction = targetX > pos.x ? 1 : -1;
    createArrow(state, pos.x, pos.y, direction);
    unit.attackCooldown = getEffectiveCooldown(unit.eid);
  }
}

function updateArcherDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  unit.aiState = AIState.Hunting;
  const range = getEffectiveRange(unit.eid, state);

  // First priority: shoot animals in range
  if (unit.attackCooldown <= 0) {
    const animalTarget = findNearestAnimal(pos.x, range);
    if (animalTarget !== undefined) {
      const animals = getAnimals();
      const animal = animals[animalTarget];
      const direction = animal.x > pos.x ? 1 : -1;
      createArrow(state, pos.x, pos.y, direction);
      unit.attackCooldown = getEffectiveCooldown(unit.eid);

      // Instant hit for simplicity (animal is in range)
      killAnimal(state, animalTarget);
      recordKill(unit.eid);
      checkLevelUpMessage(state, unit.eid);
      return;
    }
  }

  // Patrol toward the outskirts
  const patrolDirection = pos.x >= CAMP_CENTER_X ? 1 : -1;
  const patrolLimit = patrolDirection > 0 ? MAP_WIDTH * 0.8 : MAP_WIDTH * 0.2;

  const atEdge = patrolDirection > 0
    ? pos.x >= patrolLimit
    : pos.x <= patrolLimit;

  if (atEdge) {
    const dir = pos.x > CAMP_CENTER_X ? -1 : 1;
    const vx = dir * ARCHER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
  } else {
    const vx = patrolDirection * ARCHER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
  }
}

function updateArcherDusk(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  unit.aiState = AIState.Retreating;

  const wallX = findNearestWallOnSide(state, pos.x);
  const towardsCamp = pos.x > CAMP_CENTER_X ? -1 : 1;
  const retreatX = clamp(wallX + towardsCamp * 2, 0, MAP_WIDTH - 1);
  const dist = distance(pos.x, retreatX);

  if (dist < 1.0) {
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dir = retreatX > pos.x ? 1 : -1;
  const vx = dir * ARCHER_SPEED;
  setVelocity(state.world, unit.eid, vx, 0);
}

function updateArcherNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Move to wall position first
  const wallX = findNearestWallOnSide(state, pos.x);
  const distToWall = distance(pos.x, wallX);

  if (distToWall > 1.0) {
    unit.aiState = AIState.MovingTo;
    const dir = wallX > pos.x ? 1 : -1;
    const vx = dir * ARCHER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
    return;
  }

  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);

  if (unit.attackCooldown > 0) return;

  const range = getEffectiveRange(unit.eid, state);

  const targetX = findGreedTarget(state, pos.x, range);
  if (targetX !== undefined) {
    const direction = targetX > pos.x ? 1 : -1;
    createArrow(state, pos.x, pos.y, direction);
    unit.attackCooldown = getEffectiveCooldown(unit.eid);
  }
}

/** Find the best greed target. Priority: CrownStealers first, then any greed. */
function findGreedTarget(state: GameState, fromX: number, range: number): number | undefined {
  let targetX: number | undefined;
  let targetDist = Infinity;

  // Priority 1: CrownStealers
  for (const greed of state.greeds) {
    if (greed.type !== GreedType.CrownStealer) continue;
    const greedPos = getPosition(state.world, greed.eid);
    if (!greedPos) continue;
    const d = distance(fromX, greedPos.x);
    if (d <= range && d < targetDist) {
      targetDist = d;
      targetX = greedPos.x;
    }
  }

  // Priority 2: Any greed
  if (targetX === undefined) {
    for (const greed of state.greeds) {
      const greedPos = getPosition(state.world, greed.eid);
      if (!greedPos) continue;
      const d = distance(fromX, greedPos.x);
      if (d <= range && d < targetDist) {
        targetDist = d;
        targetX = greedPos.x;
      }
    }
  }

  return targetX;
}

function checkLevelUpMessage(state: GameState, eid: number): void {
  const kills = getArcherKills(eid);
  if (kills === RANGE_BONUS_THRESHOLD) {
    state.messages.push('Archer gained extended range!');
  } else if (kills === COOLDOWN_BONUS_THRESHOLD) {
    state.messages.push('Archer gained rapid fire!');
  }
}

export function createArrow(
  state: GameState,
  fromX: number,
  fromY: number,
  direction: number,
): void {
  const eid = addEntity(state.world);

  const projectile: ProjectileData = {
    eid,
    x: fromX,
    y: fromY,
    vx: direction * 30,
    damage: ARROW_DAMAGE,
    owner: 0 as any,
  };

  state.projectiles.push(projectile);
}

function findNearestAnimal(fromX: number, maxRange: number): number | undefined {
  const animals = getAnimals();
  let nearestIdx: number | undefined;
  let nearestDist = Infinity;

  for (let i = 0; i < animals.length; i++) {
    const d = distance(fromX, animals[i].x);
    if (d <= maxRange && d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }

  return nearestIdx;
}

function findNearestWallOnSide(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  let bestX = CAMP_CENTER_X;
  let bestDist = Infinity;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== onRightSide) continue;

    const d = distance(fromX, struct.x);
    if (d < bestDist) {
      bestDist = d;
      bestX = struct.x;
    }
  }

  return bestX;
}

// ─── Archer Distribution ──────────────────────────────────────────

/** Get archer counts by side. */
export function getArcherDistribution(state: GameState): { left: number; right: number } {
  let left = 0;
  let right = 0;

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Archer) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (pos.x < CAMP_CENTER_X) left++;
    else right++;
  }

  return { left, right };
}

/**
 * Try to fill empty tower slots with unassigned ground archers.
 * Called periodically by ai.ts to keep towers staffed.
 */
export function fillTowerSlots(state: GameState): void {
  // Collect towers with available capacity
  for (const [, struct] of state.structures) {
    if (!struct.towerTier) continue;
    if (struct.hp <= 0) continue;

    const capacity = TOWER_ARCHER_CAPACITY[struct.towerTier] ?? 0;
    if (capacity <= 0) continue;

    // Count archers already assigned to this tower
    let assigned = 0;
    for (const [, towerX] of towerAssignments) {
      if (towerX === struct.x) assigned++;
    }
    if (assigned >= capacity) continue;

    // Find nearest unassigned archer
    let bestArcher: UnitData | undefined;
    let bestDist = Infinity;

    for (const unit of state.units) {
      if (unit.role !== UnitRole.Archer) continue;
      if (towerAssignments.has(unit.eid)) continue;
      const pos = getPosition(state.world, unit.eid);
      if (!pos) continue;
      const d = distance(pos.x, struct.x);
      if (d < bestDist) {
        bestDist = d;
        bestArcher = unit;
      }
    }

    if (bestArcher) {
      assignArcherToTower(state, bestArcher.eid, struct.x);
    }
  }
}

/**
 * Reposition archers evenly along walls on their side during night.
 * Prevents all archers from stacking at the same position.
 */
export function repositionNightArchers(state: GameState): void {
  // Group ground archers by side
  const leftArchers: UnitData[] = [];
  const rightArchers: UnitData[] = [];

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Archer) continue;
    if (towerAssignments.has(unit.eid)) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (pos.x < CAMP_CENTER_X) leftArchers.push(unit);
    else rightArchers.push(unit);
  }

  // Spread archers along outermost wall on each side
  spreadArchersAlongWall(state, leftArchers, false);
  spreadArchersAlongWall(state, rightArchers, true);
}

function spreadArchersAlongWall(
  state: GameState,
  archers: UnitData[],
  rightSide: boolean,
): void {
  if (archers.length === 0) return;

  // Find outermost wall on this side
  let outermostX = CAMP_CENTER_X;
  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall || struct.hp <= 0) continue;
    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== rightSide) continue;
    if (rightSide ? struct.x > outermostX : struct.x < outermostX) {
      outermostX = struct.x;
    }
  }

  // Space archers evenly: 2 tiles apart, centered on outermost wall
  const spacing = 2;
  const towardCamp = rightSide ? -1 : 1;
  for (let i = 0; i < archers.length; i++) {
    archers[i].targetX = clamp(outermostX + towardCamp * spacing * i, 1, MAP_WIDTH - 2);
  }
}
