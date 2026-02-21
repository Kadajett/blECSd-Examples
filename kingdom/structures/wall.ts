/**
 * Wall, tower, and gate structure creation, upgrade, damage, visual state, and queries.
 *
 * 5-tier wall upgrade path: Spikes -> WallWood -> WallStone -> TallStone -> WallIron -> Tower
 * Tower: gives archers +5 range and allows 2 archers.
 * Gates: let friendly units pass but block greed. Auto-placed every 10 tiles.
 * Wall chains: adjacent walls get +1 HP bonus per connected wall in the chain.
 *
 * Wall tiers:
 *   | Tier | Type      | Cost | HP  | Requires             |
 *   |------|-----------|------|-----|----------------------|
 *   | 1    | Spikes    | 1    | 25  | Nothing              |
 *   | 2    | WallWood  | 3    | 50  | Nothing              |
 *   | 3    | WallStone | 6    | 200 | TownCenterTier >= 5  |
 *   | 4    | TallStone | 9    | 300 | TownCenterTier >= 5  |
 *   | 5    | WallIron  | 12   | 400 | TownCenterTier >= 7  |
 */

import { addEntity } from 'blecsd/core';
import { setPosition } from 'blecsd/components';
import {
  type GameState,
  type StructureData,
  StructureType,
  TownCenterTier,
  TowerTier,
  TOWER_COSTS,
  GROUND_Y,
  CHAR_WALL,
  CHAR_WALL_DAMAGED,
  DamageType,
  GreedType,
  TimeOfDay,
} from '../types';

/** Tower extends StructureType without modifying the shared types file */
export const TOWER_TYPE = 13 as StructureType;
export const TOWER_COST = 15;
export const TOWER_HP = 40;
export const TOWER_ARCHER_RANGE_BONUS = 5;
export const TOWER_ARCHER_SLOTS = 2;

/** Gate: blocks greed but lets friendly units pass */
export const GATE_TYPE = 15 as StructureType;
const GATE_HP = 8;

/** Auto-gate interval: place a gate every N tiles in a wall line */
const AUTO_GATE_INTERVAL = 10;

/** 5-tier wall HP values */
const WALL_HP: Record<number, number> = {
  [StructureType.Spikes]: 25,
  [StructureType.WallWood]: 50,
  [StructureType.WallStone]: 200,
  [StructureType.TallStone]: 300,
  [StructureType.WallIron]: 400,
  [13]: TOWER_HP,
  [15]: GATE_HP,
};

/** 5-tier wall build costs */
const WALL_BUILD_COSTS: Record<number, number> = {
  [StructureType.Spikes]: 1,
  [StructureType.WallWood]: 3,
  [StructureType.WallStone]: 6,
  [StructureType.TallStone]: 9,
  [StructureType.WallIron]: 12,
};

/** Ordered wall tier upgrade path (Spikes through WallIron) */
const WALL_TIER_ORDER: StructureType[] = [
  StructureType.Spikes,
  StructureType.WallWood,
  StructureType.WallStone,
  StructureType.TallStone,
  StructureType.WallIron,
];

/** Town center tier required for upgrading TO a given wall type */
const WALL_TIER_REQUIREMENTS: Partial<Record<number, number>> = {
  [StructureType.WallStone]: TownCenterTier.StoneFort,
  [StructureType.TallStone]: TownCenterTier.StoneFort,
  [StructureType.WallIron]: TownCenterTier.IronKeep,
};

/** Builder repair rate: 1 hp per 3 seconds */
export const WALL_REPAIR_RATE = 1 / 3;

/** Track base maxHp (before chain bonus) per wall x position */
const wallBaseMaxHp: Map<number, number> = new Map();

/** Get the tier number (1-5) for a wall StructureType, or 0 if not a wall */
export function getWallTier(type: StructureType): number {
  const index = WALL_TIER_ORDER.indexOf(type);
  return index >= 0 ? index + 1 : 0;
}

/** Get the next wall tier StructureType, or null if at max */
export function getNextWallTier(type: StructureType): StructureType | null {
  const index = WALL_TIER_ORDER.indexOf(type);
  if (index < 0 || index >= WALL_TIER_ORDER.length - 1) return null;
  return WALL_TIER_ORDER[index + 1];
}

/** Get the coin cost to upgrade FROM the current wall type to the next tier */
export function getWallUpgradeCost(currentType: StructureType): number {
  const next = getNextWallTier(currentType);
  if (next === null) return 0;
  return WALL_BUILD_COSTS[next] ?? 0;
}

