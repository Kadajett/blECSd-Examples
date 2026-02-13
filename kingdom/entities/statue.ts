/**
 * Statue blessing system - 4 statues on specific islands.
 * Each can be unlocked with gems (one-time), then activated with coins (repeatable).
 * Only one blessing active at a time. Blessings have timed durations.
 *
 * - Archer Statue (Island 1): perfect accuracy for 1 day
 * - Farmer Statue (Island 2): +2 farmers/farm, 50% more output for 2 days
 * - Builder Statue (Island 3): +50% wall HP for 2 days
 * - Knight Statue (Island 5): jump-slash (2x damage) for 1 day
 */
import { getPosition } from 'blecsd';
import {
  type GameState,
  distance,
} from '../types';

// ─── Blessing Types ──────────────────────────────────────────────
export enum BlessingType {
  Archer = 'archer',
  Farmer = 'farmer',
  Builder = 'builder',
  Knight = 'knight',
}

export interface StatueData {
  type: BlessingType;
  islandIndex: number;
  x: number;
  unlocked: boolean;
  blessingActive: boolean;
  blessingTimer: number; // seconds remaining
}

// ─── Statue Config ───────────────────────────────────────────────
interface StatueConfig {
  type: BlessingType;
  island: number;
  gemCost: number;
  coinCost: number;
  x: number;
  durationDays: number;
  description: string;
}

const DAY_LENGTH = 180; // match types.ts DAY_LENGTH

const STATUE_CONFIGS: StatueConfig[] = [
  { type: BlessingType.Archer, island: 1, gemCost: 4, coinCost: 10, x: 300, durationDays: 1, description: 'Archer precision' },
  { type: BlessingType.Farmer, island: 2, gemCost: 1, coinCost: 7, x: 350, durationDays: 2, description: 'Farm prosperity' },
  { type: BlessingType.Builder, island: 3, gemCost: 3, coinCost: 9, x: 280, durationDays: 2, description: 'Fortification' },
  { type: BlessingType.Knight, island: 5, gemCost: 2, coinCost: 9, x: 320, durationDays: 1, description: 'Knight fury' },
];

const STATUE_INTERACT_RANGE = 3;

// ─── Module State ────────────────────────────────────────────────
const statues: StatueData[] = [];
let activeBlessingType: BlessingType | null = null;

/** Initialize statues for the current island. */
export function createStatues(state: GameState): void {
  statues.length = 0;
  activeBlessingType = null;

  for (const config of STATUE_CONFIGS) {
    if (config.island === state.islandIndex) {
      statues.push({
        type: config.type,
        islandIndex: config.island,
        x: config.x,
        unlocked: false,
        blessingActive: false,
        blessingTimer: 0,
      });
    }
  }
}

/** Get all statues (read-only). */
export function getStatues(): readonly StatueData[] {
  return statues;
}

/** Get config for a statue type. */
export function getStatueConfig(type: BlessingType): StatueConfig | undefined {
  return STATUE_CONFIGS.find(c => c.type === type);
}

/**
 * Unlock a statue with gems (one-time).
 */
export function unlockStatue(state: GameState, statueIndex: number): boolean {
  if (statueIndex < 0 || statueIndex >= statues.length) return false;
  const statue = statues[statueIndex];
  if (statue.unlocked) return false;

  const config = getStatueConfig(statue.type);
  if (!config) return false;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return false;
  if (distance(monarchPos.x, statue.x) > STATUE_INTERACT_RANGE) return false;

  if (state.gems < config.gemCost) return false;

  state.gems -= config.gemCost;
  statue.unlocked = true;
  state.messages.push(`${config.description} statue unlocked! (${config.gemCost} gems)`);
  return true;
}

/**
 * Activate a statue's blessing with coins (repeatable).
 * Replaces any active blessing.
 */
export function activateStatue(state: GameState, statueIndex: number): boolean {
  if (statueIndex < 0 || statueIndex >= statues.length) return false;
  const statue = statues[statueIndex];
  if (!statue.unlocked) return false;

  const config = getStatueConfig(statue.type);
  if (!config) return false;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return false;
  if (distance(monarchPos.x, statue.x) > STATUE_INTERACT_RANGE) return false;

  if (state.monarchCoins < config.coinCost) return false;

  // Deactivate any existing blessing
  for (const s of statues) {
    if (s.blessingActive) {
      s.blessingActive = false;
      s.blessingTimer = 0;
    }
  }

  state.monarchCoins -= config.coinCost;
  statue.blessingActive = true;
  statue.blessingTimer = config.durationDays * DAY_LENGTH;
  activeBlessingType = statue.type;

  state.messages.push(`${config.description} blessing activated! (${config.coinCost} coins)`);
  return true;
}

/** Update blessing timers. */
export function updateStatueBlessings(dt: number): void {
  for (const statue of statues) {
    if (!statue.blessingActive) continue;

    statue.blessingTimer -= dt;
    if (statue.blessingTimer <= 0) {
      statue.blessingActive = false;
      statue.blessingTimer = 0;
      if (activeBlessingType === statue.type) {
        activeBlessingType = null;
      }
    }
  }
}

/** Check if a specific blessing type is currently active. */
export function isBlessed(type: BlessingType): boolean {
  return activeBlessingType === type;
}

/** Get the current active blessing type, or null. */
export function getBlessingType(): BlessingType | null {
  return activeBlessingType;
}

/** Find a statue near the monarch. Returns index or -1. */
export function findNearbyStatue(state: GameState): number {
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return -1;

  for (let i = 0; i < statues.length; i++) {
    if (distance(monarchPos.x, statues[i].x) <= STATUE_INTERACT_RANGE) {
      return i;
    }
  }
  return -1;
}
