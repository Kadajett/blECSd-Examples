/**
 * Construction system: builders choose closest tasks with priority ordering,
 * auto-protection blueprints, and auto-gate placement.
 *
 * Auto-protection: when the monarch first visits a settlement (within 10 tiles),
 * wall blueprints are placed 15 tiles left and right of the campfire.
 * Builders auto-queue: walls first, then farms.
 *
 * Priority order (Phase 8):
 *   1. Repair town center (critical)
 *   2. Repair damaged walls (structural)
 *   3. Build queued walls/towers (expansion)
 *   4. Upgrade town center (progression)
 *   5. Upgrade towers (improvement)
 *   6. Upgrade farms (economic)
 *   7. Boat restoration (when active)
 *   8. Cut trees (idle work)
 *
 * Max 2 builders per task to prevent overcrowding.
 *
 * Build times: Walls/Gates: 5s, Farms: 8s, Upgrades/other: 10s, Hull pieces: 5s.
 *
 * Town center integration: updateTownCenter runs each frame for cooldown.
 * Catapult builders are skipped (managed by catapult.ts).
 */

import { getPosition } from 'blecsd/components';
import {
  type GameState,
  type StructureData,
  AIState,
  UnitRole,
  StructureType,
  GamePhase,
  TowerTier,
  TownCenterTier,
  TOWER_COSTS,
} from '../types';
import { getActiveBuff, ShrineBuffType } from '../structures/shrine';
import {
  isWallStructure,
  isTowerStructure,
  isGateStructure,
  createWall,
  createGate,
  shouldAutoGate,
  upgradeTower,
  WALL_REPAIR_RATE,
  TOWER_TYPE,
  isConvertedTower,
} from '../structures/wall';
import {
  SETTLEMENT_POSITIONS,
  getNearestSettlement,
} from '../structures/portal';
import { updateTownCenter } from '../structures/townCenter';
import { isCatapultBuilder } from '../structures/catapult';
import { isBombBuilder } from '../structures/bomb';
import { isFarmStructure, getFarmUpgradeCost } from '../structures/farm';
import { isBoatBuilder, getShipX } from '../structures/ship';

/** Per-structure build progress tracked by x position (0-100) */
const buildProgress: Map<number, number> = new Map();

/** Blueprint positions: virtual structures waiting to be built */
const blueprints: Set<number> = new Set();

/** Settlements the monarch has already visited (auto-protection triggered) */
const visitedSettlements: Set<number> = new Set();

/** Distance threshold for "visiting" a settlement */
const VISIT_RADIUS = 10;

/** Wall blueprint offset from settlement campfire */
const DEFENSE_OFFSET = 15;

/** Build times in seconds per structure type */
const BUILD_TIME_WALL = 5.0;
const BUILD_TIME_FARM = 8.0;
const BUILD_TIME_UPGRADE = 10.0;
const BUILD_TIME_HULL_PIECE = 5.0;

/** Max builders per task to prevent overcrowding */
const MAX_BUILDERS_PER_TASK = 2;

/** Builder assignment tracking: task x -> count of builders assigned */
const taskBuilderCount: Map<number, number> = new Map();

enum TaskPriority {
  RepairTownCenter = 0,
  RepairWall = 1,
  BuildBlueprint = 2,
  UpgradeTownCenter = 3,
  UpgradeTower = 4,
  UpgradeFarm = 5,
  BoatRestoration = 6,
  CutTrees = 7,
}

interface BuildTask {
  x: number;
  structure: StructureData | null; // null for blueprints
  priority: TaskPriority;
  distance: number;
  buildTime: number;
  isBlueprint: boolean;
}

/** Get build progress percentage for a structure at position x (0-100) */
export function getBuildProgress(x: number): number {
  return buildProgress.get(x) ?? 0;
}

/** Get all current blueprint positions */
export function getBlueprints(): ReadonlySet<number> {
  return blueprints;
}

/** Add a blueprint at position x */
export function addBlueprint(x: number): void {
  blueprints.add(x);
}

/** Remove a blueprint at position x */
export function removeBlueprint(x: number): void {
  blueprints.delete(x);
  buildProgress.delete(x);
}

/**
 * Analyze the map and create wall blueprints for a settlement.
 * Places walls 15 tiles left and right of the settlement campfire.
 * Auto-gates every 10 tiles.
 */
