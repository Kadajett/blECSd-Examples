/**
 * Kingdom - Main renderer
 * Phase-aware rendering: Title screen, Playing (with parallax), Game Over.
 * Dirty-rect double-buffered ANSI output.
 */

import { getPosition } from 'blecsd/components';
import { writeRaw } from 'blecsd/systems';
import { createCellBuffer } from 'blecsd/utils';
import {
  type GameState,
  type StructureData,
  TileType,
  StructureType,
  TimeOfDay,
  Season,
  TownCenterTier,
  UnitRole,
  GreedType,
  GamePhase,
  MountType,
  ConsumableType,
  WeatherType,
  TowerTier,
  TOWER_ARCHER_CAPACITY,
  CAMP_CENTER_X,
  CHAR_CROWN,
  MAP_WIDTH,
  GROUND_Y,
  COLOR_SKY_DAY,
  COLOR_SKY_DUSK,
  COLOR_SKY_NIGHT,
  COLOR_SKY_DAWN,
  COLOR_GROUND,
  COLOR_DIRT,
  COLOR_WATER,
  COLOR_TREE_TRUNK,
  COLOR_TREE_LEAVES,
  COLOR_WALL_WOOD,
  COLOR_WALL_STONE,
  COLOR_WALL_IRON,
  COLOR_MONARCH,
  COLOR_VILLAGER,
  COLOR_BUILDER,
  COLOR_ARCHER,
  COLOR_FARMER,
  COLOR_GREED,
  COLOR_GREED_MASK,
  COLOR_PORTAL,
  COLOR_COIN,
  COLOR_FARM,
  COLOR_SHRINE,
  COLOR_BG,
  CHAR_MONARCH,
  CHAR_VILLAGER,
  CHAR_BUILDER,
  CHAR_ARCHER,
  CHAR_FARMER,
  CHAR_GREED,
  CHAR_GREED_MASK,
  CHAR_PORTAL,
  CHAR_WALL,
  CHAR_WALL_DAMAGED,
  CHAR_TREE_TRUNK,
  CHAR_GRASS,
  CHAR_WATER,
  CHAR_COIN,
  CHAR_FARM,
  CHAR_SHRINE,
  CHAR_ARROW,
  CHAR_HORSE,
  ISLAND_NAMES,
  AIState,
  DAY_START,
  DUSK_START,
  NIGHT_START,
  worldToScreen,
  isOnScreen,
  distance,
} from '../types';
import { getBiome, Biome } from '../world/terrain';
import { getAnimals } from '../entities/animals';
import { getDroppedCoins } from '../systems/combat';
import { getBlueprints } from '../systems/construction';
import { getNpcOrigin, NpcOrigin } from '../entities/villager';
import { getAvailableHermits, type HermitData, HermitType, getRidingHermit } from '../entities/hermit';
import { getStatues, type StatueData, BlessingType, getStatueConfig } from '../entities/statue';
import { getDogX, isDogBarking } from '../entities/dog';
import { renderHud } from './hud';
import { applyNightOverlay, updateWaveFlash, updateSparkles, renderWeather, updateCoinSparkles, renderCoinSparkles } from './effects';

// ─── CellBuffer Interface ─────────────────────────────────────────

interface CellBufferDirect {
  width: number;
  height: number;
  cells: { char: string; fg: number; bg: number }[][];
  setCell: (x: number, y: number, char: string, fg: number, bg: number) => void;
}

// ─── Double-Buffer State ──────────────────────────────────────────

let currentBuffer: CellBufferDirect | null = null;
let prevBuffer: CellBufferDirect | null = null;
let bufferWidth = 0;
let bufferHeight = 0;

function ensureBuffer(width: number, height: number): CellBufferDirect {
  if (!currentBuffer || bufferWidth !== width || bufferHeight !== height) {
    currentBuffer = createCellBuffer(width, height) as CellBufferDirect;
    prevBuffer = null;
    bufferWidth = width;
    bufferHeight = height;
  }
  return currentBuffer;
}

function fillRect(
  buffer: CellBufferDirect,
  x: number, y: number, w: number, h: number,
  char: string, fg: number, bg: number,
): void {
  for (let row = y; row < y + h && row < buffer.height; row++) {
    if (row < 0) continue;
    for (let col = x; col < x + w && col < buffer.width; col++) {
      if (col < 0) continue;
      buffer.setCell(col, row, char, fg, bg);
    }
  }
}

function writeStringCentered(buffer: CellBufferDirect, y: number, text: string, fg: number, bg: number): void {
  const startX = Math.floor((buffer.width - text.length) / 2);
  for (let i = 0; i < text.length; i++) {
    const col = startX + i;
    if (col >= 0 && col < buffer.width && y >= 0 && y < buffer.height) {
      buffer.setCell(col, y, text[i]!, fg, bg);
    }
  }
}

function writeString(buffer: CellBufferDirect, x: number, y: number, text: string, fg: number, bg: number): void {
  for (let i = 0; i < text.length; i++) {
    const col = x + i;
    if (col >= 0 && col < buffer.width && y >= 0 && y < buffer.height) {
      buffer.setCell(col, y, text[i]!, fg, bg);
    }
  }
}

// ─── Parallax: Star Field ─────────────────────────────────────────

interface Star {
  x: number;
  y: number;
  char: string;
  brightness: number;
}

let stars: Star[] | null = null;

function generateStars(): Star[] {
  const result: Star[] = [];
  const STAR_CHARS = ['.', '\u00B7', '+', '\u2022', '*'];
  // Deterministic pseudo-random using a simple seed
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) / 32768.0;
  };

  for (let i = 0; i < 120; i++) {
    result.push({
      x: Math.floor(rand() * MAP_WIDTH * 2), // Wider than map for parallax
      y: Math.floor(rand() * (GROUND_Y - 2)) + 1, // In sky region, below HUD
      char: STAR_CHARS[Math.floor(rand() * STAR_CHARS.length)]!,
      brightness: 0.3 + rand() * 0.7,
    });
  }
  return result;
}

// ─── Parallax: Cloud Layer ────────────────────────────────────────

interface Cloud {
  x: number;
  y: number;
  width: number;
}

let clouds: Cloud[] | null = null;

function generateClouds(): Cloud[] {
  const result: Cloud[] = [];
  let seed = 99;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 16) / 32768.0;
  };

  for (let i = 0; i < 15; i++) {
    result.push({
      x: Math.floor(rand() * MAP_WIDTH * 2),
      y: 2 + Math.floor(rand() * 6),
      width: 4 + Math.floor(rand() * 8),
    });
  }
  return result;
}

// ─── Foreground grass detail chars ────────────────────────────────

const GRASS_DETAILS = [',', '\'', '`', '"', ';'];

// ─── Color Interpolation ────────────────────────────────────────

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 24) & 0xff, ag = (a >> 16) & 0xff, ab = (a >> 8) & 0xff;
  const br = (b >> 24) & 0xff, bg = (b >> 16) & 0xff, bb = (b >> 8) & 0xff;
  const r = Math.floor(ar + (br - ar) * t);
  const g = Math.floor(ag + (bg - ag) * t);
  const bl = Math.floor(ab + (bb - ab) * t);
  return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((bl & 0xff) << 8) | 0xff;
}

function interpolateSkyColor(dayTime: number, season: Season): number {
  const dawn = SEASONAL_SKY[season][TimeOfDay.Dawn];
  const day = SEASONAL_SKY[season][TimeOfDay.Day];
  const dusk = SEASONAL_SKY[season][TimeOfDay.Dusk];
  const night = SEASONAL_SKY[season][TimeOfDay.Night];

  if (dayTime < DAY_START) {
    const t = dayTime / DAY_START;
    return t < 0.5 ? lerpColor(night, dawn, t * 2) : lerpColor(dawn, day, (t - 0.5) * 2);
  }
  if (dayTime < DUSK_START) return day;
  if (dayTime < NIGHT_START) {
    const t = (dayTime - DUSK_START) / (NIGHT_START - DUSK_START);
    return t < 0.5 ? lerpColor(day, dusk, t * 2) : lerpColor(dusk, night, (t - 0.5) * 2);
  }
  return night;
}

// ─── Tile Rendering Helpers ───────────────────────────────────────

// Seasonal sky color table: [season][timeOfDay]
const SEASONAL_SKY: Record<Season, Record<TimeOfDay, number>> = {
  [Season.Spring]: {
    [TimeOfDay.Dawn]: 0x446688ff,
    [TimeOfDay.Day]: 0x5599ccff,
    [TimeOfDay.Dusk]: 0x884466ff,
    [TimeOfDay.Night]: 0x112233ff,
  },
  [Season.Summer]: {
    [TimeOfDay.Dawn]: 0x558899ff,
    [TimeOfDay.Day]: 0x66aaddff,
    [TimeOfDay.Dusk]: 0x995544ff,
    [TimeOfDay.Night]: 0x0a1a2aff,
  },
  [Season.Autumn]: {
    [TimeOfDay.Dawn]: 0x665544ff,
    [TimeOfDay.Day]: 0x889988ff,
    [TimeOfDay.Dusk]: 0x774433ff,
    [TimeOfDay.Night]: 0x111122ff,
  },
  [Season.Winter]: {
    [TimeOfDay.Dawn]: 0x889999ff,
    [TimeOfDay.Day]: 0x99aabbff,
    [TimeOfDay.Dusk]: 0x667788ff,
    [TimeOfDay.Night]: 0x0a0a1aff,
  },
};

