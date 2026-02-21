/**
 * Farmer entity - works farms during day, retreats at night.
 * Irrigated farms produce 1.5x, windmill farms produce 2x.
 * Farmers flee from nearby greed even during the day.
 * Greed reaching a farm destroys it.
 * Peasant-origin farmers gain +50% output bonus.
 *
 * Seasonal effects:
 * - Spring/Summer: 100% production
 * - Autumn: 75% production
 * - Winter: no farming, forage berry bushes instead (1 coin per berry)
 */
import { getPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  type UnitData,
  type StructureData,
  AIState,
  TimeOfDay,
  Season,
  StructureType,
  VILLAGER_SPEED,
  FARM_INCOME_INTERVAL,
  FARM_REWARD_BASE,
  CAMP_CENTER_X,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';
import { getRecruitBonus, NpcOrigin } from './villager';
import { getResourceAt, harvestResource, ResourceType } from '../structures/resources';

const farmTimers = new Map<number, number>();

const GREED_THREAT_RANGE = 10;
const FARMER_FLEE_SPEED = VILLAGER_SPEED * 1.5;
const PEASANT_OUTPUT_BONUS = 1.5;

export function updateFarmer(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  // Check for nearby greed threats during any time of day
  const nearestGreedX = findNearestGreedX(state, pos.x, GREED_THREAT_RANGE);
  if (nearestGreedX !== undefined) {
    updateFarmerFlee(state, unit, pos, nearestGreedX, dt);
    return;
  }

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updateFarmerDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
    case TimeOfDay.Night:
      updateFarmerNight(state, unit, pos, dt);
      break;
  }

  // Check for greed reaching farms: destroy the farm
  checkFarmDestruction(state);
}

function updateFarmerDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Winter: no farming, forage berries instead
  if (state.season === Season.Winter) {
    updateFarmerForage(state, unit, pos, dt);
    return;
  }

  const farm = findNearestFarm(state, pos.x);
  if (!farm) {
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dist = distance(pos.x, farm.x);

  if (dist < 1.0) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);

    // Farm must be built to produce
    if (farm.hp < farm.maxHp) return;

    // Production multiplier based on farm type
    let multiplier = getFarmMultiplier(farm.type);

    // Seasonal multiplier
    if (state.season === Season.Autumn) {
      multiplier *= 0.75;
    }

    // Peasant-origin farmers get +50% output
    if (getRecruitBonus(unit.eid) === NpcOrigin.Peasant) {
      multiplier *= PEASANT_OUTPUT_BONUS;
    }

    const reward = Math.max(1, Math.floor(FARM_REWARD_BASE * multiplier));

    const timer = (farmTimers.get(unit.eid) ?? 0) + dt;
    if (timer >= FARM_INCOME_INTERVAL) {
      collectCoins(state, reward);
      farmTimers.set(unit.eid, timer - FARM_INCOME_INTERVAL);
      state.messages.push(`Farm produced ${reward} coins`);
    } else {
      farmTimers.set(unit.eid, timer);
    }
  } else {
    unit.aiState = AIState.MovingTo;
    unit.targetX = farm.x;
    const dir = farm.x > pos.x ? 1 : -1;
    const vx = dir * VILLAGER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
  }
}

/** Winter foraging: find nearest berry bush and harvest for coins. */
function updateFarmerForage(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  const berryX = findNearestBerryBush(state, pos.x);
  if (berryX === undefined) {
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dist = distance(pos.x, berryX);

  if (dist < 2.0) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);

    const timer = (farmTimers.get(unit.eid) ?? 0) + dt;
    if (timer >= FARM_INCOME_INTERVAL) {
      const coins = harvestResource(state, berryX);
      if (coins > 0) {
        collectCoins(state, coins);
        state.messages.push(`Farmer foraged berries (+${coins} coin)`);
      }
      farmTimers.set(unit.eid, timer - FARM_INCOME_INTERVAL);
    } else {
      farmTimers.set(unit.eid, timer);
    }
  } else {
    unit.aiState = AIState.MovingTo;
    unit.targetX = berryX;
    const dir = berryX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * VILLAGER_SPEED, 0);
  }
}

/** Find the nearest non-depleted berry bush. */
function findNearestBerryBush(state: GameState, fromX: number): number | undefined {
  let nearest: number | undefined;
  let nearestDist = Infinity;

  // Scan the map for berry bush resources
  for (let x = 0; x < MAP_WIDTH; x++) {
    const res = getResourceAt(state, x);
    if (!res) continue;
    if (res.type !== ResourceType.BerryBush) continue;
    if (res.depleted) continue;

    const d = distance(fromX, x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = x;
    }
  }

  return nearest;
}

function updateFarmerFlee(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  greedX: number,
  dt: number,
): void {
  unit.aiState = AIState.Fleeing;
  farmTimers.delete(unit.eid);

  // Flee away from greed, toward camp
  const fleeDir = pos.x > greedX ? 1 : -1;
  // Prefer fleeing toward camp
  const campDir = CAMP_CENTER_X > pos.x ? 1 : -1;
  const dir = fleeDir === campDir ? fleeDir : campDir;

  const vx = dir * FARMER_FLEE_SPEED;
  setVelocity(state.world, unit.eid, vx, 0);
}

