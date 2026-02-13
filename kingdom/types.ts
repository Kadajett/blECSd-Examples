/**
 * Kingdom - Shared types and constants
 * All agents reference this file. DO NOT modify without coordinating.
 */

import type { World, Entity } from 'blecsd';

// ─── World Constants ───────────────────────────────────────────────
export const MAP_WIDTH = 1200;       // Total world width in tiles
export const MAP_HEIGHT = 30;        // Total world height in tiles
export const GROUND_Y = 22;          // Ground level (0-indexed from top)
export const SKY_HEIGHT = 22;        // Everything above ground
export const WATER_Y = 24;           // Water level below ground
export const CAMP_CENTER_X = 600;    // Center of starting camp

// ─── Timing ────────────────────────────────────────────────────────
export const TARGET_FPS = 30;
export const FRAME_TIME = 1000 / TARGET_FPS;
export const DAY_LENGTH = 180;       // seconds per full day
export const DAWN_START = 0.0;       // 0% of day
export const DAY_START = 0.15;       // 15% of day
export const DUSK_START = 0.65;      // 65% of day
export const NIGHT_START = 0.8;      // 80% of day

// ─── Economy ───────────────────────────────────────────────────────
export const STARTING_COINS = 8;
export const MAX_COINS = 99;
export const COIN_DROP_COOLDOWN = 300; // ms between drops
export const FARM_INCOME_INTERVAL = 5; // seconds
export const HUNT_REWARD = 1;
export const FARM_REWARD_BASE = 2;
export const RECRUIT_COST = 1;
export const BOW_COST = 2;
export const HAMMER_COST = 2;
export const WALL_COST_WOOD = 3;
export const WALL_COST_STONE = 6;
export const WALL_COST_IRON = 10;
export const FARM_BUILD_COST = 5;
export const SHRINE_COST = 4;
export const SHIP_REPAIR_COST = 15;

// ─── Movement ──────────────────────────────────────────────────────
export const MONARCH_SPEED = 12;     // tiles per second
export const MONARCH_SPRINT = 20;
export const VILLAGER_SPEED = 5;
export const BUILDER_SPEED = 4;
export const ARCHER_SPEED = 6;
export const GREED_SPEED_BASE = 3;
export const GREED_SPEED_FAST = 6;

// ─── Combat ────────────────────────────────────────────────────────
export const ARROW_DAMAGE = 1;
export const ARROW_RANGE = 15;       // tiles
export const ARROW_COOLDOWN = 1.5;   // seconds
export const WALL_HP_WOOD = 5;
export const WALL_HP_STONE = 12;
export const WALL_HP_IRON = 25;
export const PORTAL_HP = 20;

// ─── Colors (0xRRGGBBAA) ──────────────────────────────────────────
export const COLOR_SKY_DAY = 0x4488ccff;
export const COLOR_SKY_DUSK = 0xcc6633ff;
export const COLOR_SKY_NIGHT = 0x111133ff;
export const COLOR_SKY_DAWN = 0x885566ff;
export const COLOR_GROUND = 0x228833ff;
export const COLOR_DIRT = 0x664422ff;
export const COLOR_WATER = 0x2244aaff;
export const COLOR_TREE_TRUNK = 0x553311ff;
export const COLOR_TREE_LEAVES = 0x117722ff;
export const COLOR_WALL_WOOD = 0x886633ff;
export const COLOR_WALL_STONE = 0x888888ff;
export const COLOR_WALL_IRON = 0xaaaabbff;
export const COLOR_MONARCH = 0xffdd00ff;
export const COLOR_VILLAGER = 0xccccccff;
export const COLOR_BUILDER = 0x8888ffff;
export const COLOR_ARCHER = 0x44ff44ff;
export const COLOR_FARMER = 0xddaa44ff;
export const COLOR_GREED = 0xff2266ff;
export const COLOR_GREED_MASK = 0xcc1155ff;
export const COLOR_PORTAL = 0x9922ffff;
export const COLOR_COIN = 0xffcc00ff;
export const COLOR_HUD_BG = 0x222222ff;
export const COLOR_HUD_TEXT = 0xfffffffe;
export const COLOR_FARM = 0xaacc44ff;
export const COLOR_SHRINE = 0x44ccffff;
export const COLOR_BG = 0x000000ff;