/** Create a wall at the given x position with the specified tier */
export function createWall(state: GameState, x: number, tier: StructureType): StructureData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const hp = WALL_HP[tier] ?? 25;
  const wall: StructureData = {
    eid,
    type: tier,
    x,
    hp,
    maxHp: hp,
    level: getWallTier(tier),
    assignedWorkers: [],
    towerTier: TowerTier.None,
    isRoofed: false,
  };

  state.structures.set(x, wall);
  wallBaseMaxHp.set(x, hp);

  // Recalculate chain bonuses for the affected chain
  applyWallChainBonuses(state);

  return wall;
}

/** Create a gate at the given x position */
export function createGate(state: GameState, x: number): StructureData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const gate: StructureData = {
    eid,
    type: GATE_TYPE,
    x,
    hp: GATE_HP,
    maxHp: GATE_HP,
    level: 1,
    assignedWorkers: [],
    towerTier: TowerTier.None,
    isRoofed: false,
  };

  state.structures.set(x, gate);
  wallBaseMaxHp.set(x, GATE_HP);

  return gate;
}

/**
 * Create a tower at the given x position.
 * Towers are the final upgrade beyond iron walls.
 * Returns null if not enough coins.
 */
export function createTower(state: GameState, x: number): StructureData | null {
  if (state.monarchCoins < TOWER_COST) return null;

  state.structures.delete(x);
  wallBaseMaxHp.delete(x);

  state.monarchCoins -= TOWER_COST;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const tower: StructureData = {
    eid,
    type: TOWER_TYPE,
    x,
    hp: TOWER_HP,
    maxHp: TOWER_HP,
    level: 6,
    assignedWorkers: [],
    towerTier: TowerTier.RockPlatform,
    isRoofed: false,
  };

  state.structures.set(x, tower);
  wallBaseMaxHp.set(x, TOWER_HP);

  applyWallChainBonuses(state);

  return tower;
}

/**
 * Upgrade a tower to the next tier.
 * Uses TOWER_COSTS from types.ts.
 * Tier 3 (Stone Tower) requires TownCenterTier >= 5.
 * Tier 5 (Roofed) requires TownCenterTier >= 7.
 * Returns true if upgraded.
 */
export function upgradeTower(state: GameState, x: number): boolean {
  const tower = state.structures.get(x);
  if (!tower || !isTowerStructure(tower.type)) return false;

  const currentTier = tower.towerTier ?? TowerTier.None;
  const nextTier = currentTier + 1;

  if (nextTier > TowerTier.QuadrupletTower) return false;

  // Check town center requirements
  if (nextTier >= TowerTier.StoneTower && state.townCenterTier < TownCenterTier.StoneFort) return false;
  if (nextTier >= TowerTier.RoofedTriplet && state.townCenterTier < TownCenterTier.IronKeep) return false;

  const cost = TOWER_COSTS[nextTier];
  if (cost === undefined || state.monarchCoins < cost) return false;

  state.monarchCoins -= cost;
  tower.towerTier = nextTier;
  tower.level = 6 + nextTier;
  tower.isRoofed = nextTier >= TowerTier.RoofedTriplet;

  // Increase tower HP with upgrades
  const hpBonus = nextTier * 10;
  const newMaxHp = TOWER_HP + hpBonus;
  tower.maxHp = newMaxHp;
  tower.hp = newMaxHp;
  wallBaseMaxHp.set(x, newMaxHp);

  applyWallChainBonuses(state);

  return true;
}

/**
 * Upgrade a wall through the 5-tier path.
 * Checks town center tier requirements for stone+ tiers.
 * Returns true if upgraded.
 */
export function upgradeWall(state: GameState, x: number): boolean {
  const wall = state.structures.get(x);
  if (!wall) return false;

  const next = getNextWallTier(wall.type);
  if (next === null) return false;

  // Check town center tier requirement
  const requiredTier = WALL_TIER_REQUIREMENTS[next];
  if (requiredTier !== undefined) {
    if (state.townCenterTier < requiredTier) return false;
  }

  const nextHp = WALL_HP[next] ?? 50;
  const currentIndex = WALL_TIER_ORDER.indexOf(wall.type);

  wall.type = next;
  wall.maxHp = nextHp;
  wall.hp = nextHp;
  wall.level = currentIndex + 2;

  wallBaseMaxHp.set(x, nextHp);
  applyWallChainBonuses(state);

  return true;
}

