/**
 * Greed entity spawning and AI update logic.
 *
 * Greed types (Kingdom Two Crowns):
 *   Greedling (basic): 1 HP, flees at sunrise, steals tools on kill
 *   Masked: 3 HP, front mask absorbs first frontal hit, 2x wall damage
 *   Floater: 12 HP, ignores walls, abducts villagers, no flee
 *   Breeder: 70 HP, punch attack stuns nearby units, spawns 2 greedlings/6s, no flee
 *   Crown Stealer: 8 HP, 2.5x speed, bypasses walls, targets monarch only, no flee
 *
 * Greeds target the WEAKEST settlement (lowest defense rating).
 * Retreat: greeds carrying 3+ stolen coins flee back to spawn portal.
 * Island scaling: greed base hp increases by 0.5 per island.
 * Gates block greed just like walls.
 */

import { addEntity, setPosition, getPosition, Position } from 'blecsd';
import type { Entity } from 'blecsd';
import {
  type GameState,
  type GreedData,
  GreedType,
  TimeOfDay,
  GamePhase,
  GROUND_Y,
  GREED_SPEED_BASE,
  GREED_SPEED_FAST,
} from '../types';
import { isDefensiveStructure, getGreedWallDamage, getWallDamageReduction } from '../structures/wall';
import { getWeakestSettlement, getActivePortals } from '../structures/portal';

interface GreedStats {
  hp: number;
  speed: number;
  damage: number;
}

const GREED_STATS: Record<GreedType, GreedStats> = {
  [GreedType.Basic]:         { hp: 1,  speed: GREED_SPEED_BASE,       damage: 1 },
  [GreedType.Masked]:        { hp: 3,  speed: GREED_SPEED_BASE,       damage: 1 },
  [GreedType.Floater]:       { hp: 12, speed: GREED_SPEED_FAST,       damage: 1 },
  [GreedType.Breeder]:       { hp: 70, speed: 2,                      damage: 1 },
  [GreedType.CrownStealer]:  { hp: 8,  speed: GREED_SPEED_BASE * 2.5, damage: 1 },
  [GreedType.PlagueCrawler]: { hp: 4,  speed: GREED_SPEED_BASE,       damage: 1 },
};

const WALL_BREAK_PAUSE = 0.5;
const KNOCKBACK_DISTANCE = 1.0;
const GAP_SEARCH_RANGE = 20;
const FLEE_COIN_THRESHOLD = 3;

/** Floater constants */
const FLOATER_GRAB_TIME = 3.0;
const FLOATER_CARRY_SPEED_MULT = 0.5;

/** Breeder constants */
const BREEDER_PUNCH_INTERVAL = 4.0;
const BREEDER_PUNCH_RADIUS = 2;
const BREEDER_PUNCH_STUN = 1.5;
const BREEDER_SPAWN_INTERVAL = 6.0;
const BREEDER_SPAWN_COUNT = 2;
const BREEDER_MAX_CHILDREN = 20;

/** Crown stealer constants */
const CROWN_STEAL_FLEE_SPEED = GREED_SPEED_BASE * 3;

/** Plague crawler constants */
const PLAGUE_POISON_DPS = 1;
const PLAGUE_POISON_DURATION = 5;
const PLAGUE_POISON_RADIUS = 2;
const WALL_CLIMB_TIME = 2.0;

/** Sunrise flee constants */
const SUNRISE_DESPAWN_TIMEOUT = 5.0; // seconds in daylight before despawn if no portal
const SUNRISE_DESPAWN_NO_PORTAL = 10.0; // seconds if all portals destroyed

/** Per-greed pause timer (seconds remaining) */
const pauseTimers: Map<number, number> = new Map();

/** Track which wall x each greed is currently targeting */
const greedWallTargets: Map<number, number> = new Map();

/** Track which portal each greed spawned from (for retreat) */
const greedSpawnPortals: Map<number, number> = new Map();

/** Cached weakest settlement x (recalculated periodically for performance) */
let cachedWeakestSettlement = 150;
let weakestSettlementAge = 0;
const WEAKNESS_CACHE_INTERVAL = 2.0;

