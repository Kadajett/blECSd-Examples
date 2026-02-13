/**
 * Spawn system: spawns greed waves from portals during night,
 * and roaming bands during the day.
 *
 * Final wave difficulty formula (Phase 9):
 *   baseWaveSize = floor(dayCount / 3) + 3
 *   islandMultiplier = [1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 5.0, 2.5]
 *   seasonMultiplier = { Spring: 1.0, Summer: 0.85, Autumn: 1.15, Winter: 1.35 }
 *   bloodMoonMultiplier = isBloodMoon ? 3.0 : 1.0
 *   finalWaveSize = floor(base * island * season * bloodMoon)
 *
 * Wave composition (normalized ratios):
 *   greedlingRatio = max(0.3, 1.0 - dayCount * 0.01)
 *   maskedRatio = min(0.3, dayCount * 0.005)
 *   floaterRatio = dayCount > 15 ? min(0.15, (dayCount - 15) * 0.003) : 0
 *   breederRatio = dayCount > 20 ? min(0.1, (dayCount - 20) * 0.002) : 0
 *   crownStealerRatio = dayCount > 30 ? min(0.05, (dayCount - 30) * 0.001) : 0
 *
 * Multi-portal spawning: split proportionally, weighted by inverse distance.
 * Spawn timing: staggered so furthest portal spawns first.
 *
 * Challenge island support: Skull Island edge-spawning, Plague Crawlers on island 8.
 */

import {
  type GameState,
  GreedType,
  Season,
  TimeOfDay,
  GamePhase,
  CAMP_CENTER_X,
  MAP_WIDTH,
} from '../types';
import {
  getActivePortals,
  isRetaliationPending,
  clearRetaliation,
  getPortalDifficulty,
  incrementPortalDifficulty,
  getPortalSpawnMultiplier,
  isChallengeIsland,
  getChallengeRules,
} from '../structures/portal';
import { spawnGreed, triggerSunriseFlee } from '../entities/greed';

const BLOOD_MOON_INTERVAL = 7;
const BLOOD_MOON_MULTIPLIER = 3;
const RETALIATION_MULTIPLIER = 3;
const SPAWN_DELAY = 2.0;

/** Roaming band constants */
const ROAM_SPAWN_INTERVAL = 30; // seconds between roaming band spawns
const ROAM_GROUP_MIN = 2;
const ROAM_GROUP_MAX = 3;
const ROAM_HP_SCALE = 0.5; // roaming greeds are weaker

/** Seasonal constants */
const SEASON_DAYS = 16;
const SEASON_CYCLE = 64;

/** Island wave multipliers (8 islands: 0-5 main + 6-8 challenge) */
const ISLAND_MULTIPLIERS = [1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 5.0, 2.5];

/** Season wave size multipliers (Phase 9 final values) */
const SEASON_WAVE_MULTIPLIERS: Record<number, number> = {
  [Season.Spring]: 1.0,
  [Season.Summer]: 0.85,
  [Season.Autumn]: 1.15,
  [Season.Winter]: 1.35,
};

/** Per-portal spawn queue: list of greed types still to spawn */
const spawnQueues: Map<number, GreedType[]> = new Map();

/** Per-portal countdown until next spawn */
const spawnTimers: Map<number, number> = new Map();

/** Tracks whether wave queues have been initialized for the current night */
let nightInitialized = false;

/** Whether portal difficulty was incremented this night */
let difficultyIncrementedThisNight = false;

/** Wave preview tracking */
let wavePreviewShown = false;
let lastDayCount = -1;

/** Roaming band timer */
let roamTimer = ROAM_SPAWN_INTERVAL;

/** Track if sunrise flee has been triggered this day */
let sunriseFleeDone = false;

/** Compute the season from dayCount (fallback if state.season not set) */
function computeSeason(dayCount: number): Season {
  const dayInCycle = dayCount % SEASON_CYCLE;
  const seasonIndex = Math.floor(dayInCycle / SEASON_DAYS);
  switch (seasonIndex) {
    case 0: return Season.Spring;
    case 1: return Season.Summer;
    case 2: return Season.Autumn;
    case 3: return Season.Winter;
    default: return Season.Spring;
  }
}

