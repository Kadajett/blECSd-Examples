/**
 * Vagrant / villager entity with NPC subtypes.
 *
 * NPC Types and their spawn locations:
 * - Standard vagrant: near camp, becomes any role via tool stands
 * - Warrior (red): outer settlements, becomes knight directly (3 coins)
 * - Scout (green): near forests, becomes archer with +3 range (2 coins)
 * - Craftsman (blue): central settlements, becomes builder 1.5x faster (2 coins)
 * - Peasant (yellow): everywhere, becomes farmer +50% output (1 coin)
 */
import { addEntity, setPosition, getPosition, setVelocity } from 'blecsd';
import {
  type GameState,
  type UnitData,
  UnitRole,
  AIState,
  StructureType,
  GROUND_Y,
  VILLAGER_SPEED,
  CAMP_CENTER_X,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';

// ─── NPC Origin System ──────────────────────────────────────────────

export enum NpcOrigin {
  Standard = 'standard',
  Warrior = 'warrior',
  Scout = 'scout',
  Craftsman = 'craftsman',
  Peasant = 'peasant',
}

// Track NPC origin per entity (while still a vagrant)
const npcOrigins = new Map<number, NpcOrigin>();

// Track recruited bonuses (persists after recruitment for archer/builder/farmer bonuses)
const recruitBonuses = new Map<number, NpcOrigin>();

export function getNpcOrigin(eid: number): NpcOrigin {
  return npcOrigins.get(eid) ?? NpcOrigin.Standard;
}

/** Get the bonus origin for a recruited unit (for archer/builder/farmer bonuses). */
export function getRecruitBonus(eid: number): NpcOrigin {
  return recruitBonuses.get(eid) ?? NpcOrigin.Standard;
}

/** Called when a unit is recruited: transfers origin to bonus map. */
export function markRecruited(eid: number): void {
  const origin = npcOrigins.get(eid);
  if (origin && origin !== NpcOrigin.Standard) {
    recruitBonuses.set(eid, origin);
  }
  npcOrigins.delete(eid);
}

// ─── Vagrant Camp System ──────────────────────────────────────────

export interface VagrantCamp {
  x: number;
  vagrantsAlive: number;
  spawnTimer: number;
}

const CAMP_SPAWN_INTERVAL = 120; // 2 minutes per vagrant per camp
const MAX_VAGRANTS_PER_CAMP = 3;
const MAX_TOTAL_VAGRANTS = 15;
const VAGRANT_CAMP_WANDER_RADIUS = 10;
const GREED_CROUCH_RANGE = 10;
const CROUCH_RECOVERY_TIME = 3; // seconds after greed passes

// Fixed camp positions in forest areas (per island, same for all)
const CAMP_POSITIONS = [45, 190, 540, 880, 1150];

const vagrantCamps: VagrantCamp[] = [];
let campsInitialized = false;

// Track crouch state per vagrant
const crouchTimers = new Map<number, number>(); // eid -> recovery timer

function initializeCamps(): void {
  if (campsInitialized) return;
  campsInitialized = true;
  vagrantCamps.length = 0;
  for (const x of CAMP_POSITIONS) {
    vagrantCamps.push({ x, vagrantsAlive: 0, spawnTimer: 0 });
  }
}

/** Get vagrant camps (read-only). */
export function getVagrantCamps(): readonly VagrantCamp[] {
  initializeCamps();
  return vagrantCamps;
}

/** Update camp-based vagrant spawning. */
export function updateVagrantSpawning(state: GameState, dt: number): void {
  initializeCamps();

  const totalVagrants = countVagrants(state);
  if (totalVagrants >= MAX_TOTAL_VAGRANTS) return;

  for (const camp of vagrantCamps) {
    if (camp.vagrantsAlive >= MAX_VAGRANTS_PER_CAMP) continue;

    camp.spawnTimer += dt;
    if (camp.spawnTimer >= CAMP_SPAWN_INTERVAL) {
      camp.spawnTimer -= CAMP_SPAWN_INTERVAL;
      if (totalVagrants + camp.vagrantsAlive < MAX_TOTAL_VAGRANTS) {
        const offset = (Math.random() - 0.5) * 6;
        spawnVagrant(state, camp.x + offset, NpcOrigin.Standard);
        camp.vagrantsAlive++;
      }
    }
  }
}

/** Check if a vagrant should crouch (greed nearby). Returns true if crouching. */
export function isVagrantCrouching(eid: number): boolean {
  return crouchTimers.has(eid);
}

// ─── Spawn Configuration ────────────────────────────────────────────

const MAX_VAGRANTS = 8;
const VAGRANT_SPAWN_INTERVAL = 45;
const VAGRANT_WALK_SPEED = 2;
const CAMPFIRE_WANDER_RADIUS = 6;

// Settlement zones
const OUTER_LEFT_SETTLEMENT = 40;
const OUTER_RIGHT_SETTLEMENT = MAP_WIDTH - 40;
const FOREST_LEFT_ZONE = 70;
const FOREST_RIGHT_ZONE = MAP_WIDTH - 70;
const CENTRAL_LEFT_SETTLEMENT = CAMP_CENTER_X - 30;
const CENTRAL_RIGHT_SETTLEMENT = CAMP_CENTER_X + 30;

let vagrantSpawnTimer = 0;

// Spawn rotation: cycle through NPC types
const SPAWN_ROTATION: NpcOrigin[] = [
  NpcOrigin.Standard,
  NpcOrigin.Peasant,
  NpcOrigin.Standard,
  NpcOrigin.Scout,
  NpcOrigin.Standard,
  NpcOrigin.Craftsman,
  NpcOrigin.Standard,
  NpcOrigin.Warrior,
];
let spawnRotationIndex = 0;

export function spawnVagrant(
  state: GameState,
  x: number,
  origin: NpcOrigin = NpcOrigin.Standard,
): UnitData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  if (origin !== NpcOrigin.Standard) {
    npcOrigins.set(eid, origin);
  }

  const unit: UnitData = {
    eid,
    role: UnitRole.Vagrant,
    aiState: AIState.MovingTo,
    targetX: getTargetForOrigin(origin, x),
    hp: 1,
    maxHp: 1,
    attackCooldown: 0,
    coins: 0,
  };

  state.units.push(unit);
  return unit;
}

