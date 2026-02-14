import {
  createWorld,
  createScreenEntity,
  setOutputStream,
  enterAlternateScreen,
  clearScreen,
  hideCursor,
  showCursor,
  leaveAlternateScreen,
  parseKeyBuffer,
  type KeyEvent,
} from 'blecsd';
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
import { createUI, render, initializeOverlays } from './ui';
import type { NetworkOperation } from './network';

const FRAME_RATE = 30;
const FRAME_TIME = 1000 / FRAME_RATE;

function main(): void {
  // Initialize terminal
  setOutputStream(process.stdout);
  enterAlternateScreen();
  clearScreen();
  hideCursor();

  // Create world and screen
  const world = createWorld();
  const screen = createScreenEntity(world, {
    width: process.stdout.columns ?? 80,
    height: process.stdout.rows ?? 24,
  });

  // Initialize state
  let editor = createEditor('local');
  const presence = createPresence();
  const network = createNetwork();
  const ui = createUI(process.stdout.columns ?? 80, process.stdout.rows ?? 24);

  // Add remote users to presence
  for (const user of network.users) {
    addRemoteUser(presence, user.sessionId, user.name);
  }

  // Initialize overlays
  initializeOverlays(ui, network);

  // Add some initial content
  editor = setCursor(editor, 0, 0);
  const initialText = 'Welcome to Collaborative Editor!\nStart typing to see CRDT in action.\n';
  for (const char of initialText) {
    editor = insertChar(editor, char);
  }
  editor = setCursor(editor, 2, 0);

  // Start network simulation
  startSimulation(network, editor, presence, (op: NetworkOperation) => {
    const ops = getNetworkOps(op);
    for (const textOp of ops) {
      editor = applyRemoteOperation(editor, textOp);
    }
  });

  // Input handling
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  process.stdin.on('data', (data: Buffer) => {
    const events = parseKeyBuffer(new Uint8Array(data));

    for (const key of events) {
      if (key.name === 'q' && key.ctrl) {
        cleanup();
        process.exit(0);
      }

      if (key.name === 'backspace' || key.name === 'delete') {
        editor = deleteChar(editor);
      } else if (key.name === 'up') {
        editor = moveCursor(editor, 'up');
      } else if (key.name === 'down') {
        editor = moveCursor(editor, 'down');
      } else if (key.name === 'left') {
        editor = moveCursor(editor, 'left');
      } else if (key.name === 'right') {
        editor = moveCursor(editor, 'right');
      } else if (key.name === 'return' || key.name === 'enter') {
        editor = insertChar(editor, '\n');
      } else if (key.sequence.length === 1 && !key.ctrl && !key.meta) {
        editor = insertChar(editor, key.sequence);
      }
    }
  });

  // Render loop
  const renderInterval = setInterval(() => {
    render(editor, presence, network, ui);
  }, FRAME_TIME);

  // Cleanup function
  function cleanup(): void {
    clearInterval(renderInterval);
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    showCursor();
    leaveAlternateScreen();
  }

  // Handle exit signals
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // Initial render
  render(editor, presence, network, ui);
}

main();
