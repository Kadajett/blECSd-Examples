/**
 * Kingdom - Terrain generation
 * Generates a massive varied world with multiple biomes:
 * dense forest, plains, swamp, mountains, ruins, and settlement clearings.
 */

import {
  TileType,
  MAP_WIDTH,
  GROUND_Y,
  WATER_Y,
} from '../types';

// ─── Biome System ────────────────────────────────────────────────

export enum Biome {
  DenseForest,
  Plains,
  Swamp,
  Mountain,
  Ruins,
  Settlement,
}

/**
 * Determine biome for a given x position.
 * Layout across the 1200-tile world:
 *   0-60: Dense forest (western edge)
 *   60-120: Plains
 *   120-180: Settlement 1
 *   180-260: Dense forest (portal ~220)
 *   260-340: Swamp
 *   340-370: Plains transition
 *   370-430: Settlement 2
 *   430-520: Mountain zone
 *   520-570: Dense forest (portal ~540)
 *   570-630: Settlement 3 (center, player start)
 *   630-720: Plains (with ponds)
 *   720-770: Ruins
 *   770-830: Settlement 4
 *   830-940: Dense forest (portal ~880)
 *   940-1000: Ruins
 *   1000-1020: Plains transition
 *   1020-1080: Settlement 5
 *   1080-1140: Plains
 *   1140-1200: Dense forest (eastern edge)
 */
export function getBiome(x: number): Biome {
  if (x < 60 || x > 1140) return Biome.DenseForest;

  // Settlement zones (30-tile radius)
  if (x >= 120 && x <= 180) return Biome.Settlement;
  if (x >= 370 && x <= 430) return Biome.Settlement;
  if (x >= 570 && x <= 630) return Biome.Settlement;
  if (x >= 770 && x <= 830) return Biome.Settlement;
  if (x >= 1020 && x <= 1080) return Biome.Settlement;

  // Inter-settlement biomes
  if (x > 180 && x < 260) return Biome.DenseForest;
  if (x >= 260 && x <= 340) return Biome.Swamp;
  if (x >= 430 && x <= 520) return Biome.Mountain;
  if (x > 520 && x < 570) return Biome.DenseForest;
  if (x >= 720 && x <= 770) return Biome.Ruins;
  if (x > 830 && x < 940) return Biome.DenseForest;
  if (x >= 940 && x <= 1000) return Biome.Ruins;

  return Biome.Plains;
}

/**
 * Get the ground level for a given x position.
 * Mountains are elevated, plains/forests have occasional hills.
 */
export function getGroundLevel(x: number): number {
  const biome = getBiome(x);
  let gy = GROUND_Y;

  // Mountains are elevated
  if (biome === Biome.Mountain) {
    gy -= 1;
    if (Math.sin(x * 0.1) > 0.5) gy -= 1;
  }

  // Occasional hills in plains and forest
  if (biome === Biome.Plains || biome === Biome.DenseForest) {
    const hill = Math.sin(x * 0.05) * Math.sin(x * 0.13);
    if (hill > 0.6) gy -= 1;
  }

  return gy;
}

/**
 * Check if a position should be a pond (small water body on plains).
 */
function isPond(x: number): boolean {
  if (x >= 670 && x <= 685 && ((x * 7 + 13) % 5 < 2)) return true;
  if (x >= 100 && x <= 108 && ((x * 3 + 7) % 4 < 1)) return true;
  if (x >= 1090 && x <= 1098 && ((x * 11 + 3) % 5 < 2)) return true;
  return false;
}

/**
 * Generate the full terrain tile grid.
 * Uses biome zones for variety, with hills, ponds, swamps, and mountains.
 */
export function generateTerrain(width: number, height: number): TileType[][] {
  const tiles: TileType[][] = [];

  for (let y = 0; y < height; y++) {
    const row: TileType[] = [];
    for (let x = 0; x < width; x++) {
      const biome = getBiome(x);
      const gy = getGroundLevel(x);

      if (y < gy) {
        // Above ground
        if (biome === Biome.DenseForest && y >= gy - 4) {
          row.push(TileType.Forest);
        } else if (biome === Biome.Mountain && y >= gy - 1) {
          row.push(TileType.Mountain);
        } else {
          row.push(TileType.Sky);
        }
      } else if (y === gy) {
        // Ground level varies by biome
        switch (biome) {
          case Biome.DenseForest:
            row.push(TileType.Forest);
            break;
          case Biome.Swamp:
            row.push(((x * 7 + 3) % 4 < 2) ? TileType.Swamp : TileType.Water);
            break;
          case Biome.Mountain:
            row.push(TileType.Mountain);
            break;
          case Biome.Ruins:
            row.push(((x * 11 + 5) % 7 < 2) ? TileType.Ruins : TileType.ClearedLand);
            break;
          case Biome.Settlement:
            row.push(TileType.Grass);
            break;
          case Biome.Plains:
          default:
            row.push(isPond(x) ? TileType.Water : TileType.Grass);
            break;
        }
      } else if (y === gy + 1 && biome === Biome.Swamp) {
        // Below swamp ground: mixed water/dirt
        row.push(((x * 5 + 7) % 3 < 1) ? TileType.Water : TileType.Dirt);
      } else if (y < WATER_Y) {
        row.push(TileType.Dirt);
      } else {
        row.push(TileType.Water);
      }
    }
    tiles.push(row);
  }

  return tiles;
}
