import {
  enterAlternateScreen,
  hideCursor,
  leaveAlternateScreen,
  setOutputStream,
  showCursor,
  writeRaw,
} from 'blecsd/systems';
import { parseKeyBuffer } from 'blecsd/terminal';
import {
  createEditor,
  insertChar,
  deleteChar,
  moveCursor,
  applyRemoteOperation,
  setCursor,
} from './editor';
import { createPresence, addRemoteUser } from './presence';
import { createNetwork, startSimulation, getNetworkOps } from './network';
import { createUI, renderEditorToBuffer } from './ui';
import type { NetworkOperation } from './network';
import type { EditorState } from './editor';
import type { PresenceState } from './presence';
import type { NetworkState } from './network';
import type { UIState } from './ui';

import { createCellBuffer } from 'blecsd/utils';

type BufferWithCells = ReturnType<typeof createCellBuffer>;

interface AppState {
  editor: EditorState;
  readonly presence: PresenceState;
  readonly network: NetworkState;
  readonly ui: UIState;
  termWidth: number;
  termHeight: number;
  needsRedraw: boolean;
  running: boolean;
}

function createAppState(): AppState {
  const editor = createEditor('local');
  const presence = createPresence();
  const network = createNetwork();
  const ui = createUI(process.stdout.columns ?? 80, process.stdout.rows ?? 24);

  // Add remote users to presence
  for (const user of network.users) {
    addRemoteUser(presence, user.sessionId, user.name);
  }

  return {
    editor,
    presence,
    network,
    ui,
    termWidth: process.stdout.columns ?? 80,
    termHeight: process.stdout.rows ?? 24,
    needsRedraw: true,
    running: true,
  };
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

function renderToBuffer(state: AppState): BufferWithCells {
  return renderEditorToBuffer(
    state.editor,
    state.presence,
    state.network,
    state.termWidth,
    state.termHeight
  );
}

function handleKeypress(state: AppState, key: ReturnType<typeof parseKeyBuffer>[number]): void {
  if (key.name === 'q' && key.ctrl) {
    state.running = false;
    return;
  }

  if (key.name === 'backspace' || key.name === 'delete') {
    state.editor = deleteChar(state.editor);
  } else if (key.name === 'up') {
    state.editor = moveCursor(state.editor, 'up');
  } else if (key.name === 'down') {
    state.editor = moveCursor(state.editor, 'down');
  } else if (key.name === 'left') {
    state.editor = moveCursor(state.editor, 'left');
  } else if (key.name === 'right') {
    state.editor = moveCursor(state.editor, 'right');
  } else if (key.name === 'return' || key.name === 'enter') {
    state.editor = insertChar(state.editor, '\n');
  } else if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
    state.editor = insertChar(state.editor, key.sequence);
  }

  state.needsRedraw = true;
}

function main(): void {
  const state = createAppState();

  // Initialize terminal
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

  // Add some initial content
  state.editor = setCursor(state.editor, 0, 0);
  const initialText = 'Welcome to Collaborative Editor!\nStart typing to see CRDT in action.\n';
  for (const char of initialText) {
    state.editor = insertChar(state.editor, char);
  }
  state.editor = setCursor(state.editor, 2, 0);

  // Start network simulation
  startSimulation(state.network, state.editor, state.presence, (op: NetworkOperation) => {
    const ops = getNetworkOps(op);
    for (const textOp of ops) {
      state.editor = applyRemoteOperation(state.editor, textOp);
    }
    state.needsRedraw = true;
  });

  // Input handling
  process.stdin.on('data', (data: Buffer) => {
    if (!state.running) return;
    const keyEvents = parseKeyBuffer(new Uint8Array(data));
    for (const keyEvent of keyEvents) {
      handleKeypress(state, keyEvent);
    }
  });

  // Terminal resize handling
  process.stdout.on('resize', () => {
    state.termWidth = process.stdout.columns ?? 80;
    state.termHeight = process.stdout.rows ?? 24;
    state.needsRedraw = true;
  });

  // Initial render
  writeRaw(bufferToAnsi(renderToBuffer(state)));
  state.needsRedraw = false;

  // Render loop (50ms = ~20fps)
  const renderInterval = setInterval(() => {
    if (!state.running) {
      clearInterval(renderInterval);
      restoreTerminal();
      process.exit(0);
      return;
    }

    // Always redraw for live network simulation
    state.needsRedraw = true;

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
