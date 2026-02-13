/**
 * Knight and Squire entities.
 * Squire: 4 coins for shield (TownCenterTier >= 6, Castle). 3 HP, 5 coin cap.
 *   Commands up to 4 archers. Can do everything knights do but weaker.
 * Knight: promoted from Squire with iron sword (12 coins at forge, future phase).
 *   5 HP, 11 coin cap. Enhanced combat.
 * Both lead squads of archers toward portals and can damage them.
 */
import { addEntity, getPosition, setPosition, setVelocity } from 'blecsd';
import {
  type GameState,
  type UnitData,
  UnitRole,
  AIState,
  TimeOfDay,
  StructureType,
  ARCHER_SPEED,
  CAMP_CENTER_X,
  MAP_WIDTH,
  GROUND_Y,
  clamp,
  distance,
} from '../types';

const KNIGHT_SPEED = ARCHER_SPEED + 1;
const SQUIRE_SPEED = ARCHER_SPEED;
const PORTAL_ATTACK_COOLDOWN = 2.0;
const PORTAL_ATTACK_DAMAGE = 2;
const SQUIRE_PORTAL_ATTACK_DAMAGE = 1;
const SQUAD_SIZE = 2;
const SQUIRE_SQUAD_SIZE = 4;
const PORTAL_GUARD_RANGE = 15;
const KNIGHT_SHIELD_MAX = 3;
const CROWN_DEFENSE_ATTACK_RANGE = 5;

// ─── Knight Mode & Shield ────────────────────────────────────────
export type KnightMode = 'defensive' | 'offensive' | 'crownDefense';

// Per-knight shield HP (regenerates 1 per day at dawn)
const knightShields = new Map<number, number>();

/** Get the current mode for a knight. */
export function getKnightMode(state: GameState, knightEid: number): KnightMode {
  if (state.crownDropped) return 'crownDefense';
  if (activeAssault?.active && activeAssault.knightEid === knightEid) return 'offensive';
  return 'defensive';
}

/** Get knight shield HP. */
export function getKnightShieldHp(knightEid: number): number {
  return knightShields.get(knightEid) ?? KNIGHT_SHIELD_MAX;
}

/** Initialize shield for a new knight. */
function initKnightShield(knightEid: number): void {
  if (!knightShields.has(knightEid)) {
    knightShields.set(knightEid, KNIGHT_SHIELD_MAX);
  }
}

/** Take a hit on the knight's personal shield. Returns true if absorbed. */
export function absorbKnightShieldHit(knightEid: number): boolean {
  const hp = knightShields.get(knightEid) ?? 0;
  if (hp <= 0) return false;
  knightShields.set(knightEid, hp - 1);
  return true;
}

/** Regenerate 1 shield HP for all knights at dawn. */
export function regenerateKnightShields(state: GameState): void {
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Knight) continue;
    const current = knightShields.get(unit.eid) ?? 0;
    if (current < KNIGHT_SHIELD_MAX) {
      knightShields.set(unit.eid, current + 1);
    }
  }
}

export function createKnight(state: GameState, x: number): UnitData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  const unit: UnitData = {
    eid,
    role: UnitRole.Knight,
    aiState: AIState.Idle,
    targetX: x,
    hp: 5,
    maxHp: 5,
    attackCooldown: 0,
    coins: 0,
  };

  state.units.push(unit);
  initKnightShield(unit.eid);
  return unit;
}

export function updateKnight(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  if (unit.attackCooldown > 0) {
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
  }

  // Crown defense overrides all other modes
  const mode = getKnightMode(state, unit.eid);
  if (mode === 'crownDefense') {
    updateKnightCrownDefense(state, unit, pos, dt);
    return;
  }

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updateKnightDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
      updateKnightDusk(state, unit, pos, dt);
      break;
    case TimeOfDay.Night:
      updateKnightNight(state, unit, pos, dt);
      break;
  }
}

