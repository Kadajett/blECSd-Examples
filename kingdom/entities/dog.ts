/**
 * Dog companion entity - follows monarch, barks at greed, can be kidnapped.
 * Found on Island 2 under a fallen tree (x=200 default).
 * 1 coin to free (coin returned immediately).
 * Dog follows monarch within 5 tiles, barks when greed within 30 tiles.
 * Can be kidnapped by greedlings and carried to nearest portal.
 * Recovery: destroy portal OR lose crown (dog returns next day).
 */
import { addEntity, removeEntity } from 'blecsd/core';
import type { Entity } from 'blecsd/core';
import { getPosition, setPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  GROUND_Y,
  CAMP_CENTER_X,
  distance,
  clamp,
  MAP_WIDTH,
} from '../types';

// ─── Constants ───────────────────────────────────────────────────
const DOG_FOLLOW_DISTANCE = 5;
const DOG_OFFSET = 3;
const BARK_RANGE = 30;
const BARK_DURATION = 2; // seconds
const DOG_DEFAULT_X = 200;
const FREE_COST = 1;

// ─── Module State ────────────────────────────────────────────────
let dogEid: Entity | null = null;
let dogX = DOG_DEFAULT_X;
let dogY = GROUND_Y - 1;
let barkTimer = 0;
let barkDirection: -1 | 0 | 1 = 0; // -1 left, 0 none, 1 right
let captorEntity: Entity | null = null;
let dogFreed = false;

/** Check if the dog is currently barking. */
export function isDogBarking(): boolean {
  return barkTimer > 0;
}

/** Get the direction the dog is barking at (-1 left, 0 none, 1 right). */
export function getDogBarkDirection(): -1 | 0 | 1 {
  return barkDirection;
}

/** Get the dog's current x position. */
export function getDogX(): number {
  return dogX;
}

/** Check if the dog has been freed yet. */
export function isDogFreed(): boolean {
  return dogFreed;
}

/**
 * Free the dog from the fallen tree. Costs 1 coin but returns it immediately.
 * Monarch must be on Island 2 near x=200.
 */
export function freeDog(state: GameState): boolean {
  if (state.hasDog) return false;
  if (state.islandIndex !== 2) return false;
  if (state.monarchCoins < FREE_COST) return false;

  // Cost is returned immediately (lore-accurate: dog brings back coin)
  // No net cost, but monarch needs at least 1 coin

  const eid = addEntity(state.world);
  setPosition(state.world, eid, dogX, dogY);
  setVelocity(state.world, eid, 0, 0);
  dogEid = eid;

  state.hasDog = true;
  state.dogCaptured = false;
  dogFreed = true;

  state.messages.push('You freed the dog! It loyally follows you.');
  return true;
}

/**
 * Create the dog entity (used when loading a save or starting with dog).
 */
export function createDog(state: GameState): void {
  if (dogEid !== null) return;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  const startX = monarchPos ? monarchPos.x - DOG_OFFSET : CAMP_CENTER_X - DOG_OFFSET;

  const eid = addEntity(state.world);
  setPosition(state.world, eid, startX, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  dogEid = eid;
  dogX = startX;
  dogY = GROUND_Y - 1;
  barkTimer = 0;
  barkDirection = 0;
  captorEntity = null;

  state.hasDog = true;
  state.dogCaptured = false;
}

/** Capture the dog (called by greed system when greedling reaches dog). */
export function captureDog(state: GameState, captorEid: Entity): void {
  if (!state.hasDog || state.dogCaptured) return;

  state.dogCaptured = true;
  captorEntity = captorEid;
  barkTimer = 0;
  barkDirection = 0;

  state.messages.push('The greed captured your dog!');
}

/** Recover the dog (called when portal is destroyed or at dawn after crown loss). */
export function recoverDog(state: GameState): void {
  if (!state.dogCaptured) return;

  state.dogCaptured = false;
  captorEntity = null;

  // Dog returns to monarch
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (monarchPos) {
    dogX = monarchPos.x - DOG_OFFSET;
    if (dogEid !== null) {
      setPosition(state.world, dogEid, dogX, dogY);
    }
  }

  state.messages.push('Your dog has returned!');
}

/** Main update loop for the dog. */
export function updateDog(state: GameState, dt: number): void {
  if (!state.hasDog) return;
  if (dogEid === null) return;

  // If captured, follow captor (greed system handles movement to portal)
  if (state.dogCaptured) {
    if (captorEntity !== null) {
      const captorPos = getPosition(state.world, captorEntity);
      if (captorPos) {
        dogX = captorPos.x;
        dogY = captorPos.y;
        setPosition(state.world, dogEid, dogX, dogY);
      }
    }
    return;
  }

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  // Follow monarch
  const monarchDir = monarchPos.x > dogX ? 1 : -1;
  const targetX = monarchPos.x - monarchDir * DOG_OFFSET;
  const dist = distance(dogX, targetX);

  if (dist > DOG_FOLLOW_DISTANCE) {
    // Teleport if too far (e.g. monarch rode horse)
    dogX = targetX;
  } else if (dist > 1) {
    // Move toward target
    const moveDir = targetX > dogX ? 1 : -1;
    const speed = dist > 3 ? 15 : 8; // faster if falling behind
    dogX = clamp(dogX + moveDir * speed * dt, 0, MAP_WIDTH - 1);
  }

  setPosition(state.world, dogEid, dogX, dogY);

  // Bark warning system: detect nearby greed
  updateBark(state, dt);
}

function updateBark(state: GameState, dt: number): void {
  if (barkTimer > 0) {
    barkTimer -= dt;
    if (barkTimer <= 0) {
      barkTimer = 0;
      barkDirection = 0;
    }
    return; // Don't re-trigger while barking
  }

  // Scan for greed within bark range
  let closestGreedX: number | undefined;
  let closestDist = Infinity;

  for (const greed of state.greeds) {
    const greedPos = getPosition(state.world, greed.eid);
    if (!greedPos) continue;
    const d = distance(dogX, greedPos.x);
    if (d < BARK_RANGE && d < closestDist) {
      closestDist = d;
      closestGreedX = greedPos.x;
    }
  }

  if (closestGreedX !== undefined) {
    barkTimer = BARK_DURATION;
    barkDirection = closestGreedX > dogX ? 1 : -1;
  }
}