/** Check if a given day is a seasonal blood moon (2 days before season change) */
function isSeasonalBloodMoon(dayCount: number): boolean {
  if (dayCount <= 0) return false;
  const dayInCycle = dayCount % SEASON_CYCLE;
  const dayInSeason = dayInCycle % SEASON_DAYS;
  return dayInSeason === SEASON_DAYS - 2;
}

/** Get the seasonal wave size multiplier */
function getSeasonMultiplier(state: GameState): number {
  const season = state.season ?? computeSeason(state.dayCount);
  return SEASON_WAVE_MULTIPLIERS[season] ?? 1.0;
}

/** Get the island wave size multiplier */
function getIslandMultiplier(islandIndex: number): number {
  if (islandIndex < 0) return 1.0;
  if (islandIndex >= ISLAND_MULTIPLIERS.length) return ISLAND_MULTIPLIERS[ISLAND_MULTIPLIERS.length - 1];
  return ISLAND_MULTIPLIERS[islandIndex];
}

/** Check if a given day is a blood moon (seasonal timing + every-7-days fallback) */
export function isBloodMoon(dayCount: number): boolean {
  if (dayCount <= 0) return false;
  if (isSeasonalBloodMoon(dayCount)) return true;
  return dayCount % BLOOD_MOON_INTERVAL === 0;
}

/**
 * Calculate wave size for a specific portal using the proper formula:
 * base = floor(dayCount / 3) + 2
 * Apply portal difficulty, island multiplier, season multiplier, blood moon, cave multiplier.
 */
function getPortalWaveSize(state: GameState, portalX: number): number {
  const base = Math.floor(state.dayCount / 3) + 3;
  const portalDiff = getPortalDifficulty(portalX);
  const islandMult = getIslandMultiplier(state.islandIndex);
  const seasonMult = getSeasonMultiplier(state);
  const bloodMoonMult = state.isBloodMoon ? BLOOD_MOON_MULTIPLIER : 1;
  const caveMult = getPortalSpawnMultiplier(portalX, state.isBloodMoon);

  return Math.floor(base * portalDiff * islandMult * seasonMult * bloodMoonMult * caveMult);
}

interface WaveComposition {
  basicPct: number;
  maskedPct: number;
  floaterPct: number;
  breederPct: number;
  crownStealerPct: number;
}

/**
 * Determine wave type ratios based on day count (Phase 9 final formula).
 * Ratios are normalized to sum to 1.0.
 * Challenge islands can override (allTypesFromNight1 = all types at once).
 */
function getWaveComposition(dayCount: number, _bloodMoon: boolean, islandIndex?: number): WaveComposition {
  const challenge = islandIndex !== undefined ? getChallengeRules(islandIndex) : null;
  const effectiveDay = challenge?.allTypesFromNight1 ? Math.max(dayCount, 40) : dayCount;

  // Calculate raw ratios per Phase 9 formula
  const greedling = Math.max(0.3, 1.0 - effectiveDay * 0.01);
  const masked = Math.min(0.3, effectiveDay * 0.005);
  const floater = effectiveDay > 15 ? Math.min(0.15, (effectiveDay - 15) * 0.003) : 0;
  const breeder = effectiveDay > 20 ? Math.min(0.1, (effectiveDay - 20) * 0.002) : 0;
  const crownStealer = effectiveDay > 30 ? Math.min(0.05, (effectiveDay - 30) * 0.001) : 0;

  // Normalize to sum to 1.0
  const total = greedling + masked + floater + breeder + crownStealer;
  const scale = total > 0 ? 1.0 / total : 1.0;

  return {
    basicPct: greedling * scale,
    maskedPct: masked * scale,
    floaterPct: floater * scale,
    breederPct: breeder * scale,
    crownStealerPct: crownStealer * scale,
  };
}

