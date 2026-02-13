/**
 * Portal structure management and world layout for the 1200-wide world.
 *
 * Portal positions from map.ts: 30, 220, 540, 880, 1170 (between settlements).
 * Settlements from map.ts: 150, 400, 600, 800, 1050.
 * Each portal has independent difficulty that scales per night survived.
 * Destroying a portal permanently clears the area for settlement expansion.
 * Victory: all portals destroyed on island 5.
 */

import { addEntity, setPosition, getPosition } from 'blecsd';
import {
  type GameState,
  type StructureData,
  StructureType,
  UnitRole,
  AIState,
  TowerTier,
  GROUND_Y,
  PORTAL_HP,
  GamePhase,
  GreedType,
  PortalType,
} from '../types';
import { isWallStructure, isTowerStructure } from './wall';
import { SETTLEMENT_CENTERS } from '../world/map';
import { dropGemsOnPortalDestruction } from '../systems/gems';

export const FINAL_ISLAND = 5;
export const TOTAL_ISLANDS = 9; // 0-5 main + 6-8 challenge

// ─── Challenge Island System ─────────────────────────────────────────

/** Challenge islands are post-campaign (islands 6-8) */
export function isChallengeIsland(index: number): boolean {
  return index >= 6 && index <= 8;
}

export interface ChallengeRules {
  name: string;
  description: string;
  endless: boolean;
  difficultyMultiplier: number;
  mapWidth: number;
  allTypesFromNight1: boolean;
  maxVagrantCamps: number;
  hasMerchant: boolean;
  hasBanker: boolean;
  victoryCondition: string;
  goldMedalNights: number;
  diamondMedalNights: number;
  hasPlagueCrawlers: boolean;
  surviveAfterPortals: number;
}

const CHALLENGE_RULES: Record<number, ChallengeRules> = {
  6: { // Skull Island
    name: 'Skull Island',
    description: 'Endless survival, no portals to destroy',
    endless: true,
    difficultyMultiplier: 3.0,
    mapWidth: 400,
    allTypesFromNight1: false,
    maxVagrantCamps: 4,
    hasMerchant: true,
    hasBanker: true,
    victoryCondition: 'survive',
    goldMedalNights: 30,
    diamondMedalNights: 50,
    hasPlagueCrawlers: false,
    surviveAfterPortals: 0,
  },
  7: { // Dire Island
    name: 'Dire Island',
    description: 'Island 5 difficulty x3, all greed types from night 1',
    endless: false,
    difficultyMultiplier: 5.0,
    mapWidth: 1200,
    allTypesFromNight1: true,
    maxVagrantCamps: 2,
    hasMerchant: false,
    hasBanker: false,
    victoryCondition: 'destroyAllPortals',
    goldMedalNights: 0,
    diamondMedalNights: 0,
    hasPlagueCrawlers: false,
    surviveAfterPortals: 0,
  },
  8: { // Plague Island
    name: 'Plague Island',
    description: 'Plague Crawlers climb over walls and poison units',
    endless: false,
    difficultyMultiplier: 2.5,
    mapWidth: 1000,
    allTypesFromNight1: false,
    maxVagrantCamps: 4,
    hasMerchant: true,
    hasBanker: true,
    victoryCondition: 'destroyAndSurvive',
    goldMedalNights: 0,
    diamondMedalNights: 0,
    hasPlagueCrawlers: true,
    surviveAfterPortals: 10,
  },
};

/** Get challenge rules for an island index, or null for non-challenge islands */
export function getChallengeRules(index: number): ChallengeRules | null {
  return CHALLENGE_RULES[index] ?? null;
}

/** Get the difficulty multiplier for a challenge island */
export function getChallengeDifficulty(index: number): number {
  return CHALLENGE_RULES[index]?.difficultyMultiplier ?? 1.0;
}

/** Fixed world layout positions (must match map.ts) */
export const PORTAL_POSITIONS_WORLD: readonly number[] = [30, 220, 540, 880, 1170];
export const SETTLEMENT_POSITIONS: readonly number[] = SETTLEMENT_CENTERS;

/** Defense rating search radius around a settlement center */
const DEFENSE_RADIUS = 20;

/** Retaliation wave flag: set when a portal is destroyed */
let retaliationPending = false;

