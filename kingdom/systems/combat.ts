/**
 * Combat system: projectiles, damage, coin drops, monarch coin pickup.
 *
 * Performance: only processes entities within 50 tiles of the camera.
 * Friendly fire prevention: projectiles only collide with greeds, never units.
 * Masked greeds: mask handled by greed.ts onGreedDamaged.
 * Combo: 3 arrows hitting the same greed within 1 second deals bonus damage.
 * Archers at different settlements defend independently.
 *
 * Damage types:
 *   Normal: standard arrow damage
 *   Piercing: ballista bolt hits all greeds in a line
 *   Burn: fire tower sets greed on fire (DPS over time)
 *   AoE: catapult/pike hits all in radius
 *
 * Pike thrust: pikemen hit all greed within 1.5 tiles, 3 damage, 2s cooldown.
 * Mounted combat: monarch on bear can instakill 1 greed (8s cooldown).
 */

import { removeEntity } from 'blecsd/core';
import type { Entity } from 'blecsd/core';
import { getPosition } from 'blecsd/components';
import {
  type GameState,
  type GreedData,
  GreedType,
  GamePhase,
  DamageType,
  UnitRole,
  GROUND_Y,
  MAX_COINS,
  MountType,
} from '../types';
import { getActiveBuff, ShrineBuffType, updateShrineBuff } from '../structures/shrine';
import { applyKnockback, cleanupGreedState, onGreedDamaged, applyPlagueCrawlerDeathPoison } from '../entities/greed';
import { TOWER_TYPE } from '../structures/wall';

/** A coin dropped on the ground by a dead greed */
export interface DroppedCoin {
  x: number;
  y: number;
}

const ARROW_LIFETIME = 0.5;
const CRIT_CHANCE = 0.10;
const CRIT_MULTIPLIER = 2;
const COIN_PICKUP_RANGE = 1.5;
const COMBO_WINDOW = 1.0;
const COMBO_THRESHOLD = 3;
const COMBO_BONUS = 2;
const CAMERA_CULL_RANGE = 50;

/** Pike thrust constants */
const PIKE_DAMAGE = 3;
const PIKE_RANGE = 1.5;
const PIKE_COOLDOWN = 2.0;

/** Bear combat constants */
const BEAR_ATTACK_COOLDOWN = 8.0;
const BEAR_ATTACK_RANGE = 2.0;

/** Module-level tracking */
const projectileAges: Map<number, number> = new Map();
const droppedCoins: DroppedCoin[] = [];

/** Combo tracking: greed eid -> array of hit timestamps */
const greedHitLog: Map<number, number[]> = new Map();

/** Pikeman attack cooldowns */
const pikemanCooldowns: Map<number, number> = new Map();

/** Get all coins currently on the ground */
export function getDroppedCoins(): readonly DroppedCoin[] {
  return droppedCoins;
}

/** Check if a projectile's owner is stationed at a tower */
function isFromTower(state: GameState, ownerEid: Entity): boolean {
  const pos = getPosition(state.world, ownerEid);
  if (!pos) return false;
  const x = Math.round(pos.x);
  for (const offset of [-1, 0, 1]) {
    const s = state.structures.get(x + offset);
    if (s && s.type === TOWER_TYPE) return true;
  }
  return false;
}

/** Calculate effective damage (mask is handled by onGreedDamaged) */
function calculateArrowDamage(
  baseDmg: number,
  _greedType: GreedType,
  _fromTower: boolean,
): number {
  return baseDmg;
}

/** Record a hit for the combo system. Returns bonus damage if combo triggered. */
function recordComboHit(greedEid: number, timestamp: number): number {
  let hits = greedHitLog.get(greedEid);
  if (!hits) {
    hits = [];
    greedHitLog.set(greedEid, hits);
  }

  hits.push(timestamp);

  const cutoff = timestamp - COMBO_WINDOW;
  while (hits.length > 0 && hits[0] < cutoff) {
    hits.shift();
  }

  if (hits.length >= COMBO_THRESHOLD) {
    hits.length = 0;
    return COMBO_BONUS;
  }

  return 0;
}

/** Check if an x position is within camera cull range */
function isInCullRange(x: number, cameraX: number, viewWidth: number): boolean {
  const center = cameraX + viewWidth / 2;
  return Math.abs(x - center) <= CAMERA_CULL_RANGE;
}

/**
 * Apply burn damage to a greed.
 * Sets burnTimer and burnDps on the greed entity.
 */
export function applyBurn(greed: GreedData, dps: number, duration: number): void {
  greed.burnTimer = duration;
  greed.burnDps = dps;
}

/**
 * Apply piercing damage: hits all greeds along a line (same x direction).
 * Returns the number of greeds hit.
 */
export function applyPiercing(
  state: GameState,
  startX: number,
  vx: number,
  damage: number,
  range: number,
): number {
  const direction = vx > 0 ? 1 : -1;
  let hitCount = 0;

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    const dx = pos.x - startX;
    // Only hit greeds in the projectile direction and within range
    if (dx * direction >= 0 && Math.abs(dx) <= range) {
      greed.hp -= damage;
      hitCount++;
    }
  }

  return hitCount;
}

