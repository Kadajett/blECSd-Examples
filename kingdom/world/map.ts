/**
 * Kingdom - Map generation
 * Generates the full game map: terrain, settlements, portals, and consumable spots.
 * Supports island-specific layouts with different sizes and portal configurations.
 */

import {
  type GameState,
  type StructureData,
  type MapData,
  StructureType,
  TowerTier,
  ConsumableType,
  TileType,
  MAP_HEIGHT,
  PORTAL_HP,
  ISLAND_MAP_WIDTHS,
} from '../types';
import { generateTerrain } from './terrain';

// Default (Island 1) settlement centers spread across the 600-tile map
const ISLAND_CONFIGS: {
  settlements: number[];
  portals: number[];
  foodCaches: number[];
  restShrines: number[];
  powerWells: number[];
  vagrantCamps: number[];
}[] = [
  // Island 1: Tutorial Isle (600 tiles)
  {
    settlements: [100, 250, 300, 400, 500],
    portals: [30, 200, 570],            // 2 dock portals, 1 cliff portal
    foodCaches: [160, 350, 450],
    restShrines: [80, 230, 480],
    powerWells: [50, 280, 550],
    vagrantCamps: [120, 270, 380],
  },
  // Island 2: Stone Coast (800 tiles)
  {
    settlements: [120, 300, 400, 550, 700],
    portals: [40, 230, 500, 760],       // 3 cliff portals, 1 dock portal per side
    foodCaches: [180, 360, 620, 680],
    restShrines: [100, 280, 530, 680],
    powerWells: [60, 350, 580, 740],
    vagrantCamps: [140, 320, 420, 580, 650],
  },
  // Island 3: Forge Bay (1000 tiles)
  {
    settlements: [150, 350, 500, 700, 880],
    portals: [40, 240, 440, 600, 800, 960],  // 4-6 cliff portals + cave portal
    foodCaches: [200, 430, 650, 820, 920],
    restShrines: [130, 330, 480, 680, 860],
    powerWells: [70, 300, 550, 750, 940],
    vagrantCamps: [170, 370, 520, 720, 850],
  },
  // Island 4: Iron Reach (1000 tiles)
  {
    settlements: [150, 350, 500, 700, 880],
    portals: [30, 200, 380, 550, 750, 900, 970],  // No merchant, 6+ portals
    foodCaches: [250, 450, 650, 820],
    restShrines: [130, 330, 480, 680, 860],
    powerWells: [80, 300, 550, 750, 940],
    vagrantCamps: [170, 370, 520, 720, 850, 920],
  },
  // Island 5: Crown's End (1200 tiles)
  {
    settlements: [150, 400, 600, 800, 1050],
    portals: [30, 220, 380, 540, 720, 880, 1020, 1170],  // 8+ portals
    foodCaches: [310, 500, 725, 950, 1100],
    restShrines: [130, 380, 580, 780, 1030],
    powerWells: [45, 200, 450, 700, 900, 1155],
    vagrantCamps: [170, 420, 620, 820, 1000, 1100],
  },
];

function placeStructure(state: GameState, x: number, type: StructureType, hp: number): void {
  state.structures.set(x, {
    eid: 0 as any,
    type,
    x,
    hp,
    maxHp: hp,
    level: 1,
    assignedWorkers: [],
    towerTier: TowerTier.None,
    isRoofed: false,
  });
}

/**
 * Generate island-specific map data without modifying game state.
 * Returns terrain tiles, portal positions, structure positions, and vagrant camp positions.
 */
export function generateIslandMap(islandIndex: number): MapData {
  const clampedIndex = Math.max(0, Math.min(islandIndex, ISLAND_CONFIGS.length - 1));
  const config = ISLAND_CONFIGS[clampedIndex]!;
  const mapWidth = ISLAND_MAP_WIDTHS[clampedIndex] ?? 1200;

  const tiles = generateTerrain(mapWidth, MAP_HEIGHT);

  const structurePositions: MapData['structurePositions'] = [];

  // Settlements: each gets a campfire + tool stands
  for (const cx of config.settlements) {
    if (cx < mapWidth) {
      structurePositions.push({ type: StructureType.Campfire, x: cx, hp: 999 });
      if (cx - 8 >= 0) structurePositions.push({ type: StructureType.BowStand, x: cx - 8, hp: 999 });
      if (cx + 8 < mapWidth) structurePositions.push({ type: StructureType.HammerStand, x: cx + 8, hp: 999 });
    }
  }

  // Portals
  const portalPositions = config.portals.filter(x => x < mapWidth);
  for (const px of portalPositions) {
    structurePositions.push({ type: StructureType.Portal, x: px, hp: PORTAL_HP });
  }

  return {
    tiles,
    portalPositions,
    structurePositions,
    vagrantCampPositions: config.vagrantCamps.filter(x => x < mapWidth),
    mapWidth,
  };
}

/**
 * Generate the full game map and populate the game state.
 * Uses island-specific configuration for map layout.
 */
export function generateMap(state: GameState): void {
  const islandIndex = state.islandIndex ?? 0;
  const clampedIndex = Math.max(0, Math.min(islandIndex, ISLAND_CONFIGS.length - 1));
  const config = ISLAND_CONFIGS[clampedIndex]!;
  const mapWidth = ISLAND_MAP_WIDTHS[clampedIndex] ?? 1200;

  // Store map width on state
  state.mapWidth = mapWidth;

  // Generate terrain grid
  state.tiles = generateTerrain(mapWidth, MAP_HEIGHT);

  // Initialize structures map
  state.structures = new Map<number, StructureData>();

  // Place settlements: each gets a campfire and tool stands
  for (const cx of config.settlements) {
    if (cx < mapWidth) {
      placeStructure(state, cx, StructureType.Campfire, 999);
      if (cx - 8 >= 0) placeStructure(state, cx - 8, StructureType.BowStand, 999);
      if (cx + 8 < mapWidth) placeStructure(state, cx + 8, StructureType.HammerStand, 999);
    }
  }

  // Place portals at forest edges
  state.portalPositions = config.portals.filter(x => x < mapWidth);
  for (const px of state.portalPositions) {
    placeStructure(state, px, StructureType.Portal, PORTAL_HP);
  }

  // Place consumable spots across the world
  state.consumableSpots = new Map<number, ConsumableType>();

  // Food caches
  for (const x of config.foodCaches) {
    if (x < mapWidth) state.consumableSpots.set(x, ConsumableType.FoodCache);
  }

  // Rest shrines
  for (const x of config.restShrines) {
    if (x < mapWidth) state.consumableSpots.set(x, ConsumableType.RestShrine);
  }

  // Power wells
  for (const x of config.powerWells) {
    if (x < mapWidth) state.consumableSpots.set(x, ConsumableType.PowerWell);
  }
}

// Re-export settlement centers for compatibility
export const SETTLEMENT_CENTERS = ISLAND_CONFIGS[0]!.settlements;