/** Per-portal difficulty: number of nights this portal has been active */
const portalDifficulty: Map<number, number> = new Map();

/** Permanently destroyed portal positions (cleared areas) */
const destroyedPortalPositions: Set<number> = new Set();

/** Get the expected number of portals for an island (base 2 + 1 per island) */
export function getPortalCountForIsland(islandIndex: number): number {
  return 1 + islandIndex;
}

/** Get per-portal difficulty multiplier (1.0 base + 0.1 per night survived) */
export function getPortalDifficulty(portalX: number): number {
  const nights = portalDifficulty.get(portalX) ?? 0;
  return 1 + nights * 0.1;
}

/** Increment difficulty for all active portals (call once per night start) */
export function incrementPortalDifficulty(state: GameState): void {
  for (const x of state.portalPositions) {
    if (isPortalActive(state, x)) {
      const current = portalDifficulty.get(x) ?? 0;
      portalDifficulty.set(x, current + 1);
    }
  }
}

/** Check if a portal position has been permanently destroyed */
export function isPortalCleared(x: number): boolean {
  return destroyedPortalPositions.has(x);
}

/** Get the nearest settlement center to a given x position */
export function getNearestSettlement(x: number): number {
  let best = SETTLEMENT_POSITIONS[0];
  let bestDist = Math.abs(x - best);

  for (let i = 1; i < SETTLEMENT_POSITIONS.length; i++) {
    const dist = Math.abs(x - SETTLEMENT_POSITIONS[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = SETTLEMENT_POSITIONS[i];
    }
  }

  return best;
}

/**
 * Calculate defense rating for a settlement.
 * Walls: +1 each, Towers: +3 each, Archers within radius: +2 each.
 */
export function getSettlementDefenseRating(state: GameState, settlementX: number): number {
  let rating = 0;

  // Count walls and towers
  for (const [x, structure] of state.structures) {
    if (Math.abs(x - settlementX) > DEFENSE_RADIUS) continue;
    if (isWallStructure(structure.type)) rating += 1;
    if (isTowerStructure(structure.type)) rating += 3;
  }

  // Count archers
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Archer) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - settlementX) <= DEFENSE_RADIUS) {
      rating += 2;
    }
  }

  return rating;
}

/**
 * Get the weakest settlement (lowest defense rating).
 * Returns the settlement x position.
 */
export function getWeakestSettlement(state: GameState): number {
  let weakest = SETTLEMENT_POSITIONS[0];
  let lowestRating = getSettlementDefenseRating(state, weakest);

  for (let i = 1; i < SETTLEMENT_POSITIONS.length; i++) {
    const sx = SETTLEMENT_POSITIONS[i];
    const rating = getSettlementDefenseRating(state, sx);
    if (rating < lowestRating) {
      lowestRating = rating;
      weakest = sx;
    }
  }

  return weakest;
}

/** Create a portal at the given x position */
export function createPortal(state: GameState, x: number): StructureData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const portal: StructureData = {
    eid,
    type: StructureType.Portal,
    x,
    hp: PORTAL_HP,
    maxHp: PORTAL_HP,
    level: 1,
    assignedWorkers: [],
    towerTier: TowerTier.None,
    isRoofed: false,
  };

  state.structures.set(x, portal);

  if (!state.portalPositions.includes(x)) {
    state.portalPositions.push(x);
  }

  portalDifficulty.set(x, 0);

  return portal;
}

/** Apply damage to a portal. Returns remaining hp. */
export function damagePortal(state: GameState, x: number, dmg: number): number {
  const portal = state.structures.get(x);
  if (!portal || portal.type !== StructureType.Portal) return 0;

  portal.hp -= dmg;
  if (portal.hp <= 0) {
    portal.hp = 0;
    destroyPortal(state, x);
    return 0;
  }
  return portal.hp;
}

/** Destroy a portal. Permanently clears the area. Triggers retaliation. */
export function destroyPortal(state: GameState, x: number): void {
  const portal = state.structures.get(x);
  if (!portal || portal.type !== StructureType.Portal) return;

  state.structures.delete(x);

  const idx = state.portalPositions.indexOf(x);
  if (idx !== -1) {
    state.portalPositions.splice(idx, 1);
  }

  // Permanently mark as cleared
  destroyedPortalPositions.add(x);
  portalDifficulty.delete(x);

  retaliationPending = true;

  // Drop gems on portal destruction
  const gemsDropped = dropGemsOnPortalDestruction(state, x);
  state.messages.push(`Portal destroyed at ${x}! +${gemsDropped} gems. Retaliation incoming!`);

  // Victory check: all portals destroyed on the final island
  if (state.islandIndex >= FINAL_ISLAND && getActivePortals(state).length === 0) {
    state.phase = GamePhase.Victory;
    state.messages.push('All portals destroyed! The kingdom is saved!');
  }
}

