import process from 'node:process';
import {
  setOutputStream,
  enterAlternateScreen,
  clearScreen,
  cursorHome,
  writeRaw,
  hideCursor,
  showCursor,
  leaveAlternateScreen,
  createInputHandler,
  cleanup as cleanupOutput,
  type KeyEvent,
} from 'blecsd';

import {
  createSidebarState,
  navigateSidebar,
  renderSidebar,
  getSelectedWidget,
  type SidebarState,
} from './sidebar.js';
import { renderDemo } from './demo.js';
import { renderCodePanel } from './codePanel.js';

interface AppState {
  readonly sidebar: SidebarState;
  readonly termWidth: number;
  readonly termHeight: number;
  readonly running: boolean;
}

function createAppState(): AppState {
  return {
    sidebar: createSidebarState(),
    termWidth: process.stdout.columns || 80,
    termHeight: process.stdout.rows || 24,
    running: true,
  };
}

function handleResize(state: AppState): AppState {
  return {
    ...state,
    termWidth: process.stdout.columns || 80,
    termHeight: process.stdout.rows || 24,
  };
}

function handleKeypress(state: AppState, event: KeyEvent): AppState {
  // Quit
  if (event.name === 'q' || event.sequence === '\x03') {
    return { ...state, running: false };
  }

  const sidebarHeight = state.termHeight - 2;
  const visibleLines = sidebarHeight - 2;

  // Navigation
  if (event.name === 'up' || event.name === 'k') {
    return {
      ...state,
      sidebar: navigateSidebar(state.sidebar, -1, visibleLines),
    };
  }

  if (event.name === 'down' || event.name === 'j') {
    return {
      ...state,
      sidebar: navigateSidebar(state.sidebar, 1, visibleLines),
    };
  }

  return state;
}

function render(state: AppState): void {
  const { termWidth, termHeight } = state;

  // Calculate layout dimensions
  const sidebarWidth = Math.floor(termWidth * 0.25);
  const rightWidth = termWidth - sidebarWidth;
  const demoHeight = Math.floor((termHeight - 2) / 2);
  const codeHeight = termHeight - 2 - demoHeight;

  // Get selected widget
  const selectedWidget = getSelectedWidget(state.sidebar);

  // Render components
  const sidebarContent = renderSidebar(state.sidebar, sidebarWidth, termHeight - 2);
  const demoContent = renderDemo(selectedWidget, rightWidth, demoHeight);
  const codeContent = renderCodePanel(selectedWidget, rightWidth, codeHeight);

  // Combine into full screen
  const output: string[] = [];

  // Title bar
  const title = ' blECSd Widget Gallery ';
  const titlePadding = ' '.repeat(Math.max(0, Math.floor((termWidth - title.length) / 2)));
  output.push(`\x1b[1m\x1b[44m${titlePadding}${title}${' '.repeat(termWidth - titlePadding.length - title.length)}\x1b[0m`);

  // Main content area
  const sidebarLines = sidebarContent.split('\n');
  const demoLines = demoContent.split('\n');
  const codeLines = codeContent.split('\n');

  for (let i = 0; i < termHeight - 2; i++) {
    const sidebarLine = sidebarLines[i] || ' '.repeat(sidebarWidth);
    let rightLine: string;

    if (i < demoHeight) {
      rightLine = demoLines[i] || ' '.repeat(rightWidth);
    } else {
      rightLine = codeLines[i - demoHeight] || ' '.repeat(rightWidth);
    }

    output.push(sidebarLine + rightLine);
  }

  // Footer
  const footer = ' q: quit | ↑↓/jk: navigate ';
  const footerPadding = ' '.repeat(Math.max(0, termWidth - footer.length));
  output.push(`\x1b[90m${footer}${footerPadding}\x1b[0m`);

  // Write to screen
  cursorHome();
  writeRaw(output.join('\n'));
}

function main(): void {
  setOutputStream(process.stdout);

  let state = createAppState();

  // Setup terminal
  enterAlternateScreen();
  clearScreen();
  hideCursor();

  // Setup input handler
  const inputHandler = createInputHandler(process.stdin);

  inputHandler.onKey((event) => {
    state = handleKeypress(state, event);
    if (state.running) {
      render(state);
    }
  });

  // Handle resize
  process.stdout.on('resize', () => {
    state = handleResize(state);
    render(state);
  });

  // Cleanup handler
  const cleanup = (): void => {
    inputHandler.stop();
    showCursor();
    leaveAlternateScreen();
    cleanupOutput();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  // Start input processing
  inputHandler.start();

  // Initial render
  render(state);

  // Render loop (30fps)
  const renderInterval = setInterval(() => {
    if (!state.running) {
      clearInterval(renderInterval);
      cleanup();
      return;
    }
    render(state);
  }, 1000 / 30);
}

main();
