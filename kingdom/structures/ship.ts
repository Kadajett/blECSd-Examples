/**
 * Ship/Boat structure: full boat mechanics for island travel.
 *
 * Boat wreck found at island edge (x = 5 or x = MAP_WIDTH - 5).
 * Restoration process:
 *   - 10 coins to begin restoration (initial repair)
 *   - 59 hull pieces needed, 2 coins each (118 coins total)
 *     - Island 1: all pieces free (tutorial), Island 2: 40 free
 *   - Builders hammer pieces into place (1 builder per piece, 5 seconds each)
 *   - Uninstalled hull pieces can be stolen by greedlings during night
 * Launch: 2 coins to launch boat into water
 * Dock sequence:
 *   - Builders push vessel toward dock (0.5x speed, 2+ builders)
 *   - Dock bell: 2 coins to summon 3 vagrants and 3 archers as crew
 * Departure: 10 coins to depart
 *   - Dog and hermits auto-board
 *   - Knight squads can be assigned as escort
 * Return trip: arriving at destination island
 *   - If lighthouse exists: safe landing
 *   - If no lighthouse: crash landing, lose 20% of coins
 *
 * State: boatState, hullPieces, boatBuilders, boardedEntities
 */

import { addEntity } from 'blecsd/core';
import type { Entity } from 'blecsd/core';
import { setPosition, getPosition } from 'blecsd/components';
import {
  type GameState,
  type StructureData,
  StructureType,
  GROUND_Y,
  MAP_WIDTH,
  UnitRole,
  AIState,
} from '../types';
import { FINAL_ISLAND } from './portal';
import { getLighthouseTier } from './lighthouse';

const SHIP_LEFT_X = 5;
const SHIP_RIGHT_X = MAP_WIDTH - 5;
const SHIP_MAX_HP = 20;

const RESTORATION_COST = 10;
const HULL_PIECE_COST = 2;
const HULL_PIECES_TOTAL = 59;
const HULL_PIECE_BUILD_TIME = 5.0;
const LAUNCH_COST = 2;
const DOCK_BELL_COST = 2;
const DEPARTURE_COST = 10;

const PUSH_SPEED = 0.5;
const MIN_PUSH_BUILDERS = 2;

/** Free hull pieces by island (tutorial assistance) */
const FREE_PIECES: Record<number, number> = {
  1: 59, // all free on island 1
  2: 40,
};

/** Hull piece installation progress per x position */
const hullBuildTimers: Map<number, number> = new Map();

/** Builder entities assigned to boat work */
const boatBuilders: Set<Entity> = new Set();

/** Entities boarded on the ship */
const boardedEntities: Set<Entity> = new Set();

/** Ship x position (can move when being pushed) */
let shipX = SHIP_LEFT_X;

/** Side the ship is on */
let shipSide: 'left' | 'right' = 'left';

/** Get current ship x position */
export function getShipX(): number {
  return shipX;
}

/** Get which side the ship is on */
export function getShipSide(): 'left' | 'right' {
  return shipSide;
}

/** Check if a builder is assigned to boat work */
export function isBoatBuilder(eid: Entity): boolean {
  return boatBuilders.has(eid);
}

/** Get the number of free hull pieces for current island */
function getFreePieces(islandIndex: number): number {
  return FREE_PIECES[islandIndex] ?? 0;
}

/** Get the cost for a hull piece (0 if free pieces remain) */
function getHullPieceCost(state: GameState): number {
  const free = getFreePieces(state.islandIndex);
  if (state.hullPieces < free) return 0;
  return HULL_PIECE_COST;
}

/** Create a ship structure at the island edge */
export function createShip(state: GameState, side: 'left' | 'right' = 'left'): StructureData {
  shipSide = side;
  shipX = side === 'left' ? SHIP_LEFT_X : SHIP_RIGHT_X;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, shipX, GROUND_Y);

  const ship: StructureData = {
    eid,
    type: StructureType.Ship,
    x: shipX,
    hp: 0,
    maxHp: SHIP_MAX_HP,
    level: 1,
    assignedWorkers: [],
  };

  state.structures.set(shipX, ship);
  state.boatState = 'wreck';
  state.hullPieces = 0;
  return ship;
}

/** Start boat restoration. Costs 10 coins for initial repair. */
export function startBoatRestoration(state: GameState): boolean {
  if (state.boatState !== 'wreck') return false;
  if (state.monarchCoins < RESTORATION_COST) return false;

  state.monarchCoins -= RESTORATION_COST;
  state.boatState = 'restoring';
  state.hullPieces = 0;

  state.messages.push('Boat restoration begun! Builders will install hull pieces.');
  return true;
}

/** Add a hull piece to the boat. Costs 2 coins (or free on early islands). */
export function addHullPiece(state: GameState): boolean {
  if (state.boatState !== 'restoring') return false;
  if (state.hullPieces >= HULL_PIECES_TOTAL) return false;

  const cost = getHullPieceCost(state);
  if (state.monarchCoins < cost) return false;

  state.monarchCoins -= cost;
  state.hullPieces += 1;

  if (state.hullPieces >= HULL_PIECES_TOTAL) {
    state.boatState = 'ready';
    state.messages.push('All hull pieces installed! Pay 2 coins to launch.');
  }

  return true;
}

