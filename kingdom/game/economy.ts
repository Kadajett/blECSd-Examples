/**
 * Economy system - coin dropping, recruiting, purchasing.
 * Handles proximity-based interactions with structures and NPCs.
 * Supports NPC subtypes (warrior, scout, craftsman, peasant) and
 * standard vagrant recruiting via tool stands.
 */
import { getPosition } from 'blecsd';
import {
  type GameState,
  type UnitData,
  type StructureData,
  UnitRole,
  AIState,
  StructureType,
  TownCenterTier,
  MAX_COINS,
  RECRUIT_COST,
  BOW_COST,
  HAMMER_COST,
  WALL_COST_WOOD,
  WALL_COST_STONE,
  WALL_COST_IRON,
  FARM_BUILD_COST,
  SHRINE_COST,
  WALL_HP_WOOD,
  WALL_HP_STONE,
  WALL_HP_IRON,
  CAMP_CENTER_X,
  MAP_WIDTH,
  distance,
} from '../types';
import { getNpcOrigin, NpcOrigin, markRecruited } from '../entities/villager';
import { isBankerAvailable, depositCoins, withdrawCoins } from '../entities/banker';
import { isMerchantAvailable, merchantAcceptCoin, getMerchantX } from '../entities/merchant';
import { getAvailableHermits, getHermitConfig, getRidingHermit } from '../entities/hermit';
import { getStatues, getStatueConfig, findNearbyStatue } from '../entities/statue';
import { isMountUnlocked, getMountStatsForType } from '../entities/mount';
import { MountType } from '../types';

// ─── Unit Caps ──────────────────────────────────────────────────────
const MAX_ARCHERS = 10;
const MAX_BUILDERS = 8;
const MAX_FARMERS = 6;
const MAX_KNIGHTS = 4;
const MAX_PIKEMEN = 6;
const MAX_SQUIRES = 4;
export const KNIGHT_COST = 5;
export const KNIGHT_UNLOCK_DAY = 5;
export const PIKE_COST = 2;
export const SQUIRE_COST = 4;
const FARM_UNLOCK_DAY = 3;

// ─── Unit Coin Capacities ────────────────────────────────────────
const UNIT_COIN_CAPACITY: Record<string, number> = {
  [UnitRole.Vagrant]: 0,
  [UnitRole.Builder]: 2,
  [UnitRole.Archer]: 11,
  [UnitRole.Farmer]: 14,
  [UnitRole.Knight]: 11,
  [UnitRole.Squire]: 5,
  [UnitRole.Pikeman]: 0,
  [UnitRole.Monarch]: 40,
};

/** Get the max coin capacity for a given role. */
export function getUnitCoinCapacity(role: UnitRole): number {
  return UNIT_COIN_CAPACITY[role] ?? 0;
}

/** Enforce coin capacity on a unit. Returns overflow coins (dropped on ground). */
export function enforceUnitCoinCap(unit: UnitData): number {
  const cap = getUnitCoinCapacity(unit.role);
  if (unit.coins <= cap) return 0;
  const overflow = unit.coins - cap;
  unit.coins = cap;
  return overflow;
}

// ─── NPC Direct Recruit Costs ──────────────────────────────────────
const WARRIOR_RECRUIT_COST = 3;
const SCOUT_RECRUIT_COST = 2;
const CRAFTSMAN_RECRUIT_COST = 2;
const PEASANT_RECRUIT_COST = 1;

// ─── Inflation Tracking ─────────────────────────────────────────────
let wallsBuiltLeft = 0;
let wallsBuiltRight = 0;
let shrineUses = 0;

// ─── Nearby Interactable (for HUD) ─────────────────────────────────
let nearbyInteractableDesc: string | null = null;

/** HUD can call this to display what the player can interact with. */
export function getNearbyInteractable(): string | null {
  return nearbyInteractableDesc;
}

export function canAfford(state: GameState, cost: number): boolean {
  return state.monarchCoins >= cost;
}

export function collectCoins(state: GameState, amount: number): void {
  state.monarchCoins = Math.min(state.monarchCoins + amount, MAX_COINS);
}

export function resetInflation(): void {
  wallsBuiltLeft = 0;
  wallsBuiltRight = 0;
  shrineUses = 0;
}

