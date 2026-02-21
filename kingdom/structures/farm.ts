/**
 * Farm structure creation, upgrade, income, growth cycle, and limits.
 *
 * Farm tier system:
 *   Tier 1: Water Well / Basic Farm (5 coins to build)
 *     - Up to 4 crop plots, 1 farmer assigned
 *     - Harvest: 6 coins per plot (24 coins total per cycle)
 *   Tier 2: Farmhouse / Mill House (8 coins to upgrade)
 *     - Up to 6 crop plots, 2 farmers assignable
 *     - Provides nighttime shelter for farmers
 *     - Harvest: 6 coins per plot (36 coins total per cycle)
 *   Tier 3: Blessed Farm (via Farmer Statue)
 *     - +2 additional plots (8 total), +50% yield
 *     - Only while Farmer Statue blessing is active
 *
 * Max 3 farms per side (6 total).
 * Farm placement: only near water/stream tiles.
 * Farm destruction by greed: reverts to wild land, farmer loses scythe.
 *
 * Newly built farms produce nothing for 10 seconds (growing phase).
 * Windmill farms support extra workers to attract more farmers.
 */

import { addEntity } from 'blecsd/core';
import { setPosition } from 'blecsd/components';
import {
  type GameState,
  type StructureData,
  StructureType,
  GROUND_Y,
  CAMP_CENTER_X,
} from '../types';

const FARM_UPGRADE_ORDER: StructureType[] = [
  StructureType.Farm,
  StructureType.FarmIrrigated,
  StructureType.FarmWindmill,
];

const FARM_GROWTH_TIME = 10; // seconds before new farm produces
const MAX_FARMS_PER_SIDE = 3;
const WINDMILL_BONUS_WORKERS = 1; // extra worker slots for windmill

/** Farm tier constants */
const FARM_TIER_BUILD_COST = 5;
const FARM_TIER_UPGRADE_COST = 8;

/** Crop plots per tier */
const FARM_TIER_PLOTS: Record<number, number> = {
  1: 4,
  2: 6,
  3: 8, // blessed: +2 from tier 2
};

/** Max farmers per tier */
const FARM_TIER_FARMERS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 2,
};

/** Coins per plot per harvest cycle */
const COINS_PER_PLOT = 6;

/** Blessed farm yield bonus */
const BLESSED_YIELD_BONUS = 1.5;

/** Track growth timers by farm x position (seconds remaining) */
const farmGrowthTimers: Map<number, number> = new Map();

/** Track blessed status per farm */
const blessedFarms: Set<number> = new Set();

/** Tick all farm growth timers. Call once per frame. */
export function updateFarmGrowth(dt: number): void {
  for (const [x, remaining] of farmGrowthTimers) {
    const next = remaining - dt;
    if (next <= 0) {
      farmGrowthTimers.delete(x);
    } else {
      farmGrowthTimers.set(x, next);
    }
  }
}

/** Check if a farm at position x is still in its growth phase */
export function isFarmGrowing(x: number): boolean {
  return farmGrowthTimers.has(x);
}

/** Check if a new farm can be built on the given side (max 3 per side) */
export function canBuildFarm(state: GameState, x: number): boolean {
  const side = x < CAMP_CENTER_X ? 'left' : 'right';
  let count = 0;
  for (const [fx, s] of state.structures) {
    if (!isFarmStructure(s.type)) continue;
    const farmSide = fx < CAMP_CENTER_X ? 'left' : 'right';
    if (farmSide === side) count++;
  }
  return count < MAX_FARMS_PER_SIDE;
}

/** Create a farm at the given x position (should be on cleared land near water) */
export function createFarm(state: GameState, x: number): StructureData | null {
  if (!canBuildFarm(state, x)) return null;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const farm: StructureData = {
    eid,
    type: StructureType.Farm,
    x,
    hp: 5,
    maxHp: 5,
    level: 1,
    assignedWorkers: [],
    farmTier: 1,
  };

  state.structures.set(x, farm);

  // Start growth timer
  farmGrowthTimers.set(x, FARM_GROWTH_TIME);

  return farm;
}

/**
 * Upgrade a farm to the next tier.
 * Tier 1 -> 2: costs 8 coins (Farmhouse)
 * Tier 2 -> 3 via Blessed Farm only happens through blessFarm.
 * Also upgrades underlying StructureType: Farm -> FarmIrrigated -> FarmWindmill.
 */
