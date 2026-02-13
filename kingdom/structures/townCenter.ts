/**
 * Town center upgrade system.
 * Located at CAMP_CENTER_X (600). Upgrades unlock new technologies.
 * 7 tiers from Campfire to Iron Keep.
 *
 * Tier 1 (Campfire): bow + hammer stands
 * Tier 2 (Camp): second tool stand set
 * Tier 3 (Village): scythe vendor (farmers), inner spike walls
 * Tier 4 (Town Hall): banker, siege workshop
 * Tier 5 (Stone Fort): stone walls, pike vendor, catapult station
 * Tier 6 (Castle): shields (squires), gem keeper
 * Tier 7 (Iron Keep): bomb, forge, iron walls
 *
 * Cooldown: tier * 10 seconds between upgrades.
 * Town center HP: [0, 10, 20, 30, 50, 80, 120, 200] per tier.
 * If town center HP reaches 0: game over.
 */

import {
  type GameState,
  StructureType,
  TownCenterTier,
  CAMP_CENTER_X,
  GamePhase,
  TOWN_CENTER_COSTS,
  TOWN_CENTER_NAMES,
} from '../types';

const TOWN_CENTER_HP = [0, 10, 20, 30, 50, 80, 120, 200];

export interface TownCenterUnlocks {
  tierName: string;
  unlocks: string[];
}

/** Get the current town center tier */
export function getTownCenterTier(state: GameState): TownCenterTier {
  return state.townCenterTier;
}

/** Check if the town center can be upgraded (enough coins and no cooldown) */
export function canUpgradeTownCenter(state: GameState): boolean {
  const tier = state.townCenterTier;
  if (tier >= TownCenterTier.IronKeep) return false;
  if (state.townCenterCooldown > 0) return false;
  const cost = TOWN_CENTER_COSTS[tier + 1] ?? Infinity;
  return state.monarchCoins >= cost;
}

/** Upgrade the town center. Deducts coins, increments tier, starts cooldown. */
export function upgradeTownCenter(state: GameState): boolean {
  if (!canUpgradeTownCenter(state)) return false;

  const nextTier = state.townCenterTier + 1;
  const cost = TOWN_CENTER_COSTS[nextTier];
  if (cost === undefined) return false;

  state.monarchCoins -= cost;
  state.townCenterTier = nextTier;
  state.townCenterCooldown = nextTier * 10;

  // Update campfire structure HP at the main settlement
  const campfire = state.structures.get(CAMP_CENTER_X);
  if (campfire && campfire.type === StructureType.Campfire) {
    const newHp = TOWN_CENTER_HP[nextTier] ?? 10;
    campfire.maxHp = newHp;
    campfire.hp = newHp;
    campfire.level = nextTier;
  }

  const name = TOWN_CENTER_NAMES[nextTier] ?? `Tier ${nextTier}`;
  state.messages.push(`Town Center upgraded to ${name}!`);

  return true;
}

/** Update town center cooldown timer. Check for destruction game-over. */
export function updateTownCenter(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  if (state.townCenterCooldown > 0) {
    state.townCenterCooldown = Math.max(0, state.townCenterCooldown - dt);
  }

  // Check town center destruction (only if it has been upgraded beyond default)
  const campfire = state.structures.get(CAMP_CENTER_X);
  if (campfire && campfire.type === StructureType.Campfire
    && campfire.hp <= 0 && campfire.maxHp > 0 && campfire.maxHp < 999) {
    state.phase = GamePhase.GameOver;
    state.messages.push('The Town Center has been destroyed! The kingdom falls.');
  }
}

/** Get what's unlocked at each tier */
export function getTownCenterUnlocks(tier: number): TownCenterUnlocks {
  const tierName = TOWN_CENTER_NAMES[tier] ?? 'Unknown';

  switch (tier) {
    case TownCenterTier.Campfire:
      return { tierName, unlocks: ['Bow stand', 'Hammer stand'] };
    case TownCenterTier.Camp:
      return { tierName, unlocks: ['Second tool stand set'] };
    case TownCenterTier.Village:
      return { tierName, unlocks: ['Scythe vendor (farmers)', 'Inner spike walls'] };
    case TownCenterTier.TownHall:
      return { tierName, unlocks: ['Banker NPC', 'Siege workshop'] };
    case TownCenterTier.StoneFort:
      return { tierName, unlocks: ['Stone walls', 'Pike vendor', 'Catapult station'] };
    case TownCenterTier.Castle:
      return { tierName, unlocks: ['Shields (squires)', 'Gem keeper'] };
    case TownCenterTier.IronKeep:
      return { tierName, unlocks: ['Bomb', 'Forge', 'Iron walls'] };
    default:
      return { tierName, unlocks: [] };
  }
}

/** Get the max HP for a given town center tier */
export function getTownCenterHp(tier: number): number {
  return TOWN_CENTER_HP[tier] ?? 0;
}

/** Handle coin drop at town center position. Returns true if upgrade was triggered. */
export function handleCoinDropAtTownCenter(state: GameState, dropX: number): boolean {
  if (Math.abs(dropX - CAMP_CENTER_X) > 2) return false;
  return upgradeTownCenter(state);
}
