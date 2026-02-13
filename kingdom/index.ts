#!/usr/bin/env node
/**
 * Kingdom - A side-scrolling TUI strategy game inspired by Kingdom: Two Crowns
 *
 * Built with blECSd 0.2.0 ECS framework.
 * Defend your kingdom, recruit villagers, and survive the nightly greed attacks.
 *
 * Controls: Arrow keys to move, Shift+Arrow to sprint, Space to drop coin, Q to quit.
 */

import { createWorld, getPosition, setOutputStream, writeRaw } from 'blecsd';
import { screen, cursor, style } from 'blecsd/terminal';
import {
  type GameState,
  type IslandSaveState,
  type MultiIslandSave,
  type IslandStats,
  GamePhase,
  TimeOfDay,
  Season,
  TownCenterTier,
  WeatherType,
  MountType,
  StructureType,
  ConsumableType,
  CAMP_CENTER_X,
  STARTING_COINS,
  FRAME_TIME,
  NIGHT_START,
  GROUND_Y,
  ISLAND_MAP_WIDTHS,
  MAP_WIDTH,
} from './types';

// Core systems
import { generateMap } from './world/map';
import { updateCamera } from './world/camera';
import { updateDayNight } from './game/dayNight';
import { setupInput, cleanupInput, pollInput, consumeEnter, consumeRestart, consumeNewGame, consumeContinue, consumePause, consumeQuit, consumeTab } from './game/input';
import { render } from './render/renderer';
import { triggerWaveFlash } from './render/effects';
import { playBell, playAlert, playBloodMoonWarning, setSoundEnabled } from './render/sound';
import { saveGame, loadGame } from './game/persistence';
import { collectCoins } from './game/economy';

// Entities + Economy (Agent 2)
import { createMonarch } from './entities/monarch';
import { spawnVagrant } from './entities/villager';
import { createMount, updateMount } from './entities/mount';
import { updateMovement } from './systems/movement';
import { updateAI } from './systems/ai';

// Combat + Structures + Spawning (Agent 3)
import { updateCombat } from './systems/combat';
import { updateSpawning } from './systems/spawn';
import { updateConstruction } from './systems/construction';
import { updateShrineBuff } from './structures/shrine';

function createInitialState(): GameState {
  const world = createWorld();
  const stdout = process.stdout;

  const state: GameState = {
    world,
    phase: GamePhase.Title,
    running: true,

    // Time
    dayTime: 0.2, // Start at early morning
    dayCount: 1,
    timeOfDay: TimeOfDay.Day,
    totalElapsed: 0,
    season: Season.Spring,
    seasonDay: 0,

    // Economy
    monarchCoins: STARTING_COINS,

    // Map (populated by generateMap)
    tiles: [],
    structures: new Map(),

    // Entities
    monarch: null as any,
    units: [],
    greeds: [],
    projectiles: [],

    // Portals
    portalPositions: [],

    // Camera
    cameraX: 0,
    viewWidth: stdout.columns ?? 80,
    viewHeight: stdout.rows ?? 24,

    // Island
    islandIndex: 0,
    difficultyMultiplier: 1.0,

    // Input
    inputLeft: false,
    inputRight: false,
    inputSprint: false,
    inputDrop: false,
    lastCoinDrop: 0,

    // Rendering
    needsFullRedraw: true,

    // Messages
    messages: [],

    // Mount
    mountType: MountType.None,
    stamina: 100,
    maxStamina: 100,

    // Consumables
    consumedSpots: new Set(),
    consumableSpots: new Map(),
    speedBoostTimer: 0,

    // Town Center
    townCenterTier: TownCenterTier.Campfire,
    townCenterCooldown: 0,
    gems: 0,
    gemCapacity: 10,

    // Blood Moon
    isBloodMoon: false,

    // Weather
    weather: WeatherType.Clear,

    // Crown
    crownDropped: false,
    crownX: CAMP_CENTER_X,
    crownY: GROUND_Y,
    crownTimer: 0,

    // Dog companion
    hasDog: false,
    dogCaptured: false,

    // Portal Assault
    portalAssaultActive: false,
    assaultTargetPortal: -1,

    // Pause
    isPaused: false,

    // Boat
    boatState: 'wreck',
    hullPieces: 0,

    // Bear combat
    bearAttackCooldown: 0,

    // Effects / Timers
    screenShakeTimer: 0,
    gameOverTimer: 0,
    lastSaveTime: 0,

    // Island system
    islandUnlocked: [true, false, false, false, false],
    islandStats: Array.from({ length: 5 }, () => ({ portalsDestroyed: 0, daysVisited: 0, structuresBuilt: 0 })),
    selectedIsland: 0,
    bankedCoins: 0,
    globalDayCount: 0,
    mapWidth: ISLAND_MAP_WIDTHS[0] ?? MAP_WIDTH,

    // Minimap
    showMinimap: false,

    // Sound
    soundEnabled: true,

    // Heir succession
    totalHeirs: 0,

    // Challenge islands
    challengeNightsSurvived: 0,
    hourglassFreezeTimer: 0,
  };

  // Generate world
  generateMap(state);

  // Create monarch
  state.monarch = createMonarch(state);

  // Give monarch a horse
  createMount(state);

  // Spawn initial vagrants near the camp
  const vagrantOffsets = [-15, -10, 10, 15, 20];
  for (const offset of vagrantOffsets) {
    state.units.push(spawnVagrant(state, CAMP_CENTER_X + offset));
  }

  return state;
}

