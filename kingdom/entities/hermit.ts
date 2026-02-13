/**
 * Hermit system - 7 hermit types that unlock tower conversions and abilities.
 * Each hermit lives in a cottage on a specific island.
 * Monarch pays gems to coax hermit, then drops at target tower to convert it.
 * Hermits can be kidnapped by greed and must be rescued by destroying portals.
 */
import { getPosition } from 'blecsd';
import {
  type GameState,
  GROUND_Y,
  distance,
} from '../types';

// ─── Hermit Types ────────────────────────────────────────────────
export enum HermitType {
  Ballista = 'ballista',
  Stable = 'stable',
  Bakery = 'bakery',
  Knight = 'knight',
  Horn = 'horn',
  FireTower = 'fireTower',
  Berserker = 'berserker',
}

export interface HermitData {
  type: HermitType;
  islandIndex: number;
  x: number;
  coaxed: boolean;
  riding: boolean;
  kidnapped: boolean;
  rescuable: boolean;
}

// ─── Hermit Config ───────────────────────────────────────────────
interface HermitConfig {
  type: HermitType;
  island: number;
  gemCost: number;
  coinCost: number;
  x: number;
  description: string;
}

const HERMIT_CONFIGS: HermitConfig[] = [
  { type: HermitType.Ballista, island: 1, gemCost: 3, coinCost: 1, x: 150, description: 'Ballista towers' },
  { type: HermitType.Stable, island: 2, gemCost: 1, coinCost: 1, x: 180, description: 'Farmhouse & mount horn' },
  { type: HermitType.Bakery, island: 3, gemCost: 4, coinCost: 1, x: 200, description: 'Bakery towers' },
  { type: HermitType.Knight, island: 4, gemCost: 2, coinCost: 1, x: 160, description: 'Squire towers' },
  { type: HermitType.Horn, island: 5, gemCost: 3, coinCost: 1, x: 140, description: 'Horn walls' },
  { type: HermitType.FireTower, island: 1, gemCost: 2, coinCost: 1, x: 900, description: 'Fire towers' },
  { type: HermitType.Berserker, island: 2, gemCost: 2, coinCost: 1, x: 950, description: 'Berserker towers' },
];

const HERMIT_WALK_SPEED = 2;
const COAX_RANGE = 3;
const KIDNAP_RANGE = 2;

// ─── Module State ────────────────────────────────────────────────
const hermits: HermitData[] = [];
let ridingHermitIndex = -1;

/** Initialize hermits for the current island. */
export function createHermits(state: GameState): void {
  hermits.length = 0;
  ridingHermitIndex = -1;

  for (const config of HERMIT_CONFIGS) {
    if (config.island === state.islandIndex) {
      hermits.push({
        type: config.type,
        islandIndex: config.island,
        x: config.x,
        coaxed: false,
        riding: false,
        kidnapped: false,
        rescuable: false,
      });
    }
  }
}

/** Get all hermits (read-only view). */
export function getAvailableHermits(): readonly HermitData[] {
  return hermits;
}

/** Get config for a hermit type. */
export function getHermitConfig(type: HermitType): HermitConfig | undefined {
  return HERMIT_CONFIGS.find(c => c.type === type);
}

/** Get the currently riding hermit type, or null. */
export function getRidingHermit(): HermitType | null {
  if (ridingHermitIndex < 0) return null;
  return hermits[ridingHermitIndex]?.type ?? null;
}

/**
 * Coax a hermit out of their cottage.
 * Monarch must be near cottage, pay gem cost.
 */
export function coaxHermit(state: GameState, hermitIndex: number): boolean {
  if (hermitIndex < 0 || hermitIndex >= hermits.length) return false;
  const hermit = hermits[hermitIndex];
  if (hermit.coaxed || hermit.kidnapped) return false;

  const config = getHermitConfig(hermit.type);
  if (!config) return false;

  // Check monarch near cottage
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return false;
  if (distance(monarchPos.x, hermit.x) > COAX_RANGE) return false;

  // Check gem cost
  if (state.gems < config.gemCost) return false;

  // Check no other hermit riding
  if (ridingHermitIndex >= 0) return false;

  state.gems -= config.gemCost;
  hermit.coaxed = true;
  hermit.riding = true;
  ridingHermitIndex = hermitIndex;

  state.messages.push(`${config.description} hermit coaxed! (${config.gemCost} gems)`);
  return true;
}

/**
 * Drop the riding hermit at current monarch position.
 * The hermit converts the nearest tower if applicable, then walks home.
 */
export function dropHermit(state: GameState): boolean {
  if (ridingHermitIndex < 0) return false;
  const hermit = hermits[ridingHermitIndex];

  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos) return false;

  // Pay coin cost
  const config = getHermitConfig(hermit.type);
  if (!config) return false;
  if (state.monarchCoins < config.coinCost) {
    state.messages.push(`Need ${config.coinCost} coin to place hermit`);
    return false;
  }
  state.monarchCoins -= config.coinCost;

  hermit.riding = false;
  hermit.x = monarchPos.x;
  ridingHermitIndex = -1;

  state.messages.push(`${config.description} hermit placed! Unlocked: ${config.description}`);
  return true;
}

/** Update hermit positions and kidnap checks. */
export function updateHermits(state: GameState, dt: number): void {
  for (let i = 0; i < hermits.length; i++) {
    const hermit = hermits[i];

    // Riding hermit follows monarch
    if (hermit.riding) {
      const monarchPos = getPosition(state.world, state.monarch.eid);
      if (monarchPos) {
        hermit.x = monarchPos.x;
      }
      continue;
    }

    // Kidnapped hermits don't move
    if (hermit.kidnapped) continue;

    // Coaxed but not riding: walk back to cottage
    if (hermit.coaxed) {
      const config = getHermitConfig(hermit.type);
      if (config) {
        const homeX = config.x;
        const dist = distance(hermit.x, homeX);
        if (dist > 1) {
          const dir = homeX > hermit.x ? 1 : -1;
          hermit.x += dir * HERMIT_WALK_SPEED * dt;
        } else {
          hermit.coaxed = false; // Back home, can be coaxed again for another tower
        }
      }
    }

    // Check for greed kidnapping
    if (!hermit.kidnapped && !hermit.riding) {
      for (const greed of state.greeds) {
        const greedPos = getPosition(state.world, greed.eid);
        if (!greedPos) continue;
        if (distance(hermit.x, greedPos.x) < KIDNAP_RANGE) {
          hermit.kidnapped = true;
          hermit.rescuable = true;
          state.messages.push('A hermit has been kidnapped!');
          break;
        }
      }
    }
  }
}

/** Rescue a hermit when a portal is destroyed. */
export function rescueHermitFromPortal(state: GameState): void {
  for (const hermit of hermits) {
    if (hermit.kidnapped && hermit.rescuable) {
      hermit.kidnapped = false;
      hermit.rescuable = false;
      hermit.coaxed = false;
      const config = getHermitConfig(hermit.type);
      hermit.x = config?.x ?? 200;
      state.messages.push('A hermit has been rescued!');
      return;
    }
  }
}

/** Check if a specific hermit type has been unlocked (coaxed and dropped at least once). */
const unlockedHermitTypes = new Set<HermitType>();

export function markHermitUnlocked(type: HermitType): void {
  unlockedHermitTypes.add(type);
}

export function isHermitUnlocked(type: HermitType): boolean {
  return unlockedHermitTypes.has(type);
}
