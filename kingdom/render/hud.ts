/**
 * Kingdom - HUD rendering
 * Top status bar, secondary bar (stamina/mount/wave), unit counts,
 * wall health, blood moon warning, message log.
 */

import { getPosition } from 'blecsd';
import {
  type GameState,
  type StructureData,
  TimeOfDay,
  Season,
  TownCenterTier,
  TowerTier,
  WeatherType,
  UnitRole,
  StructureType,
  MountType,
  TileType,
  MAP_WIDTH,
  GROUND_Y,
  COLOR_HUD_BG,
  COLOR_HUD_TEXT,
  COLOR_COIN,
  COLOR_GREED,
  COLOR_BUILDER,
  COLOR_ARCHER,
  COLOR_FARMER,
  COLOR_WALL_WOOD,
  CHAR_COIN,
  NIGHT_START,
  DUSK_START,
  CAMP_CENTER_X,
  TOWN_CENTER_COSTS,
  TOWN_CENTER_NAMES,
} from '../types';
import { getNearbyInteractable } from '../game/economy';

interface CellBufferDirect {
  width: number;
  height: number;
  cells: { char: string; fg: number; bg: number }[][];
  setCell: (x: number, y: number, char: string, fg: number, bg: number) => void;
}

const COLOR_MSG_FG = 0xcccc88ff;
const COLOR_MSG_BG = 0x111111ff;
const COLOR_WARN_FG = 0xff4444ff;
const COLOR_HP_FULL = 0x44cc44ff;
const COLOR_HP_MED = 0xcccc44ff;
const COLOR_HP_LOW = 0xff4444ff;
const COLOR_STAMINA = 0x44ccccff;

const SEASON_NAMES: Record<Season, string> = {
  [Season.Spring]: 'Spring',
  [Season.Summer]: 'Summer',
  [Season.Autumn]: 'Autumn',
  [Season.Winter]: 'Winter',
};

const SEASON_COLORS: Record<Season, number> = {
  [Season.Spring]: 0x44cc44ff,
  [Season.Summer]: 0xffcc44ff,
  [Season.Autumn]: 0xcc8833ff,
  [Season.Winter]: 0x99bbddff,
};

function weatherIcon(w: WeatherType): string {
  switch (w) {
    case WeatherType.Rain: return '~';
    case WeatherType.Snow: return '*';
    case WeatherType.Storm: return '!';
    default: return ' ';
  }
}

const WEATHER_COLORS: Record<WeatherType, number> = {
  [WeatherType.Clear]: 0x888888ff,
  [WeatherType.Rain]: 0x4488bbff,
  [WeatherType.Snow]: 0xddddffff,
  [WeatherType.Storm]: 0xff4444ff,
};

function timeOfDayIcon(tod: TimeOfDay): string {
  switch (tod) {
    case TimeOfDay.Dawn: return '\u263C';
    case TimeOfDay.Day: return '\u2600';
    case TimeOfDay.Dusk: return '\u263D';
    case TimeOfDay.Night: return '\u263E';
  }
}

function writeString(buffer: CellBufferDirect, x: number, y: number, text: string, fg: number, bg: number): number {
  for (let i = 0; i < text.length; i++) {
    const col = x + i;
    if (col >= 0 && col < buffer.width && y >= 0 && y < buffer.height) {
      buffer.setCell(col, y, text[i]!, fg, bg);
    }
  }
  return x + text.length;
}

function countByRole(units: { role: UnitRole }[], role: UnitRole): number {
  let count = 0;
  for (const u of units) {
    if (u.role === role) count++;
  }
  return count;
}

function findOutermostWalls(structures: Map<number, StructureData>): { left: StructureData | null; right: StructureData | null } {
  let leftWall: StructureData | null = null;
  let rightWall: StructureData | null = null;

  for (const [, s] of structures) {
    if (s.type !== StructureType.WallWood && s.type !== StructureType.WallStone && s.type !== StructureType.WallIron) continue;
    if (!leftWall || s.x < leftWall.x) leftWall = s;
    if (!rightWall || s.x > rightWall.x) rightWall = s;
  }

  return { left: leftWall, right: rightWall };
}