/** Build a spawn queue using day-based composition. */
function buildSpawnQueue(waveSize: number, dayCount: number, islandIndex?: number): GreedType[] {
  const bloodMoon = isBloodMoon(dayCount);
  const comp = getWaveComposition(dayCount, bloodMoon, islandIndex);
  const challenge = islandIndex !== undefined ? getChallengeRules(islandIndex) : null;
  const plagueCrawlerChance = challenge?.hasPlagueCrawlers ? 0.15 : 0;

  const queue: GreedType[] = [];
  for (let i = 0; i < waveSize; i++) {
    const roll = Math.random();

    // Plague crawler substitution on challenge island 8
    if (plagueCrawlerChance > 0 && roll < plagueCrawlerChance) {
      queue.push(GreedType.PlagueCrawler);
      continue;
    }

    // Adjusted roll excluding plague crawler chance
    const adjRoll = plagueCrawlerChance > 0
      ? (roll - plagueCrawlerChance) / (1 - plagueCrawlerChance)
      : roll;
    let cumulative = 0;

    cumulative += comp.crownStealerPct;
    if (adjRoll < cumulative) { queue.push(GreedType.CrownStealer); continue; }

    cumulative += comp.breederPct;
    if (adjRoll < cumulative) { queue.push(GreedType.Breeder); continue; }

    cumulative += comp.floaterPct;
    if (adjRoll < cumulative) { queue.push(GreedType.Floater); continue; }

    cumulative += comp.maskedPct;
    if (adjRoll < cumulative) { queue.push(GreedType.Masked); continue; }

    queue.push(GreedType.Basic);
  }

  // Shuffle
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = queue[i];
    queue[i] = queue[j];
    queue[j] = tmp;
  }

  return queue;
}

/** Show wave preview message during dusk */
function showWavePreview(state: GameState): void {
  if (wavePreviewShown) return;

  const activePortals = getActivePortals(state);
  if (activePortals.length === 0) return;

  let totalGreeds = 0;
  for (const px of activePortals) {
    totalGreeds += getPortalWaveSize(state, px);
  }

  const bloodMoon = isBloodMoon(state.dayCount);
  const bloodMoonSuffix = bloodMoon ? ' (BLOOD MOON!)' : '';

  const season = state.season ?? computeSeason(state.dayCount);
  const seasonNames: Record<number, string> = {
    [Season.Spring]: 'Spring',
    [Season.Summer]: 'Summer',
    [Season.Autumn]: 'Autumn',
    [Season.Winter]: 'Winter',
  };
  const seasonName = seasonNames[season] ?? '';

  state.messages.push(
    `Wave ${state.dayCount} [${seasonName}] approaching: ~${totalGreeds} greeds from ${activePortals.length} portals${bloodMoonSuffix}`
  );
  wavePreviewShown = true;
}

/**
 * Calculate spawn delay offset so distant portals spawn earlier.
 * Greeds from further portals need more travel time to reach the kingdom by midnight.
 */
function getPortalSpawnOffset(portalX: number): number {
  const distToCenter = Math.abs(portalX - CAMP_CENTER_X);
  // ~3 tiles/sec base speed, so 200 tiles = ~67 seconds offset
  return distToCenter / 3;
}

/** Initialize spawn queues for all active portals at night start (independent per portal) */
function initializeNightWaves(state: GameState): void {
  const activePortals = getActivePortals(state);
  const challenge = getChallengeRules(state.islandIndex);

  // Increment per-portal difficulty once per night
  if (!difficultyIncrementedThisNight) {
    incrementPortalDifficulty(state);
    difficultyIncrementedThisNight = true;
  }

  // Skull Island (island 6): endless mode, spawn from map edges instead of portals
  if (challenge?.endless && activePortals.length === 0) {
    const edgePositions = [5, MAP_WIDTH - 5];
    const edgeWaveSize = Math.floor((state.dayCount / 3 + 3) * (challenge.difficultyMultiplier));

    for (const edgeX of edgePositions) {
      const queue = buildSpawnQueue(edgeWaveSize, state.dayCount, state.islandIndex);
      spawnQueues.set(edgeX, queue);
      spawnTimers.set(edgeX, SPAWN_DELAY);
    }

    nightInitialized = true;
    return;
  }

  // Calculate total inverse distance for proportional splitting
  let totalInvDist = 0;
  for (const px of activePortals) {
    totalInvDist += 1 / Math.max(1, Math.abs(px - CAMP_CENTER_X));
  }

  for (const portalX of activePortals) {
    // Proportional wave split: closer portals get slightly more
    const invDist = 1 / Math.max(1, Math.abs(portalX - CAMP_CENTER_X));
    const proportion = totalInvDist > 0 ? invDist / totalInvDist : 1 / activePortals.length;

    const totalWave = getPortalWaveSize(state, portalX);
    const waveSize = Math.max(1, Math.floor(totalWave * proportion * activePortals.length));
    const queue = buildSpawnQueue(waveSize, state.dayCount, state.islandIndex);
    spawnQueues.set(portalX, queue);

    // Further portals start spawning sooner (staggered arrival)
    const offset = getPortalSpawnOffset(portalX);
    const adjustedDelay = Math.max(0, SPAWN_DELAY - offset * 0.01);
    spawnTimers.set(portalX, adjustedDelay + Math.random() * SPAWN_DELAY * 0.5);
  }

  nightInitialized = true;
}