function planSettlementDefenses(state: GameState, settlementX: number): void {
  const leftStart = settlementX - DEFENSE_OFFSET;
  const rightStart = settlementX + DEFENSE_OFFSET;

  for (const x of [leftStart, rightStart]) {
    // Don't place blueprints where structures already exist
    if (state.structures.has(x)) continue;
    if (blueprints.has(x)) continue;

    blueprints.add(x);
    buildProgress.set(x, 0);
  }
}

/**
 * Check if the monarch is visiting any new settlements.
 * If so, trigger auto-protection blueprint placement.
 */
function checkSettlementVisits(state: GameState): void {
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return;

  for (const sx of SETTLEMENT_POSITIONS) {
    if (visitedSettlements.has(sx)) continue;

    if (Math.abs(monarchPos.x - sx) <= VISIT_RADIUS) {
      visitedSettlements.add(sx);
      planSettlementDefenses(state, sx);
      state.messages.push(`Settlement discovered! Auto-defense blueprints placed.`);
    }
  }
}

/**
 * Complete a blueprint: convert it into a real wall or gate.
 * Auto-gate: if the position is at a gate interval from the nearest
 * settlement, build a gate instead of a wall.
 */
function completeBlueprint(state: GameState, x: number): void {
  blueprints.delete(x);
  buildProgress.delete(x);

  const nearestSettlement = getNearestSettlement(x);

  if (shouldAutoGate(x, nearestSettlement)) {
    createGate(state, x);
  } else {
    createWall(state, x, StructureType.WallWood);
  }
}

/** Process all builder construction work for one frame */
export function updateConstruction(state: GameState, dt: number): void {
  if (state.phase !== GamePhase.Playing) return;

  // Update town center cooldown and destruction check
  updateTownCenter(state, dt);

  // Check for new settlement visits
  checkSettlementVisits(state);

  const buff = getActiveBuff();
  const speedMultiplier = buff?.type === ShrineBuffType.BuilderSpeed ? buff.multiplier : 1;
  const effectiveDt = dt * speedMultiplier;

  // Reset builder counts each frame
  taskBuilderCount.clear();

  for (const unit of state.units) {
    if (unit.role !== UnitRole.Builder) continue;
    if (unit.aiState !== AIState.Working) continue;

    // Skip builders assigned to catapults, bombs, or boat push
    if (isCatapultBuilder(unit.eid)) continue;
    if (isBombBuilder(unit.eid)) continue;
    if (isBoatBuilder(unit.eid)) continue;

    const unitPos = getPosition(state.world, unit.eid);
    if (!unitPos) continue;

    const task = findBestTask(state, unitPos.x);
    if (!task) {
      unit.aiState = AIState.Idle;
      continue;
    }

    const x = task.x;

    // Enforce max builders per task
    const currentCount = taskBuilderCount.get(x) ?? 0;
    if (currentCount >= MAX_BUILDERS_PER_TASK) {
      // Try to find another task (builder will idle if none available)
      unit.aiState = AIState.Idle;
      continue;
    }
    taskBuilderCount.set(x, currentCount + 1);

    // Check if builder is close enough to work
    const dist = Math.abs(unitPos.x - x);
    if (dist > 2) {
      unit.targetX = x;
      continue;
    }

    if ((task.priority === TaskPriority.RepairWall || task.priority === TaskPriority.RepairTownCenter) && task.structure) {
      // Repair: use wall repair rate
      const structure = task.structure;
      structure.hp = Math.min(
        structure.maxHp,
        structure.hp + WALL_REPAIR_RATE * effectiveDt
      );

      const pct = (structure.hp / structure.maxHp) * 100;
      buildProgress.set(x, pct);

      if (structure.hp >= structure.maxHp) {
        buildProgress.delete(x);
        unit.aiState = AIState.Idle;
      }
    } else if (task.priority === TaskPriority.BoatRestoration) {
      // Boat hull piece installation: 5s per piece
      const current = buildProgress.get(x) ?? 0;
      const increment = (effectiveDt / BUILD_TIME_HULL_PIECE) * 100;
      const next = Math.min(100, current + increment);
      buildProgress.set(x, next);

      if (next >= 100) {
        buildProgress.delete(x);
        // Hull piece completion is handled by ship.ts addHullPiece
        unit.aiState = AIState.Idle;
      }
    } else {
      // Blueprint, new construction, or upgrade: advance build timer
      const current = buildProgress.get(x) ?? 0;
      const increment = (effectiveDt / task.buildTime) * 100;
      const next = Math.min(100, current + increment);
      buildProgress.set(x, next);

      if (next >= 100) {
        if (task.isBlueprint) {
          completeBlueprint(state, x);
        } else if (task.priority === TaskPriority.UpgradeTower && task.structure && isTowerStructure(task.structure.type)) {
          buildProgress.delete(x);
          upgradeTower(state, x);
        } else {
          buildProgress.delete(x);
          // Set structure to full HP on build completion
          if (task.structure) {
            task.structure.hp = task.structure.maxHp;
          }
        }
        unit.aiState = AIState.Idle;
      }
    }
  }
}

