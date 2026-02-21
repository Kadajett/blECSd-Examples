/**
 * Builder entity - constructs and repairs structures.
 * Auto-builds walls when enemies approach outer walls.
 * Panic-builds emergency barricades at night when greed breach defenses.
 * Repairs damaged walls before building new structures.
 * Expands walls outward during peaceful day periods (if coins > 15).
 * Craftsman-origin builders work 1.5x faster.
 */
import { getPosition, setVelocity } from 'blecsd/components';
import {
  type GameState,
  type UnitData,
  type StructureData,
  AIState,
  TimeOfDay,
  TileType,
  StructureType,
  BUILDER_SPEED,
  CAMP_CENTER_X,
  GROUND_Y,
  MAP_WIDTH,
  clamp,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';
import { getRecruitBonus, NpcOrigin } from './villager';
import { placeWallBlueprint } from '../game/economy';

const BASE_BUILD_RATE = 1.5;
const CRAFTSMAN_MULTIPLIER = 1.5;
const ENEMY_DETECT_RANGE = 20;
const AUTO_EXPAND_COIN_THRESHOLD = 15;
const WALL_EXPAND_DISTANCE = 3;
const AUTO_EXPAND_COOLDOWN = 30; // seconds between auto-expansions
const TREE_CHOP_TIME = 3; // seconds to chop a tree
const TREE_CHOP_REWARD = 1;

let lastAutoExpandTime = 0;
const chopTimers = new Map<number, number>(); // keyed by builder eid

export function getBuildRate(eid: number): number {
  const bonus = getRecruitBonus(eid);
  return bonus === NpcOrigin.Craftsman
    ? BASE_BUILD_RATE * CRAFTSMAN_MULTIPLIER
    : BASE_BUILD_RATE;
}

export function updateBuilder(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updateBuilderDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
      updateBuilderDusk(state, unit, pos, dt);
      break;
    case TimeOfDay.Night:
      updateBuilderNight(state, unit, pos, dt);
      break;
  }
}

function updateBuilderDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Auto-place defensive wall if enemies approach outer walls
  checkAutoDefensiveWall(state);

  // During peaceful day with enough coins, expand walls outward
  if (!hasNearbyEnemies(state) && state.monarchCoins > AUTO_EXPAND_COIN_THRESHOLD) {
    tryExpandWalls(state);
  }

  // Find build target: damaged walls first, then unfinished structures
  const target = findBuildTarget(state, pos.x);

  if (!target) {
    // Lowest priority: cut trees outside wall perimeter
    if (tryTreeCutting(state, unit, pos, dt)) return;

    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  // Clear chop timer if switching to build task
  chopTimers.delete(unit.eid);

  const dist = distance(pos.x, target.x);

  if (dist < 1.0) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);
  } else {
    unit.aiState = AIState.MovingTo;
    unit.targetX = target.x;
    const dir = target.x > pos.x ? 1 : -1;
    const vx = dir * BUILDER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
  }
}

function updateBuilderDusk(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  unit.aiState = AIState.Retreating;

  const retreatX = findRetreatPosition(state, pos.x);
  const dist = distance(pos.x, retreatX);

  if (dist < 1.0) {
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dir = retreatX > pos.x ? 1 : -1;
  const vx = dir * BUILDER_SPEED;
  setVelocity(state.world, unit.eid, vx, 0);
}

function updateBuilderNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Night panic-build: if greed approaching with no wall between them and camp
  if (tryPanicBuild(state, unit, pos, dt)) return;

  // Otherwise hide behind nearest wall
  const retreatX = findRetreatPosition(state, pos.x);
  const dist = distance(pos.x, retreatX);

  if (dist > 2) {
    unit.aiState = AIState.MovingTo;
    unit.targetX = retreatX;
    const dir = retreatX > pos.x ? 1 : -1;
    const vx = dir * BUILDER_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
    return;
  }

  // If near a damaged wall, set Working state (construction system handles HP)
  const nearbyDamaged = findNearbyDamagedWall(state, pos.x, 3);
  if (nearbyDamaged) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  unit.aiState = AIState.Idle;
  setVelocity(state.world, unit.eid, 0, 0);
}

/**
 * During night, if greed are approaching and there's no wall between them
 * and the camp, place and rush-build an emergency barricade.
 */