function drawWallHpBar(buffer: CellBufferDirect, x: number, y: number, label: string, wall: StructureData | null, maxBarWidth: number, bg: number): number {
  if (!wall) return x;

  let cx = writeString(buffer, x, y, label, COLOR_WALL_WOOD, bg);
  const ratio = wall.hp / wall.maxHp;
  const filled = Math.ceil(ratio * maxBarWidth);
  const barColor = ratio > 0.6 ? COLOR_HP_FULL : ratio > 0.3 ? COLOR_HP_MED : COLOR_HP_LOW;

  for (let i = 0; i < maxBarWidth; i++) {
    const ch = i < filled ? '\u2588' : '\u2591';
    const fg = i < filled ? barColor : 0x444444ff;
    if (cx < buffer.width) {
      buffer.setCell(cx, y, ch, fg, bg);
    }
    cx++;
  }

  cx = writeString(buffer, cx, y, ` ${wall.hp}/${wall.maxHp} `, COLOR_HUD_TEXT, bg);
  return cx;
}

/**
 * Render the full HUD: top bar, secondary bar (stamina/mount/wave),
 * unit counts, wall health, blood moon warning, and message log.
 */
export function renderHud(state: GameState, buffer: CellBufferDirect): void {
  // Blood moon detection
  const isBloodMoon = state.isBloodMoon;
  const bloodMoonActive = isBloodMoon && state.dayTime >= NIGHT_START;
  const hudBg = bloodMoonActive && Math.floor(state.totalElapsed * 3) % 2 === 0
    ? 0x440000ff
    : COLOR_HUD_BG;

  // ─── Top bar (row 0) ───────────────────────────────────────────
  const topY = 0;
  for (let x = 0; x < buffer.width; x++) {
    buffer.setCell(x, topY, ' ', COLOR_HUD_TEXT, hudBg);
  }

  let cx = 1;

  // Coins
  buffer.setCell(cx, topY, CHAR_COIN, COLOR_COIN, hudBg);
  cx++;
  cx = writeString(buffer, cx, topY, `${state.monarchCoins} `, COLOR_HUD_TEXT, hudBg);

  // Separator
  cx = writeString(buffer, cx, topY, '| ', COLOR_HUD_TEXT, hudBg);

  // Day count
  cx = writeString(buffer, cx, topY, `Day ${state.dayCount} `, COLOR_HUD_TEXT, hudBg);

  // Season and season day
  const seasonName = SEASON_NAMES[state.season];
  const seasonColor = SEASON_COLORS[state.season];
  cx = writeString(buffer, cx, topY, `${seasonName} D${state.seasonDay + 1} `, seasonColor, hudBg);

  // Time of day icon
  const icon = timeOfDayIcon(state.timeOfDay);
  buffer.setCell(cx, topY, icon, COLOR_HUD_TEXT, hudBg);
  cx++;

  cx = writeString(buffer, cx, topY, ' | ', COLOR_HUD_TEXT, hudBg);

  // Island
  cx = writeString(buffer, cx, topY, `Isle ${state.islandIndex + 1} `, COLOR_HUD_TEXT, hudBg);

  // Weather icon
  if (state.weather !== WeatherType.Clear) {
    const wIcon = weatherIcon(state.weather);
    cx = writeString(buffer, cx, topY, wIcon, WEATHER_COLORS[state.weather], hudBg);
    cx = writeString(buffer, cx, topY, ' ', COLOR_HUD_TEXT, hudBg);
  }

  // Gems
  const gems = state.gems ?? 0;
  if (gems > 0) {
    cx = writeString(buffer, cx, topY, '\u25C6', 0x44ccffff, hudBg);
    cx = writeString(buffer, cx, topY, `${gems} `, COLOR_HUD_TEXT, hudBg);
  }

  cx = writeString(buffer, cx, topY, '| ', COLOR_HUD_TEXT, hudBg);

  // Unit counts
  const builders = countByRole(state.units, UnitRole.Builder);
  const archers = countByRole(state.units, UnitRole.Archer);
  const farmers = countByRole(state.units, UnitRole.Farmer);
  const vagrants = countByRole(state.units, UnitRole.Vagrant);

  if (builders > 0) {
    cx = writeString(buffer, cx, topY, '\u2692', COLOR_BUILDER, hudBg);
    cx = writeString(buffer, cx, topY, `${builders} `, COLOR_HUD_TEXT, hudBg);
  }
  if (archers > 0) {
    cx = writeString(buffer, cx, topY, '\u2694', COLOR_ARCHER, hudBg);
    cx = writeString(buffer, cx, topY, `${archers} `, COLOR_HUD_TEXT, hudBg);
  }
  if (farmers > 0) {
    cx = writeString(buffer, cx, topY, '\u2698', COLOR_FARMER, hudBg);
    cx = writeString(buffer, cx, topY, `${farmers} `, COLOR_HUD_TEXT, hudBg);
  }
  if (vagrants > 0) {
    cx = writeString(buffer, cx, topY, '\u263A', 0x888888ff, hudBg);
    cx = writeString(buffer, cx, topY, `${vagrants} `, COLOR_HUD_TEXT, hudBg);
  }

  // Wall health
  const walls = findOutermostWalls(state.structures);
  if (walls.left || walls.right) {
    cx = writeString(buffer, cx, topY, '| ', COLOR_HUD_TEXT, hudBg);
    if (walls.left) {
      cx = drawWallHpBar(buffer, cx, topY, 'L:', walls.left, 5, hudBg);
    }
    if (walls.right) {
      cx = drawWallHpBar(buffer, cx, topY, 'R:', walls.right, 5, hudBg);
    }
  }

  // Tower count and highest tier
  let towerCount = 0;
  let highestTier = TowerTier.None;
  for (const [, s] of state.structures) {
    if ((s.towerTier ?? TowerTier.None) > TowerTier.None) {
      towerCount++;
      if ((s.towerTier ?? TowerTier.None) > highestTier) highestTier = s.towerTier ?? TowerTier.None;
    }
  }
  if (towerCount > 0) {
    cx = writeString(buffer, cx, topY, '| ', COLOR_HUD_TEXT, hudBg);
    cx = writeString(buffer, cx, topY, `T:${towerCount} `, 0x999999ff, hudBg);
  }

  // Crown dropped warning (flashing red)
  if (state.crownDropped) {
    const crownBlink = Math.floor(state.totalElapsed * 4) % 2 === 0;
    if (crownBlink) {
      cx = writeString(buffer, cx, topY, '| ', COLOR_HUD_TEXT, hudBg);
      cx = writeString(buffer, cx, topY, 'Crown! ', COLOR_WARN_FG, hudBg);
    }
  }

  // Blood moon warning (pulsing bright/dim red, right side of top bar)
  if (isBloodMoon && state.dayTime >= NIGHT_START) {
    const pulse = Math.sin(state.totalElapsed * 6) * 0.3 + 0.7;
    const r = Math.floor(0xff * pulse);
    const g = Math.floor(0x22 * pulse);
    const pulseColor = ((r & 0xff) << 24) | ((g & 0xff) << 16) | (0x22 << 8) | 0xff;
    const warnX = buffer.width - 13;
    writeString(buffer, warnX, topY, ' BLOOD MOON ', pulseColor, 0x440000ff);
  } else if (isBloodMoon && state.dayTime >= DUSK_START) {
    const warnX = buffer.width - 16;
    writeString(buffer, warnX, topY, ' Blood moon... ', COLOR_WARN_FG, hudBg);
  }

  // ─── Secondary bar (row 1): stamina, mount, wave count ─────────
  const secY = 1;
  for (let x = 0; x < buffer.width; x++) {
    buffer.setCell(x, secY, ' ', COLOR_HUD_TEXT, hudBg);
  }

  let sx = 1;

  // Mount name
  if (state.mountType !== MountType.None) {
    const mountName = state.mountType === MountType.Horse ? '\u265E Horse' : 'On foot';
    sx = writeString(buffer, sx, secY, mountName, COLOR_COIN, hudBg);
    sx = writeString(buffer, sx, secY, ' ', COLOR_HUD_TEXT, hudBg);
  }

  // Stamina bar
  if (state.maxStamina > 0) {
    sx = writeString(buffer, sx, secY, 'STA:', COLOR_STAMINA, hudBg);
    const staminaRatio = state.stamina / state.maxStamina;
    const staminaBarWidth = 10;
    const staminaFilled = Math.ceil(staminaRatio * staminaBarWidth);
    const staminaColor = staminaRatio > 0.5 ? COLOR_STAMINA : staminaRatio > 0.2 ? COLOR_HP_MED : COLOR_HP_LOW;

    for (let i = 0; i < staminaBarWidth; i++) {
      const ch = i < staminaFilled ? '\u2588' : '\u2591';
      const fg = i < staminaFilled ? staminaColor : 0x444444ff;
      if (sx < buffer.width) {
        buffer.setCell(sx, secY, ch, fg, hudBg);
      }
      sx++;
    }
    sx = writeString(buffer, sx, secY, ' ', COLOR_HUD_TEXT, hudBg);
  }

  // Wave countdown at night
  if (state.timeOfDay === TimeOfDay.Night && state.greeds.length > 0) {
    sx = writeString(buffer, sx, secY, '| ', COLOR_HUD_TEXT, hudBg);
    sx = writeString(buffer, sx, secY, `Greed: ${state.greeds.length} `, COLOR_GREED, hudBg);
  }

  // Town center info when monarch is near camp center (within 10 tiles)
  const monarchX = state.monarch ? Math.round(getPosition(state.world, state.monarch.eid)?.x ?? -999) : -999;
  const nearCenter = Math.abs(monarchX - CAMP_CENTER_X) <= 10;
  if (nearCenter) {
    const tierName = TOWN_CENTER_NAMES[state.townCenterTier];
    sx = writeString(buffer, sx, secY, '| ', COLOR_HUD_TEXT, hudBg);
    sx = writeString(buffer, sx, secY, `${tierName} `, COLOR_COIN, hudBg);

    // Show upgrade cost if not max tier
    if (state.townCenterTier < TownCenterTier.IronKeep) {
      const nextTier = state.townCenterTier + 1;
      const nextName = TOWN_CENTER_NAMES[nextTier];
      const cost = TOWN_CENTER_COSTS[nextTier];
      sx = writeString(buffer, sx, secY, `Up:${nextName}(${cost}\u25CF) `, 0x888888ff, hudBg);
    }
  }

  // Nearby interactable prompt (right-aligned on secondary bar)
  const interactable = getNearbyInteractable();
  if (interactable) {
    const promptX = buffer.width - interactable.length - 2;
    if (promptX > sx) {
      writeString(buffer, promptX, secY, interactable, 0xfffffffe, hudBg);
    }
  }

  // ─── Minimap (top-right corner, 30x5, toggled with Tab) ────────
  if (state.showMinimap) {
    renderMinimap(state, buffer);
  }

  // ─── Bottom message log (last 3 rows) ──────────────────────────
  const msgCount = 3;
  const msgStartY = buffer.height - msgCount;
  const recentMsgs = state.messages.slice(-msgCount);

  for (let m = 0; m < msgCount; m++) {
    const my = msgStartY + m;
    if (my < 0 || my >= buffer.height) continue;

    // Clear message row
    for (let x = 0; x < buffer.width; x++) {
      buffer.setCell(x, my, ' ', COLOR_MSG_FG, COLOR_MSG_BG);
    }

    const msg = recentMsgs[m];
    if (msg) {
      writeString(buffer, 1, my, msg.slice(0, buffer.width - 2), COLOR_MSG_FG, COLOR_MSG_BG);
    }
  }
}