/** Check if a retaliation wave should be spawned */
export function isRetaliationPending(): boolean {
  return retaliationPending;
}

/** Clear the retaliation flag after spawning the wave */
export function clearRetaliation(): void {
  retaliationPending = false;
}

/** Check if a portal at position x exists and has hp > 0 */
export function isPortalActive(state: GameState, x: number): boolean {
  const portal = state.structures.get(x);
  return portal !== undefined
    && portal.type === StructureType.Portal
    && portal.hp > 0;
}

/** Return all active portal x positions */
export function getActivePortals(state: GameState): number[] {
  return state.portalPositions.filter(x => isPortalActive(state, x));
}

// ─── Portal Assault System ──────────────────────────────────────────

/** Knight DPS against portal during assault */
const KNIGHT_PORTAL_DPS = 2;
/** Archer DPS against portal during assault */
const ARCHER_PORTAL_DPS = 1;
/** Portal defense wave spawn interval during assault (seconds) */
const DEFENSE_WAVE_INTERVAL = 10;
/** Portal defense wave size */
const DEFENSE_WAVE_SIZE_MIN = 3;
const DEFENSE_WAVE_SIZE_MAX = 5;

/** Timer for next defense wave spawn */
let defenseWaveTimer = DEFENSE_WAVE_INTERVAL;

/** Entities assigned to current assault */
const assaultKnights: Set<number> = new Set();
const assaultArchers: Set<number> = new Set();

/**
 * Start a portal assault on the given side ('left' or 'right').
 * Dispatches the nearest knight and archers toward the nearest portal.
 */
export function startPortalAssault(state: GameState, side: 'left' | 'right'): boolean {
  if (state.portalAssaultActive) return false;

  const portals = getActivePortals(state);
  if (portals.length === 0) return false;

  // Find nearest portal on the given side
  const centerX = 600;
  let targetPortal: number | null = null;
  let bestDist = Infinity;

  for (const px of portals) {
    if (side === 'left' && px >= centerX) continue;
    if (side === 'right' && px < centerX) continue;
    const dist = Math.abs(px - centerX);
    if (dist < bestDist) {
      bestDist = dist;
      targetPortal = px;
    }
  }

  // Fallback: any portal
  if (targetPortal === null) {
    targetPortal = portals[0];
  }

  // Find nearest knight
  let bestKnight = -1;
  let bestKnightDist = Infinity;
  for (let i = 0; i < state.units.length; i++) {
    const unit = state.units[i];
    if (unit.role !== UnitRole.Knight || unit.hp <= 0) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const dist = Math.abs(pos.x - targetPortal);
    if (dist < bestKnightDist) {
      bestKnightDist = dist;
      bestKnight = i;
    }
  }

  if (bestKnight === -1) {
    state.messages.push('No knight available for portal assault!');
    return false;
  }

  const knight = state.units[bestKnight];
  knight.aiState = AIState.Attacking;
  knight.targetX = targetPortal;
  assaultKnights.add(knight.eid);

  // Find nearby archers to accompany
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Archer || unit.hp <= 0) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - knight.targetX) < 30) {
      unit.aiState = AIState.Attacking;
      unit.targetX = targetPortal;
      assaultArchers.add(unit.eid);
    }
  }

  state.portalAssaultActive = true;
  state.assaultTargetPortal = targetPortal;
  defenseWaveTimer = DEFENSE_WAVE_INTERVAL;

  state.messages.push(`Portal assault launched toward x=${targetPortal}!`);
  return true;
}

