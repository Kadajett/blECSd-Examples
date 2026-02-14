import { writeRaw } from 'blecsd';
import type { EditorState, CursorPosition } from './editor';
import type { PresenceState } from './presence';
import type { NetworkState } from './network';
import { getCursor, getDocumentLength } from './editor';
import { getPresenceBar, getRemoteUserCount } from './presence';
import {
  createOverlayManager,
  addSessionOverlay,
  setCursorOverlay,
  renderOverlaysToAnsi,
} from 'blecsd';

export interface UIState {
  readonly width: number;
  readonly height: number;
  readonly overlayManager: ReturnType<typeof createOverlayManager>;
}

export function createUI(width: number, height: number): UIState {
  return {
    width,
    height,
    overlayManager: createOverlayManager(),
  };
}

export function initializeOverlays(ui: UIState, network: NetworkState): void {
  for (const user of network.users) {
    addSessionOverlay(user.sessionId, user.name, user.color);
    setCursorOverlay(user.sessionId, user.cursorX, user.cursorY);
  }
}

export function updateOverlayCursors(ui: UIState, network: NetworkState): void {
  for (const user of network.users) {
    setCursorOverlay(user.sessionId, user.cursorX, user.cursorY);
  }
}

function drawTopBar(presence: PresenceState, width: number): void {
  const bar = getPresenceBar(presence, width - 2);
  const userCount = getRemoteUserCount(presence);

  writeRaw('\x1b[1;1H'); // Move to top-left
  writeRaw('\x1b[48;5;237m'); // Gray background
  writeRaw('\x1b[38;5;255m'); // White text
  writeRaw(` ${bar} (${userCount} users)`);
  writeRaw(' '.repeat(Math.max(0, width - bar.length - 12)));
  writeRaw('\x1b[0m'); // Reset
}

function drawLineNumbers(startLine: number, endLine: number): void {
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(4, ' ');
    writeRaw(`\x1b[${i - startLine + 3};1H`); // Position cursor
    writeRaw('\x1b[38;5;240m'); // Dark gray
    writeRaw(lineNum);
    writeRaw('\x1b[0m');
  }
}

function drawEditorContent(editor: EditorState, ui: UIState): void {
  const contentWidth = ui.width - 5; // Account for line numbers
  const contentHeight = ui.height - 3; // Account for top and bottom bars
  const startLine = 0;
  const endLine = Math.min(startLine + contentHeight - 1, editor.lines.length - 1);

  for (let i = startLine; i <= endLine; i++) {
    const line = editor.lines[i] ?? '';
    const displayLine = line.slice(0, contentWidth);

    writeRaw(`\x1b[${i - startLine + 3};6H`); // Position after line numbers
    writeRaw('\x1b[0m'); // Reset styling
    writeRaw(displayLine);
    writeRaw(' '.repeat(Math.max(0, contentWidth - displayLine.length)));
  }
}

function drawCursor(cursor: CursorPosition): void {
  const screenY = cursor.line + 3; // Account for top bar and offset
  const screenX = cursor.col + 6; // Account for line numbers

  writeRaw(`\x1b[${screenY};${screenX}H`); // Move cursor to position
}

function drawBottomBar(editor: EditorState, presence: PresenceState, ui: UIState): void {
  const cursor = getCursor(editor);
  const docLength = getDocumentLength(editor);
  const userCount = getRemoteUserCount(presence);

  const status = `Ln ${cursor.line + 1}, Col ${cursor.col + 1} | ${docLength} chars | ${userCount} users online`;

  writeRaw(`\x1b[${ui.height};1H`); // Move to bottom
  writeRaw('\x1b[48;5;237m'); // Gray background
  writeRaw('\x1b[38;5;255m'); // White text
  writeRaw(' ' + status);
  writeRaw(' '.repeat(Math.max(0, ui.width - status.length - 1)));
  writeRaw('\x1b[0m'); // Reset
}

function drawOverlays(ui: UIState): void {
  const overlayAnsi = renderOverlaysToAnsi(ui.width, ui.height);
  writeRaw(overlayAnsi);
}

export function render(
  editor: EditorState,
  presence: PresenceState,
  network: NetworkState,
  ui: UIState
): void {
  // Clear screen
  writeRaw('\x1b[2J');

  // Draw UI components
  drawTopBar(presence, ui.width);

  const contentHeight = ui.height - 3;
  drawLineNumbers(0, Math.min(contentHeight - 1, editor.lines.length - 1));
  drawEditorContent(editor, ui);

  // Update and draw overlays
  updateOverlayCursors(ui, network);
  drawOverlays(ui);

  drawBottomBar(editor, presence, ui);

  // Draw local cursor
  drawCursor(getCursor(editor));
}