/**
 * Crown defense: rush to crown, attack greed within 5 tiles of crown.
 */
function updateKnightCrownDefense(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  const crownDist = distance(pos.x, state.crownX);

  if (crownDist > 3.0) {
    // Rush to crown
    unit.aiState = AIState.MovingTo;
    unit.targetX = state.crownX;
    const dir = state.crownX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * KNIGHT_SPEED * 1.5, 0);
    return;
  }

  // At crown position: attack any greed within range
  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);

  if (unit.attackCooldown > 0) return;

  for (const greed of state.greeds) {
    const gPos = getPosition(state.world, greed.eid);
    if (!gPos) continue;
    if (distance(state.crownX, gPos.x) <= CROWN_DEFENSE_ATTACK_RANGE) {
      greed.hp -= PORTAL_ATTACK_DAMAGE;
      unit.attackCooldown = PORTAL_ATTACK_COOLDOWN;
      return;
    }
  }
}

function updateKnightDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  // Prioritize unguarded portals, then any portal
  const portalX = findBestPortalTarget(state, pos.x);

  if (portalX === undefined) {
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  unit.aiState = AIState.Attacking;
  const dist = distance(pos.x, portalX);

  if (dist < 2.0) {
    setVelocity(state.world, unit.eid, 0, 0);

    if (unit.attackCooldown <= 0) {
      attackPortal(state, portalX);
      unit.attackCooldown = PORTAL_ATTACK_COOLDOWN;
    }
  } else {
    unit.targetX = portalX;
    const dir = portalX > pos.x ? 1 : -1;
    const vx = dir * KNIGHT_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
  }

  // Rally nearby archers
  rallySquad(state, unit, pos.x);
}

function updateKnightDusk(
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
  const vx = dir * KNIGHT_SPEED;
  setVelocity(state.world, unit.eid, vx, 0);
}

function updateKnightNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  dt: number,
): void {
  const wallX = findOutermostWallOnSide(state, pos.x);
  const dist = distance(pos.x, wallX);

  if (dist > 1.0) {
    unit.aiState = AIState.MovingTo;
    const dir = wallX > pos.x ? 1 : -1;
    const vx = dir * KNIGHT_SPEED;
    setVelocity(state.world, unit.eid, vx, 0);
    return;
  }

  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);
}

/** Prefer unguarded portals over guarded ones. */
function findBestPortalTarget(state: GameState, fromX: number): number | undefined {
  let bestUnguarded: number | undefined;
  let bestUnguardedDist = Infinity;
  let bestAny: number | undefined;
  let bestAnyDist = Infinity;

  const portalXs = collectPortalPositions(state);

  for (const px of portalXs) {
    const d = distance(fromX, px);
    const guarded = isPortalGuarded(state, px);

    if (!guarded && d < bestUnguardedDist) {
      bestUnguardedDist = d;
      bestUnguarded = px;
    }
    if (d < bestAnyDist) {
      bestAnyDist = d;
      bestAny = px;
    }
  }

  return bestUnguarded ?? bestAny;
}

function collectPortalPositions(state: GameState): number[] {
  const positions: number[] = [];

  for (const [, struct] of state.structures) {
    if (struct.type === StructureType.Portal && struct.hp > 0) {
      positions.push(struct.x);
    }
  }

  for (const px of state.portalPositions) {
    if (!positions.includes(px)) positions.push(px);
  }

  return positions;
}

function isPortalGuarded(state: GameState, portalX: number): boolean {
  for (const greed of state.greeds) {
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (distance(portalX, pos.x) <= PORTAL_GUARD_RANGE) return true;
  }
  return false;
}

function attackPortal(state: GameState, portalX: number): void {
  const roundedX = Math.round(portalX);
  for (const [key, struct] of state.structures) {
    if (struct.type !== StructureType.Portal) continue;
    if (distance(struct.x, roundedX) > 2) continue;

    struct.hp = Math.max(0, struct.hp - PORTAL_ATTACK_DAMAGE);
    if (struct.hp <= 0) {
      state.messages.push('Portal destroyed!');
      state.structures.delete(key);
      const idx = state.portalPositions.indexOf(struct.x);
      if (idx >= 0) state.portalPositions.splice(idx, 1);
    } else {
      state.messages.push('Knight attacks portal');
    }
    return;
  }
}