function countUnitsByRole(state: GameState, role: UnitRole): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.role === role) count++;
  }
  return count;
}

function getUnitCap(role: UnitRole): number {
  switch (role) {
    case UnitRole.Archer: return MAX_ARCHERS;
    case UnitRole.Builder: return MAX_BUILDERS;
    case UnitRole.Farmer: return MAX_FARMERS;
    case UnitRole.Knight: return MAX_KNIGHTS;
    case UnitRole.Pikeman: return MAX_PIKEMEN;
    case UnitRole.Squire: return MAX_SQUIRES;
    default: return Infinity;
  }
}

function scaledCost(baseCost: number, state: GameState, role: UnitRole): number {
  const existing = countUnitsByRole(state, role);
  return baseCost + existing;
}

function isAtCap(state: GameState, role: UnitRole): boolean {
  return countUnitsByRole(state, role) >= getUnitCap(role);
}

function inflatedWallCost(x: number): number {
  const onRight = x >= CAMP_CENTER_X;
  const builtOnSide = onRight ? wallsBuiltRight : wallsBuiltLeft;
  return WALL_COST_WOOD + builtOnSide;
}

function inflatedShrineCost(): number {
  return SHRINE_COST + shrineUses * 2;
}

// ─── Nearby Interactable Update ─────────────────────────────────────

/** Called each frame to update the nearby interactable description. */
export function updateNearbyInteractable(state: GameState): void {
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) {
    nearbyInteractableDesc = null;
    return;
  }

  const mx = monarchPos.x;
  const range = 3;

  // Check for banker (near town center)
  if (isBankerAvailable(state) && distance(mx, CAMP_CENTER_X) <= range) {
    nearbyInteractableDesc = '[SPACE] Deposit coins with Banker';
    return;
  }

  // Check for merchant
  if (isMerchantAvailable(state) && distance(mx, getMerchantX()) <= range) {
    nearbyInteractableDesc = '[SPACE] Pay merchant (1 coin -> 8 coins at dawn)';
    return;
  }

  // Check for hermit cottage
  const hermits = getAvailableHermits();
  for (let i = 0; i < hermits.length; i++) {
    const hermit = hermits[i];
    if (hermit.kidnapped || hermit.riding || hermit.coaxed) continue;
    if (distance(mx, hermit.x) > range) continue;
    const config = getHermitConfig(hermit.type);
    if (!config) continue;
    nearbyInteractableDesc = `[SPACE] Coax ${config.description} hermit (${config.gemCost} gems)`;
    return;
  }

  // Check for riding hermit (can drop)
  if (getRidingHermit() !== null) {
    nearbyInteractableDesc = '[SPACE] Drop hermit at current location';
    return;
  }

  // Check for nearby statue
  const statueIdx = findNearbyStatue(state);
  if (statueIdx >= 0) {
    const statues = getStatues();
    const statue = statues[statueIdx];
    const config = getStatueConfig(statue.type);
    if (config) {
      if (!statue.unlocked) {
        nearbyInteractableDesc = `[SPACE] Unlock ${config.description} statue (${config.gemCost} gems)`;
        return;
      }
      if (!statue.blessingActive) {
        nearbyInteractableDesc = `[SPACE] Activate ${config.description} blessing (${config.coinCost} coins)`;
        return;
      }
    }
  }

  // Check for special NPCs
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Vagrant) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (distance(mx, pos.x) > range) continue;

    const origin = getNpcOrigin(unit.eid);
    switch (origin) {
      case NpcOrigin.Warrior:
        nearbyInteractableDesc = `[SPACE] Recruit Knight (${WARRIOR_RECRUIT_COST})`;
        return;
      case NpcOrigin.Scout:
        nearbyInteractableDesc = `[SPACE] Recruit Archer +range (${SCOUT_RECRUIT_COST})`;
        return;
      case NpcOrigin.Craftsman:
        nearbyInteractableDesc = `[SPACE] Recruit Builder +speed (${CRAFTSMAN_RECRUIT_COST})`;
        return;
      case NpcOrigin.Peasant:
        nearbyInteractableDesc = `[SPACE] Recruit Farmer +yield (${PEASANT_RECRUIT_COST})`;
        return;
      default:
        break;
    }
  }

  // Check for standard vagrant near tool stand
  const vagrant = findNearestStandardVagrant(state, mx, range);
  if (vagrant) {
    const bowStand = findNearestStructureByType(state, mx, StructureType.BowStand, range);
    if (bowStand) {
      const cost = scaledCost(BOW_COST, state, UnitRole.Archer);
      nearbyInteractableDesc = `[SPACE] Recruit Archer (${cost})`;
      return;
    }
    const hammerStand = findNearestStructureByType(state, mx, StructureType.HammerStand, range);
    if (hammerStand) {
      const cost = scaledCost(HAMMER_COST, state, UnitRole.Builder);
      nearbyInteractableDesc = `[SPACE] Recruit Builder (${cost})`;
      return;
    }
  }

  // Check for wall nearby
  const wall = findNearestWall(state, mx, range);
  if (wall && wall.hp >= wall.maxHp) {
    if (wall.type === StructureType.WallWood) {
      nearbyInteractableDesc = `[SPACE] Upgrade to Stone (${WALL_COST_STONE})`;
      return;
    }
    if (wall.type === StructureType.WallStone) {
      nearbyInteractableDesc = `[SPACE] Upgrade to Iron (${WALL_COST_IRON})`;
      return;
    }
  }

  // Check for shrine
  const shrine = findNearestStructureByType(state, mx, StructureType.Shrine, range);
  if (shrine) {
    const cost = inflatedShrineCost();
    nearbyInteractableDesc = `[SPACE] Activate Shrine (${cost})`;
    return;
  }

  // Open ground: wall blueprint
  const roundedX = Math.round(mx);
  if (!state.structures.has(roundedX)) {
    const cost = inflatedWallCost(roundedX);
    nearbyInteractableDesc = `[SPACE] Place wall (${cost})`;
    return;
  }

  nearbyInteractableDesc = null;
}

