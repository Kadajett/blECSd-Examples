import {
  createTextCRDT,
  insertText,
  deleteText,
  getTextValue,
  getTextLength,
  applyRemoteOp,
  createLWWRegister,
  getLWWValue,
  setLWWValue,
  type TextCRDT,
  type LWWRegister,
  type TextOp,
} from 'blecsd/terminal';

export interface CursorPosition {
  readonly line: number;
  readonly col: number;
}

export interface EditorState {
  readonly crdt: TextCRDT;
  readonly cursorReg: LWWRegister<CursorPosition>;
  readonly lines: readonly string[];
  readonly siteId: string;
}

export function createEditor(siteId = 'local'): EditorState {
  const crdt = createTextCRDT(siteId);
  const cursorReg = createLWWRegister<CursorPosition>({ line: 0, col: 0 }, siteId);

  return {
    crdt,
    cursorReg,
    lines: [''],
    siteId,
  };
}

export function getCursor(state: EditorState): CursorPosition {
  return getLWWValue(state.cursorReg);
}

export function setCursor(state: EditorState, line: number, col: number): EditorState {
  setLWWValue(state.cursorReg, { line, col }, state.siteId, Date.now());
  return state;
}

function textToLines(text: string): readonly string[] {
  if (text === '') return [''];
  return text.split('\n');
}

function getPositionFromLineCol(lines: readonly string[], line: number, col: number): number {
  let pos = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    pos += (lines[i]?.length ?? 0) + 1; // +1 for newline
  }
  const currentLine = lines[line];
  if (currentLine) {
    pos += Math.min(col, currentLine.length);
  }
  return pos;
}

export function insertChar(state: EditorState, char: string): EditorState {
  const cursor = getCursor(state);
  const pos = getPositionFromLineCol(state.lines, cursor.line, cursor.col);

  insertText(state.crdt, pos, char);

  const newText = getTextValue(state.crdt);
  const newLines = textToLines(newText);

  let newLine = cursor.line;
  let newCol = cursor.col + 1;

  if (char === '\n') {
    newLine += 1;
    newCol = 0;
  }

  return {
    ...state,
    lines: newLines,
    cursorReg: state.cursorReg,
  };
}

export function deleteChar(state: EditorState): EditorState {
  const cursor = getCursor(state);

  if (cursor.col === 0 && cursor.line === 0) {
    return state; // At start of document
  }

  let pos: number;
  if (cursor.col === 0) {
    // At start of line, delete previous newline
    pos = getPositionFromLineCol(state.lines, cursor.line, 0) - 1;
  } else {
    pos = getPositionFromLineCol(state.lines, cursor.line, cursor.col) - 1;
  }

  deleteText(state.crdt, pos, 1);

  const newText = getTextValue(state.crdt);
  const newLines = textToLines(newText);

  return {
    ...state,
    lines: newLines,
    cursorReg: state.cursorReg,
  };
}

export function moveCursor(state: EditorState, direction: 'up' | 'down' | 'left' | 'right'): EditorState {
  const cursor = getCursor(state);
  let newLine = cursor.line;
  let newCol = cursor.col;

  switch (direction) {
    case 'up':
      if (newLine > 0) {
        newLine -= 1;
        const targetLine = state.lines[newLine];
        if (targetLine) {
          newCol = Math.min(newCol, targetLine.length);
        }
      }
      break;
    case 'down':
      if (newLine < state.lines.length - 1) {
        newLine += 1;
        const targetLine = state.lines[newLine];
        if (targetLine) {
          newCol = Math.min(newCol, targetLine.length);
        }
      }
      break;
    case 'left':
      if (newCol > 0) {
        newCol -= 1;
      } else if (newLine > 0) {
        newLine -= 1;
        const prevLine = state.lines[newLine];
        newCol = prevLine?.length ?? 0;
      }
      break;
    case 'right': {
      const currentLine = state.lines[newLine];
      if (currentLine && newCol < currentLine.length) {
        newCol += 1;
      } else if (newLine < state.lines.length - 1) {
        newLine += 1;
        newCol = 0;
      }
      break;
    }
  }

  return setCursor(state, newLine, newCol);
}

export function applyRemoteOperation(state: EditorState, op: TextOp): EditorState {
  applyRemoteOp(state.crdt, op);

  const newText = getTextValue(state.crdt);
  const newLines = textToLines(newText);

  return {
    ...state,
    lines: newLines,
  };
}

export function getDocumentLength(state: EditorState): number {
  return getTextLength(state.crdt);
}