// ─── ASCII Characters ──────────────────────────────────────────────
export const CHAR_MONARCH = '\u265A';     // chess king
export const CHAR_VILLAGER = '\u263A';    // smiley
export const CHAR_BUILDER = '\u2692';     // hammer and pick
export const CHAR_ARCHER = '\u2694';      // crossed swords (bow stand-in)
export const CHAR_FARMER = '\u2698';      // flower
export const CHAR_GREED = '\u2620';       // skull
export const CHAR_GREED_MASK = '\u2623';  // biohazard
export const CHAR_PORTAL = '\u25C6';      // diamond
export const CHAR_WALL = '\u2588';        // full block
export const CHAR_WALL_DAMAGED = '\u2593'; // dark shade
export const CHAR_TREE = '\u2660';        // spade (tree top)
export const CHAR_TREE_TRUNK = '\u2502';  // vertical line
export const CHAR_GRASS = '\u2591';       // light shade
export const CHAR_WATER = '\u2248';       // almost equal (waves)
export const CHAR_COIN = '\u25CF';        // filled circle
export const CHAR_FARM = '\u2261';        // identical to
export const CHAR_SHRINE = '\u2726';      // 4-pointed star
export const CHAR_ARROW = '\u2192';       // right arrow
export const CHAR_CROWN = '\u2655';       // chess queen (crown)
export const CHAR_HORSE = '\u265E';       // chess knight
export const CHAR_SHIP = '\u2708';        // airplane stand-in for ship

// ─── Enums ─────────────────────────────────────────────────────────
export enum TimeOfDay {
  Dawn = 'dawn',
  Day = 'day',
  Dusk = 'dusk',
  Night = 'night',
}

export enum TileType {
  Sky = 0,
  Grass = 1,
  Dirt = 2,
  Water = 3,
  Forest = 4,
  ClearedLand = 5,
  Swamp = 6,
  Mountain = 7,
  Ruins = 8,
}

export enum StructureType {
  None = 0,
  WallWood = 1,
  WallStone = 2,
  WallIron = 3,
  Farm = 4,
  FarmIrrigated = 5,
  FarmWindmill = 6,
  BowStand = 7,
  HammerStand = 8,
  Shrine = 9,
  Portal = 10,
  Ship = 11,
  Campfire = 12,
  // Extended types 13-15 defined as numeric casts in wall.ts/siege.ts
  Spikes = 16,
  TallStone = 17,
  HermitCottage = 18,
  Statue = 19,
}

export enum UnitRole {
  Monarch = 'monarch',
  Vagrant = 'vagrant',
  Builder = 'builder',
  Archer = 'archer',
  Farmer = 'farmer',
  Knight = 'knight',
  Pikeman = 'pikeman',
  Squire = 'squire',
}

export enum GreedType {
  Basic = 'basic',
  Masked = 'masked',
  Floater = 'floater',
  Breeder = 'breeder',
  CrownStealer = 'crownStealer',
  PlagueCrawler = 'plagueCrawler',
}

export enum AIState {
  Idle = 'idle',
  MovingTo = 'movingTo',
  Working = 'working',
  Retreating = 'retreating',
  Defending = 'defending',
  Hunting = 'hunting',
  Attacking = 'attacking',
  Fleeing = 'fleeing',
}

export enum GamePhase {
  Title = 'title',
  IslandSelect = 'islandSelect',
  Playing = 'playing',
  GameOver = 'gameOver',
  Victory = 'victory',
}

export enum MountType {
  None = 'none',
  Horse = 'horse',
  Stag = 'stag',
  Griffin = 'griffin',
  Warhorse = 'warhorse',
  Bear = 'bear',
  Lizard = 'lizard',
  Unicorn = 'unicorn',
}

export enum ConsumableType {
  FoodCache = 'foodCache',
  RestShrine = 'restShrine',
  PowerWell = 'powerWell',
}

