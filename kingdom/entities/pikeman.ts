/**
 * Pikeman entity - recruited at pike vendor (TownCenterTier >= 5, Stone Fort).
 * Day: fish at nearest water tile, earning 1 coin per fish every 8 seconds.
 * Night: defend outermost wall with AoE pike thrust (1.5 tile range).
 * Carries 0 coins (drops immediately).
 */
import { addEntity } from 'blecsd/core';
import { getPosition, setPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  type UnitData,
  UnitRole,
  AIState,
  TimeOfDay,
  TileType,
  StructureType,
  GROUND_Y,
  VILLAGER_SPEED,
  CAMP_CENTER_X,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';

const PIKE_THRUST_RANGE = 1.5;
const PIKE_THRUST_COOLDOWN = 2.0;
const FISH_INTERVAL = 8; // seconds between fish catches
const FISH_REWARD = 1;
const PIKEMAN_SPEED = VILLAGER_SPEED;

// Per-pikeman fishing timer
const fishTimers = new Map<number, number>();

export function createPikeman(state: GameState, x: number): UnitData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  const unit: UnitData = {
    eid,
    role: UnitRole.Pikeman,
    aiState: AIState.Idle,
    targetX: x,
    hp: 2,
    maxHp: 2,
    attackCooldown: 0,
    coins: 0,
  };

  state.units.push(unit);
  return unit;
}

export function updatePikeman(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  if (unit.attackCooldown > 0) {
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
  }

  // Pikeman always drops coins immediately
  unit.coins = 0;

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updatePikemanDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
      updatePikemanDusk(state, unit, pos);
      break;
    case TimeOfDay.Night:
      updatePikemanNight(state, unit, pos, dt);
      break;
  }
}

function updatePikemanDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Find nearest water tile for fishing
  const waterX = findNearestWaterTile(state, pos.x);
  if (waterX === undefined) {
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dist = distance(pos.x, waterX);

  if (dist < 2.0) {
    // At the fishing spot
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);

    const timer = (fishTimers.get(unit.eid) ?? 0) + dt;
    if (timer >= FISH_INTERVAL) {
      collectCoins(state, FISH_REWARD);
      fishTimers.set(unit.eid, timer - FISH_INTERVAL);
      state.messages.push(`Pikeman caught a fish (+${FISH_REWARD} coin)`);
    } else {
      fishTimers.set(unit.eid, timer);
    }
  } else {
    // Walk to water
    unit.aiState = AIState.MovingTo;
    unit.targetX = waterX;
    const dir = waterX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * PIKEMAN_SPEED, 0);
  }
}

function updatePikemanDusk(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
): void {
  unit.aiState = AIState.Retreating;
  fishTimers.delete(unit.eid);

  const wallX = findOutermostWallOnSide(state, pos.x);
  const dist = distance(pos.x, wallX);

  if (dist < 1.0) {
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dir = wallX > pos.x ? 1 : -1;
  setVelocity(state.world, unit.eid, dir * PIKEMAN_SPEED, 0);
}

function updatePikemanNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  const wallX = findOutermostWallOnSide(state, pos.x);
  const dist = distance(pos.x, wallX);

  if (dist > 1.5) {
    unit.aiState = AIState.MovingTo;
    const dir = wallX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * PIKEMAN_SPEED, 0);
    return;
  }

  // At wall: defend with pike thrust
  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);

  if (unit.attackCooldown > 0) return;

  // Pike thrust: kill all greed within PIKE_THRUST_RANGE (AoE melee)
  let killed = false;
  for (let i = state.greeds.length - 1; i >= 0; i--) {
    const greed = state.greeds[i];
    const greedPos = getPosition(state.world, greed.eid);
    if (!greedPos) continue;

    if (distance(pos.x, greedPos.x) <= PIKE_THRUST_RANGE) {
      greed.hp = 0;
      killed = true;
    }
  }

  if (killed) {
    unit.attackCooldown = PIKE_THRUST_COOLDOWN;
    state.messages.push('Pikeman thrusts pike!');
  }
}

function findNearestWaterTile(state: GameState, fromX: number): number | undefined {
  let nearest: number | undefined;
  let nearestDist = Infinity;

  // Scan tiles row at water level and ground level for Water type
  const yChecks = [GROUND_Y, GROUND_Y + 1, GROUND_Y + 2];
  for (const y of yChecks) {
    if (y < 0 || y >= state.tiles.length) continue;
    const row = state.tiles[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === TileType.Water) {
        const d = distance(fromX, x);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = x;
        }
      }
    }
  }

  return nearest;
}

function findOutermostWallOnSide(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  let outermostX = CAMP_CENTER_X;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== onRightSide) continue;

    if (onRightSide) {
      if (struct.x > outermostX) outermostX = struct.x;
    } else {
      if (struct.x < outermostX) outermostX = struct.x;
    }
  }

  return outermostX;
}
