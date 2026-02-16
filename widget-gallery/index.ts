import process from 'node:process';
import { renderText } from 'blecsd';
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
  renderHLine,
  type CellBuffer,
} from 'blecsd/utils';

type BufferWithCells = ReturnType<typeof createCellBuffer>;

import {
  createSidebarState,
  navigateSidebar,
  renderSidebar,
  getSelectedWidget,
  type SidebarState,
} from './sidebar.js';
import { renderDemoToBuffer } from './demo.js';
import { renderCodeToBuffer } from './codePanel.js';

// -- Helpers -----------------------------------------------------------------

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

// -- Colors ------------------------------------------------------------------

const WHITE = packColor(255, 255, 255);
const BLACK = packColor(0, 0, 0);
const GRAY = packColor(128, 128, 128);
const DIM_GRAY = packColor(90, 90, 90);
const TITLE_BG = packColor(0, 80, 180);
const FOOTER_FG = packColor(140, 140, 140);
const SIDEBAR_BG = packColor(20, 20, 30);
const SIDEBAR_FG = WHITE;
const CATEGORY_FG = packColor(255, 200, 50);
const SELECTED_FG = BLACK;
const SELECTED_BG = packColor(100, 180, 255);
const PANEL_BG = packColor(15, 15, 20);
const PANEL_FG = WHITE;
const PANEL_BORDER_FG = packColor(60, 60, 80);
const HEADING_FG = packColor(80, 200, 220);
const DESC_FG = GRAY;
const KW_FG = packColor(200, 100, 220);
const STR_FG = packColor(100, 200, 100);
const NUM_FG = packColor(220, 180, 60);
const FN_FG = packColor(80, 200, 220);
const COMMENT_FG = DIM_GRAY;

// -- State -------------------------------------------------------------------

interface AppState {
  sidebar: SidebarState;
  termWidth: number;
  termHeight: number;
  running: boolean;
  needsRedraw: boolean;
}

function createAppState(): AppState {
  return {
    sidebar: createSidebarState(),
    termWidth: process.stdout.columns || 80,
    termHeight: process.stdout.rows || 24,
    running: true,
    needsRedraw: true,
  };
}

// -- Input -------------------------------------------------------------------

function handleKeypress(state: AppState, event: KeyEvent): void {
  if (event.name === 'q' || event.sequence === '\x03') {
    state.running = false;
    return;
  }

  const sidebarHeight = state.termHeight - 2;
  const visibleLines = sidebarHeight - 2;

  if (event.name === 'up' || event.name === 'k') {
    state.sidebar = navigateSidebar(state.sidebar, -1, visibleLines);
    state.needsRedraw = true;
    return;
  }

  if (event.name === 'down' || event.name === 'j') {
    state.sidebar = navigateSidebar(state.sidebar, 1, visibleLines);
    state.needsRedraw = true;
    return;
  }
}

// -- Render ------------------------------------------------------------------

function renderToBuffer(state: AppState): BufferWithCells {
  const { termWidth, termHeight } = state;
  const buffer = createCellBuffer(termWidth, termHeight, PANEL_FG, PANEL_BG);

  // Layout dimensions
  const sidebarWidth = Math.max(20, Math.floor(termWidth * 0.25));
  const rightWidth = termWidth - sidebarWidth;
  const contentHeight = termHeight - 2; // minus title + footer
  const demoHeight = Math.floor(contentHeight / 2);
  const codeHeight = contentHeight - demoHeight;

  // Title bar
  fill(buffer, 0, 0, termWidth, 1, ' ', WHITE, TITLE_BG);
  const title = 'blECSd Widget Gallery';
  const titleX = Math.floor((termWidth - title.length) / 2);
  renderText(buffer, titleX, 0, title, WHITE, TITLE_BG);

  // Sidebar
  const selectedWidget = getSelectedWidget(state.sidebar);
  renderSidebar(buffer, state.sidebar, 0, 1, sidebarWidth, contentHeight, {
    bg: SIDEBAR_BG,
    fg: SIDEBAR_FG,
    categoryFg: CATEGORY_FG,
    selectedFg: SELECTED_FG,
    selectedBg: SELECTED_BG,
    borderFg: PANEL_BORDER_FG,
  });

  // Demo panel (top-right)
  renderDemoToBuffer(buffer, selectedWidget, sidebarWidth, 1, rightWidth, demoHeight, {
    bg: PANEL_BG,
    fg: PANEL_FG,
    borderFg: PANEL_BORDER_FG,
    headingFg: HEADING_FG,
    descFg: DESC_FG,
  });

  // Code panel (bottom-right)
  renderCodeToBuffer(buffer, selectedWidget, sidebarWidth, 1 + demoHeight, rightWidth, codeHeight, {
    bg: PANEL_BG,
    fg: PANEL_FG,
    borderFg: PANEL_BORDER_FG,
    headingFg: HEADING_FG,
    kwFg: KW_FG,
    strFg: STR_FG,
    numFg: NUM_FG,
    fnFg: FN_FG,
    commentFg: COMMENT_FG,
  });

  // Footer
  fill(buffer, 0, termHeight - 1, termWidth, 1, ' ', FOOTER_FG, BLACK);
  renderText(buffer, 1, termHeight - 1, 'q: quit | \u2191\u2193/jk: navigate', FOOTER_FG, BLACK);

  return buffer;
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

// -- Main --------------------------------------------------------------------

function main(): void {
  const state = createAppState();

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
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
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  };

  process.stdin.on('data', (data: Buffer) => {
    if (!state.running) return;
    const keyEvents = parseKeyBuffer(data);
    for (const keyEvent of keyEvents) {
      handleKeypress(state, keyEvent);
    }
  });

  process.stdout.on('resize', () => {
    state.termWidth = process.stdout.columns || 80;
    state.termHeight = process.stdout.rows || 24;
    state.needsRedraw = true;
  });

  // Initial render
  writeRaw(bufferToAnsi(renderToBuffer(state)));
  state.needsRedraw = false;

  const renderInterval = setInterval(() => {
    if (!state.running) {
      clearInterval(renderInterval);
      restoreTerminal();
      process.exit(0);
      return;
    }
    if (state.needsRedraw) {
      writeRaw(bufferToAnsi(renderToBuffer(state)));
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
