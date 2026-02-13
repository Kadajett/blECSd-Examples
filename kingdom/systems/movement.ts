/**
 * Movement system - applies velocity to positions, handles bounds,
 * projectiles, collision avoidance, and animal movement.
 */
import { getPosition, setPosition, getVelocity, removeEntity } from 'blecsd';
import type { Entity } from 'blecsd';
import {
  type GameState,
  MAP_WIDTH,
  clamp,
} from '../types';
import { getAnimals } from '../entities/animals';

const MIN_UNIT_SPACING = 1.0;

export function updateMovement(state: GameState, dt: number): void {
  // Update unit positions from velocity
  for (const unit of state.units) {
    const pos = getPosition(state.world, unit.eid);
    const vel = getVelocity(state.world, unit.eid);
    if (!pos || !vel) continue;

    if (vel.x === 0 && vel.y === 0) continue;

    const newX = clamp(pos.x + vel.x * dt, 0, MAP_WIDTH - 1);
    setPosition(state.world, unit.eid, newX, pos.y);
  }

  // Update monarch position from velocity
  {
    const pos = getPosition(state.world, state.monarch.eid);
    const vel = getVelocity(state.world, state.monarch.eid);
    if (pos && vel && (vel.x !== 0 || vel.y !== 0)) {
      const newX = clamp(pos.x + vel.x * dt, 0, MAP_WIDTH - 1);
      setPosition(state.world, state.monarch.eid, newX, pos.y);
    }
  }

  // Greeds handle their own movement via Position.x in greed.ts.
  // Do NOT apply velocity to greeds here.

  // Update projectiles and remove those off-screen
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const proj = state.projectiles[i];
    proj.x += proj.vx * dt;

    if (proj.x < 0 || proj.x >= MAP_WIDTH) {
      removeEntity(state.world, proj.eid);
      state.projectiles.splice(i, 1);
    }
  }

  // Animal positions are updated by animals.ts updateAnimals(),
  // but we include their ECS entities in collision avoidance below.

  // Collision avoidance: spread overlapping units apart
  resolveUnitOverlaps(state);
}

/**
 * Push overlapping units apart so they maintain MIN_UNIT_SPACING.
 * Uses a simple sort-and-sweep on the x-axis.
 */
function resolveUnitOverlaps(state: GameState): void {
  const entities: { eid: Entity; x: number }[] = [];

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (monarchPos) {
    entities.push({ eid: state.monarch.eid, x: monarchPos.x });
  }

  for (const unit of state.units) {
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    entities.push({ eid: unit.eid, x: pos.x });
  }

  if (entities.length < 2) return;

  entities.sort((a, b) => a.x - b.x);

  for (let i = 1; i < entities.length; i++) {
    const prev = entities[i - 1];
    const curr = entities[i];
    const gap = curr.x - prev.x;

    if (gap < MIN_UNIT_SPACING) {
      const overlap = MIN_UNIT_SPACING - gap;
      const halfPush = overlap / 2;

      const prevNewX = clamp(prev.x - halfPush, 0, MAP_WIDTH - 1);
      const currNewX = clamp(curr.x + halfPush, 0, MAP_WIDTH - 1);

      prev.x = prevNewX;
      curr.x = currNewX;

      const prevPos = getPosition(state.world, prev.eid);
      if (prevPos) setPosition(state.world, prev.eid, prevNewX, prevPos.y);

      const currPos = getPosition(state.world, curr.eid);
      if (currPos) setPosition(state.world, curr.eid, currNewX, currPos.y);
    }
  }
}