/** Launch the boat into water. Costs 2 coins. */
export function launchBoat(state: GameState): boolean {
  if (state.boatState !== 'ready') return false;
  if (state.monarchCoins < LAUNCH_COST) return false;

  state.monarchCoins -= LAUNCH_COST;
  state.boatState = 'launched';

  state.messages.push('Boat launched! Assign 2+ builders to push to dock.');
  return true;
}

/** Dock the boat (called when builders push it to dock position). */
export function dockBoat(state: GameState): boolean {
  if (state.boatState !== 'launched') return false;

  state.boatState = 'docked';
  state.messages.push('Boat docked! Pay 2 coins for dock bell, then 10 coins to depart.');
  return true;
}

/** Ring the dock bell. Costs 2 coins, summons crew. */
export function ringDockBell(state: GameState): boolean {
  if (state.boatState !== 'docked') return false;
  if (state.monarchCoins < DOCK_BELL_COST) return false;

  state.monarchCoins -= DOCK_BELL_COST;

  // Summon crew is handled by the entity spawning system
  state.messages.push('Dock bell rings! Crew summoned. Pay 10 coins to depart.');
  return true;
}

/** Board an entity onto the ship */
export function boardEntity(_state: GameState, eid: Entity): boolean {
  if (boardedEntities.has(eid)) return false;
  boardedEntities.add(eid);
  return true;
}

/** Depart to next island. Costs 10 coins. */
export function departBoat(state: GameState): boolean {
  if (state.boatState !== 'docked') return false;
  if (state.monarchCoins < DEPARTURE_COST) return false;
  if (state.islandIndex >= FINAL_ISLAND) {
    state.messages.push('This is the final island. Destroy all portals to win!');
    return false;
  }

  state.monarchCoins -= DEPARTURE_COST;
  state.boatState = 'departed';

  // Auto-board dog and hermits
  for (const unit of state.units) {
    if (unit.role === UnitRole.Knight) {
      const pos = getPosition(state.world, unit.eid);
      if (pos && Math.abs(pos.x - shipX) <= 5) {
        boardedEntities.add(unit.eid);
      }
    }
  }

  // Transition to next island
  state.islandIndex += 1;
  state.difficultyMultiplier = 1 + (state.islandIndex - 1) * 0.5;

  // Check for lighthouse on destination for safe landing
  const lighthouseTier = getLighthouseTier(state);
  if (lighthouseTier <= 0) {
    // Crash landing: lose 20% of coins
    const lost = Math.floor(state.monarchCoins * 0.2);
    state.monarchCoins -= lost;
    state.messages.push(`Crash landing on island ${state.islandIndex}! Lost ${lost} coins.`);
  } else {
    state.messages.push(`Safe landing on island ${state.islandIndex} (lighthouse guides the way).`);
  }

  // Reset boat to wreck on new island
  state.boatState = 'wreck';
  state.hullPieces = 0;
  boatBuilders.clear();
  boardedEntities.clear();

  return true;
}

/** Check if the ship is fully restored and ready to launch */
export function isShipReady(state: GameState): boolean {
  return state.boatState === 'ready' || state.boatState === 'launched' || state.boatState === 'docked';
}

/** Update boat state each frame (builder push logic) */
export function updateBoat(state: GameState, dt: number): void {
  if (state.boatState !== 'launched') return;

  // Count builders near the ship
  let pushBuilders = 0;
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Builder) continue;
    if (unit.aiState !== AIState.Working) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (Math.abs(pos.x - shipX) <= 3) {
      pushBuilders++;
      boatBuilders.add(unit.eid);
    }
  }

  if (pushBuilders < MIN_PUSH_BUILDERS) return;

  // Push toward dock (center of map)
  const dockX = MAP_WIDTH / 2;
  const direction = shipX < dockX ? 1 : -1;
  const distToDock = Math.abs(shipX - dockX);

  if (distToDock <= 2) {
    dockBoat(state);
    return;
  }

  shipX += PUSH_SPEED * direction * dt;

  // Update ship structure position
  const oldX = Math.round(shipX - PUSH_SPEED * direction * dt);
  const ship = state.structures.get(oldX);
  if (ship && ship.type === StructureType.Ship) {
    state.structures.delete(oldX);
    ship.x = Math.round(shipX);
    state.structures.set(ship.x, ship);
  }
}

/** Steal hull pieces during night (greed attack) */
export function stealHullPiece(state: GameState): boolean {
  if (state.boatState !== 'restoring') return false;
  if (state.hullPieces <= 0) return false;

  state.hullPieces -= 1;
  state.messages.push('A greedling stole a hull piece!');
  return true;
}

/**
 * Legacy compatibility: sailToNextIsland wraps departBoat.
 * Each island: +1 portal count, +0.5 greed hp, +0.5 wave multiplier.
 * Cannot sail past the final island (5).
 */
export function sailToNextIsland(state: GameState): boolean {
  return departBoat(state);
}

/** Repair the ship (legacy compatibility). Starts restoration. */
export function repairShip(state: GameState): boolean {
  return startBoatRestoration(state);
}
