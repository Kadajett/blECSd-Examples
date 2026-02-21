/**
 * AI system - dispatches unit updates based on role and handles global state transitions.
 * Integrates animal system, dog companion, manages dusk retreat, night positioning,
 * panic state when walls on one side are all destroyed,
 * emergency wall building when dusk arrives with no defenses,
 * crown defense (knights rush to dropped crown),
 * and dog bark alertness bonus for archers.
 */
import { getPosition } from 'blecsd/components';
import {
  type GameState,
  UnitRole,
  AIState,
  TimeOfDay,
  GreedType,
  StructureType,
  WeatherType,
  CAMP_CENTER_X,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';
import { updateMonarch } from '../entities/monarch';
import { updateVagrant, tickVagrantSpawns, updateVagrantSpawning } from '../entities/villager';
import { updateBuilder, resetBuilderAssignments } from '../entities/builder';
import { updateArcher, fillTowerSlots, repositionNightArchers } from '../entities/archer';
import { updateFarmer } from '../entities/farmer';
import { updateKnight, updateSquire, updateAssault, regenerateKnightShields } from '../entities/knight';
import { updatePikeman } from '../entities/pikeman';
import { updateAnimals, updateDenSpawning } from '../entities/animals';
import { updateBanker } from '../entities/banker';
import { updateMerchant } from '../entities/merchant';
import { updateDog, isDogBarking, getDogBarkDirection, getDogX } from '../entities/dog';
import { updateHermits } from '../entities/hermit';
import { updateStatueBlessings } from '../entities/statue';
import { updateMount, updateMountAbility, triggerMountPanic } from '../entities/mount';
import { placeWallBlueprint, applyDawnBonus, updateBread, updateDroppedTools } from '../game/economy';
import { applyBankerInterest } from '../entities/banker';

let previousTimeOfDay: TimeOfDay | null = null;

// Dog bark archer range bonus
const DOG_BARK_RANGE_BONUS = 2;

export function updateAI(state: GameState, dt: number): void {
  // Apply weather slowdown
  const effectiveDt = state.weather === WeatherType.Rain ? dt * 0.9 : dt;

  // Handle global state transitions when time of day changes
  if (previousTimeOfDay !== null && previousTimeOfDay !== state.timeOfDay) {
    onTimeOfDayChanged(state, previousTimeOfDay, state.timeOfDay);
  }
  previousTimeOfDay = state.timeOfDay;

  // Reset per-frame builder assignments
  resetBuilderAssignments();

  // 1. Update monarch first (player input, crown recovery)
  updateMonarch(state, effectiveDt);

  // 2. Update mount (stamina, ability cooldown, panic)
  updateMount(state, effectiveDt);
  updateMountAbility(state, effectiveDt);

  // Mount fear: check for breeder greed nearby
  checkMountFearTriggers(state);

  // 3. Update dog companion
  if (state.hasDog) {
    updateDog(state, effectiveDt);
  }

  // Update non-unit systems
  updateAnimals(state, effectiveDt);
  updateDenSpawning(state, effectiveDt);
  updateBanker(state, effectiveDt);
  updateMerchant(state, effectiveDt);
  updateHermits(state, effectiveDt);
  updateStatueBlessings(effectiveDt);
  updateBread(effectiveDt);
  updateDroppedTools(effectiveDt);

  // Vagrant camp spawning
  updateVagrantSpawning(state, effectiveDt);
  tickVagrantSpawns(state, effectiveDt);

  // Portal assault
  if (state.portalAssaultActive) {
    updateAssault(state, effectiveDt);
  }

  // Periodically fill tower slots with archers
  fillTowerSlots(state);

  // Night: reposition archers evenly
  if (state.timeOfDay === TimeOfDay.Night) {
    repositionNightArchers(state);
  }

  // Check for panic state
  checkPanicState(state);

  // Crown defense handled by knight module's getKnightMode now

  // 4-11. Update all units in priority order
  for (const unit of state.units) {
    switch (unit.role) {
      case UnitRole.Archer:
        updateArcher(state, unit, effectiveDt);
        break;
      case UnitRole.Builder:
        updateBuilder(state, unit, effectiveDt);
        break;
      case UnitRole.Farmer:
        updateFarmer(state, unit, effectiveDt);
        break;
      case UnitRole.Knight:
        updateKnight(state, unit, effectiveDt);
        break;
      case UnitRole.Squire:
        updateSquire(state, unit, effectiveDt);
        break;
      case UnitRole.Pikeman:
        updatePikeman(state, unit, effectiveDt);
        break;
      case UnitRole.Vagrant:
        updateVagrant(state, unit, effectiveDt);
        break;
      default:
        break;
    }
  }
}

/** Check if any breeder greed is near the mount and trigger panic. */
function checkMountFearTriggers(state: GameState): void {
  for (const greed of state.greeds) {
    if (greed.type !== GreedType.Breeder) continue;
    const gPos = getPosition(state.world, greed.eid);
    if (!gPos) continue;
    triggerMountPanic(state, gPos.x);
  }
}

/**
 * Get the dog bark range bonus for archers on the barking side.
 * Returns bonus range if dog is barking toward the archer's side.
 */
export function getDogBarkArcherBonus(archerX: number): number {
  if (!isDogBarking()) return 0;

  const barkDir = getDogBarkDirection();
  const dogPosition = getDogX();
  const archerOnRight = archerX >= dogPosition;

  // Bonus only for archers on the same side as the bark
  if (barkDir === 1 && archerOnRight) return DOG_BARK_RANGE_BONUS;
  if (barkDir === -1 && !archerOnRight) return DOG_BARK_RANGE_BONUS;
  return 0;
}

function onTimeOfDayChanged(
  state: GameState,
  _from: TimeOfDay,
  to: TimeOfDay,
): void {
  if (to === TimeOfDay.Dusk) {
    for (const unit of state.units) {
      if (unit.role === UnitRole.Monarch) continue;
      if (unit.role === UnitRole.Vagrant) continue;

      unit.aiState = AIState.Retreating;

      const pos = getPosition(state.world, unit.eid);
      if (!pos) continue;

      const wallX = findNearestWallOnSide(state, pos.x);
      const towardsCamp = pos.x > CAMP_CENTER_X ? -1 : 1;
      unit.targetX = wallX + towardsCamp * 2;
    }

    // Emergency: if no walls on a side, place emergency wall blueprints
    triggerEmergencyWalls(state);

    state.messages.push('Dusk falls, workers retreat!');
  }

  if (to === TimeOfDay.Night) {
    for (const unit of state.units) {
      if (unit.role === UnitRole.Archer || unit.role === UnitRole.Knight
        || unit.role === UnitRole.Pikeman || unit.role === UnitRole.Squire) {
        const pos = getPosition(state.world, unit.eid);
        if (!pos) continue;
        const wallX = findNearestWallOnSide(state, pos.x);
        unit.targetX = wallX;
        unit.aiState = AIState.MovingTo;
      }
    }
    state.messages.push('Night has come. Defend the kingdom!');
  }

  if (to === TimeOfDay.Dawn) {
    for (const unit of state.units) {
      if (unit.role === UnitRole.Monarch) continue;
      if (unit.role === UnitRole.Vagrant) continue;
      unit.aiState = AIState.Idle;
    }

    // Dawn bonus: drop coins near town center
    applyDawnBonus(state);

    // Banker interest at dawn
    applyBankerInterest(state);

    // Knight shield regeneration at dawn
    regenerateKnightShields(state);

    state.messages.push('A new dawn breaks.');
  }
}

/**
 * Emergency wall placement: when dusk arrives and a side has no walls,
 * place wall blueprints near camp center on the unprotected side(s).
 * Builders will rush to build them.
 */
function triggerEmergencyWalls(state: GameState): void {
  const hasLeft = hasStandingWallOnSide(state, false);
  const hasRight = hasStandingWallOnSide(state, true);

  if (!hasLeft) {
    // Place 2 emergency walls on the left side
    const wall1X = CAMP_CENTER_X - 5;
    const wall2X = CAMP_CENTER_X - 10;
    if (placeWallBlueprint(state, wall1X)) {
      state.messages.push('Emergency wall blueprint placed on left!');
    }
    if (placeWallBlueprint(state, wall2X)) {
      state.messages.push('Emergency wall blueprint placed on left!');
    }
  }

  if (!hasRight) {
    // Place 2 emergency walls on the right side
    const wall1X = CAMP_CENTER_X + 5;
    const wall2X = CAMP_CENTER_X + 10;
    if (placeWallBlueprint(state, wall1X)) {
      state.messages.push('Emergency wall blueprint placed on right!');
    }
    if (placeWallBlueprint(state, wall2X)) {
      state.messages.push('Emergency wall blueprint placed on right!');
    }
  }
}

/**
 * Panic state: if all walls on one side are destroyed,
 * all units on that side flee to the other side.
 */
function checkPanicState(state: GameState): void {
  // Only check during night when walls matter
  if (state.timeOfDay !== TimeOfDay.Night) return;

  const hasLeftWall = hasStandingWallOnSide(state, false);
  const hasRightWall = hasStandingWallOnSide(state, true);

  // If both sides have walls or both sides are gone, no directional panic
  if (hasLeftWall === hasRightWall) return;

  // One side is breached
  const breachedSideIsRight = !hasRightWall;
  const safeSide = breachedSideIsRight ? false : true; // left is safe if right is breached

  for (const unit of state.units) {
    if (unit.role === UnitRole.Monarch) continue;
    if (unit.role === UnitRole.Vagrant) continue;
    if (unit.aiState === AIState.Fleeing) continue; // already panicking

    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;

    // Check if unit is on the breached side
    const unitOnRight = pos.x >= CAMP_CENTER_X;
    if (unitOnRight === breachedSideIsRight) {
      unit.aiState = AIState.Fleeing;
      // Flee to the safe side's wall or camp center
      const safeWallX = findNearestWallOnSideExplicit(state, safeSide);
      const towardsCamp = breachedSideIsRight ? -1 : 1;
      unit.targetX = clamp(safeWallX + towardsCamp * 3, 0, MAP_WIDTH - 1);
    }
  }
}

function hasStandingWallOnSide(state: GameState, rightSide: boolean): boolean {
  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight === rightSide) return true;
  }
  return false;
}

function findNearestWallOnSide(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  return findNearestWallOnSideExplicit(state, onRightSide);
}

function findNearestWallOnSideExplicit(state: GameState, rightSide: boolean): number {
  let bestX = CAMP_CENTER_X;
  let bestDist = Infinity;
  // Use camp center as reference point for "nearest"
  const refX = rightSide ? CAMP_CENTER_X + 10 : CAMP_CENTER_X - 10;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== rightSide) continue;

    const d = distance(refX, struct.x);
    if (d < bestDist) {
      bestDist = d;
      bestX = struct.x;
    }
  }

  return bestX;
}