// ─── Minimap Rendering ──────────────────────────────────────────

const MINIMAP_W = 30;
const MINIMAP_H = 5;
const MINIMAP_BG = 0x111111ff;
const MINIMAP_BORDER = 0x555555ff;

const MINIMAP_WATER = 0x2244aaff;
const MINIMAP_FOREST = 0x117722ff;
const MINIMAP_CLEARED = 0x886633ff;
const MINIMAP_STRUCTURE = 0xffcc00ff;
const MINIMAP_PORTAL_ACTIVE = 0xff2266ff;
const MINIMAP_PORTAL_DEAD = 0x555555ff;
const MINIMAP_MONARCH = 0xfffffffe;

function renderMinimap(state: GameState, buffer: CellBufferDirect): void {
  const effectiveMapWidth = state.mapWidth ?? MAP_WIDTH;
  const startX = buffer.width - MINIMAP_W - 3;
  const startY = 2;

  if (startX < 0 || startY + MINIMAP_H + 2 > buffer.height) return;

  // Draw border
  // Top border
  buffer.setCell(startX, startY, '+', MINIMAP_BORDER, MINIMAP_BG);
  for (let dx = 1; dx <= MINIMAP_W; dx++) {
    buffer.setCell(startX + dx, startY, '-', MINIMAP_BORDER, MINIMAP_BG);
  }
  buffer.setCell(startX + MINIMAP_W + 1, startY, '+', MINIMAP_BORDER, MINIMAP_BG);

  // Bottom border
  const botY = startY + MINIMAP_H + 1;
  buffer.setCell(startX, botY, '+', MINIMAP_BORDER, MINIMAP_BG);
  for (let dx = 1; dx <= MINIMAP_W; dx++) {
    buffer.setCell(startX + dx, botY, '-', MINIMAP_BORDER, MINIMAP_BG);
  }
  buffer.setCell(startX + MINIMAP_W + 1, botY, '+', MINIMAP_BORDER, MINIMAP_BG);

  // Side borders + fill interior
  for (let dy = 1; dy <= MINIMAP_H; dy++) {
    const my = startY + dy;
    buffer.setCell(startX, my, '|', MINIMAP_BORDER, MINIMAP_BG);
    for (let dx = 1; dx <= MINIMAP_W; dx++) {
      buffer.setCell(startX + dx, my, ' ', MINIMAP_BG, MINIMAP_BG);
    }
    buffer.setCell(startX + MINIMAP_W + 1, my, '|', MINIMAP_BORDER, MINIMAP_BG);
  }

  // Map scale: compress entire map to MINIMAP_W columns x MINIMAP_H rows
  const scaleX = effectiveMapWidth / MINIMAP_W;
  // Terrain sampling: use ground level row for a 1D cross-section approach,
  // and also sample a few rows above for forest detection
  const sampleRows = [GROUND_Y - 3, GROUND_Y - 1, GROUND_Y, GROUND_Y + 1, GROUND_Y + 2];

  for (let mx = 0; mx < MINIMAP_W; mx++) {
    const worldX = Math.floor(mx * scaleX);
    for (let my = 0; my < MINIMAP_H; my++) {
      const sampleY = sampleRows[my];
      if (sampleY === undefined) continue;
      const tile = state.tiles[sampleY]?.[worldX];
      let ch = '.';
      let fg = MINIMAP_CLEARED;

      if (tile === TileType.Water) {
        ch = '~'; fg = MINIMAP_WATER;
      } else if (tile === TileType.Forest) {
        ch = '#'; fg = MINIMAP_FOREST;
      } else if (tile === TileType.Grass || tile === TileType.ClearedLand) {
        ch = '.'; fg = MINIMAP_CLEARED;
      } else if (tile === TileType.Mountain) {
        ch = '^'; fg = 0x887766ff;
      } else if (tile === TileType.Swamp) {
        ch = '~'; fg = 0x226644ff;
      } else if (tile === TileType.Sky) {
        ch = ' '; fg = MINIMAP_BG;
      }

      buffer.setCell(startX + 1 + mx, startY + 1 + my, ch, fg, MINIMAP_BG);
    }
  }

  // Overlay structures (yellow dots)
  for (const [, s] of state.structures) {
    if (s.type === StructureType.Portal) continue; // portals handled separately
    const mmx = Math.floor(s.x / scaleX);
    if (mmx >= 0 && mmx < MINIMAP_W) {
      buffer.setCell(startX + 1 + mmx, startY + 1 + Math.floor(MINIMAP_H / 2), '.', MINIMAP_STRUCTURE, MINIMAP_BG);
    }
  }

  // Overlay portals (red = active, gray = destroyed)
  const activePortals = new Set(state.portalPositions);
  for (const px of state.portalPositions) {
    const mmx = Math.floor(px / scaleX);
    if (mmx >= 0 && mmx < MINIMAP_W) {
      // Check if portal still exists (has hp > 0)
      const portal = state.structures.get(px);
      const alive = portal && portal.hp > 0;
      const color = alive ? MINIMAP_PORTAL_ACTIVE : MINIMAP_PORTAL_DEAD;
      buffer.setCell(startX + 1 + mmx, startY + 1 + Math.floor(MINIMAP_H / 2), '*', color, MINIMAP_BG);
    }
  }

  // Overlay monarch position (white blinking dot)
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (monarchPos) {
    const mmx = Math.floor(monarchPos.x / scaleX);
    if (mmx >= 0 && mmx < MINIMAP_W) {
      const blink = Math.floor(state.totalElapsed * 3) % 2 === 0;
      if (blink) {
        buffer.setCell(startX + 1 + mmx, startY + 1 + Math.floor(MINIMAP_H / 2), '@', MINIMAP_MONARCH, MINIMAP_BG);
      }
    }
  }

  // Overlay camera viewport indicator (highlighted region on bottom row)
  const viewStartMM = Math.floor(state.cameraX / scaleX);
  const viewEndMM = Math.floor((state.cameraX + state.viewWidth) / scaleX);
  const indicatorY = startY + MINIMAP_H;
  for (let mx = Math.max(0, viewStartMM); mx <= Math.min(MINIMAP_W - 1, viewEndMM); mx++) {
    buffer.setCell(startX + 1 + mx, indicatorY, '=', 0xfffffffe, MINIMAP_BG);
  }
}