/** Update the portal assault each frame */
export function updatePortalAssault(state: GameState, dt: number): void {
  if (!state.portalAssaultActive) return;

  const portalX = state.assaultTargetPortal;

  // Check if target portal is still active
  if (!isPortalActive(state, portalX)) {
    state.portalAssaultActive = false;
    assaultKnights.clear();
    assaultArchers.clear();
    return;
  }

  // Clean up dead assault units
  for (const eid of assaultKnights) {
    if (!state.units.some(u => u.eid === eid && u.hp > 0)) {
      assaultKnights.delete(eid);
    }
  }
  for (const eid of assaultArchers) {
    if (!state.units.some(u => u.eid === eid && u.hp > 0)) {
      assaultArchers.delete(eid);
    }
  }

  // If no more knights, abort assault
  if (assaultKnights.size === 0) {
    state.portalAssaultActive = false;
    assaultArchers.clear();
    state.messages.push('Portal assault failed: no knights remaining.');
    return;
  }

  // Apply DPS from knights near the portal
  let totalDps = 0;
  for (const eid of assaultKnights) {
    const pos = getPosition(state.world, eid);
    if (!pos) continue;
    if (Math.abs(pos.x - portalX) <= 3) {
      totalDps += KNIGHT_PORTAL_DPS;
    }
  }
  for (const eid of assaultArchers) {
    const pos = getPosition(state.world, eid);
    if (!pos) continue;
    if (Math.abs(pos.x - portalX) <= 15) {
      totalDps += ARCHER_PORTAL_DPS;
    }
  }

  if (totalDps > 0) {
    damagePortal(state, portalX, totalDps * dt);
  }

  // Spawn defense waves from the portal
  defenseWaveTimer -= dt;
  if (defenseWaveTimer <= 0) {
    defenseWaveTimer = DEFENSE_WAVE_INTERVAL;
    const waveSize = DEFENSE_WAVE_SIZE_MIN + Math.floor(
      Math.random() * (DEFENSE_WAVE_SIZE_MAX - DEFENSE_WAVE_SIZE_MIN + 1)
    );
    // Import would be circular; use state.greeds directly to add basic greeds
    // The spawnGreed import would cause circular deps. We simulate by pushing greed data.
    for (let i = 0; i < waveSize; i++) {
      const offset = (Math.random() - 0.5) * 4;
      // Minimal greed data; combat system handles the rest
      state.greeds.push({
        eid: 0 as any, // Will be cleaned up if no entity
        type: GreedType.Basic,
        hp: 1,
        speed: 3,
        damage: 1,
        carryingCoins: 0,
      });
    }
    state.messages.push(`Portal spawns ${waveSize} defenders!`);
  }
}

// ─── Cave Portal System ─────────────────────────────────────────────

/** Cave portal appears on islands 3+ (one per island) */
const CAVE_MIN_ISLAND = 3;
/** Cave spawn rate multiplier vs cliff portals */
const CAVE_SPAWN_RATE_MULT = 2;
/** Cave blood moon spawn multiplier */
const CAVE_BLOOD_MOON_MULT = 3;

/** Track cave portal positions and their hive counts */
const cavePortalPositions: Map<number, number> = new Map(); // x -> hiveCount
/** Track portal types */
const portalTypes: Map<number, PortalType> = new Map();

/** Create a cave portal at the given position. Cave HP = 200 * islandIndex. */
export function createCavePortal(state: GameState, x: number): StructureData {
  const hiveCount = state.islandIndex;
  const caveHp = 200 * state.islandIndex;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y);

  const portal: StructureData = {
    eid,
    type: StructureType.Portal,
    x,
    hp: caveHp,
    maxHp: caveHp,
    level: 1,
    assignedWorkers: [],
    towerTier: TowerTier.None,
    isRoofed: false,
  };

  state.structures.set(x, portal);

  if (!state.portalPositions.includes(x)) {
    state.portalPositions.push(x);
  }

  portalDifficulty.set(x, 0);
  cavePortalPositions.set(x, hiveCount);
  portalTypes.set(x, PortalType.Cave);

  return portal;
}

/** Check if a portal at position x is a cave portal */
export function isCavePortal(x: number): boolean {
  return portalTypes.get(x) === PortalType.Cave;
}

/** Get the number of hives inside a cave portal */
export function getCaveHiveCount(x: number): number {
  return cavePortalPositions.get(x) ?? 0;
}

/** Get the spawn rate multiplier for a portal (cave portals spawn faster) */
export function getPortalSpawnMultiplier(x: number, isBloodMoon: boolean): number {
  if (!isCavePortal(x)) return 1;
  return isBloodMoon ? CAVE_BLOOD_MOON_MULT : CAVE_SPAWN_RATE_MULT;
}

