/**
 * Shrine structure: 4 shrine types with escalating costs and cooldowns.
 *
 * Speed Shrine: +30% movement speed for 1 day (5 coins + 2 per previous use)
 * Damage Shrine: +50% arrow damage for 1 day (5 coins + 2 per previous use)
 * Shield Shrine: +30% wall HP for 2 days (8 coins + 3 per previous use)
 * Spawn Shrine: spawn 3 archers immediately (10 coins, once per day)
 *
 * 2-3 shrines per island, 1-day cooldown between uses per shrine.
 */

import { addEntity, setPosition } from 'blecsd';
import {
  type GameState,
  type StructureData,
  StructureType,
  GROUND_Y,
  DAY_LENGTH,
} from '../types';

export enum ShrineBuffType {
  ArcherDamage = 'archerDamage',
  BuilderSpeed = 'builderSpeed',
  WallDurability = 'wallDurability',
  SpawnArchers = 'spawnArchers',
}

export interface ShrineBuff {
  type: ShrineBuffType;
  remaining: number; // seconds remaining
  multiplier: number;
}

/** Shrine-specific type assigned to each shrine position */
export enum ShrineKind {
  Speed = 0,
  Damage = 1,
  Shield = 2,
  Spawn = 3,
}

interface ShrineConfig {
  buffType: ShrineBuffType;
  baseCost: number;
  costPerUse: number;
  durationDays: number;
  multiplier: number;
}

const SHRINE_CONFIGS: Record<ShrineKind, ShrineConfig> = {
  [ShrineKind.Speed]: {
    buffType: ShrineBuffType.BuilderSpeed,
    baseCost: 5,
    costPerUse: 2,
    durationDays: 1,
    multiplier: 1.3,
  },
  [ShrineKind.Damage]: {
    buffType: ShrineBuffType.ArcherDamage,
    baseCost: 5,
    costPerUse: 2,
    durationDays: 1,
    multiplier: 1.5,
  },
  [ShrineKind.Shield]: {
    buffType: ShrineBuffType.WallDurability,
    baseCost: 8,
    costPerUse: 3,
    durationDays: 2,
    multiplier: 1.3,
  },
  [ShrineKind.Spawn]: {
    buffType: ShrineBuffType.SpawnArchers,
    baseCost: 10,
    costPerUse: 0,
    durationDays: 0, // instant effect
    multiplier: 1,
  },
};

/** Per-shrine tracking: x -> kind */
const shrineKinds: Map<number, ShrineKind> = new Map();

/** Per-shrine use count (for escalating costs) */
const shrineUseCount: Map<number, number> = new Map();

/** Per-shrine cooldown timer (seconds remaining, 1-day cooldown) */
const shrineCooldowns: Map<number, number> = new Map();

/** Active buffs (multiple can be active simultaneously) */
const activeBuffs: ShrineBuff[] = [];

/** Track spawn shrine daily use: day number -> set of shrine x positions used */
let lastSpawnShrineDay = -1;
const spawnShrineUsedToday: Set<number> = new Set();

/** Create a shrine at the given x position with a specific kind */
export function createShrine(state: GameState, x: number, kind?: ShrineKind): StructureData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const shrine: StructureData = {
    eid,
    type: StructureType.Shrine,
    x,
    hp: 10,
    maxHp: 10,
    level: 1,
    assignedWorkers: [],
  };

  // Assign kind (random if not specified)
  const assignedKind = kind ?? (Math.floor(Math.random() * 4) as ShrineKind);
  shrineKinds.set(x, assignedKind);
  shrineUseCount.set(x, 0);

  state.structures.set(x, shrine);
  return shrine;
}

/** Get the shrine kind at a position */
export function getShrineType(x: number): ShrineKind | null {
  return shrineKinds.get(x) ?? null;
}