// ─── Drop Coin (Main Interaction) ──────────────────────────────────

export function dropCoin(state: GameState): void {
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;
  if (state.monarchCoins <= 0) {
    state.messages.push('No coins!');
    return;
  }

  const mx = monarchPos.x;
  const range = 3;

  // ─── Priority 0a: Banker deposit (near town center) ───
  if (isBankerAvailable(state) && distance(mx, CAMP_CENTER_X) <= range) {
    depositCoins(state, 1);
    return;
  }

  // ─── Priority 0b: Merchant payment (near merchant) ───
  if (isMerchantAvailable(state) && distance(mx, getMerchantX()) <= range) {
    merchantAcceptCoin(state);
    return;
  }

  // ─── Priority 1: Recruit special NPC (warrior/scout/craftsman/peasant) ───
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Vagrant) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (distance(mx, pos.x) > range) continue;

    const origin = getNpcOrigin(unit.eid);

    if (origin === NpcOrigin.Warrior) {
      if (isAtCap(state, UnitRole.Knight)) {
        state.messages.push('No room for more knights!');
        return;
      }
      if (!canAfford(state, WARRIOR_RECRUIT_COST)) {
        state.messages.push(`Not enough coins! (need ${WARRIOR_RECRUIT_COST})`);
        return;
      }
      state.monarchCoins -= WARRIOR_RECRUIT_COST;
      recruitUnit(unit, UnitRole.Knight);
      state.messages.push(`Recruited Knight! (${WARRIOR_RECRUIT_COST} coins)`);
      return;
    }

    if (origin === NpcOrigin.Scout) {
      if (isAtCap(state, UnitRole.Archer)) {
        state.messages.push('No room for more archers!');
        return;
      }
      if (!canAfford(state, SCOUT_RECRUIT_COST)) {
        state.messages.push(`Not enough coins! (need ${SCOUT_RECRUIT_COST})`);
        return;
      }
      state.monarchCoins -= SCOUT_RECRUIT_COST;
      recruitUnit(unit, UnitRole.Archer);
      state.messages.push(`Recruited Scout Archer! (${SCOUT_RECRUIT_COST} coins, +3 range)`);
      return;
    }

    if (origin === NpcOrigin.Craftsman) {
      if (isAtCap(state, UnitRole.Builder)) {
        state.messages.push('No room for more builders!');
        return;
      }
      if (!canAfford(state, CRAFTSMAN_RECRUIT_COST)) {
        state.messages.push(`Not enough coins! (need ${CRAFTSMAN_RECRUIT_COST})`);
        return;
      }
      state.monarchCoins -= CRAFTSMAN_RECRUIT_COST;
      recruitUnit(unit, UnitRole.Builder);
      state.messages.push(`Recruited Master Builder! (${CRAFTSMAN_RECRUIT_COST} coins, 1.5x speed)`);
      return;
    }

    if (origin === NpcOrigin.Peasant) {
      if (isAtCap(state, UnitRole.Farmer)) {
        state.messages.push('No room for more farmers!');
        return;
      }
      if (!canAfford(state, PEASANT_RECRUIT_COST)) {
        state.messages.push(`Not enough coins! (need ${PEASANT_RECRUIT_COST})`);
        return;
      }
      state.monarchCoins -= PEASANT_RECRUIT_COST;
      recruitUnit(unit, UnitRole.Farmer);
      state.messages.push(`Recruited Expert Farmer! (${PEASANT_RECRUIT_COST} coins, +50% output)`);
      return;
    }
  }

  // ─── Priority 2: Standard vagrant near tool stand ───
  const vagrant = findNearestStandardVagrant(state, mx, range);
  if (vagrant) {
    const bowStand = findNearestStructureByType(state, mx, StructureType.BowStand, range);
    if (bowStand) {
      if (isAtCap(state, UnitRole.Archer)) {
        state.messages.push('No room for more archers!');
        return;
      }
      const cost = scaledCost(BOW_COST, state, UnitRole.Archer);
      if (!canAfford(state, cost)) {
        state.messages.push(`Not enough coins! (need ${cost})`);
        return;
      }
      state.monarchCoins -= cost;
      recruitUnit(vagrant, UnitRole.Archer);
      state.messages.push(`Recruited Archer! (${cost} coins)`);
      return;
    }

    const hammerStand = findNearestStructureByType(state, mx, StructureType.HammerStand, range);
    if (hammerStand) {
      if (isAtCap(state, UnitRole.Builder)) {
        state.messages.push('No room for more builders!');
        return;
      }
      const cost = scaledCost(HAMMER_COST, state, UnitRole.Builder);
      if (!canAfford(state, cost)) {
        state.messages.push(`Not enough coins! (need ${cost})`);
        return;
      }
      state.monarchCoins -= cost;
      recruitUnit(vagrant, UnitRole.Builder);
      state.messages.push(`Recruited Builder! (${cost} coins)`);
      return;
    }

    if (state.dayCount >= FARM_UNLOCK_DAY) {
      const farm = findNearestFarmStructure(state, mx, range);
      if (farm) {
        if (isAtCap(state, UnitRole.Farmer)) {
          state.messages.push('No room for more farmers!');
          return;
        }
        const cost = scaledCost(RECRUIT_COST, state, UnitRole.Farmer);
        if (!canAfford(state, cost)) {
          state.messages.push(`Not enough coins! (need ${cost})`);
          return;
        }
        state.monarchCoins -= cost;
        recruitUnit(vagrant, UnitRole.Farmer);
        state.messages.push(`Recruited Farmer! (${cost} coins)`);
        return;
      }
    }

    if (state.dayCount >= KNIGHT_UNLOCK_DAY) {
      const shrineOrCamp = findNearestStructureByType(state, mx, StructureType.Shrine, range)
        ?? findNearestStructureByType(state, mx, StructureType.Campfire, range);
      if (shrineOrCamp) {
        if (isAtCap(state, UnitRole.Knight)) {
          state.messages.push('No room for more knights!');
          return;
        }
        const cost = scaledCost(KNIGHT_COST, state, UnitRole.Knight);
        if (!canAfford(state, cost)) {
          state.messages.push(`Not enough coins! (need ${cost})`);
          return;
        }
        state.monarchCoins -= cost;
        recruitUnit(vagrant, UnitRole.Knight);
        state.messages.push(`Recruited Knight! (${cost} coins)`);
        return;
      }
    }

    // Pikeman: requires TownCenterTier >= 5 (Stone Fort)
    if (state.townCenterTier >= TownCenterTier.StoneFort) {
      if (!isAtCap(state, UnitRole.Pikeman)) {
        const cost = PIKE_COST;
        if (canAfford(state, cost)) {
          state.monarchCoins -= cost;
          recruitUnit(vagrant, UnitRole.Pikeman);
          state.messages.push(`Recruited Pikeman! (${cost} coins)`);
          return;
        }
      }
    }

    // Squire: requires TownCenterTier >= 6 (Castle)
    if (state.townCenterTier >= TownCenterTier.Castle) {
      if (!isAtCap(state, UnitRole.Squire)) {
        const cost = SQUIRE_COST;
        if (canAfford(state, cost)) {
          state.monarchCoins -= cost;
          recruitUnit(vagrant, UnitRole.Squire);
          state.messages.push(`Recruited Squire! (${cost} coins)`);
          return;
        }
      }
    }
  }

  // ─── Priority 3: Wall upgrade (only fully-built, upgradeable walls) ───
  const wall = findNearestWall(state, mx, range);
  if (wall && wall.hp >= wall.maxHp) {
    if (tryUpgradeWall(state, wall)) return;
  }

  // ─── Priority 4: Shrine activation ───
  const shrine = findNearestStructureByType(state, mx, StructureType.Shrine, range);
  if (shrine) {
    const cost = inflatedShrineCost();
    if (canAfford(state, cost)) {
      state.monarchCoins -= cost;
      shrineUses++;
      state.messages.push(`Shrine activated! (${cost} coins)`);
      return;
    }
    state.messages.push(`Not enough coins for shrine! (need ${cost})`);
    return;
  }

  // ─── Priority 5: Place wall blueprint on open ground ───
  const roundedX = Math.round(mx);
  if (!state.structures.has(roundedX)) {
    const cost = inflatedWallCost(roundedX);
    if (canAfford(state, cost)) {
      state.monarchCoins -= cost;
      const onRight = roundedX >= CAMP_CENTER_X;
      if (onRight) wallsBuiltRight++; else wallsBuiltLeft++;

      const wallData: StructureData = {
        eid: 0 as any,
        type: StructureType.WallWood,
        x: roundedX,
        hp: 0,
        maxHp: WALL_HP_WOOD,
        level: 1,
        assignedWorkers: [],
      };
      state.structures.set(roundedX, wallData);
      state.messages.push(`Wall blueprint placed! (${cost} coins)`);
      return;
    }
    state.messages.push(`Not enough coins! (need ${cost})`);
    return;
  }

  // ─── Priority 6: Build farm (day 3+) ───
  if (state.dayCount >= FARM_UNLOCK_DAY) {
    for (const offset of [0, -1, 1, -2, 2]) {
      const farmX = Math.round(mx) + offset;
      if (farmX < 0 || farmX >= MAP_WIDTH) continue;
      if (state.structures.has(farmX)) continue;

      if (canAfford(state, FARM_BUILD_COST)) {
        state.monarchCoins -= FARM_BUILD_COST;
        const farm: StructureData = {
          eid: 0 as any,
          type: StructureType.Farm,
          x: farmX,
          hp: 0,
          maxHp: 5,
          level: 1,
          assignedWorkers: [],
        };
        state.structures.set(farmX, farm);
        state.messages.push(`Farm plot placed! (${FARM_BUILD_COST} coins)`);
        return;
      }
      state.messages.push(`Not enough coins! (need ${FARM_BUILD_COST})`);
      return;
    }
  }

  state.messages.push('Nothing nearby to interact with');
}