/**
 * Apply AoE damage to all greeds within radius of a target position.
 * Returns the number of greeds hit.
 */
export function applyAoE(
  state: GameState,
  targetX: number,
  damage: number,
  radius: number,
): number {
  let hitCount = 0;

  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;

    if (Math.abs(pos.x - targetX) <= radius) {
      greed.hp -= damage;
      hitCount++;
    }
  }

  return hitCount;
}

/** Process all combat interactions for one frame */
export function updateCombat(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  updateShrineBuff(dt);

  const buff = getActiveBuff();
  const arrowDmgMultiplier = buff?.type === ShrineBuffType.ArcherDamage ? buff.multiplier : 1;

  updateProjectiles(state, dt, arrowDmgMultiplier);
  updateBurnDamage(state, dt);
  updatePoisonDamage(state, dt);
  updatePikemanCombat(state, dt);
  updateBearCombat(state, dt);
  updateMonarchCoinPickup(state);
  cleanupDeadGreeds(state);
}

/** Update burn damage on all greeds */
function updateBurnDamage(state: GameState, dt: number): void {
  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    if (!greed.burnTimer || greed.burnTimer <= 0) continue;

    const dps = greed.burnDps ?? 0;
    greed.hp -= dps * dt;
    greed.burnTimer -= dt;

    if (greed.burnTimer <= 0) {
      greed.burnTimer = 0;
      greed.burnDps = 0;
    }
  }
}

/** Update poison damage on units (from plague crawlers) */
function updatePoisonDamage(state: GameState, dt: number): void {
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    if (!unit.poisonTimer || unit.poisonTimer <= 0) continue;

    const dps = unit.poisonDps ?? 0;
    unit.hp -= dps * dt;
    unit.poisonTimer -= dt;

    if (unit.poisonTimer <= 0) {
      unit.poisonTimer = 0;
      unit.poisonDps = 0;
    }
  }
}

/** Update pikeman thrust attacks */
function updatePikemanCombat(state: GameState, dt: number): void {
  // Tick down all cooldowns
  for (const [eid, cd] of pikemanCooldowns) {
    const next = cd - dt;
    if (next <= 0) {
      pikemanCooldowns.delete(eid);
    } else {
      pikemanCooldowns.set(eid, next);
    }
  }

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Pikeman) continue;
    if (unit.hp <= 0) continue;

    // Check cooldown
    if (pikemanCooldowns.has(unit.eid)) continue;

    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;

    // Check for greeds in range
    let hitAny = false;
    for (const greed of state.greeds) {
      if (greed.hp <= 0) continue;
      const greedPos = getPosition(state.world, greed.eid);
      if (!greedPos) continue;

      if (Math.abs(greedPos.x - pos.x) <= PIKE_RANGE) {
        greed.hp -= PIKE_DAMAGE;
        hitAny = true;
      }
    }

    if (hitAny) {
      pikemanCooldowns.set(unit.eid, PIKE_COOLDOWN);
    }
  }
}

/** Update mounted bear combat (monarch on bear instakill) */
function updateBearCombat(state: GameState, dt: number): void {
  if (state.mountType !== MountType.Horse) return; // bear uses Horse slot for now

  // Tick cooldown
  state.bearAttackCooldown = Math.max(0, state.bearAttackCooldown - dt);
  if (state.bearAttackCooldown > 0) return;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  // Find nearest greed in range
  for (const greed of state.greeds) {
    if (greed.hp <= 0) continue;
    const greedPos = getPosition(state.world, greed.eid);
    if (!greedPos) continue;

    if (Math.abs(greedPos.x - monarchPos.x) <= BEAR_ATTACK_RANGE) {
      greed.hp = 0; // instakill
      state.bearAttackCooldown = BEAR_ATTACK_COOLDOWN;
      state.messages.push('Bear mauls a greed!');
      return;
    }
  }
}

