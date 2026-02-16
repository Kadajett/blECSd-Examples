import process from 'node:process';
import { createWorld, renderText, type World } from 'blecsd';
import {
  activatePlugin,
  createPluginRegistry,
  createScheduler,
  deactivatePlugin,
  getPlugins,
  isPluginActive,
  registerPlugin,
} from 'blecsd/core';
import {
  enterAlternateScreen,
  hideCursor,
  leaveAlternateScreen,
  setOutputStream,
  showCursor,
  writeRaw,
} from 'blecsd/systems';
import { parseKeyBuffer, type ParsedKeyEvent as KeyEvent } from 'blecsd/terminal';
import {
  BOX_SINGLE,
  createCellBuffer,
  packColor,
  renderBox,
  type CellBuffer,
} from 'blecsd/utils';

import { weatherPlugin, renderWeatherToBuffer } from './plugins/weather.js';
import { customThemePlugin, getThemeStatus } from './plugins/custom-theme.js';
import { chartsPlugin, renderChartToBuffer } from './plugins/charts.js';

type BufferWithCells = ReturnType<typeof createCellBuffer>;

interface AppState {
  running: boolean;
  termWidth: number;
  termHeight: number;
  needsRedraw: boolean;
}

function fill(
  buffer: CellBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  char: string,
  fg: number,
  bg: number,
): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      buffer.setCell(x + col, y + row, char, fg, bg);
    }
  }
}

function bufferToAnsi(buffer: BufferWithCells): string {
  const lines: string[] = [];
  for (let y = 0; y < buffer.height; y++) {
    let line = '';
    let prevFg = -1;
    let prevBg = -1;
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y]?.[x];
      if (!cell) continue;
      if (cell.fg !== prevFg || cell.bg !== prevBg) {
        const fgR = (cell.fg >> 16) & 0xff;
        const fgG = (cell.fg >> 8) & 0xff;
        const fgB = cell.fg & 0xff;
        const bgR = (cell.bg >> 16) & 0xff;
        const bgG = (cell.bg >> 8) & 0xff;
        const bgB = cell.bg & 0xff;
        line += `\x1b[38;2;${fgR};${fgG};${fgB};48;2;${bgR};${bgG};${bgB}m`;
        prevFg = cell.fg;
        prevBg = cell.bg;
      }
      line += cell.char;
    }
    lines.push(line);
  }
  return '\x1b[H' + lines.join('\n') + '\x1b[0m';
}

function createAppState(): AppState {
  return {
    running: true,
    termWidth: process.stdout.columns || 80,
    termHeight: process.stdout.rows || 24,
    needsRedraw: false,
  };
}

function handleKeypress(
  state: AppState,
  registry: ReturnType<typeof createPluginRegistry>,
  scheduler: ReturnType<typeof createScheduler>,
  world: ReturnType<typeof createWorld>,
  keyEvent: KeyEvent,
): void {
  const key = keyEvent.name;
  const ctrl = keyEvent.ctrl;

  if (key === 'q' || (key === 'c' && ctrl)) {
    state.running = false;
    return;
  }

  if (key === '1') {
    if (isPluginActive(registry, 'weather')) {
      deactivatePlugin(registry, scheduler, world, 'weather');
    } else {
      activatePlugin(registry, scheduler, world, 'weather');
    }
    state.needsRedraw = true;
  }

  if (key === '2') {
    if (isPluginActive(registry, 'custom-theme')) {
      deactivatePlugin(registry, scheduler, world, 'custom-theme');
    } else {
      activatePlugin(registry, scheduler, world, 'custom-theme');
    }
    state.needsRedraw = true;
  }

  if (key === '3') {
    if (isPluginActive(registry, 'charts')) {
      deactivatePlugin(registry, scheduler, world, 'charts');
    } else {
      activatePlugin(registry, scheduler, world, 'charts');
    }
    state.needsRedraw = true;
  }

  if (key === 'a') {
    activatePlugin(registry, scheduler, world, 'weather');
    activatePlugin(registry, scheduler, world, 'custom-theme');
    activatePlugin(registry, scheduler, world, 'charts');
    state.needsRedraw = true;
  }

  if (key === 'd') {
    deactivatePlugin(registry, scheduler, world, 'weather');
    deactivatePlugin(registry, scheduler, world, 'custom-theme');
    deactivatePlugin(registry, scheduler, world, 'charts');
    state.needsRedraw = true;
  }
}