function getSkyColor(phase: TimeOfDay, season: Season): number {
  return SEASONAL_SKY[season][phase];
}

// Blood moon sky override
const BLOOD_MOON_SKY = 0x331111ff;

// Season-adjusted terrain colors
function seasonalGrassFg(season: Season): number {
  switch (season) {
    case Season.Autumn: return 0xbb9944ff;
    case Season.Winter: return 0xccccddff;
    default: return COLOR_GROUND;
  }
}

function seasonalGrassBg(season: Season): number {
  switch (season) {
    case Season.Winter: return 0xddddffff;
    default: return 0x115511ff;
  }
}

function seasonalForestFg(season: Season): number {
  switch (season) {
    case Season.Autumn: return 0xcc5533ff;
    case Season.Winter: return 0x99aabbff;
    default: return COLOR_TREE_LEAVES;
  }
}

// Town center visual data: [chars, fgColor]
const TOWN_CENTER_VISUALS: [string, number][] = [
  ['.', 0x555555ff],        // Ruins
  ['*', 0xff8833ff],        // Campfire (handled specially for flicker)
  ['#*', 0xaa7744ff],       // Camp
  ['|#|', 0xbb8844ff],     // Village
  ['|##|', 0x999999ff],    // Town Hall
  ['[###]', 0x888888ff],   // Stone Fort
  ['|[###]|', 0xcc9944ff], // Castle
  ['{[###]}', 0xaaaabbff], // Iron Keep
];

// Tower tier visual data: [chars, fgColor]
const TOWER_VISUALS: [string, number][] = [
  ['', 0x000000ff],         // None
  ['=', 0x886633ff],        // Rock Platform (brown)
  ['T', 0x886633ff],        // Wood Watchtower
  ['T', 0x999999ff],        // Stone Tower (gray)
  ['TTT', 0x999999ff],      // Triplet (3 wide)
  ['^T^', 0x888888ff],      // Roofed Triplet
  ['^TT^', 0xaaaabbff],     // Quadruplet (4 wide with roof)
];

function tileChar(tile: TileType): string {
  switch (tile) {
    case TileType.Grass: return CHAR_GRASS;
    case TileType.Dirt: return CHAR_GRASS;
    case TileType.Water: return CHAR_WATER;
    case TileType.Forest: return '\u2660';
    case TileType.ClearedLand: return '.';
    case TileType.Swamp: return CHAR_GRASS;
    case TileType.Mountain: return '^';
    case TileType.Ruins: return '\u2500'; // horizontal line
    default: return ' ';
  }
}

function tileFg(tile: TileType): number {
  switch (tile) {
    case TileType.Grass: return COLOR_GROUND;
    case TileType.Dirt: return COLOR_DIRT;
    case TileType.Water: return COLOR_WATER;
    case TileType.Forest: return COLOR_TREE_LEAVES;
    case TileType.ClearedLand: return COLOR_GROUND;
    case TileType.Swamp: return 0x116622ff;
    case TileType.Mountain: return 0x887766ff;
    case TileType.Ruins: return 0x444444ff;
    default: return COLOR_BG;
  }
}

function tileBg(tile: TileType): number {
  switch (tile) {
    case TileType.Grass: return 0x115511ff;
    case TileType.Dirt: return 0x442211ff;
    case TileType.Water: return 0x112255ff;
    case TileType.Forest: return 0x0a3311ff;
    case TileType.ClearedLand: return 0x335522ff;
    case TileType.Swamp: return 0x0a2211ff;
    case TileType.Mountain: return 0x666655ff;
    case TileType.Ruins: return 0x222222ff;
    default: return COLOR_BG;
  }
}

function structureChar(s: StructureData): string {
  // Under construction: hp=0 but maxHp>0
  if (s.hp === 0 && s.maxHp > 0) return '-';

  switch (s.type) {
    case StructureType.WallWood:
    case StructureType.WallStone:
    case StructureType.WallIron:
      return s.hp < s.maxHp * 0.5 ? CHAR_WALL_DAMAGED : CHAR_WALL;
    case StructureType.Farm:
    case StructureType.FarmIrrigated:
    case StructureType.FarmWindmill:
      return CHAR_FARM;
    case StructureType.Portal: return CHAR_PORTAL;
    case StructureType.Shrine: return CHAR_SHRINE;
    case StructureType.BowStand: return ')';
    case StructureType.HammerStand: return 'T';
    case StructureType.Campfire: return '*';
    default: return '?';
  }
}

function structureFg(s: StructureData): number {
  switch (s.type) {
    case StructureType.WallWood: return COLOR_WALL_WOOD;
    case StructureType.WallStone: return COLOR_WALL_STONE;
    case StructureType.WallIron: return COLOR_WALL_IRON;
    case StructureType.Farm:
    case StructureType.FarmIrrigated:
    case StructureType.FarmWindmill:
      return COLOR_FARM;
    case StructureType.Portal: return COLOR_PORTAL;
    case StructureType.Shrine: return COLOR_SHRINE;
    case StructureType.BowStand: return COLOR_ARCHER;
    case StructureType.HammerStand: return COLOR_BUILDER;
    case StructureType.Campfire: return 0xff8833ff;
    default: return 0xffffffff;
  }
}

function unitChar(role: UnitRole): string {
  switch (role) {
    case UnitRole.Monarch: return CHAR_MONARCH;
    case UnitRole.Vagrant: return CHAR_VILLAGER;
    case UnitRole.Builder: return CHAR_BUILDER;
    case UnitRole.Archer: return CHAR_ARCHER;
    case UnitRole.Farmer: return CHAR_FARMER;
    case UnitRole.Knight: return CHAR_MONARCH;
    case UnitRole.Pikeman: return CHAR_ARCHER;
    case UnitRole.Squire: return CHAR_MONARCH;
  }
}

function unitFg(role: UnitRole): number {
  switch (role) {
    case UnitRole.Monarch: return COLOR_MONARCH;
    case UnitRole.Vagrant: return COLOR_VILLAGER;
    case UnitRole.Builder: return COLOR_BUILDER;
    case UnitRole.Archer: return COLOR_ARCHER;
    case UnitRole.Farmer: return COLOR_FARMER;
    case UnitRole.Knight: return COLOR_MONARCH;
    case UnitRole.Pikeman: return COLOR_BUILDER;
    case UnitRole.Squire: return COLOR_FARMER;
  }
}

// ─── Title Screen ─────────────────────────────────────────────────

const TITLE_ART = [
  ' \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557\u2588\u2588\u2557   \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557',
  ' \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2554\u255D \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 \u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551',
  ' \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2588\u2557 \u2588\u2588\u2551  \u2588\u2588\u2551 \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551',
  ' \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u255D  \u2588\u2588\u2551\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551 \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551',
  ' \u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2557  \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551',
  ' \u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D\u255A\u2550\u255D\u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     \u255A\u2550\u255D',
];