/** Apply damage to a wall, tower, or gate. Destroys it if hp drops to 0. */
export function damageWall(state: GameState, x: number, dmg: number): number {
  const wall = state.structures.get(x);
  if (!wall) return 0;

  wall.hp -= dmg;
  if (wall.hp <= 0) {
    wall.hp = 0;
    state.structures.delete(x);
    wallBaseMaxHp.delete(x);
    applyWallChainBonuses(state);
    return 0;
  }
  return wall.hp;
}

/** Repair a wall/tower/gate by the given hp amount. Clamps to maxHp. */
export function repairWall(state: GameState, x: number, amount: number): number {
  const wall = state.structures.get(x);
  if (!wall || (!isWallStructure(wall.type) && !isTowerStructure(wall.type) && !isGateStructure(wall.type))) return 0;

  wall.hp = Math.min(wall.maxHp, wall.hp + amount);
  return wall.hp;
}

/** Get wall/tower/gate health as a 0-1 ratio */
export function getWallHealth(state: GameState, x: number): number {
  const wall = state.structures.get(x);
  if (!wall) return 0;
  if (!isWallStructure(wall.type) && !isTowerStructure(wall.type) && !isGateStructure(wall.type)) return 0;
  if (wall.maxHp <= 0) return 0;
  return wall.hp / wall.maxHp;
}

/** Get the display character for a wall based on damage state */
export function getWallChar(state: GameState, x: number): string {
  const health = getWallHealth(state, x);
  if (health <= 0) return '';
  return health < 0.5 ? CHAR_WALL_DAMAGED : CHAR_WALL;
}

/** Get the outermost wall/tower/gate positions */
export function getOutermostWalls(state: GameState): { left: number | null; right: number | null } {
  let left: number | null = null;
  let right: number | null = null;

  for (const [x, structure] of state.structures) {
    if (!isDefensiveStructure(structure.type)) continue;
    if (left === null || x < left) left = x;
    if (right === null || x > right) right = x;
  }

  return { left, right };
}

/** Find a wall/tower/gate at a specific x position, or null */
export function getWallAt(state: GameState, x: number): StructureData | null {
  const structure = state.structures.get(x);
  if (structure && isDefensiveStructure(structure.type)) {
    return structure;
  }
  return null;
}

/** Find a tower at a specific x position, or null */
export function getTowerAt(state: GameState, x: number): StructureData | null {
  const structure = state.structures.get(x);
  if (structure && isTowerStructure(structure.type)) {
    return structure;
  }
  return null;
}

/** Check if a structure type is a wall (spikes/wood/stone/tall stone/iron, not tower or gate) */
export function isWallStructure(type: StructureType): boolean {
  return type === StructureType.Spikes
    || type === StructureType.WallWood
    || type === StructureType.WallStone
    || type === StructureType.TallStone
    || type === StructureType.WallIron;
}

/** Check if a structure type is a tower */
export function isTowerStructure(type: StructureType): boolean {
  return type === TOWER_TYPE;
}

/** Check if a structure type is a gate */
export function isGateStructure(type: StructureType): boolean {
  return type === GATE_TYPE;
}

/** Check if a structure type is any defensive structure (wall, tower, or gate) */
export function isDefensiveStructure(type: StructureType): boolean {
  return isWallStructure(type) || isTowerStructure(type) || isGateStructure(type);
}

/**
 * Check if a wall at position x should be auto-converted to a gate.
 * Gates are placed every AUTO_GATE_INTERVAL tiles relative to the nearest
 * settlement center, so builders and archers can move through.
 */
export function shouldAutoGate(x: number, settlementX: number): boolean {
  const offset = Math.abs(x - settlementX);
  return offset > 0 && offset % AUTO_GATE_INTERVAL === 0;
}

/**
 * Get the length of the wall chain containing position x.
 * A chain is a contiguous run of walls/towers/gates at adjacent x positions.
 */
export function getWallChainLength(state: GameState, x: number): number {
  const s = state.structures.get(x);
  if (!s || !isDefensiveStructure(s.type)) return 0;

  let length = 1;

  // Scan left
  let lx = x - 1;
  while (true) {
    const ls = state.structures.get(lx);
    if (!ls || !isDefensiveStructure(ls.type)) break;
    length++;
    lx--;
  }

  // Scan right
  let rx = x + 1;
  while (true) {
    const rs = state.structures.get(rx);
    if (!rs || !isDefensiveStructure(rs.type)) break;
    length++;
    rx++;
  }

  return length;
}

/**
 * Recalculate wall chain HP bonuses for all walls/towers/gates.
 * Each wall in a chain of length N gets +N bonus maxHp.
 * Call after creating or destroying any defensive structure.
 */