function resetState(state: GameState): void {
  const fresh = createInitialState();
  fresh.phase = GamePhase.Playing;
  fresh.needsFullRedraw = true;

  // Copy all properties from fresh state onto existing state object
  // so the input system's reference remains valid
  Object.assign(state, fresh);
}

// ─── Per-Island Save/Load ─────────────────────────────────────────

const islandSaves: (IslandSaveState | null)[] = [null, null, null, null, null];

function saveIslandState(state: GameState, islandIndex: number): void {
  const structures: IslandSaveState['structures'] = [];
  for (const [, s] of state.structures) {
    structures.push({ type: s.type, x: s.x, hp: s.hp, maxHp: s.maxHp, level: s.level });
  }

  islandSaves[islandIndex] = {
    dayCount: state.dayCount,
    dayTime: state.dayTime,
    monarchCoins: state.monarchCoins,
    mountType: state.mountType,
    stamina: state.stamina,
    portalPositions: [...state.portalPositions],
    structures,
    townCenterTier: state.townCenterTier,
    boatState: state.boatState,
    hullPieces: state.hullPieces,
    hasDog: state.hasDog,
  };

  // Update island stats
  if (state.islandStats[islandIndex]) {
    state.islandStats[islandIndex].daysVisited = state.dayCount;
  }
}

function loadIslandState(state: GameState, islandIndex: number): boolean {
  const saved = islandSaves[islandIndex];
  if (!saved) return false;

  state.islandIndex = islandIndex;
  state.mapWidth = ISLAND_MAP_WIDTHS[islandIndex] ?? MAP_WIDTH;
  state.dayCount = saved.dayCount;
  state.dayTime = saved.dayTime;
  state.monarchCoins = saved.monarchCoins;
  state.mountType = saved.mountType;
  state.stamina = saved.stamina;
  state.portalPositions = [...saved.portalPositions];
  state.townCenterTier = saved.townCenterTier;
  state.boatState = saved.boatState;
  state.hullPieces = saved.hullPieces;
  state.hasDog = saved.hasDog;

  // Regenerate map tiles for the island
  generateMap(state);

  // Restore structures from save over the generated ones
  for (const s of saved.structures) {
    const existing = state.structures.get(s.x);
    if (existing) {
      existing.type = s.type;
      existing.hp = s.hp;
      existing.maxHp = s.maxHp;
      existing.level = s.level;
    } else {
      state.structures.set(s.x, {
        eid: 0 as any,
        type: s.type,
        x: s.x,
        hp: s.hp,
        maxHp: s.maxHp,
        level: s.level,
        assignedWorkers: [],
      });
    }
  }

  // Recreate monarch and units
  state.monarch = createMonarch(state);
  createMount(state);
  state.units = [];
  state.greeds = [];
  state.projectiles = [];

  return true;
}