function renderTitleScreen(buffer: CellBufferDirect, totalElapsed: number): void {
  fillRect(buffer, 0, 0, buffer.width, buffer.height, ' ', 0xffffffff, 0x0a0a1aff);

  // Animated star background
  const titleStars = stars ?? (stars = generateStars());
  for (const star of titleStars) {
    const twinkle = Math.sin(totalElapsed * 2 + star.x * 0.1) * 0.3 + 0.7;
    const b = Math.floor(star.brightness * twinkle * 255);
    const sx = (star.x + Math.floor(totalElapsed * 3)) % buffer.width;
    const fg = ((b & 0xff) << 24) | ((b & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
    if (star.y >= 0 && star.y < buffer.height && sx >= 0 && sx < buffer.width) {
      buffer.setCell(sx, star.y, star.char, fg, 0x0a0a1aff);
    }
  }

  // Title art
  const titleStartY = Math.floor(buffer.height / 2) - 5;
  const flicker = Math.sin(totalElapsed * 4) * 0.1 + 0.9;
  const goldR = Math.floor(255 * flicker);
  const goldG = Math.floor(200 * flicker);
  const titleColor = ((goldR & 0xff) << 24) | ((goldG & 0xff) << 16) | (0x00 << 8) | 0xff;

  for (let row = 0; row < TITLE_ART.length; row++) {
    const line = TITLE_ART[row]!;
    writeStringCentered(buffer, titleStartY + row, line, titleColor, 0x0a0a1aff);
  }

  // Subtitle
  const subtitleY = titleStartY + TITLE_ART.length + 2;
  writeStringCentered(buffer, subtitleY, 'A Kingdom: Two Crowns Tribute', 0x888899ff, 0x0a0a1aff);

  // Menu options
  const menuY = subtitleY + 3;
  writeStringCentered(buffer, menuY, '[N] New Game    [C] Continue    [Q] Quit', 0xfffffffe, 0x0a0a1aff);

  // Blinking cursor on menu
  const blink = Math.floor(totalElapsed * 2) % 2 === 0;
  if (blink) {
    writeStringCentered(buffer, menuY + 2, '\u25B6', 0xffcc00ff, 0x0a0a1aff);
  }

  // Controls hint
  const controlsY = buffer.height - 3;
  writeStringCentered(buffer, controlsY, 'Arrow Keys: Move  |  Shift: Sprint  |  Space: Drop Coin  |  Q: Quit', 0x555577ff, 0x0a0a1aff);
}

// ─── Game Over Screen ─────────────────────────────────────────────

function renderGameOverScreen(buffer: CellBufferDirect, state: GameState): void {
  fillRect(buffer, 0, 0, buffer.width, buffer.height, ' ', 0xffffffff, 0x1a0505ff);

  const centerY = Math.floor(buffer.height / 2);
  const COLOR_RED = 0xff3333ff;
  const COLOR_DIM = 0x884444ff;

  // Main message
  writeStringCentered(buffer, centerY - 4, '\u2620  YOUR CROWN HAS BEEN LOST  \u2620', COLOR_RED, 0x1a0505ff);

  // Divider
  const divider = '\u2500'.repeat(40);
  writeStringCentered(buffer, centerY - 2, divider, COLOR_DIM, 0x1a0505ff);

  // Stats
  writeStringCentered(buffer, centerY, `Days Survived: ${state.dayCount}`, 0xccaaaaff, 0x1a0505ff);
  writeStringCentered(buffer, centerY + 1, `Island: ${state.islandIndex + 1}`, 0xccaaaaff, 0x1a0505ff);
  writeStringCentered(buffer, centerY + 2, `Subjects: ${state.units.length}`, 0xccaaaaff, 0x1a0505ff);

  // Divider
  writeStringCentered(buffer, centerY + 4, divider, COLOR_DIM, 0x1a0505ff);

  // Restart prompt
  const blink = Math.floor(state.totalElapsed * 2) % 2 === 0;
  if (blink) {
    writeStringCentered(buffer, centerY + 6, '[ Press R to restart  |  Q to quit ]', 0xfffffffe, 0x1a0505ff);
  }
}

// ─── Victory Screen ──────────────────────────────────────────────

function renderVictoryScreen(buffer: CellBufferDirect, state: GameState): void {
  fillRect(buffer, 0, 0, buffer.width, buffer.height, ' ', 0xffffffff, 0x0a0a05ff);

  const centerY = Math.floor(buffer.height / 2);
  const COLOR_GOLD = 0xffcc00ff;
  const COLOR_DIM_GOLD = 0x886600ff;

  // Main message
  writeStringCentered(buffer, centerY - 4, '\u2655  THE KINGDOM IS SECURED  \u2655', COLOR_GOLD, 0x0a0a05ff);

  // Divider
  const divider = '\u2550'.repeat(40);
  writeStringCentered(buffer, centerY - 2, divider, COLOR_DIM_GOLD, 0x0a0a05ff);

  // Stats
  writeStringCentered(buffer, centerY, `Days Survived: ${state.dayCount}`, 0xcccc88ff, 0x0a0a05ff);
  writeStringCentered(buffer, centerY + 1, `Island: ${state.islandIndex + 1}`, 0xcccc88ff, 0x0a0a05ff);
  writeStringCentered(buffer, centerY + 2, `Subjects: ${state.units.length}`, 0xcccc88ff, 0x0a0a05ff);
  writeStringCentered(buffer, centerY + 3, `Greeds Defeated: ${state.greeds.length === 0 ? 'All' : state.greeds.length + ' remain'}`, 0xcccc88ff, 0x0a0a05ff);

  // Divider
  writeStringCentered(buffer, centerY + 5, divider, COLOR_DIM_GOLD, 0x0a0a05ff);

  // Prompt
  const blink = Math.floor(state.totalElapsed * 2) % 2 === 0;
  if (blink) {
    writeStringCentered(buffer, centerY + 7, '[ Press R to restart  |  Q to quit ]', 0xfffffffe, 0x0a0a05ff);
  }
}

// ─── Island Select Screen ────────────────────────────────────────

function renderIslandSelectScreen(buffer: CellBufferDirect, state: GameState): void {
  fillRect(buffer, 0, 0, buffer.width, buffer.height, ' ', 0xffffffff, 0x0a0a1aff);

  const centerY = Math.floor(buffer.height / 2) - 4;
  writeStringCentered(buffer, centerY, 'SELECT YOUR ISLAND', 0xffcc00ff, 0x0a0a1aff);

  const divider = '\u2550'.repeat(40);
  writeStringCentered(buffer, centerY + 2, divider, 0x555577ff, 0x0a0a1aff);

  // Draw 5 islands in a horizontal row
  const islandW = 12;
  const totalW = islandW * 5 + 4 * 2; // 5 islands + 4 gaps
  const startX = Math.floor((buffer.width - totalW) / 2);
  const islandY = centerY + 4;

  for (let i = 0; i < 5; i++) {
    const ix = startX + i * (islandW + 2);
    const name = ISLAND_NAMES[i] ?? `Island ${i + 1}`;
    const isUnlocked = state.islandUnlocked[i] ?? false;
    const isSelected = state.selectedIsland === i;

    // Status
    let status: string;
    let statusColor: number;
    if (!isUnlocked) {
      status = 'LOCKED';
      statusColor = 0x555555ff;
    } else if (i === state.islandIndex) {
      status = 'ACTIVE';
      statusColor = 0x44cc44ff;
    } else {
      status = 'OPEN';
      statusColor = 0x44aaffff;
    }

    // Island box
    const boxBg = isSelected ? 0x222244ff : 0x0a0a1aff;
    const borderChar = isSelected ? '\u2588' : '.';
    const borderColor = isSelected ? 0xffcc00ff : (isUnlocked ? 0x555577ff : 0x333333ff);

    // Top border
    for (let dx = 0; dx < islandW; dx++) {
      if (ix + dx >= 0 && ix + dx < buffer.width && islandY >= 0) {
        buffer.setCell(ix + dx, islandY, dx === 0 || dx === islandW - 1 ? '+' : '-', borderColor, boxBg);
      }
    }

    // Name (centered in box)
    const nameStr = name.slice(0, islandW - 2);
    const nameX = ix + 1 + Math.floor((islandW - 2 - nameStr.length) / 2);
    const nameFg = isUnlocked ? 0xfffffffe : 0x555555ff;
    writeString(buffer, nameX, islandY + 1, nameStr, nameFg, boxBg);

    // Island number
    writeString(buffer, ix + 1, islandY + 2, `  Isle ${i + 1}  `, 0x888899ff, boxBg);

    // Status
    const statusStr = `[${status}]`;
    const statX = ix + 1 + Math.floor((islandW - 2 - statusStr.length) / 2);
    writeString(buffer, statX, islandY + 3, statusStr, statusColor, boxBg);

    // Stats (if unlocked)
    if (isUnlocked && state.islandStats[i]) {
      const stats = state.islandStats[i];
      writeString(buffer, ix + 1, islandY + 4, `P:${stats.portalsDestroyed}`, 0x888888ff, boxBg);
      writeString(buffer, ix + 5, islandY + 4, `D:${stats.daysVisited}`, 0x888888ff, boxBg);
    }

    // Bottom border
    for (let dx = 0; dx < islandW; dx++) {
      if (ix + dx >= 0 && ix + dx < buffer.width && islandY + 5 < buffer.height) {
        buffer.setCell(ix + dx, islandY + 5, dx === 0 || dx === islandW - 1 ? '+' : '-', borderColor, boxBg);
      }
    }

    // Selection arrow
    if (isSelected) {
      const arrowX = ix + Math.floor(islandW / 2);
      if (arrowX >= 0 && arrowX < buffer.width && islandY + 6 < buffer.height) {
        const blink = Math.floor(state.totalElapsed * 3) % 2 === 0;
        if (blink) {
          buffer.setCell(arrowX, islandY + 6, '\u25B2', 0xffcc00ff, 0x0a0a1aff);
        }
      }
    }
  }

  // Controls hint
  const controlsY = islandY + 8;
  if (controlsY < buffer.height) {
    writeStringCentered(buffer, controlsY, 'Left/Right: Select  |  Enter: Embark  |  Q: Back', 0x888899ff, 0x0a0a1aff);
  }
}

// ─── Pause Screen Overlay ────────────────────────────────────────

function renderPauseOverlay(buffer: CellBufferDirect): void {
  // Dim the entire screen by 50%
  for (let y = 0; y < buffer.height; y++) {
    const row = buffer.cells[y];
    if (!row) continue;
    for (let x = 0; x < buffer.width; x++) {
      const cell = row[x];
      if (!cell) continue;
      const bgR = Math.floor(((cell.bg >> 24) & 0xff) * 0.5);
      const bgG = Math.floor(((cell.bg >> 16) & 0xff) * 0.5);
      const bgB = Math.floor(((cell.bg >> 8) & 0xff) * 0.5);
      cell.bg = ((bgR & 0xff) << 24) | ((bgG & 0xff) << 16) | ((bgB & 0xff) << 8) | 0xff;
      const fgR = Math.floor(((cell.fg >> 24) & 0xff) * 0.5);
      const fgG = Math.floor(((cell.fg >> 16) & 0xff) * 0.5);
      const fgB = Math.floor(((cell.fg >> 8) & 0xff) * 0.5);
      cell.fg = ((fgR & 0xff) << 24) | ((fgG & 0xff) << 16) | ((fgB & 0xff) << 8) | 0xff;
    }
  }

  const centerY = Math.floor(buffer.height / 2);
  const pauseBg = 0x111111ff;

  // Draw background box
  const boxW = 30;
  const boxH = 5;
  const boxX = Math.floor((buffer.width - boxW) / 2);
  const boxY = centerY - 2;
  fillRect(buffer, boxX, boxY, boxW, boxH, ' ', 0xffffffff, pauseBg);

  writeStringCentered(buffer, centerY - 1, 'PAUSED', 0xfffffffe, pauseBg);
  writeStringCentered(buffer, centerY + 0, 'Press P to resume', 0x888888ff, pauseBg);
  writeStringCentered(buffer, centerY + 1, 'Press Q to quit', 0x888888ff, pauseBg);
}

// ─── Mount Rendering Data ────────────────────────────────────────

interface MountRender {
  mountChar: string;
  mountColor: number;
}

function getMountRenderData(mountType: MountType, time: number): MountRender {
  switch (mountType) {
    case MountType.Horse:
      return { mountChar: 'H', mountColor: COLOR_MONARCH };
    case MountType.Stag:
      return { mountChar: 'S', mountColor: 0xaa6633ff };
    case MountType.Griffin: {
      // Alternate between G and g for flapping wings
      const flap = Math.floor(time * 4) % 2 === 0;
      return { mountChar: flap ? 'G' : 'g', mountColor: 0xddaa33ff };
    }
    case MountType.Warhorse:
      return { mountChar: 'W', mountColor: 0x778899ff };
    case MountType.Bear: {
      // Sway animation: alternate B and b
      const sway = Math.floor(time * 2) % 2 === 0;
      return { mountChar: sway ? 'B' : 'b', mountColor: 0x664422ff };
    }
    case MountType.Lizard:
      return { mountChar: 'L', mountColor: 0x55aa33ff };
    case MountType.Unicorn:
      return { mountChar: 'U', mountColor: 0xffddffff };
    case MountType.None:
    default:
      return { mountChar: CHAR_MONARCH, mountColor: COLOR_MONARCH };
  }
}

// ─── Hermit Cottage Rendering Helpers ────────────────────────────

function hermitTypeMarker(type: HermitType): string {
  switch (type) {
    case HermitType.Ballista: return 'b';
    case HermitType.Stable: return 's';
    case HermitType.Bakery: return 'k';
    case HermitType.Knight: return 'n';
    case HermitType.Horn: return 'o';
    case HermitType.FireTower: return 'f';
    case HermitType.Berserker: return 'r';
    default: return '?';
  }
}

// ─── Statue Rendering Helpers ────────────────────────────────────

function statueIcon(type: BlessingType): string {
  switch (type) {
    case BlessingType.Archer: return ')'; // bow
    case BlessingType.Farmer: return '/'; // scythe
    case BlessingType.Builder: return '#'; // wall
    case BlessingType.Knight: return '+'; // sword
    default: return '?';
  }
}

// ─── Playing Phase Render ─────────────────────────────────────────

function renderPlaying(buffer: CellBufferDirect, state: GameState, dt: number): void {
  const { viewWidth, viewHeight, tiles, timeOfDay } = state;
  const shakeOffset = state.screenShakeTimer > 0 ? (Math.random() - 0.5) * 3 : 0;
  const cameraX = state.cameraX + shakeOffset;
  const camXi = Math.floor(cameraX);

  // Vertical offset: push world to bottom of screen on tall terminals
  const MAP_H = tiles.length || 30;
  const yOffset = Math.max(0, viewHeight - MAP_H);

  // Helper to convert world Y to screen Y
  const toScreenY = (wy: number): number => wy + yOffset;

  // 1. Sky background (season-aware, blood moon override)
  const sky = state.isBloodMoon ? BLOOD_MOON_SKY : interpolateSkyColor(state.dayTime, state.season);
  fillRect(buffer, 0, 0, viewWidth, viewHeight, ' ', sky, sky);

  // Blood moon: large red moon at top of screen
  if (state.isBloodMoon) {
    const moonX = Math.floor(viewWidth / 2);
    const moonY = 3;
    if (moonY < viewHeight) {
      buffer.setCell(moonX, moonY, 'O', 0xff2222ff, BLOOD_MOON_SKY);
      if (moonX - 1 >= 0) buffer.setCell(moonX - 1, moonY, '(', 0x882222ff, BLOOD_MOON_SKY);
      if (moonX + 1 < viewWidth) buffer.setCell(moonX + 1, moonY, ')', 0x882222ff, BLOOD_MOON_SKY);
    }
  }

  // 1.5 Sun/moon celestial bodies
  if (!state.isBloodMoon) {
    if (state.dayTime >= DAY_START && state.dayTime < DUSK_START) {
      // Sun arcs during day
      const dayProgress = (state.dayTime - DAY_START) / (DUSK_START - DAY_START);
      const sunX = Math.floor(dayProgress * viewWidth);
      const sunArc = Math.sin(dayProgress * Math.PI);
      const sunY = Math.floor((1 - sunArc) * (GROUND_Y + yOffset - 6)) + 2;
      if (sunX >= 0 && sunX < viewWidth && sunY >= 0 && sunY < viewHeight) {
        buffer.setCell(sunX, sunY, 'O', 0xffdd44ff, sky);
      }
    } else if (state.dayTime >= NIGHT_START || state.dayTime < DAY_START) {
      // Moon arcs during night
      const nightTotal = (1.0 - NIGHT_START) + DAY_START;
      const nightProgress = state.dayTime >= NIGHT_START
        ? (state.dayTime - NIGHT_START) / nightTotal
        : ((1.0 - NIGHT_START) + state.dayTime) / nightTotal;
      const moonX = Math.floor(nightProgress * viewWidth);
      const moonArc = Math.sin(nightProgress * Math.PI);
      const moonY = Math.floor((1 - moonArc) * (GROUND_Y + yOffset - 6)) + 2;
      if (moonX >= 0 && moonX < viewWidth && moonY >= 0 && moonY < viewHeight) {
        buffer.setCell(moonX, moonY, 'C', 0xddddffff, sky);
      }
    }
  }

  // 2. Parallax: stars at 0.5x scroll speed (only visible at dusk/night/dawn)
  if (timeOfDay !== TimeOfDay.Day) {
    if (!stars) stars = generateStars();
    const starScrollX = Math.floor(cameraX * 0.5);
    for (const star of stars) {
      const sx = star.x - starScrollX;
      const wrappedX = ((sx % viewWidth) + viewWidth) % viewWidth;
      const starSY = star.y + yOffset;
      if (starSY >= 1 && starSY < toScreenY(GROUND_Y) && wrappedX >= 0 && wrappedX < viewWidth) {
        const twinkle = Math.sin(state.totalElapsed * 1.5 + star.x * 0.3) * 0.3 + 0.7;
        const b = Math.floor(star.brightness * twinkle * 180);
        const fg = ((b & 0xff) << 24) | ((b & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
        buffer.setCell(wrappedX, starSY, star.char, fg, sky);
      }
    }

    // 2.3 Constellation warning (2 days before crown stealer, around day 28)
    if (state.dayCount >= 26 && state.dayCount <= 30) {
      const constellationStars: [number, number][] = [
        [0.3, 1], [0.4, 2], [0.5, 1], [0.6, 2], [0.7, 1],
        [0.45, 3], [0.55, 3],
      ];
      const daysIn = state.dayCount - 26;
      const visibleCount = Math.min(constellationStars.length, Math.floor(daysIn * 2) + 2);
      const fade = state.dayCount >= 29 ? 0.5 : 1.0;
      for (let ci = 0; ci < visibleCount; ci++) {
        const [xFrac, row] = constellationStars[ci]!;
        const cx = Math.floor(xFrac * viewWidth);
        const constY = row + yOffset;
        if (cx >= 0 && cx < viewWidth && constY >= 0 && constY < viewHeight) {
          const twinkle = Math.sin(state.totalElapsed * 2 + ci * 1.7) * 0.2 + 0.8;
          const cr = Math.floor(0x88 * twinkle * fade);
          const cg = Math.floor(0x22 * twinkle * fade);
          const cb = Math.floor(0x22 * twinkle * fade);
          const cfg = ((cr & 0xff) << 24) | ((cg & 0xff) << 16) | ((cb & 0xff) << 8) | 0xff;
          buffer.setCell(cx, constY, '*', cfg, sky);
        }
      }
    }
  }

  // 2.5 Northern lights (winter clear nights only)
  if (state.season === Season.Winter && state.weather === WeatherType.Clear && !state.isBloodMoon
      && (timeOfDay === TimeOfDay.Night || timeOfDay === TimeOfDay.Dusk)) {
    let auroraIntensity = 0;
    if (state.dayTime >= NIGHT_START) {
      auroraIntensity = Math.sin(((state.dayTime - NIGHT_START) / (1.0 - NIGHT_START)) * Math.PI);
    } else if (state.dayTime < DAY_START) {
      auroraIntensity = 1 - state.dayTime / DAY_START;
    } else if (state.dayTime >= DUSK_START) {
      auroraIntensity = ((state.dayTime - DUSK_START) / (NIGHT_START - DUSK_START)) * 0.5;
    }
    if (auroraIntensity > 0.05) {
      for (let aRow = 2; aRow <= 5; aRow++) {
        const row = aRow + yOffset;
        if (row >= viewHeight) continue;
        for (let col = 0; col < viewWidth; col++) {
          const wave = Math.sin(col / 5 + state.totalElapsed * 0.5 + row * 0.8);
          if (wave > 0.3) {
            const bi = (wave - 0.3) * auroraIntensity;
            const isGreen = (row + Math.floor(state.totalElapsed * 0.3)) % 2 === 0;
            const ar = isGreen ? Math.floor(0x33 * bi) : Math.floor(0x88 * bi);
            const ag = isGreen ? Math.floor(0xaa * bi) : Math.floor(0x33 * bi);
            const ab = isGreen ? Math.floor(0x66 * bi) : Math.floor(0xaa * bi);
            if (ar > 5 || ag > 5 || ab > 5) {
              const afg = ((ar & 0xff) << 24) | ((ag & 0xff) << 16) | ((ab & 0xff) << 8) | 0xff;
              buffer.setCell(col, row, '\u2591', afg, sky);
            }
          }
        }
      }
    }
  }

  // 3. Parallax: clouds at 0.5x scroll speed (with slow drift)
  if (!clouds) clouds = generateClouds();
  const cloudDrift = Math.floor(state.totalElapsed * 2);
  const cloudScrollX = Math.floor(cameraX * 0.5) - cloudDrift;
  const cloudFg = timeOfDay === TimeOfDay.Night ? 0x222244ff : 0xccddeeee;
  for (const cloud of clouds) {
    const sx = cloud.x - cloudScrollX;
    const wrappedX = ((sx % (viewWidth + 20)) + viewWidth + 20) % (viewWidth + 20) - 10;
    for (let dx = 0; dx < cloud.width; dx++) {
      const cx = wrappedX + dx;
      const cloudSY = cloud.y + yOffset;
      if (cx >= 0 && cx < viewWidth && cloudSY >= 1 && cloudSY < toScreenY(GROUND_Y) - 4) {
        buffer.setCell(cx, cloudSY, '\u2592', cloudFg, sky);
      }
    }
  }

  // 3.5 Weather effects (rain/snow/storm overlay in sky area)
  renderWeather(buffer, viewWidth, viewHeight, state.weather, state.totalElapsed, toScreenY(GROUND_Y));

  // 4. Terrain tiles (animated water + tree sway)
  for (let sy = 0; sy < viewHeight; sy++) {
    const tileY = sy - yOffset;
    const tileRow = tiles[tileY];
    if (!tileRow) continue;
    for (let sx = 0; sx < viewWidth; sx++) {
      const worldX = camXi + sx;
      if (worldX < 0 || worldX >= tileRow.length) continue;
      const tile = tileRow[worldX]!;
      if (tile === TileType.Sky) continue;

      // Animated water: seasonal, flow direction, reflections
      if (tile === TileType.Water) {
        if (state.season === Season.Winter) {
          buffer.setCell(sx, sy, '=', 0xaabbccff, 0x223344ff);
        } else {
          const waterTime = Math.floor(state.totalElapsed * 2 + worldX * 0.15);
          const waterChar = waterTime % 2 === 0 ? '~' : '-';
          const biome = getBiome(worldX);
          if (biome === Biome.Swamp) {
            buffer.setCell(sx, sy, waterChar, 0x227766ff, 0x112233ff);
          } else {
            const colorPhase = Math.sin(state.totalElapsed * 1.5 + worldX * 0.2);
            const waterFg = colorPhase > 0 ? 0x3366aaff : 0x4477bbff;
            buffer.setCell(sx, sy, waterChar, waterFg, 0x112255ff);
          }
          // Night star reflections in water
          if (timeOfDay === TimeOfDay.Night || timeOfDay === TimeOfDay.Dusk) {
            const reflHash = ((worldX * 2654435761 + sy * 31) >>> 0) % 11;
            if (reflHash < 2) {
              const rb = Math.floor(40 + Math.sin(state.totalElapsed + worldX * 0.7) * 20);
              const rfg = ((rb & 0xff) << 24) | ((rb & 0xff) << 16) | ((rb & 0xff) << 8) | 0xff;
              buffer.setCell(sx, sy, '.', rfg, 0x112255ff);
            }
          }
        }
        continue;
      }

      // Swamp ground: darker green with occasional murk
      if (tile === TileType.Swamp) {
        const swampPhase = Math.sin(state.totalElapsed * 0.5 + worldX * 0.7);
        const swampChar = swampPhase > 0.3 ? CHAR_GRASS : ',';
        buffer.setCell(sx, sy, swampChar, 0x116622ff, 0x0a2211ff);
        continue;
      }

      // Mountain: rocky elevated terrain
      if (tile === TileType.Mountain) {
        const rockHash = ((worldX * 13 + sy * 7) >>> 0) % 5;
        const mountainChar = rockHash < 2 ? '^' : rockHash < 4 ? '.' : '\u2592';
        buffer.setCell(sx, sy, mountainChar, 0x887766ff, 0x666655ff);
        continue;
      }

      // Ruins: broken walls with box-drawing characters
      if (tile === TileType.Ruins) {
        const ruinChars = ['\u250C', '\u2510', '\u2514', '\u2518', '\u2502', '\u2500'];
        const ruinIdx = ((worldX * 11 + sy * 5) >>> 0) % ruinChars.length;
        buffer.setCell(sx, sy, ruinChars[ruinIdx]!, 0x444444ff, 0x222222ff);
        continue;
      }

      // Tree sway: alternate canopy chars (season-aware colors)
      if (tile === TileType.Forest) {
        if (tileY === GROUND_Y) {
          buffer.setCell(sx, sy, CHAR_TREE_TRUNK, COLOR_TREE_TRUNK, 0x0a3311ff);
        } else {
          const swayPhase = Math.sin(state.totalElapsed * 0.8 + worldX * 0.5);
          const treeChar = swayPhase > 0.3 ? '\u2660' : '\u2663';
          buffer.setCell(sx, sy, treeChar, seasonalForestFg(state.season), 0x0a3311ff);
        }
        continue;
      }

      // Grass: season-aware coloring
      if (tile === TileType.Grass) {
        buffer.setCell(sx, sy, CHAR_GRASS, seasonalGrassFg(state.season), seasonalGrassBg(state.season));
        continue;
      }

      buffer.setCell(sx, sy, tileChar(tile), tileFg(tile), tileBg(tile));
    }
  }

  // 4.1 Fill rows below terrain map with animated reflective water
  const tileRows = tiles.length;
  const tileBottomRow = tileRows + yOffset;
  if (viewHeight > tileBottomRow) {
    for (let sy = tileBottomRow; sy < viewHeight; sy++) {
      for (let sx = 0; sx < viewWidth; sx++) {
        const worldX = camXi + sx;
        const depth = sy - tileBottomRow; // Distance below terrain edge
        if (state.season === Season.Winter) {
          // Frozen deep water
          buffer.setCell(sx, sy, '=', 0x8899aaff, 0x112233ff);
        } else {
          // Animated deep water with reflections
          const wt = Math.floor(state.totalElapsed * 1.5 + worldX * 0.12 + depth * 0.3);
          const waterChar = wt % 3 === 0 ? '~' : wt % 3 === 1 ? '-' : '\u2248';
          const colorPhase = Math.sin(state.totalElapsed * 1.2 + worldX * 0.15 + depth * 0.5);
          const depthFade = Math.max(0, 1.0 - depth * 0.1);
          const baseR = Math.floor(0x22 * depthFade);
          const baseG = Math.floor((0x44 + colorPhase * 0x11) * depthFade);
          const baseB = Math.floor((0x88 + colorPhase * 0x22) * depthFade);
          const waterFg = ((baseR & 0xff) << 24) | ((baseG & 0xff) << 16) | ((baseB & 0xff) << 8) | 0xff;
          const bgR = Math.floor(0x08 * depthFade);
          const bgG = Math.floor(0x15 * depthFade);
          const bgB = Math.floor((0x33 + colorPhase * 0x11) * depthFade);
          const waterBg = ((bgR & 0xff) << 24) | ((bgG & 0xff) << 16) | ((bgB & 0xff) << 8) | 0xff;
          buffer.setCell(sx, sy, waterChar, waterFg, waterBg);

          // Star/sky reflections in water (night/dusk)
          if (timeOfDay === TimeOfDay.Night || timeOfDay === TimeOfDay.Dusk) {
            const reflHash = ((worldX * 2654435761 + sy * 37) >>> 0) % 17;
            if (reflHash < 2) {
              const sparkle = Math.sin(state.totalElapsed * 0.8 + worldX * 0.5 + depth);
              if (sparkle > 0.3) {
                const rb = Math.floor(30 + sparkle * 40);
                const rfg = ((rb & 0xff) << 24) | ((rb & 0xff) << 16) | (((rb + 20) & 0xff) << 8) | 0xff;
                buffer.setCell(sx, sy, '.', rfg, waterBg);
              }
            }
          }
        }
      }
    }
  }

  // 4.5 Blood moon ambient glow on ground tiles
  if (state.isBloodMoon) {
    for (let sx = 0; sx < viewWidth; sx++) {
      const sy = toScreenY(GROUND_Y);
      if (sy >= viewHeight) continue;
      const cell = buffer.cells[sy]?.[sx];
      if (cell) {
        // Tint existing fg with red-orange
        const r = Math.min(255, ((cell.fg >> 24) & 0xff) + 40);
        const g = Math.max(0, ((cell.fg >> 16) & 0xff) - 20);
        const b = Math.max(0, ((cell.fg >> 8) & 0xff) - 30);
        cell.fg = ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
      }
    }
  }

  // 4.6 Campfire warm glow radius (night/dusk only)
  if (timeOfDay === TimeOfDay.Night || timeOfDay === TimeOfDay.Dusk) {
    let glowRadius = 0;
    if (state.townCenterTier >= TownCenterTier.Village) glowRadius = 12;
    else if (state.townCenterTier >= TownCenterTier.Camp) glowRadius = 8;
    else if (state.townCenterTier >= TownCenterTier.Campfire) glowRadius = 5;
    if (glowRadius > 0) {
      const campSX = worldToScreen(CAMP_CENTER_X, cameraX);
      const tintR = state.isBloodMoon ? 0x66 : 0x44;
      const tintG = state.isBloodMoon ? 0x11 : 0x22;
      const glowGroundY = toScreenY(GROUND_Y);
      for (let gx = Math.max(0, campSX - glowRadius); gx <= Math.min(viewWidth - 1, campSX + glowRadius); gx++) {
        const dist = Math.abs(gx - campSX);
        const intensity = 0.3 * (1 - dist / glowRadius);
        if (intensity <= 0) continue;
        for (let gy = Math.max(0, glowGroundY - 3); gy < Math.min(viewHeight, glowGroundY + 3); gy++) {
          const cell = buffer.cells[gy]?.[gx];
          if (!cell) continue;
          const bgR = (cell.bg >> 24) & 0xff;
          const bgG = (cell.bg >> 16) & 0xff;
          const bgB = (cell.bg >> 8) & 0xff;
          const nr = Math.floor(bgR * (1 - intensity) + tintR * intensity);
          const ng = Math.floor(bgG * (1 - intensity) + tintG * intensity);
          const nb = Math.floor(bgB * (1 - intensity));
          cell.bg = ((nr & 0xff) << 24) | ((ng & 0xff) << 16) | ((nb & 0xff) << 8) | 0xff;
        }
      }
    }
  }

  // 5. Parallax: foreground grass details at 1.2x scroll speed
  const grassY = toScreenY(GROUND_Y + 1); // Just below ground level, on dirt
  if (grassY < viewHeight) {
    const grassScrollX = Math.floor(cameraX * 1.2);
    for (let sx = 0; sx < viewWidth; sx++) {
      const worldGrassX = grassScrollX + sx;
      // Use deterministic pattern based on world position
      const hash = ((worldGrassX * 2654435761) >>> 0) % 7;
      if (hash < 3) {
        const ch = GRASS_DETAILS[hash]!;
        const tileRow = tiles[GROUND_Y + 1];
        if (tileRow) {
          const tileWorldX = camXi + sx;
          const tile = tileRow[tileWorldX];
          if (tile === TileType.Dirt) {
            buffer.setCell(sx, grassY, ch, 0x336622ff, 0x442211ff);
          }
        }
      }
    }
  }

  // 5.5 Construction blueprints (dim, blinking outlines)
  for (const bx of getBlueprints()) {
    if (!isOnScreen(bx, cameraX, viewWidth)) continue;
    const sx = worldToScreen(bx, cameraX);
    const sy = toScreenY(GROUND_Y);
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      const bpColor = Math.floor(state.totalElapsed * 2) % 2 === 0 ? 0x664433ff : 0x332211ff;
      buffer.setCell(sx, sy, CHAR_WALL, bpColor, COLOR_BG);
    }
  }

  // 5.7 Town center multi-char rendering
  {
    const tier = state.townCenterTier;
    const [tcChars, tcColor] = TOWN_CENTER_VISUALS[tier]!;
    const tcStartX = CAMP_CENTER_X - Math.floor(tcChars.length / 2);
    for (let i = 0; i < tcChars.length; i++) {
      const wx = tcStartX + i;
      if (!isOnScreen(wx, cameraX, viewWidth)) continue;
      const sx = worldToScreen(wx, cameraX);
      const sy = toScreenY(GROUND_Y);
      if (sx < 0 || sx >= viewWidth || sy < 0 || sy >= viewHeight) continue;
      if (tier === TownCenterTier.Campfire) {
        // Flickering campfire
        const fireColor = Math.floor(state.totalElapsed * 4) % 2 === 0 ? 0xff6600ff : 0xff8800ff;
        buffer.setCell(sx, sy, '*', fireColor, COLOR_BG);
      } else {
        buffer.setCell(sx, sy, tcChars[i]!, tcColor, COLOR_BG);
      }
    }
    // Castle tier: banner char above center
    if (tier >= TownCenterTier.Castle) {
      const bannerX = CAMP_CENTER_X;
      if (isOnScreen(bannerX, cameraX, viewWidth)) {
        const bsx = worldToScreen(bannerX, cameraX);
        const bsy = toScreenY(GROUND_Y - 1);
        if (bsx >= 0 && bsx < viewWidth && bsy >= 0 && bsy < viewHeight) {
          const bannerColor = Math.floor(state.totalElapsed * 2) % 2 === 0 ? 0xffcc00ff : 0xffaa00ff;
          buffer.setCell(bsx, bsy, '\u2691', bannerColor, COLOR_BG);
        }
      }
    }
  }

  // 6. Structures (towers, under-construction pulses, wall HP bars)
  for (const [, structure] of state.structures) {
    if (!isOnScreen(structure.x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(structure.x, cameraX);
    const sy = toScreenY(GROUND_Y);
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      if (structure.type === StructureType.Campfire) {
        continue;
      } else if (structure.hp === 0 && structure.maxHp > 0) {
        const buildPulse = Math.sin(state.totalElapsed * 3) * 0.3 + 0.5;
        const b = Math.floor(0x88 * buildPulse);
        const buildColor = ((b & 0xff) << 24) | ((b & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
        buffer.setCell(sx, sy, '-', buildColor, COLOR_BG);
      } else if ((structure.towerTier ?? TowerTier.None) > TowerTier.None) {
        // Tower rendering based on tier
        const tier = structure.towerTier!;
        const [towerChars, towerColor] = TOWER_VISUALS[tier]!;
        const towerStartX = sx - Math.floor(towerChars.length / 2);
        for (let ti = 0; ti < towerChars.length; ti++) {
          const tx = towerStartX + ti;
          if (tx >= 0 && tx < viewWidth) {
            buffer.setCell(tx, sy, towerChars[ti]!, towerColor, COLOR_BG);
          }
        }
        // Stone tower and above: render 2 chars high
        if (tier >= TowerTier.StoneTower) {
          const topY = sy - 1;
          if (topY >= 0 && topY < viewHeight) {
            if (tier >= TowerTier.RoofedTriplet) {
              // Roofed: show roof char above center
              const roofColor = 0x777788ff;
              buffer.setCell(sx, topY, '^', roofColor, COLOR_BG);
            } else {
              buffer.setCell(sx, topY, '|', towerColor, COLOR_BG);
            }
          }
        }
        // Archer count above tower
        const capacity = TOWER_ARCHER_CAPACITY[tier] ?? 0;
        if (capacity > 0) {
          const countY = sy - (tier >= TowerTier.StoneTower ? 2 : 1);
          if (countY >= 0 && countY < viewHeight) {
            const assigned = structure.assignedWorkers.length;
            const countStr = `${assigned}/${capacity}`;
            const countColor = assigned >= capacity ? 0x44cc44ff : 0xcccc44ff;
            for (let ci = 0; ci < countStr.length; ci++) {
              const cx = sx - Math.floor(countStr.length / 2) + ci;
              if (cx >= 0 && cx < viewWidth) {
                buffer.setCell(cx, countY, countStr[ci]!, countColor, COLOR_BG);
              }
            }
          }
        }
      } else {
        buffer.setCell(sx, sy, structureChar(structure), structureFg(structure), COLOR_BG);
      }

      // Wall HP bars
      const isWall = structure.type === StructureType.WallWood
        || structure.type === StructureType.WallStone
        || structure.type === StructureType.WallIron;
      if (isWall && structure.hp > 0 && structure.hp < structure.maxHp) {
        const hpY = toScreenY(GROUND_Y - 1);
        if (hpY >= 0 && hpY < viewHeight) {
          const ratio = structure.hp / structure.maxHp;
          const hpColor = ratio > 0.66 ? 0x44cc44ff : ratio > 0.33 ? 0xcccc44ff : 0xff4444ff;
          buffer.setCell(sx, hpY, '\u2588', hpColor, COLOR_BG);
        }
      }
    }
  }

  // 6.5 Consumable spots (pulse/sparkle to attract attention)
  for (const [x, type] of state.consumableSpots) {
    if (state.consumedSpots.has(x)) continue;
    if (!isOnScreen(x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(x, cameraX);
    const sy = toScreenY(GROUND_Y - 1);
    if (sx < 0 || sx >= viewWidth || sy < 0 || sy >= viewHeight) continue;

    const pulse = Math.sin(state.totalElapsed * 3) * 0.3 + 0.7;

    switch (type) {
      case ConsumableType.FoodCache: {
        const r = Math.floor(255 * pulse);
        const g = Math.floor(204 * pulse);
        const fg = ((r & 0xff) << 24) | ((g & 0xff) << 16) | (0x00 << 8) | 0xff;
        buffer.setCell(sx, sy, CHAR_COIN, fg, COLOR_BG);
        break;
      }
      case ConsumableType.RestShrine: {
        const r = Math.floor(0x44 * pulse);
        const g = Math.floor(0xcc * pulse);
        const b = Math.floor(0xff * pulse);
        const fg = ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | 0xff;
        buffer.setCell(sx, sy, '\u2726', fg, COLOR_BG);
        break;
      }
      case ConsumableType.PowerWell: {
        const rb = Math.floor(0xff * pulse);
        const fg = ((rb & 0xff) << 24) | (0x00 << 16) | ((rb & 0xff) << 8) | 0xff;
        buffer.setCell(sx, sy, '\u25C6', fg, COLOR_BG);
        break;
      }
    }
  }

  // 6.7 Hermit cottages (small houses in forest)
  for (const hermit of getAvailableHermits()) {
    if (!isOnScreen(hermit.x, cameraX, viewWidth)) continue;
    const hsx = worldToScreen(hermit.x, cameraX);
    const hsy = toScreenY(GROUND_Y);
    if (hsx < 0 || hsx >= viewWidth || hsy < 0 || hsy >= viewHeight) continue;

    if (hermit.kidnapped) {
      // Dim empty cottage
      buffer.setCell(hsx, hsy, 'h', 0x333333ff, COLOR_BG);
    } else {
      // Cottage with roof
      buffer.setCell(hsx, hsy, 'h', 0x228833ff, COLOR_BG);
      // Hermit type marker next to cottage when home (not riding)
      if (!hermit.riding && hsx + 1 < viewWidth) {
        buffer.setCell(hsx + 1, hsy, hermitTypeMarker(hermit.type), 0x88aa44ff, COLOR_BG);
      }
      // Small roof char above
      const roofY = hsy - 1;
      if (roofY >= 0 && roofY < viewHeight) {
        buffer.setCell(hsx, roofY, '^', 0x664422ff, COLOR_BG);
      }
    }
  }

  // 6.8 Statues (pedestal + icon, blessing particles)
  for (const statue of getStatues()) {
    if (!isOnScreen(statue.x, cameraX, viewWidth)) continue;
    const ssx = worldToScreen(statue.x, cameraX);
    const ssy = toScreenY(GROUND_Y);
    if (ssx < 0 || ssx >= viewWidth || ssy < 0 || ssy >= viewHeight) continue;

    if (statue.blessingActive) {
      // Active (blessed): bright gold with particles
      buffer.setCell(ssx, ssy, '!', 0xffcc00ff, COLOR_BG);
      // Icon above pedestal
      const iconY = ssy - 1;
      if (iconY >= 0 && iconY < viewHeight) {
        buffer.setCell(ssx, iconY, statueIcon(statue.type), 0xffcc00ff, COLOR_BG);
      }
      // Radiating particles (small dots orbiting)
      const particlePhase = state.totalElapsed * 3;
      for (let p = 0; p < 4; p++) {
        const angle = particlePhase + p * (Math.PI / 2);
        const pdx = Math.round(Math.cos(angle) * 2);
        const pdy = Math.round(Math.sin(angle) * 1);
        const px = ssx + pdx;
        const py = ssy + pdy;
        if (px >= 0 && px < viewWidth && py >= 0 && py < viewHeight) {
          buffer.setCell(px, py, '.', 0xffee88ff, COLOR_BG);
        }
      }
    } else if (statue.unlocked) {
      // Unlocked but not active: dim gold
      buffer.setCell(ssx, ssy, '!', 0x886600ff, COLOR_BG);
      const iconY = ssy - 1;
      if (iconY >= 0 && iconY < viewHeight) {
        buffer.setCell(ssx, iconY, statueIcon(statue.type), 0x886600ff, COLOR_BG);
      }
    } else {
      // Not unlocked: dim gray pedestal
      buffer.setCell(ssx, ssy, '|', 0x555555ff, COLOR_BG);
    }

    // Show cost in HUD area when monarch is within 5 tiles
    const monarchPos = getPosition(state.world, state.monarch.eid);
    if (monarchPos && distance(monarchPos.x, statue.x) <= 5) {
      const config = getStatueConfig(statue.type);
      if (config) {
        const costY = ssy - 2;
        if (costY >= 0 && costY < viewHeight) {
          const costStr = statue.unlocked ? `${config.coinCost}\u25CF` : `${config.gemCost}\u25C6`;
          const costColor = statue.unlocked ? COLOR_COIN : 0x44ccffff;
          for (let ci = 0; ci < costStr.length; ci++) {
            const cx = ssx - Math.floor(costStr.length / 2) + ci;
            if (cx >= 0 && cx < viewWidth) {
              buffer.setCell(cx, costY, costStr[ci]!, costColor, COLOR_BG);
            }
          }
        }
      }
    }
  }

  // 7. Units (with NPC subtype rendering for vagrants)
  for (const unit of state.units) {
    const pos = getPosition(state.world, unit.eid);
    if (!pos) continue;
    if (!isOnScreen(pos.x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(pos.x, cameraX);
    const sy = toScreenY(Math.floor(pos.y));
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      if (unit.role === UnitRole.Vagrant) {
        const origin = getNpcOrigin(unit.eid);
        let ch: string;
        let fg: number;
        switch (origin) {
          case NpcOrigin.Warrior:
            ch = '\u2694'; fg = 0xff4444ff; break;
          case NpcOrigin.Scout:
            ch = '\u2192'; fg = 0x44ff44ff; break;
          case NpcOrigin.Craftsman:
            ch = '\u2692'; fg = 0x4488ffff; break;
          case NpcOrigin.Peasant:
            ch = '\u2698'; fg = 0xffdd44ff; break;
          default:
            ch = CHAR_VILLAGER; fg = COLOR_VILLAGER; break;
        }
        buffer.setCell(sx, sy, ch, fg, COLOR_BG);
      } else {
        buffer.setCell(sx, sy, unitChar(unit.role), unitFg(unit.role), COLOR_BG);
        // Entity detail accessories
        const detailX = sx + 1;
        if (detailX < viewWidth) {
          if (unit.role === UnitRole.Builder && unit.aiState === AIState.Working) {
            buffer.setCell(detailX, sy, '/', COLOR_BUILDER, COLOR_BG);
          } else if (unit.role === UnitRole.Archer) {
            buffer.setCell(detailX, sy, unit.aiState === AIState.Attacking ? '>' : ')', COLOR_ARCHER, COLOR_BG);
          } else if (unit.role === UnitRole.Farmer && timeOfDay === TimeOfDay.Day) {
            buffer.setCell(detailX, sy, '/', COLOR_FARMER, COLOR_BG);
          } else if (unit.role === UnitRole.Knight) {
            buffer.setCell(detailX, sy, unit.aiState === AIState.Defending ? '|' : '+', COLOR_MONARCH, COLOR_BG);
          } else if (unit.role === UnitRole.Pikeman) {
            buffer.setCell(detailX, sy, unit.aiState === AIState.Attacking ? 'I' : '|', COLOR_BUILDER, COLOR_BG);
          } else if (unit.role === UnitRole.Squire) {
            buffer.setCell(detailX, sy, ']', COLOR_FARMER, COLOR_BG);
          }
        }
      }
    }
  }

  // 7.5 Animals (rabbits and deer in forest areas)
  for (const animal of getAnimals()) {
    if (!isOnScreen(animal.x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(animal.x, cameraX);
    const sy = toScreenY(Math.floor(animal.y));
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      const ch = animal.type === 'rabbit' ? 'r' : 'D';
      const fg = animal.type === 'rabbit' ? 0xccaa88ff : 0x886644ff;
      buffer.setCell(sx, sy, ch, fg, COLOR_BG);
    }
  }

  // 7.6 Dog companion
  if (state.hasDog && !state.dogCaptured) {
    const dogWorldX = getDogX();
    if (isOnScreen(dogWorldX, cameraX, viewWidth)) {
      const dsx = worldToScreen(dogWorldX, cameraX);
      const dsy = toScreenY(GROUND_Y);
      if (dsx >= 0 && dsx < viewWidth && dsy >= 0 && dsy < viewHeight) {
        buffer.setCell(dsx, dsy, 'd', 0xaa8866ff, COLOR_BG);
        if (isDogBarking() && dsx + 1 < viewWidth) {
          buffer.setCell(dsx + 1, dsy, '!', 0xff4444ff, COLOR_BG);
        }
      }
    }
  }

  // 8. Monarch (mount type specific rendering) + crown visual
  {
    const pos = getPosition(state.world, state.monarch.eid);
    if (pos && isOnScreen(pos.x, cameraX, viewWidth)) {
      const sx = worldToScreen(pos.x, cameraX);
      const sy = toScreenY(Math.floor(pos.y));
      if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
        const mount = getMountRenderData(state.mountType, state.totalElapsed);
        // Render mount body character
        buffer.setCell(sx, sy, mount.mountChar, mount.mountColor, COLOR_BG);
        // For bear: wider body (extra char to the right)
        if (state.mountType === MountType.Bear && sx + 1 < viewWidth) {
          buffer.setCell(sx + 1, sy, mount.mountChar, mount.mountColor, COLOR_BG);
        }
        // Render '@' monarch on top of mount (or just monarch char if no mount)
        if (state.mountType !== MountType.None) {
          const monarchOnMountY = sy - 1;
          if (monarchOnMountY >= 0 && monarchOnMountY < viewHeight) {
            buffer.setCell(sx, monarchOnMountY, '@', COLOR_MONARCH, COLOR_BG);
          }
        }

        // Crown above monarch when not dropped
        if (!state.crownDropped) {
          const crownY = state.mountType !== MountType.None ? sy - 2 : sy - 1;
          if (crownY >= 0 && crownY < viewHeight) {
            buffer.setCell(sx, crownY, CHAR_CROWN, COLOR_MONARCH, COLOR_BG);
          }
        }
        // Monarch coin count
        if (state.monarchCoins > 0) {
          const coinCountX = sx + (state.mountType === MountType.Bear ? 2 : 1);
          const coinCountY = state.mountType !== MountType.None ? sy - 1 : sy;
          const countStr = String(state.monarchCoins);
          for (let ci = 0; ci < countStr.length; ci++) {
            if (coinCountX + ci >= 0 && coinCountX + ci < viewWidth && coinCountY >= 0 && coinCountY < viewHeight) {
              buffer.setCell(coinCountX + ci, coinCountY, countStr[ci]!, COLOR_COIN, COLOR_BG);
            }
          }
        }
        // Hermit riding indicator
        const ridingHermit = getRidingHermit();
        if (ridingHermit !== null) {
          const hx = sx - 1;
          const hy = state.mountType !== MountType.None ? sy - 1 : sy;
          if (hx >= 0 && hx < viewWidth && hy >= 0 && hy < viewHeight) {
            buffer.setCell(hx, hy, 'h', 0x88aa44ff, COLOR_BG);
          }
        }
      }
    }
  }

  // 8.5 Dropped crown (bouncing on ground, sparkle effect)
  if (state.crownDropped) {
    if (isOnScreen(state.crownX, cameraX, viewWidth)) {
      const sx = worldToScreen(state.crownX, cameraX);
      const bounceOffset = Math.floor(Math.sin(state.totalElapsed * 8) * 1.5);
      const sy = toScreenY(Math.floor(state.crownY)) + bounceOffset;
      if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
        const crownChar = Math.floor(state.totalElapsed * 2) % 2 === 0 ? CHAR_CROWN : '*';
        buffer.setCell(sx, sy, crownChar, 0xffcc00ff, COLOR_BG);
      }
    }
  }

  // 9. Greeds
  for (const greed of state.greeds) {
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (!isOnScreen(pos.x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(pos.x, cameraX);
    const sy = toScreenY(Math.floor(pos.y));
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      const ch = greed.type === GreedType.Masked ? CHAR_GREED_MASK : CHAR_GREED;
      const col = greed.type === GreedType.Masked ? COLOR_GREED_MASK : COLOR_GREED;
      buffer.setCell(sx, sy, ch, col, COLOR_BG);
    }
  }

  // 9.5 Dropped coins (pulsing on the ground)
  for (const coin of getDroppedCoins()) {
    if (!isOnScreen(coin.x, cameraX, viewWidth)) continue;
    const sx = worldToScreen(coin.x, cameraX);
    const sy = toScreenY(Math.floor(coin.y));
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      const coinPulse = Math.sin(state.totalElapsed * 4 + coin.x) * 0.2 + 0.8;
      const cr = Math.floor(0xff * coinPulse);
      const cg = Math.floor(0xcc * coinPulse);
      const coinFg = ((cr & 0xff) << 24) | ((cg & 0xff) << 16) | (0x00 << 8) | 0xff;
      buffer.setCell(sx, sy, CHAR_COIN, coinFg, COLOR_BG);
    }
  }

  // 10. Projectiles
  for (const proj of state.projectiles) {
    const sx = worldToScreen(proj.x, cameraX);
    const sy = toScreenY(Math.floor(proj.y));
    if (sx >= 0 && sx < viewWidth && sy >= 0 && sy < viewHeight) {
      const ch = proj.vx >= 0 ? CHAR_ARROW : '\u2190';
      buffer.setCell(sx, sy, ch, COLOR_COIN, COLOR_BG);
    }
  }

  // 11. Night overlay (smooth gradient)
  applyNightOverlay(buffer, timeOfDay, state.dayTime, state.isBloodMoon);

  // 12. Sparkle effects + coin sparkles
  updateSparkles(buffer, dt);
  updateCoinSparkles(dt);
  renderCoinSparkles(buffer);

  // 13. Wave flash
  updateWaveFlash(buffer, dt);

  // 14. HUD (after overlay so it's always readable)
  renderHud(state, buffer);
}

// ─── Main Render Entry Point ──────────────────────────────────────

let lastRenderTime = Date.now();

/**
 * Phase-aware render: delegates to title screen, playing, or game over renderer.
 * Flushes to stdout with dirty-rect optimization.
 */
export function render(state: GameState): void {
  const { viewWidth, viewHeight } = state;
  const buffer = ensureBuffer(viewWidth, viewHeight);

  const now = Date.now();
  const dt = (now - lastRenderTime) / 1000;
  lastRenderTime = now;

  switch (state.phase) {
    case GamePhase.Title:
      renderTitleScreen(buffer, state.totalElapsed);
      break;
    case GamePhase.IslandSelect:
      renderIslandSelectScreen(buffer, state);
      break;
    case GamePhase.Playing:
      renderPlaying(buffer, state, dt);
      if (state.isPaused) {
        renderPauseOverlay(buffer);
      }
      break;
    case GamePhase.GameOver:
      renderGameOverScreen(buffer, state);
      break;
    case GamePhase.Victory:
      renderVictoryScreen(buffer, state);
      break;
  }

  flushBuffer(buffer, state.needsFullRedraw);
  state.needsFullRedraw = false;
}

// ─── ANSI Output with Dirty-Rect Diffing ──────────────────────────

function flushBuffer(buffer: CellBufferDirect, forceFullRedraw: boolean): void {
  const stdout = process.stdout;

  if (forceFullRedraw || !prevBuffer || prevBuffer.width !== buffer.width || prevBuffer.height !== buffer.height) {
    writeRaw(bufferToAnsiFull(buffer));
    prevBuffer = cloneBufferDeep(buffer);
    return;
  }

  let output = '';
  let lastFg = -1;
  let lastBg = -1;
  let lastOutX = -2;
  let lastOutY = -1;

  for (let y = 0; y < buffer.height; y++) {
    const currentRow = buffer.cells[y];
    const prevRow = prevBuffer.cells[y];
    if (!currentRow) continue;

    for (let x = 0; x < buffer.width; x++) {
      const cur = currentRow[x];
      const prev = prevRow?.[x];
      if (!cur) continue;

      if (prev && cur.char === prev.char && cur.fg === prev.fg && cur.bg === prev.bg) {
        continue;
      }

      // Skip cursor repositioning for consecutive cells on same row
      if (y !== lastOutY || x !== lastOutX + 1) {
        output += `\x1b[${y + 1};${x + 1}H`;
      }

      if (cur.fg !== lastFg || cur.bg !== lastBg) {
        const fgR = (cur.fg >> 24) & 0xff;
        const fgG = (cur.fg >> 16) & 0xff;
        const fgB = (cur.fg >> 8) & 0xff;
        const bgR = (cur.bg >> 24) & 0xff;
        const bgG = (cur.bg >> 16) & 0xff;
        const bgB = (cur.bg >> 8) & 0xff;
        output += `\x1b[38;2;${fgR};${fgG};${fgB};48;2;${bgR};${bgG};${bgB}m`;
        lastFg = cur.fg;
        lastBg = cur.bg;
      }

      output += cur.char;
      lastOutX = x;
      lastOutY = y;

      if (prev) {
        prev.char = cur.char;
        prev.fg = cur.fg;
        prev.bg = cur.bg;
      }
    }
  }

  if (output) {
    writeRaw(output);
  }
}

function bufferToAnsiFull(buffer: CellBufferDirect): string {
  let output = '\x1b[H';
  let lastFg = -1;
  let lastBg = -1;

  for (let y = 0; y < buffer.height; y++) {
    const row = buffer.cells[y];
    if (!row) continue;
    for (let x = 0; x < buffer.width; x++) {
      const cell = row[x];
      if (!cell) continue;
      if (cell.fg !== lastFg || cell.bg !== lastBg) {
        const fgR = (cell.fg >> 24) & 0xff;
        const fgG = (cell.fg >> 16) & 0xff;
        const fgB = (cell.fg >> 8) & 0xff;
        const bgR = (cell.bg >> 24) & 0xff;
        const bgG = (cell.bg >> 16) & 0xff;
        const bgB = (cell.bg >> 8) & 0xff;
        output += `\x1b[38;2;${fgR};${fgG};${fgB};48;2;${bgR};${bgG};${bgB}m`;
        lastFg = cell.fg;
        lastBg = cell.bg;
      }
      output += cell.char;
    }
    if (y < buffer.height - 1) {
      output += '\n';
    }
  }

  return output;
}

function cloneBufferDeep(buffer: CellBufferDirect): CellBufferDirect {
  const cells: { char: string; fg: number; bg: number }[][] = [];
  for (let y = 0; y < buffer.height; y++) {
    const srcRow = buffer.cells[y];
    const row: { char: string; fg: number; bg: number }[] = [];
    if (srcRow) {
      for (let x = 0; x < buffer.width; x++) {
        const c = srcRow[x];
        row.push(c ? { char: c.char, fg: c.fg, bg: c.bg } : { char: ' ', fg: 0xffffffff, bg: 0x000000ff });
      }
    }
    cells.push(row);
  }
  return {
    width: buffer.width,
    height: buffer.height,
    cells,
    setCell(x: number, y: number, char: string, fg: number, bg: number) {
      const r = cells[y];
      if (r) {
        const cell = r[x];
        if (cell) {
          cell.char = char;
          cell.fg = fg;
          cell.bg = bg;
        }
      }
    },
  };
}
