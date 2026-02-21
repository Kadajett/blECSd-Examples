/**
 * Kingdom - Camera system
 * Follows the monarch with smooth lerp, look-ahead in movement direction,
 * and clamping to map bounds. Supports variable map widths per island.
 */

import {
  type GameState,
  MAP_WIDTH,
  clamp,
  lerp,
} from '../types';
import { getPosition, getVelocity } from 'blecsd/components';

const CAMERA_LERP_SPEED = 0.1;
const LOOK_AHEAD_TILES = 5;

/**
 * Update camera to follow the monarch's x position.
 * Adds look-ahead offset in the direction of movement for better visibility.
 * Smooth lerp toward the target, clamped to map bounds.
 */
export function updateCamera(state: GameState): void {
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  const effectiveMapWidth = state.mapWidth ?? MAP_WIDTH;

  // Look-ahead: offset camera in movement direction
  let lookAhead = 0;
  const monarchVel = getVelocity(state.world, state.monarch.eid);
  if (monarchVel) {
    if (monarchVel.x > 0) lookAhead = LOOK_AHEAD_TILES;
    else if (monarchVel.x < 0) lookAhead = -LOOK_AHEAD_TILES;
  }

  // Target camera centers the monarch (with look-ahead) in the viewport
  const targetX = monarchPos.x + lookAhead - Math.floor(state.viewWidth / 2);
  const maxCameraX = Math.max(0, effectiveMapWidth - state.viewWidth);
  const clampedTarget = clamp(targetX, 0, maxCameraX);

  // Smooth interpolation
  state.cameraX = lerp(state.cameraX, clampedTarget, CAMERA_LERP_SPEED);

  // Clamp final result
  state.cameraX = clamp(state.cameraX, 0, maxCameraX);
}