export function upgradeFarm(state: GameState, x: number): boolean {
  const farm = state.structures.get(x);
  if (!farm || !isFarmStructure(farm.type)) return false;

  const currentTier = farm.farmTier ?? 1;
  if (currentTier >= 2) return false; // tier 3 only via blessing

  if (state.monarchCoins < FARM_TIER_UPGRADE_COST) return false;

  state.monarchCoins -= FARM_TIER_UPGRADE_COST;

  const currentIndex = FARM_UPGRADE_ORDER.indexOf(farm.type);
  if (currentIndex >= 0 && currentIndex < FARM_UPGRADE_ORDER.length - 1) {
    farm.type = FARM_UPGRADE_ORDER[currentIndex + 1];
  }

  farm.farmTier = 2;
  farm.level = 2;
  farm.maxHp += 3;
  farm.hp = farm.maxHp;

  state.messages.push('Farm upgraded to Farmhouse! +2 crop plots, 2 farmers.');
  return true;
}

/** Bless a farm (via Farmer Statue). Upgrades to tier 3 with bonus plots and yield. */
export function blessFarm(state: GameState, x: number): boolean {
  const farm = state.structures.get(x);
  if (!farm || !isFarmStructure(farm.type)) return false;

  const currentTier = farm.farmTier ?? 1;
  if (currentTier < 2) return false; // must be tier 2+ to bless

  farm.farmTier = 3;
  blessedFarms.add(x);

  state.messages.push('Farm blessed! +2 plots, +50% yield while blessing active.');
  return true;
}

/** Remove blessing from a farm */
export function unblessFarm(x: number): void {
  const wasBlessed = blessedFarms.delete(x);
  if (wasBlessed) {
    // farmTier reverts to 2 when blessing ends
    // (actual tier update happens in the calling code)
  }
}

/** Check if a farm is blessed */
export function isFarmBlessed(x: number): boolean {
  return blessedFarms.has(x);
}

/** Get the number of crop plots for a farm tier */
export function getFarmCapacity(tier: number): number {
  return FARM_TIER_PLOTS[tier] ?? 4;
}

/** Get the coin yield for a farm based on tier and blessed status */
export function getFarmYield(tier: number, blessed: boolean): number {
  const plots = getFarmCapacity(tier);
  const baseYield = plots * COINS_PER_PLOT;
  return blessed ? Math.floor(baseYield * BLESSED_YIELD_BONUS) : baseYield;
}

/** Get the coin yield for a farm structure. Returns 0 if still growing. */
export function getFarmOutput(farm: StructureData): number {
  if (farmGrowthTimers.has(farm.x)) return 0;
  const tier = farm.farmTier ?? 1;
  const blessed = blessedFarms.has(farm.x);
  return getFarmYield(tier, blessed);
}

/** Get max farmers assignable to a farm tier */
export function getFarmMaxFarmers(tier: number): number {
  return FARM_TIER_FARMERS[tier] ?? 1;
}

/** Find the first farm that has room for more workers, or null */
export function getAvailableFarm(state: GameState): StructureData | null {
  for (const [, structure] of state.structures) {
    if (!isFarmStructure(structure.type)) continue;

    const tier = structure.farmTier ?? 1;
    const maxWorkers = getFarmMaxFarmers(tier);

    // Windmill farms get bonus worker slots
    const bonusSlots = structure.type === StructureType.FarmWindmill
      ? WINDMILL_BONUS_WORKERS
      : 0;
    const totalSlots = maxWorkers + bonusSlots;

    if (structure.assignedWorkers.length < totalSlots) {
      return structure;
    }
  }
  return null;
}

/** Check if a structure type is any farm tier */
export function isFarmStructure(type: StructureType): boolean {
  return type === StructureType.Farm
    || type === StructureType.FarmIrrigated
    || type === StructureType.FarmWindmill;
}

/** Get the build cost for a tier-1 farm */
export function getFarmBuildCost(): number {
  return FARM_TIER_BUILD_COST;
}

/** Get the upgrade cost for the next farm tier */
export function getFarmUpgradeCost(currentTier: number): number {
  if (currentTier >= 2) return 0; // tier 3 is via blessing, free
  return FARM_TIER_UPGRADE_COST;
}
