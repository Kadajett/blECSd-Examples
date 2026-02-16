import { renderText } from 'blecsd';
import { createCellBuffer, packColor, type CellBuffer } from 'blecsd/utils';
import type { EditorState } from './editor';
import type { PresenceState } from './presence';
import type { NetworkState } from './network';
import { getCursor, getDocumentLength } from './editor';
import { getPresenceBar, getRemoteUserCount } from './presence';

type BufferWithCells = ReturnType<typeof createCellBuffer>;

export interface UIState {
  readonly width: number;
  readonly height: number;
}

export function createUI(width: number, height: number): UIState {
  return {
    width,
    height,
  };
}

// Helper function to fill a rectangular region with a character
function fill(
  buffer: CellBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  char: string,
  fg: number,
  bg: number
): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      buffer.setCell(x + col, y + row, char, fg, bg);
    }
  }
}

// Color constants
const COLOR_WHITE = packColor(255, 255, 255);
const COLOR_BLACK = packColor(0, 0, 0);
const COLOR_GRAY_BG = packColor(58, 58, 58); // ~237 in 256-color
const COLOR_GRAY_DIM = packColor(88, 88, 88); // ~240 in 256-color
const COLOR_RED = packColor(255, 85, 85);
const COLOR_GREEN = packColor(85, 255, 85);
const COLOR_YELLOW = packColor(255, 255, 85);
const COLOR_CURSOR_INVERTED_FG = COLOR_BLACK;
const COLOR_CURSOR_INVERTED_BG = COLOR_WHITE;

function getUserColor(color: number): number {
  switch (color) {
    case 1:
      return COLOR_RED;
    case 2:
      return COLOR_GREEN;
    case 3:
      return COLOR_YELLOW;
    default:
      return COLOR_WHITE;
  }
}

function renderTopBar(buffer: CellBuffer, presence: PresenceState, width: number): void {
  const bar = getPresenceBar(presence, width - 12);
  const userCount = getRemoteUserCount(presence);
  const text = ` ${bar} (${userCount} users)`;

  // Fill entire top bar with gray background
  fill(buffer, 0, 0, width, 1, ' ', COLOR_WHITE, COLOR_GRAY_BG);

  // Render text
  renderText(buffer, 0, 0, text, COLOR_WHITE, COLOR_GRAY_BG);
}

function renderLineNumbers(
  buffer: CellBuffer,
  startLine: number,
  endLine: number,
  yOffset: number
): void {
  for (let i = startLine; i <= endLine; i++) {
    const lineNum = String(i + 1).padStart(4, ' ');
    renderText(buffer, 0, yOffset + (i - startLine), lineNum, COLOR_GRAY_DIM, COLOR_BLACK);
  }
}

function renderEditorContent(
  buffer: CellBuffer,
  editor: EditorState,
  width: number,
  height: number
): void {
  const contentWidth = width - 5; // Account for line numbers (4 digits + 1 space)
  const contentHeight = height - 3; // Account for top and bottom bars
  const startLine = 0;
  const endLine = Math.min(startLine + contentHeight - 1, editor.lines.length - 1);
  const xOffset = 5;
  const yOffset = 2;

  for (let i = startLine; i <= endLine; i++) {
    const line = editor.lines[i] ?? '';
    const displayLine = line.slice(0, contentWidth);

    renderText(buffer, xOffset, yOffset + (i - startLine), displayLine, COLOR_WHITE, COLOR_BLACK);
  }
}

function renderLocalCursor(
  buffer: CellBuffer,
  editor: EditorState,
  width: number,
  height: number
): void {
  const cursor = getCursor(editor);
  const screenY = cursor.line + 2; // Account for top bar
  const screenX = cursor.col + 5; // Account for line numbers

  if (screenY >= 2 && screenY < height - 1 && screenX >= 5 && screenX < width) {
    const line = editor.lines[cursor.line] ?? '';
    const char = cursor.col < line.length ? line[cursor.col] ?? ' ' : ' ';

    // Invert colors for cursor
    buffer.setCell(
      screenX,
      screenY,
      char,
      COLOR_CURSOR_INVERTED_FG,
      COLOR_CURSOR_INVERTED_BG
    );
  }
}

function renderRemoteCursors(
  buffer: CellBuffer,
  network: NetworkState,
  width: number,
  height: number
): void {
  for (const user of network.users) {
    const x = user.cursorX;
    const y = user.cursorY;

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const color = getUserColor(user.color);
      // Render remote cursor as a colored block
      buffer.setCell(x, y, '█', color, COLOR_BLACK);
    }
  }
}

function renderBottomBar(
  buffer: CellBuffer,
  editor: EditorState,
  presence: PresenceState,
  width: number,
  height: number
): void {
  const cursor = getCursor(editor);
  const docLength = getDocumentLength(editor);
  const userCount = getRemoteUserCount(presence);

  const status = ` Ln ${cursor.line + 1}, Col ${cursor.col + 1} | ${docLength} chars | ${userCount} users online`;

  const y = height - 1;

  // Fill entire bottom bar with gray background
  fill(buffer, 0, y, width, 1, ' ', COLOR_WHITE, COLOR_GRAY_BG);

  // Render status text
  renderText(buffer, 0, y, status, COLOR_WHITE, COLOR_GRAY_BG);
}

export function renderEditorToBuffer(
  editor: EditorState,
  presence: PresenceState,
  network: NetworkState,
  width: number,
  height: number
): BufferWithCells {
  const buffer = createCellBuffer(width, height, COLOR_WHITE, COLOR_BLACK);

  // Render UI components in order
  renderTopBar(buffer, presence, width);

  const contentHeight = height - 3;
  renderLineNumbers(buffer, 0, Math.min(contentHeight - 1, editor.lines.length - 1), 2);
  renderEditorContent(buffer, editor, width, height);

  // Render cursors
  renderRemoteCursors(buffer, network, width, height);
  renderLocalCursor(buffer, editor, width, height);

  renderBottomBar(buffer, editor, presence, width, height);

  return buffer;
}