function tryPanicBuild(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): boolean {
  const onRight = pos.x >= CAMP_CENTER_X;
  let closestGreedX: number | undefined;
  let closestGreedDist = Infinity;

  for (const greed of state.greeds) {
    const gPos = getPosition(state.world, greed.eid);
    if (!gPos) continue;
    const greedOnRight = gPos.x >= CAMP_CENTER_X;
    if (greedOnRight !== onRight) continue;
    const d = distance(pos.x, gPos.x);
    if (d < closestGreedDist) {
      closestGreedDist = d;
      closestGreedX = gPos.x;
    }
  }

  if (closestGreedX === undefined || closestGreedDist > 30) return false;

  // Check if there's a wall between the greed and camp
  if (hasWallBetween(state, closestGreedX, CAMP_CENTER_X)) return false;

  // No wall! Emergency: place a barricade between greed and camp
  const barricadeX = Math.round(onRight
    ? Math.min(closestGreedX - 3, pos.x)
    : Math.max(closestGreedX + 3, pos.x));

  if (placeWallBlueprint(state, barricadeX)) {
    state.messages.push('Emergency barricade placed!');
  }

  // Rush to build the nearest unfinished structure
  const target = findNearestUnfinished(state, pos.x);
  if (!target) return false;

  const dist = distance(pos.x, target.x);

  if (dist < 1.0) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);
    return true;
  }

  unit.aiState = AIState.MovingTo;
  unit.targetX = target.x;
  const dir = target.x > pos.x ? 1 : -1;
  const vx = dir * (BUILDER_SPEED * 1.5); // Run faster in panic
  setVelocity(state.world, unit.eid, vx, 0);
  return true;
}

/** Auto-place defensive wall if enemies approach outer walls. */
function checkAutoDefensiveWall(state: GameState): void {
  const outerLeft = findOutermostWallX(state, false);
  const outerRight = findOutermostWallX(state, true);

  for (const greed of state.greeds) {
    const gPos = getPosition(state.world, greed.eid);
    if (!gPos) continue;

    if (outerLeft !== undefined
      && gPos.x < outerLeft
      && distance(gPos.x, outerLeft) < ENEMY_DETECT_RANGE
    ) {
      const newWallX = outerLeft - WALL_EXPAND_DISTANCE;
      if (newWallX > 0 && placeWallBlueprint(state, newWallX)) {
        state.messages.push('Defensive wall placed!');
        return;
      }
    }

    if (outerRight !== undefined
      && gPos.x > outerRight
      && distance(gPos.x, outerRight) < ENEMY_DETECT_RANGE
    ) {
      const newWallX = outerRight + WALL_EXPAND_DISTANCE;
      if (newWallX < MAP_WIDTH && placeWallBlueprint(state, newWallX)) {
        state.messages.push('Defensive wall placed!');
        return;
      }
    }
  }
}

/** During peaceful day with coins > threshold, expand walls outward. */
function tryExpandWalls(state: GameState): void {
  if (state.totalElapsed - lastAutoExpandTime < AUTO_EXPAND_COOLDOWN) return;

  const outerLeft = findOutermostWallX(state, false);
  const outerRight = findOutermostWallX(state, true);

  // Only expand if walls exist on both sides
  if (outerLeft === undefined || outerRight === undefined) return;

  // Don't expand if there are already unfinished blueprints
  if (countUnfinishedBlueprints(state) >= 2) return;

  const expandLeft = outerLeft - WALL_EXPAND_DISTANCE;
  if (expandLeft > 10 && placeWallBlueprint(state, expandLeft)) {
    state.messages.push('Expanding defenses outward');
    lastAutoExpandTime = state.totalElapsed;
    return;
  }

  const expandRight = outerRight + WALL_EXPAND_DISTANCE;
  if (expandRight < MAP_WIDTH - 10 && placeWallBlueprint(state, expandRight)) {
    state.messages.push('Expanding defenses outward');
    lastAutoExpandTime = state.totalElapsed;
  }
}

function hasNearbyEnemies(state: GameState): boolean {
  for (const greed of state.greeds) {
    const gPos = getPosition(state.world, greed.eid);
    if (!gPos) continue;
    if (distance(gPos.x, CAMP_CENTER_X) < MAP_WIDTH * 0.4) return true;
  }
  return false;
}

function hasWallBetween(state: GameState, x1: number, x2: number): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;
    if (struct.x > minX && struct.x < maxX) return true;
  }
  return false;
}

function countUnfinishedBlueprints(state: GameState): number {
  let count = 0;
  for (const [, struct] of state.structures) {
    if (struct.hp === 0 && struct.type !== StructureType.Portal) count++;
  }
  return count;
}