/** Get the portal type for a given position */
export function getPortalType(x: number): PortalType {
  return portalTypes.get(x) ?? PortalType.Cliff;
}

/** Set the portal type for a position */
export function setPortalType(x: number, type: PortalType): void {
  portalTypes.set(x, type);
}

/**
 * Destroy a cave portal via bomb. ALL greed on island die immediately.
 * Island marked as "cleared" (no more greed spawn ever).
 * Gem reward: 4-8 gems.
 */
export function destroyCavePortal(state: GameState, x: number): void {
  if (!isCavePortal(x)) return;

  // Kill all greed on the island
  for (const greed of state.greeds) {
    greed.hp = 0;
  }

  // Remove from tracking
  cavePortalPositions.delete(x);
  portalTypes.delete(x);

  // Destroy the portal structure
  state.structures.delete(x);
  const idx = state.portalPositions.indexOf(x);
  if (idx !== -1) {
    state.portalPositions.splice(idx, 1);
  }

  destroyedPortalPositions.add(x);
  portalDifficulty.delete(x);

  // Gem reward: 4-8 gems
  const gemReward = 4 + Math.floor(Math.random() * 5);
  state.gems = Math.min(state.gemCapacity, state.gems + gemReward);

  state.messages.push(`Cave portal destroyed! All greed vanquished! +${gemReward} gems.`);

  // Victory check
  if (state.islandIndex >= FINAL_ISLAND && getActivePortals(state).length === 0) {
    state.phase = GamePhase.Victory;
    state.messages.push('All portals destroyed! The kingdom is saved!');
  }
}

// ─── Teleporter System ──────────────────────────────────────────────

/** Days after portal destruction before teleporter activates */
const TELEPORTER_ACTIVATION_DAYS = 3;
/** Cost to use a teleporter */
const TELEPORTER_USE_COST = 2;

/** Track teleporter status: destroyed portal x -> { dayDestroyed, ready } */
interface TeleporterData {
  dayDestroyed: number;
  ready: boolean;
}
const teleporters: Map<number, TeleporterData> = new Map();

/**
 * Convert a destroyed portal position to a teleporter.
 * Called internally after portal destruction; activates after 3 days.
 */
export function convertToTeleporter(x: number, dayCount: number): void {
  if (!destroyedPortalPositions.has(x)) return;
  if (teleporters.has(x)) return;

  teleporters.set(x, {
    dayDestroyed: dayCount,
    ready: false,
  });
}

/**
 * Update teleporter readiness. Call once per day.
 * Teleporters become ready 3 days after portal destruction.
 */
export function updateTeleporters(dayCount: number): void {
  for (const [x, data] of teleporters) {
    if (!data.ready && dayCount - data.dayDestroyed >= TELEPORTER_ACTIVATION_DAYS) {
      data.ready = true;
    }
  }

  // Auto-convert any destroyed portals that don't have teleporters yet
  for (const x of destroyedPortalPositions) {
    if (!teleporters.has(x)) {
      teleporters.set(x, {
        dayDestroyed: dayCount,
        ready: false,
      });
    }
  }
}

/** Get all available (ready) teleporter positions */
export function getAvailableTeleporters(): number[] {
  const result: number[] = [];
  for (const [x, data] of teleporters) {
    if (data.ready) result.push(x);
  }
  return result;
}

/** Check if a position has a ready teleporter */
export function isTeleporterReady(x: number): boolean {
  const data = teleporters.get(x);
  return data?.ready ?? false;
}

/**
 * Use a teleporter to move the monarch to another teleporter.
 * Costs 2 coins. Returns the destination x, or -1 if failed.
 */
export function useTeleporter(
  state: GameState,
  fromX: number,
  toX: number,
): number {
  if (!isTeleporterReady(fromX)) return -1;
  if (!isTeleporterReady(toX)) return -1;
  if (fromX === toX) return -1;
  if (state.monarchCoins < TELEPORTER_USE_COST) return -1;

  state.monarchCoins -= TELEPORTER_USE_COST;

  // Move monarch to destination
  setPosition(state.world, state.monarch.eid, toX, GROUND_Y);
  state.messages.push(`Teleported to x=${toX}!`);

  return toX;
}