/** Find the best task for a builder, sorted by priority then distance */
function findBestTask(state: GameState, builderX: number): BuildTask | null {
  const tasks: BuildTask[] = [];

  // Priority 0: Repair town center (critical)
  for (const [, structure] of state.structures) {
    if (structure.type !== StructureType.Campfire) continue;
    // Only repair upgraded campfires (maxHp < 999 means it was upgraded via town center)
    if (structure.maxHp >= 999) continue;
    if (structure.hp >= structure.maxHp || structure.hp <= 0) continue;

    const dist = Math.abs(builderX - structure.x);
    tasks.push({
      x: structure.x,
      structure,
      priority: TaskPriority.RepairTownCenter,
      distance: dist,
      buildTime: BUILD_TIME_WALL,
      isBlueprint: false,
    });
  }

  // Priority 2: Build blueprints (expansion)
  for (const bx of blueprints) {
    const dist = Math.abs(builderX - bx);
    tasks.push({
      x: bx,
      structure: null,
      priority: TaskPriority.BuildBlueprint,
      distance: dist,
      buildTime: BUILD_TIME_WALL,
      isBlueprint: true,
    });
  }

  // Check existing structures
  for (const [, structure] of state.structures) {
    if (structure.type === StructureType.Portal
      || structure.type === StructureType.Campfire) {
      continue;
    }

    const dist = Math.abs(builderX - structure.x);
    const isWall = isWallStructure(structure.type);
    const isTower = isTowerStructure(structure.type);
    const isGate = isGateStructure(structure.type);
    const isFarm = isFarmStructure(structure.type);

    // Priority 1: Repair damaged walls/towers/gates (structural)
    if ((isWall || isTower || isGate) && structure.hp < structure.maxHp && structure.hp > 0) {
      tasks.push({
        x: structure.x,
        structure,
        priority: TaskPriority.RepairWall,
        distance: dist,
        buildTime: BUILD_TIME_WALL,
        isBlueprint: false,
      });
      continue;
    }

    // Priority 2: Structures placed with hp:0 need building (expansion)
    if (structure.hp === 0 && structure.maxHp > 0) {
      const buildTime = getBuildTimeForType(structure.type);
      tasks.push({
        x: structure.x,
        structure,
        priority: TaskPriority.BuildBlueprint,
        distance: dist,
        buildTime,
        isBlueprint: false,
      });
      continue;
    }

    // Priority 4: Tower upgrades (tower with towerTier < max and pending upgrade progress)
    // Skip converted towers (they cannot be further upgraded)
    if (isTower && !isConvertedTower(structure.type) && (structure.towerTier ?? TowerTier.None) < TowerTier.QuadrupletTower) {
      const upgProgress = buildProgress.get(structure.x) ?? 0;
      if (upgProgress > 0 && upgProgress < 100) {
        tasks.push({
          x: structure.x,
          structure,
          priority: TaskPriority.UpgradeTower,
          distance: dist,
          buildTime: BUILD_TIME_UPGRADE,
          isBlueprint: false,
        });
        continue;
      }
    }

    // Priority 5: Farm upgrades (economic)
    if (isFarm && (structure.farmTier ?? 1) < 2) {
      const upgCost = getFarmUpgradeCost(structure.farmTier ?? 1);
      if (upgCost > 0) {
        const upgProgress = buildProgress.get(structure.x) ?? 0;
        if (upgProgress > 0 && upgProgress < 100) {
          tasks.push({
            x: structure.x,
            structure,
            priority: TaskPriority.UpgradeFarm,
            distance: dist,
            buildTime: BUILD_TIME_FARM,
            isBlueprint: false,
          });
          continue;
        }
      }
    }

    // In-progress construction (uses the structure's natural priority)
    const progress = buildProgress.get(structure.x) ?? 0;
    if (progress > 0 && progress < 100) {
      const buildTime = getBuildTimeForType(structure.type);
      tasks.push({
        x: structure.x,
        structure,
        priority: TaskPriority.BuildBlueprint,
        distance: dist,
        buildTime,
        isBlueprint: false,
      });
      continue;
    }
  }

  // Priority 6: Boat restoration (when active)
  if (state.boatState === 'restoring') {
    const boatX = getShipX();
    const dist = Math.abs(builderX - boatX);
    tasks.push({
      x: boatX,
      structure: null,
      priority: TaskPriority.BoatRestoration,
      distance: dist,
      buildTime: BUILD_TIME_HULL_PIECE,
      isBlueprint: false,
    });
  }

  if (tasks.length === 0) return null;

  // Filter out tasks that already have max builders assigned
  const available = tasks.filter(t => {
    const count = taskBuilderCount.get(t.x) ?? 0;
    return count < MAX_BUILDERS_PER_TASK;
  });

  if (available.length === 0) return null;

  // Sort: priority first (lower = better), then distance (closer = better)
  available.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.distance - b.distance;
  });

  return available[0];
}

