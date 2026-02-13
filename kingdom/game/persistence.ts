/**
 * Kingdom - Save/Load persistence
 * Saves game state to ~/.kingdom-save.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getPosition } from 'blecsd';
import {
  type GameState,
  type StructureData,
  StructureType,
  UnitRole,
  MountType,
} from '../types';

const SAVE_PATH = join(homedir(), '.kingdom-save.json');

interface SavedStructure {
  type: StructureType;
  x: number;
  hp: number;
  maxHp: number;
  level: number;
}

interface SavedUnit {
  role: UnitRole;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  coins: number;
}

interface SaveData {
  version: 1;
  islandIndex: number;
  dayCount: number;
  monarchCoins: number;
  mountType: MountType;
  stamina: number;
  structures: SavedStructure[];
  units: SavedUnit[];
  portalPositions: number[];
  monarchX: number;
}

/**
 * Save game state to ~/.kingdom-save.json.
 */
export function saveGame(state: GameState): void {
  try {
    const monarchPos = getPosition(state.world, state.monarch.eid);

    const structures: SavedStructure[] = [];
    for (const [, s] of state.structures) {
      structures.push({
        type: s.type,
        x: s.x,
        hp: s.hp,
        maxHp: s.maxHp,
        level: s.level,
      });
    }

    const units: SavedUnit[] = [];
    for (const u of state.units) {
      const pos = getPosition(state.world, u.eid);
      if (pos) {
        units.push({
          role: u.role,
          x: pos.x,
          y: pos.y,
          hp: u.hp,
          maxHp: u.maxHp,
          coins: u.coins,
        });
      }
    }

    const save: SaveData = {
      version: 1,
      islandIndex: state.islandIndex,
      dayCount: state.dayCount,
      monarchCoins: state.monarchCoins,
      mountType: state.mountType,
      stamina: state.stamina,
      structures,
      units,
      portalPositions: [...state.portalPositions],
      monarchX: monarchPos?.x ?? 200,
    };

    writeFileSync(SAVE_PATH, JSON.stringify(save), 'utf8');
  } catch {
    // Silently fail on save error
  }
}

/**
 * Load game state from ~/.kingdom-save.json.
 * Returns partial state with restorable fields, or null if no save exists.
 */
export function loadGame(): Partial<GameState> | null {
  try {
    if (!existsSync(SAVE_PATH)) return null;

    const raw = readFileSync(SAVE_PATH, 'utf8');
    const save: SaveData = JSON.parse(raw);
    if (save.version !== 1) return null;

    // Reconstruct structures Map
    const structures = new Map<number, StructureData>();
    for (const s of save.structures) {
      structures.set(s.x, {
        eid: 0 as any,
        type: s.type,
        x: s.x,
        hp: s.hp,
        maxHp: s.maxHp,
        level: s.level,
        assignedWorkers: [],
      });
    }

    return {
      islandIndex: save.islandIndex,
      dayCount: save.dayCount,
      monarchCoins: save.monarchCoins,
      mountType: save.mountType,
      stamina: save.stamina,
      portalPositions: save.portalPositions,
      structures,
    };
  } catch {
    return null;
  }
}