export enum Season {
  Spring = 0,
  Summer = 1,
  Autumn = 2,
  Winter = 3,
}

export enum TownCenterTier {
  Ruins = 0,
  Campfire = 1,
  Camp = 2,
  Village = 3,
  TownHall = 4,
  StoneFort = 5,
  Castle = 6,
  IronKeep = 7,
}

// ─── Island Constants ────────────────────────────────────────────
export const ISLAND_NAMES = ['Tutorial Isle', 'Stone Coast', 'Forge Bay', 'Iron Reach', "Crown's End"];
export const ISLAND_MAP_WIDTHS = [600, 800, 1000, 1000, 1200];

export interface IslandStats {
  portalsDestroyed: number;
  daysVisited: number;
  structuresBuilt: number;
}

export interface IslandSaveState {
  dayCount: number;
  dayTime: number;
  monarchCoins: number;
  mountType: MountType;
  stamina: number;
  portalPositions: number[];
  structures: { type: StructureType; x: number; hp: number; maxHp: number; level: number }[];
  townCenterTier: TownCenterTier;
  boatState: 'wreck' | 'restoring' | 'ready' | 'launched' | 'docked' | 'departed';
  hullPieces: number;
  hasDog: boolean;
}

export interface MultiIslandSave {
  version: 2;
  currentIsland: number;
  globalDayCount: number;
  gems: number;
  bankedCoins: number;
  islandUnlocked: boolean[];
  islandStats: IslandStats[];
  islands: (IslandSaveState | null)[];
}

export interface MapData {
  tiles: TileType[][];
  portalPositions: number[];
  structurePositions: { type: StructureType; x: number; hp: number }[];
  vagrantCampPositions: number[];
  mapWidth: number;
}

export const TOWN_CENTER_COSTS = [0, 1, 4, 8, 12, 15, 18, 20];
export const TOWN_CENTER_NAMES = ['Ruins', 'Campfire', 'Camp', 'Village', 'Town Hall', 'Stone Fort', 'Castle', 'Iron Keep'];

export enum TowerTier {
  None = 0,
  RockPlatform = 1,
  WoodWatchtower = 2,
  StoneTower = 3,
  TripletTower = 4,
  RoofedTriplet = 5,
  QuadrupletTower = 6,
}

export const TOWER_COSTS = [0, 3, 5, 7, 9, 12, 15];
export const TOWER_ARCHER_CAPACITY = [0, 1, 1, 2, 3, 3, 4];
export const TOWER_NAMES = ['None', 'Rock Platform', 'Watchtower', 'Stone Tower', 'Triplet', 'Roofed Triplet', 'Quadruplet'];

export enum WeatherType {
  Clear = 0,
  Rain = 1,
  Snow = 2,
  Storm = 3,
}

// ─── Component Data Interfaces ─────────────────────────────────────
export interface UnitData {
  eid: Entity;
  role: UnitRole;
  aiState: AIState;
  targetX: number;
  hp: number;
  maxHp: number;
  attackCooldown: number;
  coins: number;
  poisonTimer?: number;
  poisonDps?: number;
}

export interface StructureData {
  eid: Entity;
  type: StructureType;
  x: number;
  hp: number;
  maxHp: number;
  level: number;
  assignedWorkers: Entity[];
  towerTier?: TowerTier;
  isRoofed?: boolean;
  farmTier?: number;
  convertedTowerType?: number;
  gateLocked?: boolean;
}

export interface GreedData {
  eid: Entity;
  type: GreedType;
  hp: number;
  speed: number;
  damage: number;
  carryingCoins: number;
  // Masked greedling state
  maskBroken?: boolean;
  // Floater state
  floaterTarget?: Entity | null;
  isCarrying?: boolean;
  grabTimer?: number;
  // Breeder state
  breederSpawnTimer?: number;
  breederPunchTimer?: number;
  breederSpawnCount?: number;
  // Crown stealer state
  hasCrown?: boolean;
  isClimbing?: boolean;
  climbTimer?: number;
  // Sunrise flee state
  isFleeing?: boolean;
  fleeDespawnTimer?: number;
  // Burn damage state (fire tower)
  burnTimer?: number;
  burnDps?: number;
  // Plague crawler state
  poisonOnDeath?: boolean;
}