function updateProjectiles(state: GameState, dt: number, dmgMultiplier: number): void {
  const deadIndices: number[] = [];

  for (let i = 0; i < state.projectiles.length; i++) {
    const proj = state.projectiles[i];

    // Move the projectile
    proj.x += proj.vx * dt;

    // Age the projectile
    const age = (projectileAges.get(proj.eid) ?? 0) + dt;
    projectileAges.set(proj.eid, age);

    // Lifetime expiry
    if (age >= ARROW_LIFETIME) {
      deadIndices.push(i);
      continue;
    }

    // Camera cull: skip collision checks for far-away projectiles
    if (!isInCullRange(proj.x, state.cameraX, state.viewWidth)) {
      if (proj.x < state.cameraX - CAMERA_CULL_RANGE || proj.x > state.cameraX + state.viewWidth + CAMERA_CULL_RANGE) {
        deadIndices.push(i);
      }
      continue;
    }

    const damageType = proj.damageType ?? DamageType.Normal;

    // Piercing projectiles hit all greeds in a line
    if (damageType === DamageType.Piercing) {
      const range = proj.aoeRadius ?? 20;
      const hits = applyPiercing(state, proj.x, proj.vx, proj.damage * dmgMultiplier, range);
      if (hits > 0) {
        deadIndices.push(i);
      }
      continue;
    }

    // AoE projectiles damage all in radius on first hit
    if (damageType === DamageType.AoE) {
      const radius = proj.aoeRadius ?? 3;
      for (const greed of state.greeds) {
        if (greed.hp <= 0) continue;
        const greedPos = getPosition(state.world, greed.eid);
        if (!greedPos) continue;
        if (Math.abs(proj.x - greedPos.x) < 1.0) {
          applyAoE(state, greedPos.x, proj.damage * dmgMultiplier, radius);
          deadIndices.push(i);
          break;
        }
      }
      continue;
    }

    // Normal collision check (including burn on contact)
    let hit = false;
    for (const greed of state.greeds) {
      if (greed.hp <= 0) continue;

      const greedPos = getPosition(state.world, greed.eid);
      if (!greedPos) continue;

      if (!isInCullRange(greedPos.x, state.cameraX, state.viewWidth)) continue;

      const dist = Math.abs(proj.x - greedPos.x);
      if (dist < 1.0) {
        const fromTower = isFromTower(state, proj.owner);

        const isCrit = Math.random() < CRIT_CHANCE;
        const critMult = isCrit ? CRIT_MULTIPLIER : 1;

        const rawDmg = proj.damage * dmgMultiplier * critMult;
        const armorDmg = calculateArrowDamage(rawDmg, greed.type, fromTower);
        const comboBonus = recordComboHit(greed.eid, state.totalElapsed);

        // onGreedDamaged handles mask absorption; returns 0 if mask absorbed
        const maskMult = onGreedDamaged(state, greed, proj.vx, fromTower);
        const totalDmg = (armorDmg + comboBonus) * maskMult;

        greed.hp -= totalDmg;

        // Apply burn if this is a burn projectile
        if (damageType === DamageType.Burn && proj.burnDps && proj.burnDuration) {
          applyBurn(greed, proj.burnDps, proj.burnDuration);
        }

        applyKnockback(state, greed.eid, proj.vx);

        hit = true;
        break;
      }
    }

    if (hit) {
      deadIndices.push(i);
      continue;
    }

    // Remove projectiles far off-screen
    if (proj.x < state.cameraX - CAMERA_CULL_RANGE || proj.x > state.cameraX + state.viewWidth + CAMERA_CULL_RANGE) {
      deadIndices.push(i);
    }
  }

  // Remove dead projectiles in reverse order
  for (let i = deadIndices.length - 1; i >= 0; i--) {
    const idx = deadIndices[i];
    const proj = state.projectiles[idx];
    projectileAges.delete(proj.eid);
    removeEntity(state.world, proj.eid);
    state.projectiles.splice(idx, 1);
  }
}

/** Monarch picks up dropped coins by walking over them */
function updateMonarchCoinPickup(state: GameState): void {
  if (droppedCoins.length === 0) return;

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  for (let i = droppedCoins.length - 1; i >= 0; i--) {
    const coin = droppedCoins[i];
    const dist = Math.abs(coin.x - monarchPos.x);
    if (dist < COIN_PICKUP_RANGE) {
      if (state.monarchCoins < MAX_COINS) {
        state.monarchCoins += 1;
      }
      droppedCoins.splice(i, 1);
    }
  }
}

/** Remove dead greeds and drop coins at their death positions */
function cleanupDeadGreeds(state: GameState): void {
  for (let i = state.greeds.length - 1; i >= 0; i--) {
    const greed = state.greeds[i];
    if (greed.hp > 0) continue;

    const deathPos = getPosition(state.world, greed.eid);

    // Drop coins at death
    if (deathPos) {
      droppedCoins.push({ x: deathPos.x, y: GROUND_Y - 1 });
    }

    if (greed.carryingCoins > 0 && deathPos) {
      for (let c = 0; c < greed.carryingCoins; c++) {
        droppedCoins.push({
          x: deathPos.x + (Math.random() - 0.5) * 2,
          y: GROUND_Y - 1,
        });
      }
    }

    // PlagueCrawler: poison nearby units on death
    if (greed.type === GreedType.PlagueCrawler && greed.poisonOnDeath && deathPos) {
      applyPlagueCrawlerDeathPoison(state, deathPos.x);
    }

    // Floater: drop carried unit at current position (alive)
    if (greed.type === GreedType.Floater && greed.isCarrying && greed.floaterTarget != null) {
      greed.floaterTarget = null;
      greed.isCarrying = false;
    }

    // Crown stealer: drop crown if carrying
    if (greed.type === GreedType.CrownStealer && greed.hasCrown && deathPos) {
      state.crownDropped = true;
      state.crownX = deathPos.x;
      state.crownY = GROUND_Y - 1;
      state.messages.push('Crown dropped! Recover it quickly!');
    }

    greedHitLog.delete(greed.eid);

    cleanupGreedState(greed.eid);
    removeEntity(state.world, greed.eid);
    state.greeds.splice(i, 1);
  }
}