function renderToBuffer(
  state: AppState,
  registry: ReturnType<typeof createPluginRegistry>,
): BufferWithCells {
  const buffer = createCellBuffer(state.termWidth, state.termHeight);

  // Colors
  const white = packColor(255, 255, 255);
  const blue = packColor(0, 0, 255);
  const yellow = packColor(255, 255, 0);
  const green = packColor(0, 255, 0);
  const red = packColor(255, 0, 0);
  const cyan = packColor(0, 255, 255);
  const magenta = packColor(255, 0, 255);
  const black = packColor(0, 0, 0);

  // Draw title bar
  fill(buffer, 0, 0, state.termWidth, 1, ' ', white, blue);
  renderText(buffer, 1, 0, 'Plugin System Demo', white, blue);

  // Draw plugin status panel
  const panelWidth = 50;
  const panelX = 1;
  const panelY = 2;
  const plugins = getPlugins(registry);
  const panelHeight = plugins.length + 4;

  renderBox(buffer, panelX, panelY, panelWidth, panelHeight, BOX_SINGLE, {
    fg: yellow,
    bg: black,
  });
  renderText(buffer, panelX + 2, panelY, ' Plugin Status ', white, black);

  let row = panelY + 2;
  for (const plugin of plugins) {
    const active = isPluginActive(registry, plugin.name);
    const statusColor = active ? green : red;
    const status = active ? 'ACTIVE' : 'INACTIVE';
    const name = plugin.name.padEnd(15);
    const version = plugin.version.padEnd(10);

    renderText(buffer, panelX + 2, row, `${name} ${version}`, white, black);
    renderText(buffer, panelX + 2 + 15 + 1 + 10 + 1, row, status, statusColor, black);
    row++;
  }

  // Draw plugin outputs
  let outputY = panelY + panelHeight + 1;

  if (isPluginActive(registry, 'weather')) {
    renderWeatherToBuffer(buffer, panelX, outputY, 26, 7);
    outputY += 8;
  }

  if (isPluginActive(registry, 'charts')) {
    renderChartToBuffer(buffer, panelX, outputY, 26, 9);
    outputY += 10;
  }

  if (isPluginActive(registry, 'custom-theme')) {
    const themeStatus = getThemeStatus();
    renderText(buffer, panelX, outputY, themeStatus, magenta, black);
  }

  // Draw footer with controls
  const footerY = state.termHeight - 2;
  renderText(
    buffer,
    panelX,
    footerY,
    'Controls: 1=Weather 2=Theme 3=Charts a=Activate All d=Deactivate All q=Quit',
    cyan,
    black,
  );

  return buffer;
}

function main(): void {
  const world = createWorld();
  const scheduler = createScheduler();
  const registry = createPluginRegistry();

  registerPlugin(registry, scheduler, world, weatherPlugin);
  registerPlugin(registry, scheduler, world, customThemePlugin);
  registerPlugin(registry, scheduler, world, chartsPlugin);

  const state = createAppState();

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  setOutputStream(process.stdout);
  hideCursor();
  enterAlternateScreen();

  let terminalRestored = false;
  const restoreTerminal = (): void => {
    if (terminalRestored) return;
    terminalRestored = true;
    leaveAlternateScreen();
    showCursor();
    writeRaw('\x1b[0m');
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };

  process.stdin.on('data', (data: Buffer) => {
    if (!state.running) return;
    const keyEvents = parseKeyBuffer(data);
    for (const keyEvent of keyEvents) {
      handleKeypress(state, registry, scheduler, world, keyEvent);
    }
  });

  process.stdout.on('resize', () => {
    state.termWidth = process.stdout.columns || 80;
    state.termHeight = process.stdout.rows || 24;
    state.needsRedraw = true;
  });

  writeRaw(bufferToAnsi(renderToBuffer(state, registry)));
  state.needsRedraw = false;

  const renderInterval = setInterval(() => {
    if (!state.running) {
      clearInterval(renderInterval);
      restoreTerminal();
      process.exit(0);
      return;
    }
    state.needsRedraw = true;
    if (state.needsRedraw) {
      writeRaw(bufferToAnsi(renderToBuffer(state, registry)));
      state.needsRedraw = false;
    }
  }, 50);

  const exit = (): void => {
    state.running = false;
    clearInterval(renderInterval);
    restoreTerminal();
    process.exit(0);
  };

  process.on('SIGINT', exit);
  process.on('SIGTERM', exit);
}

main();
