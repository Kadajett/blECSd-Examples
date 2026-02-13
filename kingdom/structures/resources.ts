/**
 * Resource nodes: gold veins, berry bushes, trees, and fishing streams.
 *
 * Gold Veins:
 *   Finite: 50 coins per vein, becomes inert when depleted.
 *   Miners extract 1 coin every 10 seconds.
 *   3-5 gold veins per island.
 *
 * Berry Bushes (winter):
 *   4 berries per bush, 1 coin per berry.
 *   Regrow after 2 days if still winter.
 *   8-12 bushes per island during winter.
 *
 * Trees:
 *   Drop 1 coin when cut by builder.
 *   Block wall placement (must be cut first).
 *   Regrow slowly: 1 per day in spring/summer, no regrowth in autumn/winter.
 *
 * Streams:
 *   Pikemen can fish for 1 coin, 8-second fishing time.
 *   Only in non-frozen streams (not winter).
 */

import { type GameState, MAP_WIDTH, Season } from '../types';

export enum ResourceType {
  GoldVein = 'goldVein',
  BerryBush = 'berryBush',
  Tree = 'tree',
  Stream = 'stream',
}

export interface ResourceNode {
  x: number;
  type: ResourceType;
  harvestsRemaining: number;
  depleted: boolean;
  respawnTimer: number;
}

/** Gold vein constants */
const GOLD_VEIN_MAX_HARVESTS = 50;
const GOLD_VEIN_HARVEST_INTERVAL = 10; // seconds

/** Berry bush constants */
const BERRY_BUSH_HARVESTS = 4;
const BERRY_BUSH_REGROW_DAYS = 2;

/** Tree constants */
const TREE_HARVESTS = 1;

/** Fishing constants */
export const FISHING_TIME = 8; // seconds per fish
const FISHING_HARVESTS = 99; // effectively unlimited per stream

/** All resource nodes keyed by x position */
const resources: Map<number, ResourceNode> = new Map();

/** Per-resource harvest cooldown (seconds remaining) */
const harvestCooldowns: Map<number, number> = new Map();

/** Track positions of winter berry bushes for cleanup */
const winterBerryPositions: Set<number> = new Set();

/** Track depleted berry bush positions for regrowth */
const depletedBerryTimers: Map<number, number> = new Map();

/** Tree positions that have been cut (for wall placement check) */
const cutTrees: Set<number> = new Set();

/** Create a resource node at the given x position */
export function createResource(_state: GameState, x: number, type: ResourceType): void {
  let maxHarvests: number;
  switch (type) {
    case ResourceType.GoldVein:
      maxHarvests = GOLD_VEIN_MAX_HARVESTS;
      break;
    case ResourceType.BerryBush:
      maxHarvests = BERRY_BUSH_HARVESTS;
      break;
    case ResourceType.Tree:
      maxHarvests = TREE_HARVESTS;
      break;
    case ResourceType.Stream:
      maxHarvests = FISHING_HARVESTS;
      break;
    default:
      maxHarvests = 20;
  }

  resources.set(x, {
    x,
    type,
    harvestsRemaining: maxHarvests,
    depleted: false,
    respawnTimer: 0,
  });
}

/** Harvest a resource at x. Returns coins gained (0 if unavailable or on cooldown). */
export function harvestResource(_state: GameState, x: number): number {
  const node = resources.get(x);
  if (!node || node.depleted) return 0;

  const cooldown = harvestCooldowns.get(x) ?? 0;
  if (cooldown > 0) return 0;

  node.harvestsRemaining -= 1;

  // Set cooldown based on resource type
  switch (node.type) {
    case ResourceType.GoldVein:
      harvestCooldowns.set(x, GOLD_VEIN_HARVEST_INTERVAL);
      break;
    case ResourceType.Stream:
      harvestCooldowns.set(x, FISHING_TIME);
      break;
    default:
      harvestCooldowns.set(x, 1); // 1 second for berries/trees
  }

  if (node.harvestsRemaining <= 0) {
    node.depleted = true;

    if (node.type === ResourceType.Tree) {
      cutTrees.add(x);
    }

    // Gold veins stay inert (no respawn)
    // Berry bushes track for regrowth
    if (node.type === ResourceType.BerryBush) {
      depletedBerryTimers.set(x, 0);
    }
  }

  return 1;
}

/** Get the resource node at position x, or null */
export function getResourceAt(_state: GameState, x: number): ResourceNode | null {
  return resources.get(x) ?? null;
}

/** Check if a tree exists at position x (blocks wall placement) */
export function hasTreeAt(x: number): boolean {
  const node = resources.get(x);
  return node !== null && node !== undefined && node.type === ResourceType.Tree && !node.depleted;
}

/** Check if fishing is available at position x (not winter) */
export function canFishAt(x: number, season: Season): boolean {
  if (season === Season.Winter) return false;
  const node = resources.get(x);
  return node !== null && node !== undefined && node.type === ResourceType.Stream && !node.depleted;
}

/** Update resource respawn timers, harvest cooldowns, and seasonal effects. */
export function updateResources(dt: number, season?: Season, dayLength?: number): void {
  // Update harvest cooldowns
  for (const [x, cooldown] of harvestCooldowns) {
    const next = cooldown - dt;
    if (next <= 0) {
      harvestCooldowns.delete(x);
    } else {
      harvestCooldowns.set(x, next);
    }
  }

  // Update depleted berry bush regrowth (only in winter)
  if (season === Season.Winter) {
    const dayDuration = dayLength ?? 180;
    for (const [x, timer] of depletedBerryTimers) {
      const newTimer = timer + dt;
      if (newTimer >= BERRY_BUSH_REGROW_DAYS * dayDuration) {
        // Regrow the berry bush
        const node = resources.get(x);
        if (node && node.type === ResourceType.BerryBush) {
          node.depleted = false;
          node.harvestsRemaining = BERRY_BUSH_HARVESTS;
        }
        depletedBerryTimers.delete(x);
      } else {
        depletedBerryTimers.set(x, newTimer);
      }
    }
  }

  // Tree regrowth: 1 per day in spring/summer (handled externally via regrowTree)
}

/** Regrow a single tree at position x (called by game loop, 1 per day in spring/summer) */
export function regrowTree(x: number): boolean {
  if (!cutTrees.has(x)) return false;

  resources.set(x, {
    x,
    type: ResourceType.Tree,
    harvestsRemaining: TREE_HARVESTS,
    depleted: false,
    respawnTimer: 0,
  });
  cutTrees.delete(x);
  return true;
}

/** Get all cut tree positions (for regrowth selection) */
export function getCutTreePositions(): ReadonlySet<number> {
  return cutTrees;
}

/**
 * Spawn 8-12 berry bushes across the map when winter starts.
 * Each bush has 4 harvests at 1 coin per berry.
 */
export function spawnWinterBerries(_state: GameState): void {
  const count = 8 + Math.floor(Math.random() * 5); // 8-12

  for (let i = 0; i < count; i++) {
    const x = 50 + Math.floor(Math.random() * (MAP_WIDTH - 100));
    if (resources.has(x)) continue;

    resources.set(x, {
      x,
      type: ResourceType.BerryBush,
      harvestsRemaining: BERRY_BUSH_HARVESTS,
      depleted: false,
      respawnTimer: 0,
    });
    winterBerryPositions.add(x);
  }
}

/** Remove all winter berry bushes when winter ends */
export function clearWinterBerries(_state: GameState): void {
  for (const x of winterBerryPositions) {
    resources.delete(x);
    harvestCooldowns.delete(x);
    depletedBerryTimers.delete(x);
  }
  winterBerryPositions.clear();
}