function rallySquad(state: GameState, knight: UnitData, knightX: number): void {
  let rallied = 0;
  const rallyRange = 20;

  for (const unit of state.units) {
    if (rallied >= SQUAD_SIZE) break;
    if (unit.role !== UnitRole.Archer) continue;
    if (unit.aiState === AIState.Retreating || unit.aiState === AIState.Defending) continue;

    const archerPos = getPosition(state.world, unit.eid);
    if (!archerPos) continue;

    const d = distance(knightX, archerPos.x);
    if (d <= rallyRange) {
      unit.targetX = knight.targetX;
      unit.aiState = AIState.Attacking;
      rallied++;
    }
  }
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

function findOutermostWallOnSide(state: GameState, fromX: number): number {
  const onRightSide = fromX >= CAMP_CENTER_X;
  let outermostX = CAMP_CENTER_X;

  for (const [, struct] of state.structures) {
    const isWall = struct.type === StructureType.WallWood
      || struct.type === StructureType.WallStone
      || struct.type === StructureType.WallIron;
    if (!isWall) continue;
    if (struct.hp <= 0) continue;

    const wallOnRight = struct.x >= CAMP_CENTER_X;
    if (wallOnRight !== onRightSide) continue;

    if (onRightSide) {
      if (struct.x > outermostX) outermostX = struct.x;
    } else {
      if (struct.x < outermostX) outermostX = struct.x;
    }
  }

  return outermostX;
}

// ─── Portal Assault ──────────────────────────────────────────────

export interface AssaultSquad {
  knightEid: number;
  archerEids: number[];
  targetPortalX: number;
  active: boolean;
  knightShieldHp: number;
}

const ASSAULT_SQUAD_SIZE = 4;
const ASSAULT_FORMATION_SPACING = 2;
const KNIGHT_SHIELD_HP = 3;
const ASSAULT_PORTAL_DPS = 2;

let activeAssault: AssaultSquad | null = null;

/** Get the current assault squad (read-only). */
export function getAssaultSquad(): AssaultSquad | null {
  return activeAssault;
}

/**
 * Dispatch an assault squad toward a portal.
 * Knight leads, 4 archers follow in formation.
 */
export function dispatchAssault(
  state: GameState,
  knightUnit: UnitData,
  targetPortalX: number,
): boolean {
  if (activeAssault?.active) return false;

  // Find 4 nearest available archers
  const archerEids: number[] = [];
  const knightPos = getPosition(state.world, knightUnit.eid);
  if (!knightPos) return false;

  const candidates: { eid: number; dist: number }[] = [];
  for (const unit of state.units) {
    if (unit.role !== UnitRole.Archer) continue;
    if (unit.aiState === AIState.Retreating || unit.aiState === AIState.Fleeing) continue;
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    candidates.push({ eid: unit.eid, dist: distance(knightPos.x, pos.x) });
  }

  candidates.sort((a, b) => a.dist - b.dist);
  for (let i = 0; i < Math.min(ASSAULT_SQUAD_SIZE, candidates.length); i++) {
    archerEids.push(candidates[i].eid);
  }

  activeAssault = {
    knightEid: knightUnit.eid,
    archerEids,
    targetPortalX,
    active: true,
    knightShieldHp: KNIGHT_SHIELD_HP,
  };

  knightUnit.aiState = AIState.Attacking;
  knightUnit.targetX = targetPortalX;

  // Set archers to assault mode
  for (const archerEid of archerEids) {
    const unit = state.units.find(u => u.eid === archerEid);
    if (unit) {
      unit.aiState = AIState.Attacking;
      unit.targetX = targetPortalX;
    }
  }

  state.messages.push('Portal assault dispatched!');
  return true;
}

/** Update the active assault squad. */
export function updateAssault(state: GameState, dt: number): void {
  if (!activeAssault || !activeAssault.active) return;

  const knight = state.units.find(u => u.eid === activeAssault!.knightEid);
  if (!knight) {
    recallSquad(state);
    return;
  }

  const knightPos = getPosition(state.world, knight.eid);
  if (!knightPos) return;

  // Check retreat conditions
  if (activeAssault.knightShieldHp <= 0) {
    state.messages.push('Knight shield broken! Squad retreating!');
    recallSquad(state);
    return;
  }
  if (knight.hp <= 1) {
    state.messages.push('Knight critically wounded! Squad retreating!');
    recallSquad(state);
    return;
  }

  // Check if archers are all dead
  const livingArchers = activeAssault.archerEids.filter(eid =>
    state.units.some(u => u.eid === eid && u.hp > 0)
  );
  if (livingArchers.length === 0) {
    state.messages.push('All archers fallen! Squad retreating!');
    recallSquad(state);
    return;
  }
  activeAssault.archerEids = livingArchers;

  const portalDist = distance(knightPos.x, activeAssault.targetPortalX);

  // Knight moves to portal
  if (portalDist > 2.0) {
    knight.aiState = AIState.Attacking;
    const dir = activeAssault.targetPortalX > knightPos.x ? 1 : -1;
    setVelocity(state.world, knight.eid, dir * KNIGHT_SPEED, 0);
  } else {
    // Knight attacking portal
    setVelocity(state.world, knight.eid, 0, 0);
    if (knight.attackCooldown <= 0) {
      attackPortal(state, activeAssault.targetPortalX);
      knight.attackCooldown = PORTAL_ATTACK_COOLDOWN;

      // Check if portal destroyed
      const portalStillExists = state.portalPositions.includes(
        Math.round(activeAssault.targetPortalX)
      ) || [...state.structures.values()].some(
        s => s.type === StructureType.Portal && distance(s.x, activeAssault!.targetPortalX) < 3
      );

      if (!portalStillExists) {
        state.messages.push('Portal destroyed! Squad returning victorious!');
        recallSquad(state);
        return;
      }
    }
  }

  // Archers follow in formation behind knight
  for (let i = 0; i < activeAssault.archerEids.length; i++) {
    const archer = state.units.find(u => u.eid === activeAssault!.archerEids[i]);
    if (!archer) continue;
    const archerPos = getPosition(state.world, archer.eid);
    if (!archerPos) continue;

    // Formation position: behind knight
    const dir = activeAssault.targetPortalX > knightPos.x ? -1 : 1;
    const formationX = knightPos.x + dir * (ASSAULT_FORMATION_SPACING * (i + 1));
    const formDist = distance(archerPos.x, formationX);

    if (formDist > 1.5) {
      const moveDir = formationX > archerPos.x ? 1 : -1;
      setVelocity(state.world, archer.eid, moveDir * ARCHER_SPEED, 0);
    } else {
      setVelocity(state.world, archer.eid, 0, 0);
    }
  }
}

/** Recall the assault squad. All units return to idle. */
export function recallSquad(state: GameState): void {
  if (!activeAssault) return;

  const knight = state.units.find(u => u.eid === activeAssault!.knightEid);
  if (knight) {
    knight.aiState = AIState.Idle;
    setVelocity(state.world, knight.eid, 0, 0);
  }

  for (const archerEid of activeAssault.archerEids) {
    const archer = state.units.find(u => u.eid === archerEid);
    if (archer) {
      archer.aiState = AIState.Idle;
      setVelocity(state.world, archer.eid, 0, 0);
    }
  }

  activeAssault.active = false;
  activeAssault = null;
}

/** Absorb a hit on the assault knight's shield. Returns true if absorbed. */
export function absorbAssaultHit(): boolean {
  if (!activeAssault || !activeAssault.active) return false;
  if (activeAssault.knightShieldHp <= 0) return false;

  activeAssault.knightShieldHp--;
  return true;
}

// ─── Squire ───────────────────────────────────────────────────────

export function createSquire(state: GameState, x: number): UnitData {
  const eid = addEntity(state.world);
  setPosition(state.world, eid, x, GROUND_Y - 1);
  setVelocity(state.world, eid, 0, 0);

  const unit: UnitData = {
    eid,
    role: UnitRole.Squire,
    aiState: AIState.Idle,
    targetX: x,
    hp: 3,
    maxHp: 3,
    attackCooldown: 0,
    coins: 0,
  };

  state.units.push(unit);
  return unit;
}

/** Squire update: same behavior as knight but with weaker stats and larger squad. */
export function updateSquire(state: GameState, unit: UnitData, dt: number): void {
  const pos = getPosition(state.world, unit.eid);
  if (!pos) return;

  if (unit.attackCooldown > 0) {
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
  }

  switch (state.timeOfDay) {
    case TimeOfDay.Dawn:
    case TimeOfDay.Day:
      updateSquireDay(state, unit, pos, dt);
      break;
    case TimeOfDay.Dusk:
      updateSquireDusk(state, unit, pos);
      break;
    case TimeOfDay.Night:
      updateSquireNight(state, unit, pos);
      break;
  }
}

function updateSquireDay(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
  _dt: number,
): void {
  const portalX = findBestPortalTarget(state, pos.x);

  if (portalX === undefined) {
    unit.aiState = AIState.Idle;
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  unit.aiState = AIState.Attacking;
  const dist = distance(pos.x, portalX);

  if (dist < 2.0) {
    setVelocity(state.world, unit.eid, 0, 0);

    if (unit.attackCooldown <= 0) {
      attackPortal(state, portalX);
      unit.attackCooldown = PORTAL_ATTACK_COOLDOWN;
    }
  } else {
    unit.targetX = portalX;
    const dir = portalX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * SQUIRE_SPEED, 0);
  }

  // Squires rally a larger squad (4 archers)
  rallySquireSquad(state, unit, pos.x);
}

function updateSquireDusk(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
): void {
  unit.aiState = AIState.Retreating;

  const retreatX = findRetreatPosition(state, pos.x);
  const dist = distance(pos.x, retreatX);

  if (dist < 1.0) {
    setVelocity(state.world, unit.eid, 0, 0);
    return;
  }

  const dir = retreatX > pos.x ? 1 : -1;
  setVelocity(state.world, unit.eid, dir * SQUIRE_SPEED, 0);
}

function updateSquireNight(
  state: GameState,
  unit: UnitData,
  pos: { x: number; y: number },
): void {
  const wallX = findOutermostWallOnSide(state, pos.x);
  const dist = distance(pos.x, wallX);

  if (dist > 1.0) {
    unit.aiState = AIState.MovingTo;
    const dir = wallX > pos.x ? 1 : -1;
    setVelocity(state.world, unit.eid, dir * SQUIRE_SPEED, 0);
    return;
  }

  unit.aiState = AIState.Defending;
  setVelocity(state.world, unit.eid, 0, 0);
}

function rallySquireSquad(state: GameState, squire: UnitData, squireX: number): void {
  let rallied = 0;
  const rallyRange = 20;

  for (const unit of state.units) {
    if (rallied >= SQUIRE_SQUAD_SIZE) break;
    if (unit.role !== UnitRole.Archer) continue;
    if (unit.aiState === AIState.Retreating || unit.aiState === AIState.Defending) continue;

    const archerPos = getPosition(state.world, unit.eid);
    if (!archerPos) continue;

    const d = distance(squireX, archerPos.x);
    if (d <= rallyRange) {
      unit.targetX = squire.targetX;
      unit.aiState = AIState.Attacking;
      rallied++;
    }
  }
}