/** Spawn a greed entity at a given x position. Applies island hp scaling. */
export function spawnGreed(state: GameState, x: number, type: GreedType): GreedData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);

  const stats = GREED_STATS[type];
  const islandHpBonus = (state.islandIndex - 1) * 0.5;

  const greed: GreedData = {
    eid,
    type,
    hp: stats.hp + Math.max(0, islandHpBonus),
    speed: stats.speed,
    damage: stats.damage,
    carryingCoins: 0,
  };

  // Initialize type-specific state
  if (type === GreedType.Masked) {
    greed.maskBroken = false;
  } else if (type === GreedType.Floater) {
    greed.floaterTarget = null;
    greed.isCarrying = false;
    greed.grabTimer = 0;
  } else if (type === GreedType.Breeder) {
    greed.breederSpawnTimer = BREEDER_SPAWN_INTERVAL;
    greed.breederPunchTimer = BREEDER_PUNCH_INTERVAL;
    greed.breederSpawnCount = 0;
  } else if (type === GreedType.CrownStealer) {
    greed.hasCrown = false;
    greed.isClimbing = false;
    greed.climbTimer = 0;
  } else if (type === GreedType.PlagueCrawler) {
    greed.poisonOnDeath = true;
    greed.isClimbing = false;
    greed.climbTimer = 0;
  }

  greedSpawnPortals.set(eid, x);
  state.greeds.push(greed);
  return greed;
}

/** Spawn a mini-greed (from breeder). Fixed 1hp, no island scaling. */
function spawnMiniGreed(state: GameState, x: number): void {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);

  const greed: GreedData = {
    eid,
    type: GreedType.Basic,
    hp: 1,
    speed: GREED_SPEED_BASE,
    damage: 1,
    carryingCoins: 0,
  };

  state.greeds.push(greed);
}

/**
 * Called by combat system when a greed takes damage.
 * Handles masked greedling front mask logic.
 * Returns the actual damage to apply (0 if mask absorbed).
 */
export function onGreedDamaged(
  _state: GameState,
  greed: GreedData,
  _arrowVx: number,
  fromTower: boolean,
): number {
  if (greed.type === GreedType.Masked && !greed.maskBroken) {
    // Tower archers bypass mask
    if (fromTower) return 1;

    // Front hit absorbed by mask
    greed.maskBroken = true;
    return 0;
  }
  return 1; // full damage multiplier
}

/** Apply knockback to a greed (called by combat on arrow hit) */
export function applyKnockback(state: GameState, greedEid: Entity, arrowVx: number): void {
  const pos = getPosition(state.world, greedEid);
  if (!pos) return;

  const pushDir = arrowVx > 0 ? 1 : -1;
  Position.x[greedEid] = pos.x + KNOCKBACK_DISTANCE * pushDir;
}

/** Notify greeds that a wall was destroyed. Attacking greeds get a brief pause. */
export function onWallDestroyed(wallX: number): void {
  const toPause: number[] = [];
  for (const [eid, targetX] of greedWallTargets) {
    if (targetX === wallX) {
      toPause.push(eid);
    }
  }
  for (const eid of toPause) {
    pauseTimers.set(eid, WALL_BREAK_PAUSE);
    greedWallTargets.delete(eid);
  }
}

/**
 * Trigger sunrise flee for all greedlings and masked greedlings.
 * Breeders, floaters, and crown stealers do NOT flee.
 */
export function triggerSunriseFlee(state: GameState): void {
  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    if (greed.type === GreedType.Basic || greed.type === GreedType.Masked) {
      greed.isFleeing = true;
      greed.fleeDespawnTimer = 0;
    }
  }
}

/** Find nearest portal position to a given x */
function findNearestPortalX(state: GameState, x: number): number | null {
  const portals = getActivePortals(state);
  if (portals.length === 0) return null;

  let nearest = portals[0];
  let nearestDist = Math.abs(x - portals[0]);
  for (let i = 1; i < portals.length; i++) {
    const dist = Math.abs(x - portals[i]);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = portals[i];
    }
  }
  return nearest;
}

/** Find nearest defensive structure in path between greed and target */
function findNearestDefenseInPath(
  state: GameState,
  greedX: number,
  targetX: number,
): number | null {
  const direction = greedX > targetX ? -1 : 1;
  const startX = Math.round(greedX);
  const endX = Math.round(targetX);
  const scanLimit = Math.abs(endX - startX);

  for (let i = 1; i <= Math.min(scanLimit, 50); i++) {
    const checkX = startX + direction * i;
    const structure = state.structures.get(checkX);
    if (structure && isDefensiveStructure(structure.type)) {
      return checkX;
    }
  }
  return null;
}

/** Find a gap in a wall line that a crown stealer can pathfind through */
function findWallGap(state: GameState, wallX: number, greedX: number): number | null {
  let bestGap: number | null = null;
  let bestDist = Infinity;

  for (let offset = 1; offset <= GAP_SEARCH_RANGE; offset++) {
    for (const dir of [-1, 1]) {
      const checkX = wallX + offset * dir;
      if (checkX < 0) continue;

      const structure = state.structures.get(checkX);
      const hasDefense = structure && isDefensiveStructure(structure.type);

      if (!hasDefense) {
        const dist = Math.abs(checkX - greedX);
        if (dist < bestDist) {
          bestDist = dist;
          bestGap = checkX;
        }
      }
    }
    if (bestGap !== null) break;
  }

  return bestGap;
}