export enum DamageType {
  Normal = 0,
  Piercing = 1,
  Burn = 2,
  AoE = 3,
}

export enum PortalType {
  Cliff = 'cliff',
  Dock = 'dock',
  Cave = 'cave',
}

export interface ProjectileData {
  eid: Entity;
  x: number;
  y: number;
  vx: number;
  damage: number;
  owner: Entity;
  damageType?: DamageType;
  burnDps?: number;
  burnDuration?: number;
  piercing?: boolean;
  aoeRadius?: number;
}

// ─── Game State ────────────────────────────────────────────────────
export interface GameState {
  world: World;
  phase: GamePhase;
  running: boolean;

  // Time
  dayTime: number;          // 0.0 to 1.0 within a day cycle
  dayCount: number;
  timeOfDay: TimeOfDay;
  totalElapsed: number;     // total seconds elapsed
  season: Season;
  seasonDay: number;        // 0-15, day within current season

  // Economy
  monarchCoins: number;

  // Map
  tiles: TileType[][];      // [y][x]
  structures: Map<number, StructureData>; // keyed by x position

  // Entities
  monarch: UnitData;
  units: UnitData[];
  greeds: GreedData[];
  projectiles: ProjectileData[];

  // Portals
  portalPositions: number[]; // x positions

  // Camera
  cameraX: number;
  viewWidth: number;
  viewHeight: number;

  // Island
  islandIndex: number;
  difficultyMultiplier: number;

  // Input state
  inputLeft: boolean;
  inputRight: boolean;
  inputSprint: boolean;
  inputDrop: boolean;
  lastCoinDrop: number;

  // Rendering
  needsFullRedraw: boolean;

  // Messages
  messages: string[];

  // Mount
  mountType: MountType;
  stamina: number;
  maxStamina: number;

  // Consumables
  consumedSpots: Set<number>;
  consumableSpots: Map<number, ConsumableType>;
  speedBoostTimer: number;

  // Town Center
  townCenterTier: TownCenterTier;
  townCenterCooldown: number;
  gems: number;
  gemCapacity: number;

  // Blood Moon
  isBloodMoon: boolean;

  // Weather
  weather: WeatherType;

  // Crown
  crownDropped: boolean;
  crownX: number;
  crownY: number;
  crownTimer: number;

  // Dog companion
  hasDog: boolean;
  dogCaptured: boolean;

  // Portal Assault
  portalAssaultActive: boolean;
  assaultTargetPortal: number;

  // Pause
  isPaused: boolean;

  // Boat
  boatState: 'wreck' | 'restoring' | 'ready' | 'launched' | 'docked' | 'departed';
  hullPieces: number;

  // Bear combat
  bearAttackCooldown: number;

  // Effects / Timers
  screenShakeTimer: number;
  gameOverTimer: number;
  lastSaveTime: number;

  // Island system
  islandUnlocked: boolean[];
  islandStats: IslandStats[];
  selectedIsland: number;
  bankedCoins: number;
  globalDayCount: number;
  mapWidth: number;

  // Minimap
  showMinimap: boolean;

  // Sound
  soundEnabled: boolean;

  // Heir succession
  totalHeirs: number;

  // Challenge islands
  challengeNightsSurvived: number;
  hourglassFreezeTimer: number;
}

// ─── Tile Map Helpers ──────────────────────────────────────────────
export function tileKey(x: number, y: number): number {
  return y * MAP_WIDTH + x;
}

export function worldToScreen(worldX: number, cameraX: number): number {
  return Math.round(worldX - cameraX);
}

export function screenToWorld(screenX: number, cameraX: number): number {
  return screenX + cameraX;
}

export function isOnScreen(worldX: number, cameraX: number, viewWidth: number): boolean {
  const sx = worldX - cameraX;
  return sx >= 0 && sx < viewWidth;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(x1: number, x2: number): number {
  return Math.abs(x1 - x2);
}