function getTargetForOrigin(origin: NpcOrigin, spawnX: number): number {
  const onLeft = spawnX < CAMP_CENTER_X;
  switch (origin) {
    case NpcOrigin.Warrior:
      return onLeft ? OUTER_LEFT_SETTLEMENT : OUTER_RIGHT_SETTLEMENT;
    case NpcOrigin.Scout:
      return onLeft ? FOREST_LEFT_ZONE : FOREST_RIGHT_ZONE;
    case NpcOrigin.Craftsman:
      return onLeft ? CENTRAL_LEFT_SETTLEMENT : CENTRAL_RIGHT_SETTLEMENT;
    case NpcOrigin.Peasant:
    case NpcOrigin.Standard:
    default:
      return CAMP_CENTER_X;
  }
}

function getSpawnX(origin: NpcOrigin): number {
  switch (origin) {
    case NpcOrigin.Warrior: {
      const fromLeft = Math.random() < 0.5;
      return fromLeft
        ? 5 + Math.random() * 10
        : MAP_WIDTH - 15 + Math.random() * 10;
    }
    case NpcOrigin.Scout: {
      const fromLeft = Math.random() < 0.5;
      return fromLeft
        ? 50 + Math.random() * 20
        : MAP_WIDTH - 70 + Math.random() * 20;
    }
    case NpcOrigin.Craftsman:
      return CAMP_CENTER_X + (Math.random() - 0.5) * 40;
    case NpcOrigin.Peasant: {
      const fromLeft = Math.random() < 0.5;
      return fromLeft
        ? 20 + Math.random() * 30
        : MAP_WIDTH - 50 + Math.random() * 30;
    }
    default: {
      const fromLeft = Math.random() < 0.5;
      return fromLeft
        ? 5 + Math.random() * 20
        : MAP_WIDTH - 25 + Math.random() * 20;
    }
  }
}