export function applyWallChainBonuses(state: GameState): void {
  for (const [x, structure] of state.structures) {
    if (!isDefensiveStructure(structure.type)) continue;

    const baseHp = wallBaseMaxHp.get(x) ?? structure.maxHp;
    const chainLen = getWallChainLength(state, x);
    const newMaxHp = baseHp + chainLen;

    // Only increase hp by the delta if maxHp grew
    const delta = newMaxHp - structure.maxHp;
    structure.maxHp = newMaxHp;
    if (delta > 0) {
      structure.hp += delta;
    } else if (structure.hp > structure.maxHp) {
      structure.hp = structure.maxHp;
    }
  }
}

// ─── Special Tower Conversions ──────────────────────────────────────

/** Converted tower type constants (hermit-triggered conversions) */
export const BALLISTA_TOWER_TYPE = 19 as StructureType;
export const FIRE_TOWER_TYPE = 20 as StructureType;
export const BAKERY_TOWER_TYPE = 21 as StructureType;
export const KNIGHT_TOWER_TYPE = 22 as StructureType;
export const BERSERKER_TOWER_TYPE = 23 as StructureType;

export enum ConvertedTowerKind {
  Ballista = 19,
  Fire = 20,
  Bakery = 21,
  Knight = 22,
  Berserker = 23,
}

/** Conversion costs */
const CONVERSION_COSTS: Record<number, number> = {
  [ConvertedTowerKind.Ballista]: 6,
  [ConvertedTowerKind.Fire]: 8,
  [ConvertedTowerKind.Bakery]: 6,
  [ConvertedTowerKind.Knight]: 6,
  [ConvertedTowerKind.Berserker]: 6,
};

/** Minimum tower tier required for conversion */
const CONVERSION_MIN_TIER = TowerTier.StoneTower; // tier 3+

/** Ballista tower stats */
export const BALLISTA_TOWER_RANGE = 20;
export const BALLISTA_TOWER_DAMAGE = 5;
export const BALLISTA_TOWER_RELOAD = 4.0;

/** Fire tower stats */
export const FIRE_TOWER_RANGE = 15;
export const FIRE_TOWER_BURN_DPS = 2;
export const FIRE_TOWER_BURN_DURATION = 3.0;
export const FIRE_TOWER_AOE = 3;

/** Production tower output tracking */
const towerProductionTimers: Map<number, number> = new Map();
const BAKERY_BREAD_PER_DAY = 7;
const KNIGHT_SHIELDS_PER_DAY = 1;
const BERSERKER_POTIONS_PER_DAY = 1;

/** Potion buff duration (30 seconds of 2x damage + 2x speed) */
export const POTION_BUFF_DURATION = 30.0;

/** Per-tower output stockpile (bread loaves, shields, or potions) */
const towerOutputStock: Map<number, number> = new Map();

/** Check if a structure type is a converted tower */
export function isConvertedTower(type: StructureType): boolean {
  const t = type as number;
  return t >= 19 && t <= 23;
}

/**
 * Convert an existing tower to a special tower type.
 * Requires tower tier >= 3 and enough coins.
 * Converted towers are locked at their current tier.
 */
export function convertTower(
  state: GameState,
  towerX: number,
  conversionType: ConvertedTowerKind,
): boolean {
  const tower = state.structures.get(towerX);
  if (!tower || !isTowerStructure(tower.type)) return false;

  const currentTier = tower.towerTier ?? TowerTier.None;
  if (currentTier < CONVERSION_MIN_TIER) return false;

  const cost = CONVERSION_COSTS[conversionType];
  if (cost === undefined || state.monarchCoins < cost) return false;

  state.monarchCoins -= cost;

  tower.type = conversionType as unknown as StructureType;
  tower.convertedTowerType = conversionType;

  // Initialize production timer for economic towers
  if (conversionType === ConvertedTowerKind.Bakery
    || conversionType === ConvertedTowerKind.Knight
    || conversionType === ConvertedTowerKind.Berserker) {
    towerProductionTimers.set(towerX, 0);
    towerOutputStock.set(towerX, 0);
  }

  const names: Record<number, string> = {
    [ConvertedTowerKind.Ballista]: 'Ballista Tower',
    [ConvertedTowerKind.Fire]: 'Fire Tower',
    [ConvertedTowerKind.Bakery]: 'Bakery Tower',
    [ConvertedTowerKind.Knight]: 'Knight Tower',
    [ConvertedTowerKind.Berserker]: 'Berserker Tower',
  };

  state.messages.push(`Tower converted to ${names[conversionType]}!`);
  return true;
}