function main(): void {
  const stdout = process.stdout;

  // Terminal setup
  setOutputStream(process.stdout);
  writeRaw(screen.alternateOn());
  writeRaw(cursor.hide());

  const state = createInitialState();

  // Try loading a saved game
  const saved = loadGame();
  if (saved) {
    Object.assign(state, saved);
    state.messages.push(`Loaded save: Day ${state.dayCount}, Isle ${state.islandIndex + 1}`);
  }

  // Set up input
  setupInput(state);

  // Handle resize
  stdout.on('resize', () => {
    state.viewWidth = stdout.columns ?? 80;
    state.viewHeight = stdout.rows ?? 24;
    state.needsFullRedraw = true;
  });

  // Cleanup handler
  const cleanup = (): void => {
    saveGame(state);
    cleanupInput();
    writeRaw(cursor.show());
    writeRaw(screen.alternateOff());
    writeRaw(style.reset());
  };

  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });

  // Track previous state for transition detection
  let prevTimeOfDay = state.timeOfDay;
  let prevPhase = state.phase;

  // Game loop
  let lastTime = Date.now();

  const loop = (): void => {
    if (!state.running) {
      cleanup();
      process.exit(0);
      return;
    }

    const now = Date.now();
    const dtMs = now - lastTime;
    lastTime = now;
    const dt = dtMs / 1000;
    state.totalElapsed += dt;

    // Poll input (timestamp-based held key detection)
    pollInput(state);

    // Pause toggle (works during playing phase)
    if (state.phase === GamePhase.Playing && consumePause()) {
      state.isPaused = !state.isPaused;
      state.needsFullRedraw = true;
    }

    // Quit from pause: exit game
    if (state.isPaused && consumeQuit()) {
      state.running = false;
    }

    // When paused, skip all game updates, only render
    if (state.isPaused) {
      prevPhase = state.phase;
      render(state);
      const elapsed = Date.now() - now;
      const delay = Math.max(0, FRAME_TIME - elapsed);
      setTimeout(loop, delay);
      return;
    }

    // Phase-specific logic
    if (state.phase === GamePhase.Title) {
      if (consumeNewGame() || consumeEnter()) {
        state.phase = GamePhase.Playing;
        state.needsFullRedraw = true;
        state.messages.push('Your kingdom awaits. Ride forth and build your defenses!');
      } else if (consumeContinue()) {
        const savedGame = loadGame();
        if (savedGame) {
          Object.assign(state, savedGame);
          state.phase = GamePhase.Playing;
          state.needsFullRedraw = true;
          state.messages.push(`Loaded save: Day ${state.dayCount}, Isle ${state.islandIndex + 1}`);
        } else {
          state.messages.push('No save found. Press N for a new game.');
        }
      }
    } else if (state.phase === GamePhase.IslandSelect) {
      // Island selection screen input handling
      if (state.inputLeft) {
        state.selectedIsland = Math.max(0, state.selectedIsland - 1);
        state.inputLeft = false;
        state.needsFullRedraw = true;
      }
      if (state.inputRight) {
        state.selectedIsland = Math.min(4, state.selectedIsland + 1);
        state.inputRight = false;
        state.needsFullRedraw = true;
      }
      if (consumeEnter()) {
        const sel = state.selectedIsland;
        if (state.islandUnlocked[sel]) {
          // Save current island state before switching
          saveIslandState(state, state.islandIndex);
          // Switch to selected island
          const loaded = loadIslandState(state, sel);
          if (!loaded) {
            // Generate fresh island
            state.islandIndex = sel;
            state.mapWidth = ISLAND_MAP_WIDTHS[sel] ?? MAP_WIDTH;
            generateMap(state);
            state.monarch = createMonarch(state);
            createMount(state);
            const vagrantOffsets = [-15, -10, 10, 15, 20];
            for (const offset of vagrantOffsets) {
              state.units.push(spawnVagrant(state, (ISLAND_MAP_WIDTHS[sel] ?? MAP_WIDTH) / 2 + offset));
            }
          }
          state.phase = GamePhase.Playing;
          state.needsFullRedraw = true;
          state.messages.push(`Arrived at Isle ${sel + 1}`);
        } else {
          state.messages.push('That island is locked. Build a boat to unlock the next island.');
        }
      }
      if (consumeQuit()) {
        state.phase = GamePhase.Title;
        state.needsFullRedraw = true;
      }
    } else if (state.phase === GamePhase.GameOver) {
      // 500ms pause before accepting restart input
      if (prevPhase !== GamePhase.GameOver) {
        state.gameOverTimer = 0.5;
        playAlert();
      }

      state.gameOverTimer = Math.max(0, state.gameOverTimer - dt);

      if (state.gameOverTimer <= 0 && consumeRestart()) {
        resetState(state);
        state.messages.push('A new reign begins...');
      }
    } else if (state.phase === GamePhase.Victory) {
      if (prevPhase !== GamePhase.Victory) {
        state.gameOverTimer = 0.5;
      }
      state.gameOverTimer = Math.max(0, state.gameOverTimer - dt);
      if (state.gameOverTimer <= 0 && consumeRestart()) {
        resetState(state);
        state.messages.push('A new reign begins...');
      }
    } else if (state.phase === GamePhase.Playing) {
      // Minimap toggle
      if (consumeTab()) {
        state.showMinimap = !state.showMinimap;
        state.needsFullRedraw = true;
      }

      // Snapshot values for change detection
      const prevCoins = state.monarchCoins;
      const wallHpBefore = new Map<number, number>();
      for (const [x, s] of state.structures) {
        if (s.type === StructureType.WallWood || s.type === StructureType.WallStone || s.type === StructureType.WallIron) {
          wallHpBefore.set(x, s.hp);
        }
      }

      // Update game systems
      updateDayNight(state, dt);

      // Compute season from day count (16 days per season, 64-day full cycle)
      state.season = Math.floor((state.dayCount % 64) / 16) as Season;
      state.seasonDay = state.dayCount % 16;

      // Blood moon: every 5th day during night
      state.isBloodMoon = state.dayCount > 0 && state.dayCount % 5 === 0 && state.dayTime >= NIGHT_START;

      // Weather: set at dawn each day based on season
      if (state.isBloodMoon) {
        state.weather = WeatherType.Storm;
      } else if (state.timeOfDay === TimeOfDay.Dawn && prevTimeOfDay !== TimeOfDay.Dawn) {
        const weatherRoll = (state.dayCount * 7 + state.seasonDay * 13) % 100;
        switch (state.season) {
          case Season.Spring:
            state.weather = weatherRoll < 30 ? WeatherType.Rain : WeatherType.Clear;
            break;
          case Season.Summer:
            state.weather = WeatherType.Clear;
            break;
          case Season.Autumn:
            state.weather = weatherRoll < 20 ? WeatherType.Rain : WeatherType.Clear;
            break;
          case Season.Winter:
            state.weather = weatherRoll < 80 ? WeatherType.Snow : WeatherType.Clear;
            break;
        }
      }

      // NOTE: updateMount is called inside updateAI, no separate call needed here

      // Blood moon warning ~40 seconds before midnight (dayTime ~0.78 for blood moon days)
      if (state.dayCount > 0 && state.dayCount % 5 === 0 && state.dayTime >= 0.78 && state.dayTime < 0.80 && prevTimeOfDay === TimeOfDay.Dusk) {
        playBloodMoonWarning();
        state.messages.push('A blood moon rises tonight...');
      }

      // Trigger wave flash + alert when night begins
      if (state.timeOfDay === TimeOfDay.Night && prevTimeOfDay !== TimeOfDay.Night) {
        triggerWaveFlash();
        playAlert();
        state.messages.push('The greed stirs in the darkness...');
      }

      // Dawn bonus: +2 coins each morning
      if (state.timeOfDay === TimeOfDay.Dawn && prevTimeOfDay !== TimeOfDay.Dawn) {
        collectCoins(state, 2);
        playBell();
        state.messages.push('Dawn bonus: +2 coins');
      }

      prevTimeOfDay = state.timeOfDay;

      updateAI(state, dt);

      // NOTE: double-movement issue exists: updateMonarch applies position directly,
      // then updateMovement also applies velocity to position. Agent 3 will fix
      // movement.ts to not double-apply. Speed boost is handled via state.speedBoostTimer
      // which monarch.ts / getMountSpeed should read instead of scaling velocity here.
      updateMovement(state, dt);
      updateSpawning(state, dt);
      updateCombat(state, dt);
      updateConstruction(state, dt);
      updateShrineBuff(dt);
      updateCamera(state);

      // Check consumable spot pickup
      const monarchPos = getPosition(state.world, state.monarch.eid);
      if (monarchPos) {
        const mx = Math.round(monarchPos.x);
        const consumable = state.consumableSpots.get(mx);
        if (consumable !== undefined && !state.consumedSpots.has(mx)) {
          state.consumedSpots.add(mx);
          switch (consumable) {
            case ConsumableType.FoodCache:
              collectCoins(state, 3);
              state.messages.push('Found food cache! (+3 coins)');
              playBell();
              break;
            case ConsumableType.RestShrine:
              state.stamina = state.maxStamina;
              state.messages.push('Rested at shrine! (stamina restored)');
              playBell();
              break;
            case ConsumableType.PowerWell:
              state.speedBoostTimer = 15;
              state.messages.push('Power well activated! (speed boost 15s)');
              playBell();
              break;
          }
        }
      }

      // Decrement speed boost timer
      if (state.speedBoostTimer > 0) {
        state.speedBoostTimer = Math.max(0, state.speedBoostTimer - dt);
      }

      // Sound cue on coin pickup
      if (state.monarchCoins > prevCoins) {
        playBell();
      }

      // Detect wall breaches: trigger screen shake + alert
      for (const [x, prevHp] of wallHpBefore) {
        const wall = state.structures.get(x);
        if (!wall || wall.hp <= 0) {
          if (prevHp > 0) {
            state.screenShakeTimer = 0.2;
            playAlert();
            state.messages.push('A wall has been breached!');
            break;
          }
        }
      }

      // Decrement screen shake timer
      if (state.screenShakeTimer > 0) {
        state.screenShakeTimer = Math.max(0, state.screenShakeTimer - dt);
      }

      // Boat departed: unlock next island and go to island select
      if (state.boatState === 'departed') {
        const nextIsland = state.islandIndex + 1;
        if (nextIsland < 5) {
          state.islandUnlocked[nextIsland] = true;
        }
        state.boatState = 'wreck'; // Reset for next use
        state.selectedIsland = Math.min(nextIsland, 4);
        state.phase = GamePhase.IslandSelect;
        state.needsFullRedraw = true;
        state.messages.push('Your boat sails to new shores...');
      }

      // Auto-save every 30 seconds
      if (state.totalElapsed - state.lastSaveTime >= 30) {
        saveGame(state);
        state.lastSaveTime = state.totalElapsed;
      }
    }

    prevPhase = state.phase;

    render(state);

    // Schedule next frame
    const elapsed = Date.now() - now;
    const delay = Math.max(0, FRAME_TIME - elapsed);
    setTimeout(loop, delay);
  };

  loop();
}

main();