// ─── Builder Priority System ──────────────────────────────────────

export enum BuilderTaskType {
  RepairTownCenter = 0,
  RepairWall = 1,
  BuildQueued = 2,
  UpgradeTownCenter = 3,
  UpgradeTower = 4,
  UpgradeFarm = 5,
  RestoreBoat = 6,
  OperateCatapult = 7,
  PushBomb = 8,
  CutTree = 9,
  IdleAtWall = 10,
}

/** Get the numeric priority for a builder task type (lower = higher priority). */
export function getBuilderPriority(taskType: BuilderTaskType): number {
  return taskType;
}

// Track how many builders are assigned to each structure x
const builderAssignments = new Map<number, number>(); // structureX -> count
const MAX_BUILDERS_PER_TASK = 2;

function canAssignBuilder(structX: number): boolean {
  return (builderAssignments.get(structX) ?? 0) < MAX_BUILDERS_PER_TASK;
}

function assignBuilderToTask(structX: number): void {
  builderAssignments.set(structX, (builderAssignments.get(structX) ?? 0) + 1);
}

/** Reset builder assignments each frame (recalculated). */
export function resetBuilderAssignments(): void {
  builderAssignments.clear();
}

/**
 * Find the best builder task using full priority list.
 * Priority: repair TC > repair walls (lowest HP) > build queued > upgrades > boat > trees > idle.
 */
export function findBestBuilderTask(state: GameState, builderX: number): StructureData | undefined {
  // Priority 1: Repair town center
  const tc = findTownCenter(state);
  if (tc && tc.hp > 0 && tc.hp < tc.maxHp && canAssignBuilder(tc.x)) {
    assignBuilderToTask(tc.x);
    return tc;
  }

  // Priority 2: Repair damaged walls (lowest HP first)
  const damagedWall = findLowestHpDamagedWall(state, builderX);
  if (damagedWall && canAssignBuilder(damagedWall.x)) {
    assignBuilderToTask(damagedWall.x);
    return damagedWall;
  }

  // Priority 3: Build queued structures (unfinished, hp=0)
  const queued = findNearestQueued(state, builderX);
  if (queued && canAssignBuilder(queued.x)) {
    assignBuilderToTask(queued.x);
    return queued;
  }

  // Priority 4-6: Upgrade TC, towers, farms (only if coin was dropped at them)
  // These are initiated by dropCoin, not auto-assigned here

  // Priority 7: Restore boat hull pieces
  if (state.boatState === 'restoring') {
    const ship = findShip(state);
    if (ship && ship.hp < ship.maxHp && canAssignBuilder(ship.x)) {
      assignBuilderToTask(ship.x);
      return ship;
    }
  }

  // Priority 8-9: Catapult and bomb are handled by other systems

  return undefined; // No structure task; caller falls through to tree cutting / idle
}

function findTownCenter(state: GameState): StructureData | undefined {
  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Campfire) return struct;
  }
  return undefined;
}

function findLowestHpDamagedWall(state: GameState, fromX: number): StructureData | undefined {
  let best: StructureData | undefined;
  let bestHpRatio = Infinity;
  let bestDist = Infinity;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0 || struct.hp >= struct.maxHp) continue;

    const hpRatio = struct.hp / struct.maxHp;
    const d = distance(fromX, struct.x);

    // Lowest HP ratio first, then nearest
    if (hpRatio < bestHpRatio || (hpRatio === bestHpRatio && d < bestDist)) {
      bestHpRatio = hpRatio;
      bestDist = d;
      best = struct;
    }
  }

  return best;
}

function findNearestQueued(state: GameState, fromX: number): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Portal) continue;
    if (struct.hp !== 0) continue; // only unfinished (hp=0)

    const d = distance(fromX, struct.x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findShip(state: GameState): StructureData | undefined {
  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Ship) return struct;
  }
  return undefined;
}

/**
 * Legacy find: used as fallback by existing code paths.
 */
function findBuildTarget(state: GameState, fromX: number): StructureData | undefined {
  return findBestBuilderTask(state, fromX);
}

function findNearestUnfinished(state: GameState, fromX: number): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Portal) continue;
    if (struct.hp >= struct.maxHp) continue;
    const d = distance(fromX, struct.x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findNearbyDamagedWall(
  state: GameState,
  fromX: number,
  maxDist: number,
): StructureData | undefined {
  let nearest: StructureData | undefined;
  let nearestDist = Infinity;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0 || struct.hp >= struct.maxHp) continue;
    const d = distance(fromX, struct.x);
    if (d <= maxDist && d < nearestDist) {
      nearestDist = d;
      nearest = struct;
    }
  }

  return nearest;
}