/** Update breeder-specific behavior: punch attack and continuous spawning */
function updateBreeder(state: GameState, greed: GreedData, dt: number): void {
  const pos = getPosition(state.world, greed.eid);
  if (!pos) return;

  // Punch attack: every 4 seconds, knocks down all units within 2 tiles
  greed.breederPunchTimer = (greed.breederPunchTimer ?? BREEDER_PUNCH_INTERVAL) - dt;
  if (greed.breederPunchTimer <= 0) {
    greed.breederPunchTimer = BREEDER_PUNCH_INTERVAL;

    for (const unit of state.units) {
      if (unit.hp <= 0) continue;
      const unitPos = getPosition(state.world, unit.eid);
      if (!unitPos) continue;
      if (Math.abs(unitPos.x - pos.x) <= BREEDER_PUNCH_RADIUS) {
        // Stun unit (set to idle temporarily, use attackCooldown as stun timer)
        unit.attackCooldown = Math.max(unit.attackCooldown, BREEDER_PUNCH_STUN);
        // Drop coins
        if (unit.coins > 0) {
          unit.coins = 0;
        }
      }
    }
  }

  // Continuous spawning: 2 greedlings every 6 seconds
  greed.breederSpawnTimer = (greed.breederSpawnTimer ?? BREEDER_SPAWN_INTERVAL) - dt;
  if (greed.breederSpawnTimer <= 0) {
    greed.breederSpawnTimer = BREEDER_SPAWN_INTERVAL;

    const currentChildren = greed.breederSpawnCount ?? 0;
    if (currentChildren < BREEDER_MAX_CHILDREN) {
      for (let i = 0; i < BREEDER_SPAWN_COUNT; i++) {
        const offset = (Math.random() - 0.5) * 4;
        spawnMiniGreed(state, pos.x + offset);
      }
      greed.breederSpawnCount = currentChildren + BREEDER_SPAWN_COUNT;
    }
  }
}

/** Update floater-specific behavior: abduct villagers */
function updateFloater(state: GameState, greed: GreedData, dt: number): void {
  const pos = getPosition(state.world, greed.eid);
  if (!pos) return;

  // If carrying a unit, move toward nearest portal
  if (greed.isCarrying && greed.floaterTarget != null) {
    const portalX = greedSpawnPortals.get(greed.eid);
    if (portalX !== undefined) {
      const direction = pos.x < portalX ? 1 : -1;
      const dist = Math.abs(pos.x - portalX);
      const moveSpeed = greed.speed * FLOATER_CARRY_SPEED_MULT;
      const moveAmount = Math.min(moveSpeed * dt, dist);
      Position.x[greed.eid] = pos.x + moveAmount * direction;

      if (dist < 1.0) {
        // Remove the abducted unit
        const targetEid = greed.floaterTarget;
        const unitIdx = state.units.findIndex(u => u.eid === targetEid);
        if (unitIdx !== -1) {
          state.units.splice(unitIdx, 1);
        }
        greed.floaterTarget = null;
        greed.isCarrying = false;
      }
    }
    return;
  }

  // Grabbing a target
  if (greed.floaterTarget != null && !greed.isCarrying) {
    const targetEid = greed.floaterTarget;
    const targetUnit = state.units.find(u => u.eid === targetEid);
    if (!targetUnit || targetUnit.hp <= 0) {
      greed.floaterTarget = null;
      greed.grabTimer = 0;
      return;
    }

    const targetPos = getPosition(state.world, targetEid);
    if (!targetPos) {
      greed.floaterTarget = null;
      greed.grabTimer = 0;
      return;
    }

    // Move toward target
    const dist = Math.abs(pos.x - targetPos.x);
    if (dist > 1.0) {
      const direction = pos.x < targetPos.x ? 1 : -1;
      const moveAmount = Math.min(greed.speed * dt, dist);
      Position.x[greed.eid] = pos.x + moveAmount * direction;
      return;
    }

    // Within grab range: tick grab timer
    greed.grabTimer = (greed.grabTimer ?? 0) + dt;
    if (greed.grabTimer >= FLOATER_GRAB_TIME) {
      greed.isCarrying = true;
    }
    return;
  }

  // Find a new target: nearest non-monarch unit
  let bestUnit: Entity | null = null;
  let bestDist = Infinity;

  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    // Skip archers in roofed towers (towerTier >= 5)
    // This check is simplified; we check if the unit is near a roofed tower
    const unitPos = getPosition(state.world, unit.eid);
    if (!unitPos) continue;

    const dist = Math.abs(unitPos.x - pos.x);
    if (dist < bestDist) {
      bestDist = dist;
      bestUnit = unit.eid;
    }
  }

  if (bestUnit !== null) {
    greed.floaterTarget = bestUnit;
    greed.grabTimer = 0;
  }
}