/** Add a retaliation wave to all remaining active portals */
function triggerRetaliationWave(state: GameState): void {
  const activePortals = getActivePortals(state);

  for (const portalX of activePortals) {
    const retaliationSize = Math.floor(getPortalWaveSize(state, portalX) * RETALIATION_MULTIPLIER);
    const existing = spawnQueues.get(portalX) ?? [];
    const extraQueue = buildSpawnQueue(retaliationSize, state.dayCount);
    spawnQueues.set(portalX, [...existing, ...extraQueue]);
  }

  state.messages.push('Retaliation wave incoming from all portals!');
  clearRetaliation();
}

/** Spawn roaming bands during the day: 2-3 weak basic greeds near active portals */
function updateRoamingBands(state: GameState, dt: number): void {
  if (state.timeOfDay !== TimeOfDay.Day) return;

  roamTimer -= dt;
  if (roamTimer > 0) return;
  roamTimer = ROAM_SPAWN_INTERVAL;

  const activePortals = getActivePortals(state);
  if (activePortals.length === 0) return;

  // Pick a random portal to spawn roamers from
  const portalX = activePortals[Math.floor(Math.random() * activePortals.length)];
  const groupSize = ROAM_GROUP_MIN + Math.floor(Math.random() * (ROAM_GROUP_MAX - ROAM_GROUP_MIN + 1));

  for (let i = 0; i < groupSize; i++) {
    const offset = (Math.random() - 0.5) * 6;
    const greed = spawnGreed(state, portalX + offset, GreedType.Basic);
    // Roaming greeds are weaker
    greed.hp *= ROAM_HP_SCALE;
  }
}

/** Process greed spawning for one frame */
export function updateSpawning(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  // Reset preview flag on new day
  if (state.dayCount !== lastDayCount) {
    wavePreviewShown = false;
    difficultyIncrementedThisNight = false;
    sunriseFleeDone = false;
    lastDayCount = state.dayCount;
  }

  // Trigger sunrise flee when transitioning to day
  if (state.timeOfDay === TimeOfDay.Day && !sunriseFleeDone) {
    triggerSunriseFlee(state);
    sunriseFleeDone = true;
  }

  // Check for retaliation regardless of time of day
  if (isRetaliationPending()) {
    triggerRetaliationWave(state);
  }

  // Roaming bands during the day
  updateRoamingBands(state, dt);

  // Show wave preview at dusk
  if (state.timeOfDay === TimeOfDay.Dusk) {
    showWavePreview(state);
  }

  if (state.timeOfDay !== TimeOfDay.Night) {
    if (nightInitialized) {
      // Track survived nights for challenge islands
      if (isChallengeIsland(state.islandIndex)) {
        state.challengeNightsSurvived += 1;
      }
      spawnQueues.clear();
      spawnTimers.clear();
      nightInitialized = false;
    }
    return;
  }

  // Hourglass freeze: skip spawning while active
  if (state.hourglassFreezeTimer > 0) {
    state.hourglassFreezeTimer -= dt;
    return;
  }

  if (!nightInitialized) {
    initializeNightWaves(state);
  }

  // Get all spawn sources (portals + edge positions for Skull Island)
  const spawnSources = [...spawnQueues.keys()];

  for (const sourceX of spawnSources) {
    const queue = spawnQueues.get(sourceX);
    if (!queue || queue.length === 0) continue;

    const timer = (spawnTimers.get(sourceX) ?? 0) - dt;
    if (timer > 0) {
      spawnTimers.set(sourceX, timer);
      continue;
    }

    const type = queue.shift()!;
    spawnGreed(state, sourceX, type);

    spawnTimers.set(sourceX, SPAWN_DELAY);
  }
}
