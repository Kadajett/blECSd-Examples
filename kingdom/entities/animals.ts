/**
 * Animal entities - rabbits, deer, and boars that spawn in forest areas.
 * Archers hunt them during the day for coin rewards.
 * Animals flee from nearby entities and respawn over time.
 *
 * Seasonal effects:
 * - Spring/Summer: normal spawning
 * - Autumn: 1.5x respawn interval (reduced spawn rate)
 * - Winter: no rabbits or deer spawn at all. Instead, 1 boar spawns.
 *   Boar: 30 coins reward, 5 HP, slow, aggressive (charges nearby entities).
 *
 * Animal data is stored in module-level state since GameState
 * doesn't have an animals field (types.ts is shared/locked).
 */
import { addEntity, removeEntity, getPosition, setPosition, setVelocity } from 'blecsd';
import type { Entity } from 'blecsd';
import {
  type GameState,
  Season,
  GROUND_Y,
  MAP_WIDTH,
  TimeOfDay,
  clamp,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';
import { getBiome, Biome } from '../world/terrain';
import { isStagMounted } from './mount';

// ─── Animal Constants ─────────────────────────────────────────────
const MAX_ANIMALS = 12;
const MAX_BOARS = 1;
const RESPAWN_INTERVAL = 12; // seconds between spawns
const FLEE_RANGE = 8;        // tiles: animals flee if entity is closer
const RABBIT_SPEED = 10;
const DEER_SPEED = 4;
const BOAR_SPEED = 3;
const BOAR_CHARGE_SPEED = 6;
const RABBIT_REWARD = 1;
const DEER_REWARD = 3;
const BOAR_REWARD = 30;
const BOAR_CHARGE_RANGE = 10;

// Forest zones derived from terrain biome layout
const FOREST_ZONES: ReadonlyArray<{ min: number; max: number }> = [
  { min: 10, max: 60 },
  { min: 180, max: 260 },
  { min: 520, max: 570 },
  { min: 830, max: 940 },
  { min: 1140, max: 1190 },
];

export type AnimalType = 'rabbit' | 'deer' | 'boar';

export interface AnimalData {
  eid: Entity;
  type: AnimalType;
  x: number;
  y: number;
  vx: number;
  hp: number;
  reward: number;
  fleeing: boolean;
}

// ─── Rabbit Den ──────────────────────────────────────────────────
const DEN_SPAWN_INTERVAL = 45; // seconds per rabbit
const DEN_MAX_RABBITS = 2;
const STAG_ATTRACT_RANGE = 20;
const STAG_ATTRACT_SPEED = 1.5; // slow approach

export interface RabbitDen {
  x: number;
  rabbitsAlive: number;
  spawnTimer: number;
}

// Fixed den positions in forest zones
const DEN_POSITIONS = [35, 220, 545, 870, 1160];

// ─── Module State ─────────────────────────────────────────────────
const animals: AnimalData[] = [];
let respawnTimer = 0;
const rabbitDens: RabbitDen[] = [];
let densInitialized = false;

/** Get current animal list (read-only view for other modules). */
export function getAnimals(): readonly AnimalData[] {
  return animals;
}

/** Spawn a single animal at the given x position. */
export function spawnAnimal(state: GameState, x: number, type?: AnimalType): AnimalData {
  const animalType = type ?? (Math.random() < 0.6 ? 'rabbit' : 'deer');
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  let hp = 1;
  let reward = animalType === 'rabbit' ? RABBIT_REWARD : DEER_REWARD;
  if (animalType === 'boar') {
    hp = 5;
    reward = BOAR_REWARD;
  }

  const animal: AnimalData = {
    eid,
    type: animalType,
    x,
    y: GROUND_Y - 1,
    vx: 0,
    hp,
    reward,
    fleeing: false,
  };

  animals.push(animal);
  return animal;
}

/**
 * Kill an animal by index. Awards coins and removes the entity.
 * Returns true if the animal was successfully killed.
 */
export function killAnimal(state: GameState, index: number): boolean {
  if (index < 0 || index >= animals.length) return false;
  const animal = animals[index];
  collectCoins(state, animal.reward);
  notifyDenOfDeath(animal.eid);
  removeEntity(state.world, animal.eid);
  animals.splice(index, 1);

  state.messages.push(`Hunted a ${animal.type} (+${animal.reward} coins)`);
  return true;
}

/** Main update: flee behavior, movement, respawn timer. */
export function updateAnimals(state: GameState, dt: number): void {
  // Only active during day/dawn
  if (state.timeOfDay === TimeOfDay.Night) {
    // Animals hide at night, stop moving (except boars which are aggressive)
    for (const animal of animals) {
      if (animal.type !== 'boar') {
        animal.vx = 0;
      }
    }
    return;
  }

  // Update each animal
  for (const animal of animals) {
    if (animal.type === 'boar') {
      updateBoarBehavior(state, animal, dt);
    } else {
      updateAnimalFlee(state, animal);
    }
    updateAnimalMovement(state, animal, dt);
  }

  // Seasonal respawn logic
  const effectiveInterval = getSeasonalRespawnInterval(state);

  if (state.season === Season.Winter) {
    // Winter: no rabbits/deer, only boars
    respawnTimer += dt;
    const boarCount = animals.filter(a => a.type === 'boar').length;
    if (respawnTimer >= effectiveInterval && boarCount < MAX_BOARS) {
      respawnTimer -= effectiveInterval;
      spawnRandomBoar(state);
    }
  } else {
    // Normal seasons: spawn rabbits and deer
    respawnTimer += dt;
    const normalCount = animals.filter(a => a.type !== 'boar').length;
    if (respawnTimer >= effectiveInterval && normalCount < MAX_ANIMALS) {
      respawnTimer -= effectiveInterval;
      spawnRandomAnimal(state);
    }
  }
}

function getSeasonalRespawnInterval(state: GameState): number {
  switch (state.season) {
    case Season.Autumn:
      return RESPAWN_INTERVAL * 1.5;
    case Season.Winter:
      return RESPAWN_INTERVAL * 2; // boar spawn rate
    default:
      return RESPAWN_INTERVAL;
  }
}

/** Boar: aggressive, charges at nearby entities. */
function updateBoarBehavior(
  state: GameState,
  animal: AnimalData,
  _dt: number,
): void {
  // Find nearest target (monarch or units)
  let closestX: number | undefined;
  let closestDist = Infinity;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (monarchPos) {
    const d = distance(animal.x, monarchPos.x);
    if (d < BOAR_CHARGE_RANGE && d < closestDist) {
      closestDist = d;
      closestX = monarchPos.x;
    }
  }

  for (const unit of state.units) {
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const d = distance(animal.x, pos.x);
    if (d < BOAR_CHARGE_RANGE && d < closestDist) {
      closestDist = d;
      closestX = pos.x;
    }
  }

  if (closestX !== undefined) {
    // Charge toward target
    animal.fleeing = false;
    const dir = closestX > animal.x ? 1 : -1;
    animal.vx = dir * BOAR_CHARGE_SPEED;
  } else {
    // Wander slowly
    animal.fleeing = false;
    if (Math.random() < 0.01) {
      animal.vx = (Math.random() - 0.5) * 2 * BOAR_SPEED;
    }
    animal.vx *= 0.95;
    if (Math.abs(animal.vx) < 0.1) animal.vx = 0;
  }
}

function spawnRandomBoar(state: GameState): void {
  const zone = FOREST_ZONES[Math.floor(Math.random() * FOREST_ZONES.length)];
  const x = zone.min + Math.random() * (zone.max - zone.min);
  spawnAnimal(state, x, 'boar');
  state.messages.push('A wild boar appears in the forest!');
}

function updateAnimalFlee(state: GameState, animal: AnimalData): void {
  // Stag mount: deer are attracted instead of fleeing
  if (animal.type === 'deer' && isStagMounted(state)) {
    const monarchPos = getPosition(state.world, state.monarch.eid);
    if (monarchPos) {
      const d = distance(animal.x, monarchPos.x);
      if (d < STAG_ATTRACT_RANGE && d > 2) {
        // Slowly approach the stag-mounted monarch
        animal.fleeing = false;
        const dir = monarchPos.x > animal.x ? 1 : -1;
        animal.vx = dir * STAG_ATTRACT_SPEED;
        return;
      }
      if (d <= 2) {
        // Close enough, just idle near monarch
        animal.fleeing = false;
        animal.vx *= 0.9;
        if (Math.abs(animal.vx) < 0.1) animal.vx = 0;
        return;
      }
    }
  }

  // Check for nearby entities (units + monarch) and flee from them
  let closestThreatX: number | undefined;
  let closestThreatDist = Infinity;

  // Check monarch
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (monarchPos) {
    const d = distance(animal.x, monarchPos.x);
    if (d < FLEE_RANGE && d < closestThreatDist) {
      closestThreatDist = d;
      closestThreatX = monarchPos.x;
    }
  }

  // Check all units
  for (const unit of state.units) {
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    const d = distance(animal.x, pos.x);
    if (d < FLEE_RANGE && d < closestThreatDist) {
      closestThreatDist = d;
      closestThreatX = pos.x;
    }
  }

  if (closestThreatX !== undefined) {
    // Flee away from threat (boars don't flee, they charge via updateBoarBehavior)
    if (animal.type === 'boar') return;
    animal.fleeing = true;
    const fleeDir = animal.x > closestThreatX ? 1 : -1;
    const speed = animal.type === 'rabbit' ? RABBIT_SPEED : DEER_SPEED;
    animal.vx = fleeDir * speed;
  } else {
    animal.fleeing = false;
    // Gentle random wandering
    if (Math.random() < 0.01) {
      const speed = animal.type === 'rabbit' ? RABBIT_SPEED * 0.3 : DEER_SPEED * 0.3;
      animal.vx = (Math.random() - 0.5) * 2 * speed;
    }
    // Slow down over time
    animal.vx *= 0.95;
    if (Math.abs(animal.vx) < 0.1) animal.vx = 0;
  }
}

function updateAnimalMovement(state: GameState, animal: AnimalData, dt: number): void {
  animal.x = clamp(animal.x + animal.vx * dt, 1, MAP_WIDTH - 2);

  // Keep animals in forest areas using biome check
  const inForest = getBiome(animal.x) === Biome.DenseForest;

  if (!inForest && !animal.fleeing) {
    // Drift back toward nearest forest zone
    let nearestCenter = FOREST_ZONES[0].min;
    let nearestDist = Infinity;
    for (const zone of FOREST_ZONES) {
      const center = (zone.min + zone.max) / 2;
      const d = distance(animal.x, center);
      if (d < nearestDist) {
        nearestDist = d;
        nearestCenter = center;
      }
    }
    const dir = nearestCenter > animal.x ? 1 : -1;
    animal.vx += dir * 0.5;
  }

  // Update ECS position
  setPosition(state.world, animal.eid, animal.x, animal.y);
}

function spawnRandomAnimal(state: GameState): void {
  const zone = FOREST_ZONES[Math.floor(Math.random() * FOREST_ZONES.length)];
  const x = zone.min + Math.random() * (zone.max - zone.min);
  spawnAnimal(state, x);
}

// ─── Rabbit Den System ───────────────────────────────────────────

/** Initialize dens once at game start. */
function initializeDens(): void {
  if (densInitialized) return;
  densInitialized = true;
  rabbitDens.length = 0;
  for (const x of DEN_POSITIONS) {
    rabbitDens.push({ x, rabbitsAlive: 0, spawnTimer: 0 });
  }
}

/** Get rabbit dens (read-only). */
export function getRabbitDens(): readonly RabbitDen[] {
  return rabbitDens;
}

/**
 * Update rabbit den spawning.
 * Each den spawns 1 rabbit every 45s, max 2 alive per den.
 * Winter: no den spawning.
 */
export function updateDenSpawning(state: GameState, dt: number): void {
  initializeDens();

  // No rabbit dens active in winter
  if (state.season === Season.Winter) return;
  if (state.timeOfDay === TimeOfDay.Night) return;

  for (const den of rabbitDens) {
    if (den.rabbitsAlive >= DEN_MAX_RABBITS) continue;

    den.spawnTimer += dt;
    if (den.spawnTimer >= DEN_SPAWN_INTERVAL) {
      den.spawnTimer -= DEN_SPAWN_INTERVAL;
      const rabbit = spawnAnimal(state, den.x, 'rabbit');
      den.rabbitsAlive++;
      // Tag this rabbit so we can decrement on death
      denRabbitMap.set(rabbit.eid, den);
    }
  }
}

/** Track which den a rabbit belongs to. */
const denRabbitMap = new Map<Entity, RabbitDen>();

/** Notify den when a rabbit dies (called from killAnimal). */
function notifyDenOfDeath(eid: Entity): void {
  const den = denRabbitMap.get(eid);
  if (den) {
    den.rabbitsAlive = Math.max(0, den.rabbitsAlive - 1);
    denRabbitMap.delete(eid);
  }
}