/** Update a single greed's AI */
export function updateGreed(state: GameState, greed: GreedData, dt: number): void {
  if (greed.hp <= 0) return;

  // Periodically recalculate weakest settlement
  weakestSettlementAge += dt;
  if (weakestSettlementAge >= WEAKNESS_CACHE_INTERVAL) {
    cachedWeakestSettlement = getWeakestSettlement(state);
    weakestSettlementAge = 0;
  }

  // Check pause timer (wall-break stun)
  const pauseRemaining = pauseTimers.get(greed.eid);
  if (pauseRemaining !== undefined) {
    const newPause = pauseRemaining - dt;
    if (newPause > 0) {
      pauseTimers.set(greed.eid, newPause);
      return;
    }
    pauseTimers.delete(greed.eid);
  }

  const pos = getPosition(state.world, greed.eid);
  if (!pos) return;

  const greedX = pos.x;
  const isFloater = greed.type === GreedType.Floater;
  const isCrownStealer = greed.type === GreedType.CrownStealer;
  const isBreeder = greed.type === GreedType.Breeder;
  const isPlagueType = greed.type === GreedType.PlagueCrawler;

  // Sunrise flee behavior (greedlings and masked only)
  if (greed.isFleeing) {
    const portalX = findNearestPortalX(state, greedX);
    if (portalX !== null) {
      const fleeDir = greedX < portalX ? 1 : -1;
      const distToPortal = Math.abs(greedX - portalX);

      if (distToPortal < 1.0) {
        greed.hp = 0; // vanish at portal
        return;
      }

      const moveAmount = Math.min(greed.speed * dt, distToPortal);
      Position.x[greed.eid] = greedX + moveAmount * fleeDir;
      return;
    }

    // No portal: despawn after timeout
    greed.fleeDespawnTimer = (greed.fleeDespawnTimer ?? 0) + dt;
    if (greed.fleeDespawnTimer >= SUNRISE_DESPAWN_NO_PORTAL) {
      greed.hp = 0;
      return;
    }

    // Wander while waiting to despawn
    return;
  }

  // Daylight despawn for non-fleeing basic/masked (if sunrise flee wasn't triggered yet)
  if ((greed.type === GreedType.Basic || greed.type === GreedType.Masked)
      && state.timeOfDay === TimeOfDay.Day) {
    greed.fleeDespawnTimer = (greed.fleeDespawnTimer ?? 0) + dt;
    if (greed.fleeDespawnTimer >= SUNRISE_DESPAWN_TIMEOUT) {
      greed.hp = 0;
      return;
    }
  }

  // Crown stealer with crown: flee to portal
  if (isCrownStealer && greed.hasCrown) {
    const portalX = greedSpawnPortals.get(greed.eid);
    if (portalX !== undefined) {
      const fleeDir = greedX < portalX ? 1 : -1;
      const distToPortal = Math.abs(greedX - portalX);

      if (distToPortal < 1.0) {
        // Crown lost permanently
        greed.hp = 0;
        state.phase = GamePhase.GameOver;
        state.messages.push('A Crown Stealer escaped with the crown!');
        return;
      }

      const moveAmount = Math.min(CROWN_STEAL_FLEE_SPEED * dt, distToPortal);
      Position.x[greed.eid] = greedX + moveAmount * fleeDir;
    }
    return;
  }

  // Breeder-specific updates
  if (isBreeder) {
    updateBreeder(state, greed, dt);
  }

  // Floater-specific updates (abduction logic)
  if (isFloater) {
    updateFloater(state, greed, dt);
    // If floater has a target or is carrying, the floater update handles movement
    if (greed.floaterTarget != null || greed.isCarrying) return;
  }

  // Retreat behavior: greeds carrying 3+ coins flee to spawn portal
  if (greed.carryingCoins >= FLEE_COIN_THRESHOLD) {
    const portalX = greedSpawnPortals.get(greed.eid);
    if (portalX !== undefined) {
      const fleeDir = greedX < portalX ? 1 : -1;
      const distToPortal = Math.abs(greedX - portalX);

      if (distToPortal < 1.0) {
        greed.hp = 0;
        return;
      }

      const moveAmount = Math.min(greed.speed * dt, distToPortal);
      Position.x[greed.eid] = greedX + moveAmount * fleeDir;
      return;
    }
  }

  // Determine movement target: weakest settlement
  let targetX = cachedWeakestSettlement;
  if (isCrownStealer) {
    const monarchPos = getPosition(state.world, state.monarch.eid);
    if (monarchPos) {
      targetX = monarchPos.x;
    }
  }

  // Check for defensive structures in path
  // Floaters fly over walls
  const isPlagueCrawler = greed.type === GreedType.PlagueCrawler;
  if (!isFloater) {
    const defenseX = findNearestDefenseInPath(state, greedX, targetX);

    if (defenseX !== null) {
      const defense = state.structures.get(defenseX);
      if (defense) {
        // PlagueCrawler and CrownStealer climb over walls
        if (isPlagueCrawler || isCrownStealer) {
          if (isCrownStealer) {
            // Crown stealers try to find a gap first
            const gapX = findWallGap(state, defenseX, greedX);
            if (gapX !== null) {
              targetX = gapX;
            } else {
              // No gap: climb over (2 seconds, vulnerable)
              greed.isClimbing = true;
              greed.climbTimer = (greed.climbTimer ?? 0) + dt;
              if (greed.climbTimer >= WALL_CLIMB_TIME) {
                greed.isClimbing = false;
                greed.climbTimer = 0;
                // Jump past the wall
                const dir = greedX > defenseX ? -1 : 1;
                Position.x[greed.eid] = defenseX + dir * 2;
              }
              return;
            }
          } else {
            // PlagueCrawler always climbs
            greed.isClimbing = true;
            greed.climbTimer = (greed.climbTimer ?? 0) + dt;
            if (greed.climbTimer >= WALL_CLIMB_TIME) {
              greed.isClimbing = false;
              greed.climbTimer = 0;
              const dir = greedX > defenseX ? -1 : 1;
              Position.x[greed.eid] = defenseX + dir * 2;
            }
            return;
          }
        } else {
          // Normal greed attacks wall with per-type damage
          greedWallTargets.set(greed.eid, defenseX);
          const wallDps = getGreedWallDamage(greed.type);
          const reduction = getWallDamageReduction(state, defenseX);
          defense.hp -= wallDps * reduction * dt;
          if (defense.hp <= 0) {
            defense.hp = 0;
            state.structures.delete(defenseX);
            onWallDestroyed(defenseX);
          }
          return;
        }
      }
    } else {
      greedWallTargets.delete(greed.eid);
      // Reset climbing state if no wall in path
      if (greed.isClimbing) {
        greed.isClimbing = false;
        greed.climbTimer = 0;
      }
    }
  }

  // Move toward target
  const direction = greedX > targetX ? -1 : 1;
  const distToTarget = Math.abs(greedX - targetX);
  if (distToTarget < 0.1) return;

  const moveAmount = Math.min(greed.speed * dt, distToTarget);
  const newX = greedX + moveAmount * direction;
  Position.x[greed.eid] = newX;

  // Check collision with monarch
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  const distToMonarch = Math.abs(newX - monarchPos.x);
  if (distToMonarch < 1.0) {
    if (isCrownStealer) {
      // Instantly knock crown off
      greed.hasCrown = true;
      state.crownDropped = true;
      state.crownX = monarchPos.x;
      state.crownY = GROUND_Y - 1;
      state.messages.push('A Crown Stealer snatched the crown!');
      return;
    }

    if (state.monarchCoins > 0) {
      const stolen = Math.min(1, state.monarchCoins);
      state.monarchCoins -= stolen;
      greed.carryingCoins += stolen;
    } else if (!state.crownDropped) {
      state.phase = GamePhase.GameOver;
      state.messages.push('The Greed has taken your crown!');
    }
  }
}

/** Apply plague crawler death poison to nearby units */
export function applyPlagueCrawlerDeathPoison(state: GameState, deathX: number): void {
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    const unitPos = getPosition(state.world, unit.eid);
    if (!unitPos) continue;
    if (Math.abs(unitPos.x - deathX) <= PLAGUE_POISON_RADIUS) {
      unit.poisonTimer = PLAGUE_POISON_DURATION;
      unit.poisonDps = PLAGUE_POISON_DPS;
    }
  }
}

/** Clean up module state for a removed greed */
export function cleanupGreedState(eid: Entity): void {
  pauseTimers.delete(eid);
  greedWallTargets.delete(eid);
  greedSpawnPortals.delete(eid);
}