function findOutermostWallX(state: GameState, rightSide: boolean): number | undefined {
  let outermost: number | undefined;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== rightSide) continue;

    if (outermost === undefined) {
      outermost = struct.x;
    } else if (rightSide && struct.x > outermost) {
      outermost = struct.x;
    } else if (!rightSide && struct.x < outermost) {
      outermost = struct.x;
    }
  }

  return outermost;
}

function findRetreatPosition(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  let bestWallX = CAMP_CENTER_X;
  let bestDist = Infinity;
  const towardsCamp = onRightSide ? -1 : 1;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== onRightSide) continue;

    const d = distance(fromX, struct.x);
    if (d < bestDist) {
      bestDist = d;
      bestWallX = struct.x + towardsCamp * 2;
    }
  }

  return clamp(bestWallX, 0, MAP_WIDTH - 1);
}

function structureName(type: StructureType): string {
  switch (type) {
    case StructureType.WallWood: return 'Wood wall';
    case StructureType.WallStone: return 'Stone wall';
    case StructureType.WallIron: return 'Iron wall';
    case StructureType.Farm: return 'Farm';
    case StructureType.FarmIrrigated: return 'Irrigated farm';
    case StructureType.FarmWindmill: return 'Windmill farm';
    case StructureType.BowStand: return 'Bow stand';
    case StructureType.HammerStand: return 'Hammer stand';
    case StructureType.Shrine: return 'Shrine';
    default: return 'Structure';
  }
}

// ─── Tree Cutting ────────────────────────────────────────────────

/**
 * Find nearest tree outside current wall perimeter on the builder's side.
 * Only looks at tiles at GROUND_Y (tree base row).
 */
export function findNearestTree(state: GameState, builderX: number): number | undefined {
  const onRight = builderX >= CAMP_CENTER_X;
  const outerWallX = findOutermostWallX(state, onRight);

  // Only cut trees beyond the outermost wall
  const searchStart = outerWallX !== undefined
    ? (onRight ? outerWallX + 1 : 0)
    : (onRight ? CAMP_CENTER_X : 0);
  const searchEnd = outerWallX !== undefined
    ? (onRight ? MAP_WIDTH : outerWallX - 1)
    : (onRight ? MAP_WIDTH : CAMP_CENTER_X);

  let nearest: number | undefined;
  let nearestDist = Infinity;

  const row = state.tiles[GROUND_Y];
  if (!row) return undefined;

  for (let x = Math.floor(searchStart); x < Math.ceil(searchEnd); x++) {
    if (x < 0 || x >= MAP_WIDTH) continue;
    if (row[x] !== TileType.Forest) continue;

    const d = distance(builderX, x);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = x;
    }
  }

  return nearest;
}

/**
 * Cut a tree at the given position. Changes tile to ClearedLand.
 * Returns 1 coin.
 */
export function cutTree(state: GameState, treeX: number): void {
  const row = state.tiles[GROUND_Y];
  if (!row) return;
  if (treeX < 0 || treeX >= MAP_WIDTH) return;

  row[treeX] = TileType.ClearedLand;
  collectCoins(state, TREE_CHOP_REWARD);
  state.messages.push(`Tree cleared (+${TREE_CHOP_REWARD} coin)`);
}

/**
 * Attempt tree cutting as lowest-priority daytime task.
 * Returns true if the builder is engaged in tree cutting.
 */
function tryTreeCutting(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): boolean {
  const treeX = findNearestTree(state, pos.x);
  if (treeX === undefined) return false;

  const dist = distance(pos.x, treeX);

  if (dist < 1.5) {
    unit.aiState = AIState.Working;
    setVelocity(state.world, unit.eid, 0, 0);

    const timer = (chopTimers.get(unit.eid) ?? 0) + dt;
    if (timer >= TREE_CHOP_TIME) {
      cutTree(state, treeX);
      chopTimers.set(unit.eid, 0);
    } else {
      chopTimers.set(unit.eid, timer);
    }
    return true;
  }

  // Walk to tree
  unit.aiState = AIState.MovingTo;
  unit.targetX = treeX;
  const dir = treeX > pos.x ? 1 : -1;
  setVelocity(state.world, unit.eid, dir * BUILDER_SPEED, 0);
  return true;
}