/** Get the current cost to activate a shrine at position x */
export function getShrineCost(x: number): number {
  const kind = shrineKinds.get(x);
  if (kind === undefined) return 0;
  const config = SHRINE_CONFIGS[kind];
  const uses = shrineUseCount.get(x) ?? 0;
  return config.baseCost + config.costPerUse * uses;
}

/** Get the effect description for a shrine kind */
export function getShrineEffect(kind: ShrineKind): string {
  switch (kind) {
    case ShrineKind.Speed: return '+30% movement speed (1 day)';
    case ShrineKind.Damage: return '+50% arrow damage (1 day)';
    case ShrineKind.Shield: return '+30% wall HP (2 days)';
    case ShrineKind.Spawn: return 'Spawn 3 archers (once per day)';
  }
}

/**
 * Activate a shrine at position x.
 * Returns the buff type granted, or null if unavailable.
 */
export function activateShrine(state: GameState, x: number): ShrineBuffType | null {
  const kind = shrineKinds.get(x);
  if (kind === undefined) return null;

  const config = SHRINE_CONFIGS[kind];
  const cost = getShrineCost(x);

  if (state.monarchCoins < cost) return null;

  // Check cooldown
  const cooldown = shrineCooldowns.get(x) ?? 0;
  if (cooldown > 0) return null;

  // Check spawn shrine daily limit
  if (kind === ShrineKind.Spawn) {
    if (state.dayCount !== lastSpawnShrineDay) {
      lastSpawnShrineDay = state.dayCount;
      spawnShrineUsedToday.clear();
    }
    if (spawnShrineUsedToday.has(x)) return null;
  }

  state.monarchCoins -= cost;
  shrineUseCount.set(x, (shrineUseCount.get(x) ?? 0) + 1);

  // Set 1-day cooldown
  shrineCooldowns.set(x, DAY_LENGTH);

  if (kind === ShrineKind.Spawn) {
    spawnShrineUsedToday.add(x);
    state.messages.push('Spawn Shrine: 3 archers summoned!');
    return ShrineBuffType.SpawnArchers;
  }

  // Add timed buff
  const duration = config.durationDays * DAY_LENGTH;
  activeBuffs.push({
    type: config.buffType,
    remaining: duration,
    multiplier: config.multiplier,
  });

  const names: Record<ShrineKind, string> = {
    [ShrineKind.Speed]: 'Speed',
    [ShrineKind.Damage]: 'Damage',
    [ShrineKind.Shield]: 'Shield',
    [ShrineKind.Spawn]: 'Spawn',
  };
  state.messages.push(`${names[kind]} Shrine activated for ${config.durationDays} day(s)!`);
  return config.buffType;
}

/** Tick down buff durations and cooldowns. Call each frame with dt. */
export function updateShrineBuff(dt: number): void {
  // Update active buffs
  for (let i = activeBuffs.length - 1; i >= 0; i--) {
    activeBuffs[i].remaining -= dt;
    if (activeBuffs[i].remaining <= 0) {
      activeBuffs.splice(i, 1);
    }
  }

  // Update shrine cooldowns
  for (const [x, cd] of shrineCooldowns) {
    const next = cd - dt;
    if (next <= 0) {
      shrineCooldowns.delete(x);
    } else {
      shrineCooldowns.set(x, next);
    }
  }
}

/** Get the current active buff of a specific type, or null */
export function getActiveBuff(): ShrineBuff | null {
  // Return the strongest active buff (backward compat: returns first match)
  return activeBuffs.length > 0 ? activeBuffs[0] : null;
}

/** Get all active buffs */
export function getAllActiveBuffs(): readonly ShrineBuff[] {
  return activeBuffs;
}

/** Check if a specific buff type is active */
export function isBuffActive(type: ShrineBuffType): boolean {
  return activeBuffs.some(b => b.type === type);
}

/** Get the multiplier for a specific buff type (1.0 if not active) */
export function getBuffMultiplier(type: ShrineBuffType): number {
  for (const buff of activeBuffs) {
    if (buff.type === type) return buff.multiplier;
  }
  return 1.0;
}