/**
 * Update production towers (bakery, knight, berserker).
 * Called once per frame during day. Produces output at dawn.
 */
export function updateConvertedTowers(state: GameState, _dt: number, isDawn: boolean): void {
  if (!isDawn) return;

  for (const [x, structure] of state.structures) {
    if (!isConvertedTower(structure.type)) continue;

    const kind = structure.type as number as ConvertedTowerKind;

    switch (kind) {
      case ConvertedTowerKind.Bakery: {
        const stock = (towerOutputStock.get(x) ?? 0) + BAKERY_BREAD_PER_DAY;
        towerOutputStock.set(x, stock);
        state.messages.push(`Bakery Tower produces ${BAKERY_BREAD_PER_DAY} bread loaves.`);
        break;
      }
      case ConvertedTowerKind.Knight: {
        const stock = (towerOutputStock.get(x) ?? 0) + KNIGHT_SHIELDS_PER_DAY;
        towerOutputStock.set(x, stock);
        state.messages.push('Knight Tower produces a shield.');
        break;
      }
      case ConvertedTowerKind.Berserker: {
        const stock = (towerOutputStock.get(x) ?? 0) + BERSERKER_POTIONS_PER_DAY;
        towerOutputStock.set(x, stock);
        state.messages.push('Berserker Tower brews a potion.');
        break;
      }
    }
  }
}

/** Get the current output stock for a converted tower */
export function getConvertedTowerOutput(x: number): number {
  return towerOutputStock.get(x) ?? 0;
}

/** Consume one unit of output from a converted tower */
export function consumeTowerOutput(x: number): boolean {
  const stock = towerOutputStock.get(x) ?? 0;
  if (stock <= 0) return false;
  towerOutputStock.set(x, stock - 1);
  return true;
}

/** Get the DamageType a converted tower uses (for combat system) */
export function getConvertedTowerDamageType(type: StructureType): DamageType {
  const kind = type as number;
  if (kind === ConvertedTowerKind.Ballista) return DamageType.Piercing;
  if (kind === ConvertedTowerKind.Fire) return DamageType.Burn;
  return DamageType.Normal;
}

// ─── Wall Damage Mechanics (Phase 9) ─────────────────────────────

/** Get wall damage per second for a given greed type */
export function getGreedWallDamage(type: GreedType): number {
  switch (type) {
    case GreedType.Basic: return 1;         // 1 damage, 1 attack/second
    case GreedType.Masked: return 2;        // 2 damage, 1 attack/second
    case GreedType.Breeder: return 1.25;    // 5 damage per 4-second punch
    case GreedType.CrownStealer: return 0;  // bypasses walls
    case GreedType.Floater: return 0;       // flies over walls
    case GreedType.PlagueCrawler: return 0; // climbs over walls
    default: return 1;
  }
}

/** Get gate HP for a given wall tier (50% of wall HP) */
export function getGateHpForTier(wallType: StructureType): number {
  const wallHp = WALL_HP[wallType] ?? 25;
  return Math.floor(wallHp * 0.5);
}

/** Lock all gates (called at dusk) */
export function lockGatesAtDusk(state: GameState): void {
  for (const [, structure] of state.structures) {
    if (structure.type === GATE_TYPE) {
      structure.gateLocked = true;
    }
  }
}

/** Unlock all gates (called at dawn) */
export function unlockGatesAtDawn(state: GameState): void {
  for (const [, structure] of state.structures) {
    if (structure.type === GATE_TYPE) {
      structure.gateLocked = false;
    }
  }
}

/** Check if gate at position x is locked */
export function isGateLocked(state: GameState, x: number): boolean {
  const structure = state.structures.get(x);
  if (!structure || structure.type !== GATE_TYPE) return false;
  return structure.gateLocked === true;
}

/** Get damage multiplier for a structure (locked gates take 50% less damage) */
export function getWallDamageReduction(state: GameState, x: number): number {
  const structure = state.structures.get(x);
  if (!structure) return 1;
  if (structure.type === GATE_TYPE && structure.gateLocked) return 0.5;
  return 1;
}

/** Update gate states based on time of day transitions */
export function updateGateStates(state: GameState, prevTime: TimeOfDay, newTime: TimeOfDay): void {
  if (prevTime !== TimeOfDay.Dusk && newTime === TimeOfDay.Dusk) {
    lockGatesAtDusk(state);
  }
  if (prevTime !== TimeOfDay.Dawn && newTime === TimeOfDay.Dawn) {
    unlockGatesAtDawn(state);
  }
}