/** Tick the vagrant spawn timer. Spawns new vagrants from various locations. */
export function tickVagrantSpawns(state: GameState, dt: number): void {
  vagrantSpawnTimer += dt;
  if (vagrantSpawnTimer < VAGRANT_SPAWN_INTERVAL) return;
  vagrantSpawnTimer -= VAGRANT_SPAWN_INTERVAL;

  const vagrantCount = countVagrants(state);
  if (vagrantCount >= MAX_VAGRANTS) return;

  const origin = SPAWN_ROTATION[spawnRotationIndex % SPAWN_ROTATION.length];
  spawnRotationIndex++;

  const x = getSpawnX(origin);
  spawnVagrant(state, x, origin);

  const label = origin === NpcOrigin.Standard ? 'vagrant' : origin;
  state.messages.push(`A ${label} wanders in from the wilderness`);
}

export function updateVagrant(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  // Check for nearby greed: crouch and freeze
  const nearGreed = hasGreedNearby(state, pos.x, GREED_CROUCH_RANGE);
  if (nearGreed) {
    crouchTimers.set(unit.eid, CROUCH_RECOVERY_TIME);
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  // Crouch recovery timer
  const crouchTimer = crouchTimers.get(unit.eid);
  if (crouchTimer !== undefined) {
    const remaining = crouchTimer - dt;
    if (remaining > 0) {
      crouchTimers.set(unit.eid, remaining);
      setVelocity(state.world, unit.eid, 0, 0);
      return;
    }
    crouchTimers.delete(unit.eid);
  }

  const origin = getNpcOrigin(unit.eid);
  const homeX = getWanderTarget(state, origin, pos.x);
  const wanderRadius = origin === NpcOrigin.Standard ? CAMPFIRE_WANDER_RADIUS : 8;
  const nearHome = distance(pos.x, homeX) < wanderRadius;

  if (unit.aiState === AIState.Idle) {
    if (nearHome) {
      if (Math.random() < 0.015) {
        unit.aiState = AIState.MovingTo;
        const offset = (Math.random() - 0.5) * 2 * wanderRadius;
        unit.targetX = clamp(homeX + offset, 0, MAP_WIDTH - 1);
      }
      setVelocity(state.world, unit.eid, 0, 0);
    } else {
      unit.aiState = AIState.MovingTo;
      unit.targetX = homeX;
    }
    return;
  }

  if (unit.aiState === AIState.MovingTo) {
    const dx = unit.targetX - pos.x;
    const absDx = Math.abs(dx);

    if (absDx < 0.5) {
      unit.aiState = AIState.Idle;
      setVelocity(state.world, unit.eid, 0, 0);
      return;
    }

    const speed = nearHome ? VILLAGER_SPEED : VAGRANT_WALK_SPEED;
    const dir = dx > 0 ? 1 : -1;
    const vx = dir * speed;
    setVelocity(state.world, unit.eid, vx, 0);
  }
}

function hasGreedNearby(state: GameState, x: number, range: number): boolean {
  for (const greed of state.greeds) {
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (distance(x, pos.x) <= range) return true;
  }
  return false;
}

function getWanderTarget(state: GameState, origin: NpcOrigin, currentX: number): number {
  switch (origin) {
    case NpcOrigin.Warrior:
      return currentX < CAMP_CENTER_X ? OUTER_LEFT_SETTLEMENT : OUTER_RIGHT_SETTLEMENT;
    case NpcOrigin.Scout:
      return currentX < CAMP_CENTER_X ? FOREST_LEFT_ZONE : FOREST_RIGHT_ZONE;
    case NpcOrigin.Craftsman:
      return currentX < CAMP_CENTER_X ? CENTRAL_LEFT_SETTLEMENT : CENTRAL_RIGHT_SETTLEMENT;
    case NpcOrigin.Peasant:
    case NpcOrigin.Standard:
    default:
      return findCampfireX(state);
  }
}

export function recruitVagrant(state: GameState, unit: UnitData, newRole: UnitRole): void {
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
    default:
      break;
  }
}

function countVagrants(state: GameState): number {
  let count = 0;
  for (const unit of state.units) {
    if (unit.role === UnitRole.Vagrant) count++;
  }
  return count;
}

function findCampfireX(state: GameState): number {
  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Campfire) return struct.x;
  }
  return CAMP_CENTER_X;
}