// ─── Auto-Builder Wall Blueprint ───────────────────────────────────

/** Place a wall blueprint at given x (used by auto-builder AI). No coin cost. */
export function placeWallBlueprint(state: GameState, x: number): boolean {
  const roundedX = Math.round(x);
  if (roundedX < 0 || roundedX >= MAP_WIDTH) return false;
  if (state.structures.has(roundedX)) return false;

  const wallData: StructureData = {
    eid: 0 as any,
    type: StructureType.WallWood,
    x: roundedX,
    hp: 0,
    maxHp: WALL_HP_WOOD,
    level: 1,
    assignedWorkers: [],
  };
  state.structures.set(roundedX, wallData);
  return true;
}

// ─── Helpers ────────────────────────────────────────────────────────

function recruitUnit(unit: UnitData, newRole: UnitRole): void {
  markRecruited(unit.eid);
  unit.role = newRole;
  unit.aiState = AIState.Idle;

  switch (newRole) {
    case UnitRole.Builder:
      unit.hp = 3;
      unit.maxHp = 3;
      break;
    case UnitRole.Archer:
      unit.hp = 2;
      unit.maxHp = 2;
      break;
    case UnitRole.Farmer:
      unit.hp = 2;
      unit.maxHp = 2;
      break;
    case UnitRole.Knight:
      unit.hp = 5;
      unit.maxHp = 5;
      break;
    case UnitRole.Pikeman:
      unit.hp = 2;
      unit.maxHp = 2;
      unit.coins = 0;
      break;
    case UnitRole.Squire:
      unit.hp = 3;
      unit.maxHp = 3;
      break;
    default:
      break;
  }
}

