/**
 * Monarch entity - the player character.
 * One-shot coin drop (fires once per space press, not continuous).
 * Updates nearby interactable indicator for HUD each frame.
 *
 * Crown mechanic:
 * - Crown drops when monarch has 0 coins and takes a hit from greed
 * - 10 second recovery window to walk over crown position
 * - Crown stealer can grab dropped crown and carry to portal
 * - If timer expires or crown reaches portal: game over
 */
import { addEntity } from 'blecsd/core';
import { setPosition, getPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  type UnitData,
  UnitRole,
  AIState,
  GamePhase,
  MountType,
  CAMP_CENTER_X,
  GROUND_Y,
  STARTING_COINS,
  distance,
} from '../types';
import { dropCoin, updateNearbyInteractable } from '../game/economy';
import { getMountSpeed } from './mount';

let previousInputDrop = false;

const CROWN_RECOVERY_TIME = 10; // seconds
const CROWN_PICKUP_RANGE = 2; // tiles

export function createMonarch(state: GameState): UnitData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, CAMP_CENTER_X, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  const unit: UnitData = {
    eid,
    role: UnitRole.Monarch,
    aiState: AIState.Idle,
    targetX: CAMP_CENTER_X,
    hp: 1,
    maxHp: 1,
    attackCooldown: 0,
    coins: 0,
  };

  return unit;
}

export function updateMonarch(state: GameState, dt: number): void {
  const monarch = state.monarch;
  const pos = getPosition(state.world, monarch.eid);
  if (!pos) return;

  // Determine movement velocity from input
  let vx = 0;
  let speed = getMountSpeed(state);
  if (state.speedBoostTimer > 0) speed *= 1.5;

  if (state.inputLeft) vx = -speed;
  if (state.inputRight) vx = speed;

  setVelocity(state.world, monarch.eid, vx, 0);

  // Update nearby interactable indicator for HUD
  updateNearbyInteractable(state);

  // Handle crown drop recovery
  if (state.crownDropped) {
    updateCrownRecovery(state, pos, dt);
  }

  // Handle coin drop: one-shot on rising edge of inputDrop
  if (state.inputDrop && !previousInputDrop) {
    dropCoin(state);
    state.lastCoinDrop = Date.now();
  }
  previousInputDrop = state.inputDrop;
}

/**
 * Drop the crown when monarch has 0 coins and takes a hit.
 * Called by combat/greed system when monarch is hit.
 */
export function dropCrown(state: GameState): void {
  if (state.crownDropped) return; // already dropped

  const pos = getPosition(state.world, state.monarch.eid);
  if (!pos) return;

  state.crownDropped = true;
  state.crownX = pos.x;
  state.crownY = pos.y;
  state.crownTimer = CROWN_RECOVERY_TIME;

  state.messages.push('The crown has fallen! Recover it quickly!');
}

/**
 * Recover the crown by walking over it.
 */
export function recoverCrown(state: GameState): void {
  if (!state.crownDropped) return;

  state.crownDropped = false;
  state.crownTimer = 0;

  state.messages.push('Crown recovered!');
}

/**
 * Check if monarch is vulnerable (0 coins, crown not already dropped).
 * Used by combat system to determine if a hit should drop the crown.
 */
export function isMonarchVulnerable(state: GameState): boolean {
  return state.monarchCoins <= 0 && !state.crownDropped;
}

function updateCrownRecovery(
  state: GameState,
  monarchPos: { x: number; y: number },
  dt: number,
): void {
  // Count down timer
  state.crownTimer -= dt;

  // Check if monarch walks over crown
  if (distance(monarchPos.x, state.crownX) <= CROWN_PICKUP_RANGE) {
    recoverCrown(state);
    return;
  }

  // Check if timer expired
  if (state.crownTimer <= 0) {
    triggerHeirSuccession(state);
  }
}

// ─── Heir Succession ──────────────────────────────────────────────

const HEIR_STARTING_COINS = 8;
const DOCK_X = 50; // spawn at dock on same island

/**
 * Trigger heir succession when crown is permanently lost.
 * Instead of game over, a new heir takes the throne.
 * Preserves: banker coins, gems, unlocks.
 * Decays: all subjects revert to vagrants, structures decay.
 */
export function triggerHeirSuccession(state: GameState): void {
  state.totalHeirs++;
  state.messages.push('The crown has been lost...');
  state.messages.push('A new heir approaches the kingdom.');

  // Revert all units to vagrants (lose their tools)
  for (const unit of state.units) {
    if (unit.role === UnitRole.Monarch) continue;
    if (unit.role !== UnitRole.Vagrant) {
      unit.role = UnitRole.Vagrant;
      unit.aiState = AIState.Idle;
      unit.hp = 1;
      unit.maxHp = 1;
      unit.coins = 0;
    }
  }

  // Spawn new heir
  spawnHeir(state);
}

/**
 * Spawn the heir monarch at the dock position.
 * Starts with 8 coins, no mount.
 */
export function spawnHeir(state: GameState): void {
  // Reset crown state
  state.crownDropped = false;
  state.crownTimer = 0;

  // Reset monarch position to dock
  setPosition(state.world, state.monarch.eid, DOCK_X, GROUND_Y - 1);
  setVelocity(state.world, state.monarch.eid, 0, 0);

  // Heir starts with limited resources
  state.monarchCoins = HEIR_STARTING_COINS;

  // No mount
  state.mountType = MountType.None;
  state.stamina = 0;

  // Gems and banker coins are preserved (inheritance)
  // Unlocks (mounts, hermits, statues) are preserved

  state.messages.push(`Heir #${state.totalHeirs} has arrived at the dock with ${HEIR_STARTING_COINS} coins.`);
}