/**
 * Night/dusk behavior: if farm has farmhouse (level >= 2), stay at farm.
 * Otherwise retreat to wall/camp center.
 */
export function updateFarmerNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Check if farmer has access to a farmhouse (farm level >= 2)
  const shelterFarm = findFarmhouseFarm(state);
  if (shelterFarm) {
    // Stay at farm position (sheltered)
    const dist = distance(pos.x, shelterFarm.x);
    if (dist < 1.5) {
      unit.aiState = AIState.Idle;
      setVelocity(state.world, unit.eid, 0, 0);
      return;
    }
    // Move to farmhouse
    unit.aiState = AIState.MovingTo;
    unit.targetX = shelterFarm.x;
    const dir = shelterFarm.x > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * VILLAGER_SPEED, 0);
    return;
  }

  // No farmhouse: retreat to wall/camp
  updateFarmerRetreat(state, unit, pos, dt);
}

/**
 * Check if a farmer entity is sheltered in a farmhouse.
 * Sheltered farmers don't lose coins to greed.
 */
export function isFarmerSheltered(state: GameState, farmerEid: number): boolean {
  const pos = getPosition(state.world, farmerEid);
  if (!pos) return false;

  // Must be night/dusk
  if (state.timeOfDay !== TimeOfDay.Night && state.timeOfDay !== TimeOfDay.Dusk) return false;

  // Check if near a farmhouse (level >= 2 farm)
  for (const [, struct] of state.structures) {
    const isFarm = struct.type === StructureType.Farm
      || struct.type === StructureType.FarmIrrigated
      || struct.type === StructureType.FarmWindmill;
    if (!isFarm) continue;
    if (struct.level < 2) continue;
    if (distance(pos.x, struct.x) < 2) return true;
  }

  return false;
}

function updateFarmerRetreat(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  unit.aiState = AIState.Retreating;
  farmTimers.delete(unit.eid);

  const retreatX = findRetreatPosition(state, pos.x);
  const dist = distance(pos.x, retreatX);

  if (dist < 1.0) {
    setVelocity(state.world, unit.eid, 0, 0);
    unit.aiState = AIState.Idle;
    return;
  }

  const dir = retreatX > pos.x ? 1 : -1;
  const vx = dir * VILLAGER_SPEED;
  setVelocity(state.world, unit.eid, vx, 0);
}

/** Find a farm with level >= 2 (farmhouse). */
function findFarmhouseFarm(state: GameState): StructureData | undefined {
  for (const [, struct] of state.structures) {
    const isFarm = struct.type === StructureType.Farm
      || struct.type === StructureType.FarmIrrigated
      || struct.type === StructureType.FarmWindmill;
    if (!isFarm) continue;
    if (struct.level >= 2 && struct.hp >= struct.maxHp) return struct;
  }
  return undefined;
}

function getFarmMultiplier(type: StructureType): number {
  switch (type) {
    case StructureType.FarmIrrigated: return 1.5;
    case StructureType.FarmWindmill: return 2.0;
    default: return 1.0;
  }
}

function findNearestGreedX(
  state: GameState,
  fromX: number,
  maxRange: number,
): number | undefined {
  let nearest: number | undefined;
  let nearestDist = Infinity;

  for (const greed of state.greeds) {
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    const d = distance(fromX, pos.x);
    if (d <= maxRange && d < nearestDist) {
      nearestDist = d;
      nearest = pos.x;
    }
  }

  return nearest;
}

/** Destroy farms that greed have reached. */
function checkFarmDestruction(state: GameState): void {
  const farmsToDestroy: number[] = [];

  for (const [key, struct] of state.structures) {
    const isFarm = struct.type === StructureType.Farm
      || struct.type === StructureType.FarmIrrigated
      || struct.type === StructureType.FarmWindmill;
    if (!isFarm) continue;

    for (const greed of state.greeds) {
      const greedPos = getPosition(state.world, greed.eid);
      if (!greedPos) continue;
      if (distance(struct.x, greedPos.x) < 1.5) {
        farmsToDestroy.push(key);
        break;
      }
    }
  }

  for (const key of farmsToDestroy) {
    state.structures.delete(key);
    state.messages.push('The greed destroyed a farm!');
  }
}

function findNearestFarm(state: GameState, fromX: number): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    if (
      struct.type !== StructureType.Farm &&
      struct.type !== StructureType.FarmIrrigated &&
      struct.type !== StructureType.FarmWindmill
    ) continue;

    const d = distance(fromX, struct.x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findRetreatPosition(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  let bestWallX = CAMP_CENTER_X;
  let bestDist = Infinity;
  const towardsCamp = onRightSide ? -1 : 1;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== onRightSide) continue;

    const d = distance(fromX, struct.x);
    if (d < bestDist) {
      bestDist = d;
      bestWallX = struct.x + towardsCamp * 2;
    }
  }

  return clamp(bestWallX, 0, MAP_WIDTH - 1);
}
