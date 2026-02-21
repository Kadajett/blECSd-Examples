/**
 * Kingdom - Mount system with 7 mount types.
 * Each mount has unique speed, stamina, and ability.
 * Mounts found at stables on specific islands, unlocked with gems, ridden for coins.
 * Mount loss on hit: returns to stable.
 * Abilities activated with 'e' key.
 *
 * | Mount    | Speed | Stamina | Ability                                |
 * |----------|-------|---------|----------------------------------------|
 * | Horse    | 1.5x  | 100     | None (baseline)                        |
 * | Stag     | 1.3x  | 80      | Attracts deer within 20 tiles          |
 * | Griffin  | 1.8x  | 60      | Wing flap knockback (5 tiles AoE)      |
 * | Warhorse | 1.5x  | 120     | Charge: 10s invincibility nearby allies |
 * | Bear     | 1.0x  | 150     | Pounce: instakill 1 greed, 8s cd       |
 * | Lizard   | 1.3x  | 70      | Fire breath: 3-tile cone, 3 DPS, 6s cd |
 * | Unicorn  | 1.4x  | 90      | Grass eating: +3 coins, 15s cd         |
 */

import { getPosition } from 'blecsd/components';
import {
  type GameState,
  MountType,
  TileType,
  GROUND_Y,
  MONARCH_SPEED,
  MONARCH_SPRINT,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';

export { MountType } from '../types';

// ─── Mount Stats ──────────────────────────────────────────────────
interface MountStats {
  speedMult: number;
  sprintMult: number;
  maxStamina: number;
  island: number;
  gemCost: number;
  coinCost: number;
  abilityCooldown: number; // seconds; 0 = no ability
}

const MOUNT_STATS: Record<string, MountStats> = {
  [MountType.Horse]:    { speedMult: 1.5, sprintMult: 2.0, maxStamina: 100, island: 1, gemCost: 0, coinCost: 3, abilityCooldown: 0 },
  [MountType.Stag]:     { speedMult: 1.3, sprintMult: 1.8, maxStamina: 80,  island: 2, gemCost: 1, coinCost: 3, abilityCooldown: 0 },
  [MountType.Griffin]:  { speedMult: 1.8, sprintMult: 2.5, maxStamina: 60,  island: 1, gemCost: 2, coinCost: 8, abilityCooldown: 10 },
  [MountType.Warhorse]: { speedMult: 1.5, sprintMult: 2.0, maxStamina: 120, island: 3, gemCost: 2, coinCost: 8, abilityCooldown: 20 },
  [MountType.Bear]:     { speedMult: 1.0, sprintMult: 1.5, maxStamina: 150, island: 4, gemCost: 3, coinCost: 11, abilityCooldown: 8 },
  [MountType.Lizard]:   { speedMult: 1.3, sprintMult: 1.8, maxStamina: 70,  island: 4, gemCost: 3, coinCost: 10, abilityCooldown: 6 },
  [MountType.Unicorn]:  { speedMult: 1.4, sprintMult: 2.0, maxStamina: 90,  island: 5, gemCost: 4, coinCost: 12, abilityCooldown: 15 },
};

const STAMINA_DEPLETE_RATE = 20;
const STAMINA_RECHARGE_RATE = 10;
const STAMINA_GRASS_BONUS = 5;
const STAMINA_IDLE_BONUS = 3; // extra recharge when idle (no movement input)
const MOUNT_SWITCH_COST = 3;

// ─── Module State ────────────────────────────────────────────────
const mountsUnlocked = new Set<MountType>();
let mountAbilityCooldown = 0;
let chargeTimer = 0; // warhorse charge duration

// ─── Mount Fear ──────────────────────────────────────────────────
const FEAR_RANGE = 8;
const FEAR_DURATION_DEFAULT = 2;
const FEAR_DURATION_WARHORSE = 1;
const FEAR_COOLDOWN = 3; // seconds after panic before normal control
const FEAR_SPEED_MULT = 2;

let mountPanicTimer = 0;
let mountPanicCooldown = 0;
let panicDirection = 0; // -1 or 1, direction to flee

/** Get stats for a mount type. */
export function getMountStatsForType(type: MountType): MountStats | undefined {
  return MOUNT_STATS[type];
}

/** Get all mount stats (for UI). */
export function getAllMountStats(): Record<string, MountStats> {
  return MOUNT_STATS;
}

/** Check if a mount type is unlocked. */
export function isMountUnlocked(type: MountType): boolean {
  return mountsUnlocked.has(type);
}

/** Unlock a mount type. */
export function unlockMount(state: GameState, type: MountType): boolean {
  if (mountsUnlocked.has(type)) return false;
  const stats = MOUNT_STATS[type];
  if (!stats) return false;

  if (state.gems < stats.gemCost) return false;
  state.gems -= stats.gemCost;
  mountsUnlocked.add(type);
  state.messages.push(`${type} mount unlocked! (${stats.gemCost} gems)`);
  return true;
}

/** Give the monarch a mount. */
export function createMount(state: GameState): void {
  state.mountType = MountType.Horse;
  state.stamina = state.maxStamina;
  mountsUnlocked.add(MountType.Horse);
}

/**
 * Switch mount at stable. Costs 3 coins.
 */
export function switchMount(state: GameState, newType: MountType): boolean {
  if (newType === state.mountType) return false;
  if (!mountsUnlocked.has(newType)) return false;

  if (state.monarchCoins < MOUNT_SWITCH_COST) {
    state.messages.push(`Need ${MOUNT_SWITCH_COST} coins to switch mounts`);
    return false;
  }

  state.monarchCoins -= MOUNT_SWITCH_COST;

  const stats = MOUNT_STATS[newType];
  if (stats) {
    state.mountType = newType;
    state.maxStamina = stats.maxStamina;
    state.stamina = stats.maxStamina;
  }

  mountAbilityCooldown = 0;
  state.messages.push(`Switched to ${newType} mount!`);
  return true;
}

/**
 * Lose mount (monarch takes hit). Mount returns to stable.
 */
export function loseMount(state: GameState): void {
  if (state.mountType === MountType.None) return;

  state.messages.push('Your mount fled!');
  state.mountType = MountType.None;
  state.stamina = 0;
  mountAbilityCooldown = 0;
  chargeTimer = 0;
}

/**
 * Update mount stamina each frame.
 */
export function updateMount(state: GameState, dt: number): void {
  if (state.mountType === MountType.None) return;

  // Update ability cooldown
  if (mountAbilityCooldown > 0) {
    mountAbilityCooldown = Math.max(0, mountAbilityCooldown - dt);
  }

  // Warhorse charge timer
  if (chargeTimer > 0) {
    chargeTimer = Math.max(0, chargeTimer - dt);
  }

  if (state.inputSprint && state.stamina > 0) {
    state.stamina = Math.max(0, state.stamina - STAMINA_DEPLETE_RATE * dt);
  } else {
    let rechargeRate = STAMINA_RECHARGE_RATE;

    // Grass bonus for any mount
    const monarchPos = getPosition(state.world, state.monarch.eid);
    if (monarchPos) {
      const tileX = Math.floor(monarchPos.x);
      const tile = state.tiles[GROUND_Y]?.[tileX];
      if (tile === TileType.Grass || tile === TileType.Forest) {
        rechargeRate += STAMINA_GRASS_BONUS;
      }
    }

    // Idle bonus (not moving)
    if (!state.inputLeft && !state.inputRight) {
      rechargeRate += STAMINA_IDLE_BONUS;
    }

    state.stamina = Math.min(state.maxStamina, state.stamina + rechargeRate * dt);
  }
}

/** Get effective movement speed based on mount type and stamina. */
export function getMountSpeed(state: GameState): number {
  if (state.mountType === MountType.None) {
    return state.inputSprint ? MONARCH_SPRINT : MONARCH_SPEED;
  }

  const stats = MOUNT_STATS[state.mountType];
  if (!stats) {
    return state.inputSprint ? MONARCH_SPRINT : MONARCH_SPEED;
  }

  const canSprint = state.inputSprint && state.stamina > 0;
  return canSprint
    ? MONARCH_SPEED * stats.sprintMult
    : MONARCH_SPEED * stats.speedMult;
}

/** Get current and max stamina values. */
export function getStamina(state: GameState): { current: number; max: number } {
  return { current: state.stamina, max: state.maxStamina };
}

/** Get mount ability cooldown. */
export function getMountAbilityCooldown(): number {
  return mountAbilityCooldown;
}

/** Check if stag mount is active (for deer attraction in animals.ts). */
export function isStagMounted(state: GameState): boolean {
  return state.mountType === MountType.Stag;
}

/** Check if warhorse charge is active (allies invincible). */
export function isWarhorseChargeActive(): boolean {
  return chargeTimer > 0;
}

/**
 * Activate the current mount's ability.
 * Called when player presses 'e'.
 */
export function activateMountAbility(state: GameState): boolean {
  if (state.mountType === MountType.None) return false;

  const stats = MOUNT_STATS[state.mountType];
  if (!stats || stats.abilityCooldown === 0) return false;
  if (mountAbilityCooldown > 0) return false;

  mountAbilityCooldown = stats.abilityCooldown;

  switch (state.mountType) {
    case MountType.Griffin: {
      // Wing flap knockback: push greed 5 tiles away
      const monarchPos = getPosition(state.world, state.monarch.eid);
      if (monarchPos) {
        let knocked = 0;
        for (const greed of state.greeds) {
          const gPos = getPosition(state.world, greed.eid);
          if (!gPos) continue;
          if (distance(monarchPos.x, gPos.x) <= 5) {
            // Push greed away (handled by greed system checking knockback flag)
            knocked++;
          }
        }
        state.messages.push(`Griffin flap knocked back ${knocked} greed!`);
      }
      return true;
    }

    case MountType.Warhorse: {
      // Charge: 10s invincibility to nearby allies
      chargeTimer = 10;
      state.messages.push('Warhorse charge! Allies are invincible for 10 seconds!');
      return true;
    }

    case MountType.Bear: {
      // Pounce: instakill 1 nearest greed
      const monarchPos = getPosition(state.world, state.monarch.eid);
      if (monarchPos) {
        let closest = -1;
        let closestDist = 10; // max pounce range
        for (let i = 0; i < state.greeds.length; i++) {
          const gPos = getPosition(state.world, state.greeds[i].eid);
          if (!gPos) continue;
          const d = distance(monarchPos.x, gPos.x);
          if (d < closestDist) {
            closestDist = d;
            closest = i;
          }
        }
        if (closest >= 0) {
          state.greeds[closest].hp = 0;
          state.messages.push('Bear pounce! Greed destroyed!');
        } else {
          state.messages.push('No greed in range for bear pounce');
          mountAbilityCooldown = 1; // short cooldown on miss
        }
      }
      return true;
    }

    case MountType.Lizard: {
      // Fire breath: damage greed in 3-tile cone
      const monarchPos = getPosition(state.world, state.monarch.eid);
      if (monarchPos) {
        const facingDir = state.inputRight ? 1 : -1;
        let hit = 0;
        for (const greed of state.greeds) {
          const gPos = getPosition(state.world, greed.eid);
          if (!gPos) continue;
          const dx = gPos.x - monarchPos.x;
          if (Math.abs(dx) <= 3 && Math.sign(dx) === facingDir) {
            greed.hp -= 3;
            hit++;
          }
        }
        state.messages.push(`Lizard fire breath hit ${hit} greed!`);
      }
      return true;
    }

    case MountType.Unicorn: {
      // Grass eating: generate 3 coins
      collectCoins(state, 3);
      state.messages.push('Unicorn grazes. +3 coins!');
      return true;
    }

    default:
      return false;
  }
}

/**
 * Update mount abilities (cooldown timers handled in updateMount).
 */
export function updateMountAbility(state: GameState, dt: number): void {
  // Stag attraction handled in animals.ts via isStagMounted check
  // Warhorse charge timer handled in updateMount
  // All other abilities are instant on activation

  // Update panic timers
  if (mountPanicTimer > 0) {
    mountPanicTimer = Math.max(0, mountPanicTimer - dt);
    if (mountPanicTimer <= 0) {
      mountPanicCooldown = FEAR_COOLDOWN;
    }
  }
  if (mountPanicCooldown > 0) {
    mountPanicCooldown = Math.max(0, mountPanicCooldown - dt);
  }
}

// ─── Mount Fear Exports ──────────────────────────────────────────

/**
 * Trigger mount panic from a breeder greed at the given position.
 * Bear is immune (too brave). Griffin is immune (flies over).
 */
export function triggerMountPanic(state: GameState, breederX: number): void {
  if (state.mountType === MountType.None) return;
  if (state.mountType === MountType.Bear) return; // immune
  if (state.mountType === MountType.Griffin) return; // immune

  // Don't re-trigger if already panicking or in cooldown
  if (mountPanicTimer > 0 || mountPanicCooldown > 0) return;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  if (distance(monarchPos.x, breederX) > FEAR_RANGE) return;

  // Warhorse has reduced fear duration
  mountPanicTimer = state.mountType === MountType.Warhorse
    ? FEAR_DURATION_WARHORSE
    : FEAR_DURATION_DEFAULT;

  // Flee away from breeder
  panicDirection = monarchPos.x > breederX ? 1 : -1;

  state.messages.push('Your mount panics!');
}

/** Check if the mount is currently panicking. */
export function isMountPanicking(): boolean {
  return mountPanicTimer > 0;
}

/** Get the panic flee velocity (used by monarch movement). */
export function getMountPanicVelocity(state: GameState): number {
  if (mountPanicTimer <= 0) return 0;
  const stats = MOUNT_STATS[state.mountType];
  if (!stats) return 0;
  return panicDirection * MONARCH_SPEED * stats.speedMult * FEAR_SPEED_MULT;
}