/** Find nearest standard vagrant (no special NPC origin). */
function findNearestStandardVagrant(
  state: GameState,
  x: number,
  maxDist: number,
): UnitData | undefined {
  let nearest: UnitData | undefined;
  let nearestDist = Infinity;

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Vagrant) continue;
    if (getNpcOrigin(unit.eid) !== NpcOrigin.Standard) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const d = distance(x, pos.x);
    if (d <= maxDist && d < nearestDist) {
      nearestDist = d;
      nearest = unit;
    }
  }

  return nearest;
}

function findNearestStructureByType(
  state: GameState,
  x: number,
  type: StructureType,
  maxDist: number,
): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    if (struct.type !== type) continue;
    const d = distance(x, struct.x);
    if (d <= maxDist && d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findNearestFarmStructure(
  state: GameState,
  x: number,
  maxDist: number,
): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    if (
      struct.type !== StructureType.Farm &&
      struct.type !== StructureType.FarmIrrigated &&
      struct.type !== StructureType.FarmWindmill
    ) continue;
    const d = distance(x, struct.x);
    if (d <= maxDist && d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findNearestWall(
  state: GameState,
  x: number,
  maxDist: number,
): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    const d = distance(x, struct.x);
    if (d <= maxDist && d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function tryUpgradeWall(state: GameState, wall: StructureData): boolean {
  switch (wall.type) {
    case StructureType.WallWood:
      if (canAfford(state, WALL_COST_STONE)) {
        state.monarchCoins -= WALL_COST_STONE;
        wall.type = StructureType.WallStone;
        wall.hp = WALL_HP_STONE;
        wall.maxHp = WALL_HP_STONE;
        state.messages.push(`Wall upgraded to Stone! (${WALL_COST_STONE} coins)`);
        return true;
      }
      state.messages.push(`Not enough coins to upgrade! (need ${WALL_COST_STONE})`);
      return true;
    case StructureType.WallStone:
      if (canAfford(state, WALL_COST_IRON)) {
        state.monarchCoins -= WALL_COST_IRON;
        wall.type = StructureType.WallIron;
        wall.hp = WALL_HP_IRON;
        wall.maxHp = WALL_HP_IRON;
        state.messages.push(`Wall upgraded to Iron! (${WALL_COST_IRON} coins)`);
        return true;
      }
      state.messages.push(`Not enough coins to upgrade! (need ${WALL_COST_IRON})`);
      return true;
    default:
      // Iron or unknown: can't upgrade, fall through to next priority
      return false;
  }
}

// ─── Bread System (Bakery Tower) ──────────────────────────────────

const BREAD_PER_DAY = 7;
const BREAD_SPOIL_TIME = 360; // 2 in-game days (180s each)

interface BreadLoaf {
  x: number;
  age: number; // seconds since produced
}

const breadLoaves: BreadLoaf[] = [];

/** Get current bread count. */
export function getBreadCount(): number {
  return breadLoaves.length;
}

/**
 * Produce bread at a bakery position.
 * Called once per day per bakery tower.
 */
export function produceBread(bakeryX: number): void {
  for (let i = 0; i < BREAD_PER_DAY; i++) {
    breadLoaves.push({ x: bakeryX, age: 0 });
  }
}

/**
 * Update bread: age all loaves, spoil expired ones.
 */
export function updateBread(dt: number): void {
  for (let i = breadLoaves.length - 1; i >= 0; i--) {
    breadLoaves[i].age += dt;
    if (breadLoaves[i].age >= BREAD_SPOIL_TIME) {
      breadLoaves.splice(i, 1);
    }
  }
}

/**
 * Use bread to recruit a vagrant. Consumes 1 bread loaf.
 * Returns true if bread was available and used.
 */
export function useBreadForRecruitment(state: GameState, vagrant: UnitData, role: UnitRole): boolean {
  if (breadLoaves.length === 0) return false;

  // Use the oldest loaf first
  breadLoaves.shift();

  recruitUnit(vagrant, role);
  state.messages.push(`Bread recruited a ${role}!`);
  return true;
}

// ─── Dawn Bonus ──────────────────────────────────────────────────

/**
 * Apply dawn coin bonus based on town center tier.
 * Tier 1-2: 2 coins, Tier 3-4: 3 coins, Tier 5-7: 4 coins.
 * Called by ai.ts when time transitions to Dawn.
 */
export function applyDawnBonus(state: GameState): void {
  const tier = state.townCenterTier;
  let bonus: number;

  if (tier >= TownCenterTier.StoneFort) {
    bonus = 4;
  } else if (tier >= TownCenterTier.Village) {
    bonus = 3;
  } else {
    bonus = 2;
  }

  collectCoins(state, bonus);
  state.messages.push(`Dawn breaks. +${bonus} coins`);
}

// ─── Tool Theft System ──────────────────────────────────────────

export type ToolType = 'bow' | 'hammer' | 'scythe' | 'pike' | 'shield' | 'sword';

interface DroppedTool {
  x: number;
  toolType: ToolType;
  timer: number; // seconds remaining before despawn
}

const TOOL_DESPAWN_TIME = 60; // seconds
const droppedTools: DroppedTool[] = [];

/** Map tool types to unit roles. */
function toolToRole(tool: ToolType): UnitRole {
  switch (tool) {
    case 'bow': return UnitRole.Archer;
    case 'hammer': return UnitRole.Builder;
    case 'scythe': return UnitRole.Farmer;
    case 'pike': return UnitRole.Pikeman;
    case 'shield': return UnitRole.Squire;
    case 'sword': return UnitRole.Knight;
  }
}

/** Map unit roles to tool types. */
function roleToTool(role: UnitRole): ToolType | undefined {
  switch (role) {
    case UnitRole.Archer: return 'bow';
    case UnitRole.Builder: return 'hammer';
    case UnitRole.Farmer: return 'scythe';
    case UnitRole.Pikeman: return 'pike';
    case UnitRole.Squire: return 'shield';
    case UnitRole.Knight: return 'sword';
    default: return undefined;
  }
}

/**
 * Drop a tool at a position (when a unit dies).
 * Called by combat system.
 */
export function dropTool(x: number, toolType: ToolType): void {
  droppedTools.push({ x, toolType, timer: TOOL_DESPAWN_TIME });
}

/**
 * Drop a tool for a specific unit role at its death position.
 */
export function dropToolForRole(x: number, role: UnitRole): void {
  const tool = roleToTool(role);
  if (tool) {
    dropTool(x, tool);
  }
}

/**
 * Pick up a dropped tool. Vagrant becomes the tool's unit role.
 * Returns true if successful.
 */
export function pickUpTool(state: GameState, vagrant: UnitData, toolIndex: number): boolean {
  if (toolIndex < 0 || toolIndex >= droppedTools.length) return false;
  if (vagrant.role !== UnitRole.Vagrant) return false;

  const tool = droppedTools[toolIndex];
  const role = toolToRole(tool.toolType);
  recruitUnit(vagrant, role);
  droppedTools.splice(toolIndex, 1);

  state.messages.push(`Vagrant picked up ${tool.toolType} and became ${role}!`);
  return true;
}

/**
 * Update dropped tools: age timers, remove expired.
 */
export function updateDroppedTools(dt: number): void {
  for (let i = droppedTools.length - 1; i >= 0; i--) {
    droppedTools[i].timer -= dt;
    if (droppedTools[i].timer <= 0) {
      droppedTools.splice(i, 1);
    }
  }
}

/** Get all dropped tools (read-only). */
export function getDroppedTools(): readonly DroppedTool[] {
  return droppedTools;
}

/** Find a dropped tool near a position. Returns index or -1. */
export function findNearbyDroppedTool(x: number, range: number): number {
  for (let i = 0; i < droppedTools.length; i++) {
    if (distance(x, droppedTools[i].x) <= range) {
      return i;
    }
  }
  return -1;
}