/**
 * Start a tower upgrade at position x.
 * Called when the monarch drops a coin on a tower.
 * Deducts the cost and sets build progress to trigger builder work.
 */
export function startTowerUpgrade(state: GameState, x: number): boolean {
  const tower = state.structures.get(x);
  if (!tower || !isTowerStructure(tower.type)) return false;
  if ((tower.towerTier ?? TowerTier.None) >= TowerTier.QuadrupletTower) return false;

  const nextTier = (tower.towerTier ?? TowerTier.None) + 1;
  const cost = TOWER_COSTS[nextTier];
  if (cost === undefined || state.monarchCoins < cost) return false;

  // Check town center requirements
  if (nextTier >= TowerTier.StoneTower && state.townCenterTier < TownCenterTier.StoneFort) return false;
  if (nextTier >= TowerTier.RoofedTriplet && state.townCenterTier < TownCenterTier.IronKeep) return false;

  // Set build progress to trigger builder to walk to tower
  buildProgress.set(x, 1);
  return true;
}

/**
 * Get the numeric priority for a task type string.
 * Lower numbers = higher priority.
 * Exported for external systems that need to understand builder priority ordering.
 */
export function getConstructionPriority(taskType: string): number {
  switch (taskType) {
    case 'repairTownCenter': return TaskPriority.RepairTownCenter;
    case 'repairWall': return TaskPriority.RepairWall;
    case 'buildWall':
    case 'buildTower':
    case 'buildBlueprint': return TaskPriority.BuildBlueprint;
    case 'upgradeTownCenter': return TaskPriority.UpgradeTownCenter;
    case 'upgradeTower':
    case 'convertTower': return TaskPriority.UpgradeTower;
    case 'upgradeFarm': return TaskPriority.UpgradeFarm;
    case 'boatRestoration': return TaskPriority.BoatRestoration;
    case 'cutTrees': return TaskPriority.CutTrees;
    default: return TaskPriority.CutTrees;
  }
}

/**
 * Start a farm upgrade at position x.
 * Called when the monarch drops a coin on a farm.
 * Sets build progress to trigger builder work.
 */
export function startFarmUpgrade(state: GameState, x: number): boolean {
  const farm = state.structures.get(x);
  if (!farm || !isFarmStructure(farm.type)) return false;
  if ((farm.farmTier ?? 1) >= 2) return false;

  const cost = getFarmUpgradeCost(farm.farmTier ?? 1);
  if (cost <= 0 || state.monarchCoins < cost) return false;

  // Set build progress to trigger builder to walk to farm
  buildProgress.set(x, 1);
  return true;
}

function getBuildTimeForType(type: StructureType): number {
  if (isWallStructure(type) || isTowerStructure(type) || isGateStructure(type)) return BUILD_TIME_WALL;

  if (isFarmStructure(type)) return BUILD_TIME_FARM;

  switch (type) {
    case StructureType.Ship:
      return BUILD_TIME_HULL_PIECE;
    default:
      return BUILD_TIME_UPGRADE;
  }
}
