import { renderText } from 'blecsd';
import { BOX_SINGLE, renderBox, type CellBuffer } from 'blecsd/utils';
import type { WidgetDemo } from './demoData.js';

function fill(buffer: CellBuffer, x: number, y: number, w: number, h: number, char: string, fg: number, bg: number): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      buffer.setCell(x + col, y + row, char, fg, bg);
    }
  }
}

export interface CodeColors {
  readonly fg: number;
  readonly bg: number;
  readonly borderFg: number;
  readonly headingFg: number;
  readonly kwFg: number;
  readonly strFg: number;
  readonly numFg: number;
  readonly fnFg: number;
  readonly commentFg: number;
}

interface ColorSpan {
  readonly text: string;
  readonly color: number;
}

export function renderCodeToBuffer(
  buffer: CellBuffer,
  widget: WidgetDemo,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: CodeColors,
): void {
  // Background + border
  fill(buffer, x, y, width, height, ' ', colors.fg, colors.bg);
  renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: colors.borderFg, bg: colors.bg });

  const innerWidth = width - 2;
  const innerX = x + 1;

  // Title
  renderText(buffer, innerX + 1, y + 1, 'Code Example', colors.headingFg, colors.bg);

  // Separator at row y+2
  for (let col = 0; col < width; col++) {
    if (col === 0) {
      buffer.setCell(x, y + 2, '\u251c', colors.borderFg, colors.bg);
    } else if (col === width - 1) {
      buffer.setCell(x + col, y + 2, '\u2524', colors.borderFg, colors.bg);
    } else {
      buffer.setCell(x + col, y + 2, BOX_SINGLE.horizontal, colors.borderFg, colors.bg);
    }
  }

  // Code lines with syntax highlighting
  const codeLines = widget.code.split('\n');
  const availableLines = height - 4; // border top, title, separator, border bottom

  for (let i = 0; i < Math.min(codeLines.length, availableLines); i++) {
    const codeLine = codeLines[i];
    if (codeLine === undefined) break;

    const row = y + 3 + i;
    const spans = highlightLine(codeLine, colors);

    let col = innerX + 1;
    for (const span of spans) {
      for (let c = 0; c < span.text.length; c++) {
        if (col >= x + width - 1) break;
        const ch = span.text[c];
        if (ch) {
          buffer.setCell(col, row, ch, span.color, colors.bg);
        }
        col++;
      }
    }
  }
}

const KEYWORDS = new Set([
  'import', 'from', 'const', 'let', 'var', 'function', 'return',
  'if', 'else', 'for', 'while', 'export', 'default', 'new',
  'type', 'interface', 'true', 'false', 'null', 'undefined',
]);

function highlightLine(line: string, colors: CodeColors): ColorSpan[] {
  const spans: ColorSpan[] = [];

  // Check for full-line comment
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//')) {
    spans.push({ text: line, color: colors.commentFg });
    return spans;
  }

  // Tokenize character by character
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;

    // Inline comment
    if (ch === '/' && line[i + 1] === '/') {
      spans.push({ text: line.slice(i), color: colors.commentFg });
      break;
    }

    // String literals
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++; // skip escaped char
        j++;
      }
      j++; // include closing quote
      spans.push({ text: line.slice(i, j), color: colors.strFg });
      i = j;
      continue;
    }

    // Numbers
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < line.length && ((line[j]! >= '0' && line[j]! <= '9') || line[j] === '.' || line[j] === 'x' || line[j] === 'f')) {
        j++;
      }
      spans.push({ text: line.slice(i, j), color: colors.numFg });
      i = j;
      continue;
    }

    // Words (identifiers / keywords)
    if (isIdentChar(ch)) {
      let j = i;
      while (j < line.length && isIdentChar(line[j]!)) {
        j++;
      }
      const word = line.slice(i, j);

      if (KEYWORDS.has(word)) {
        spans.push({ text: word, color: colors.kwFg });
      } else if (j < line.length && line[j] === '(') {
        spans.push({ text: word, color: colors.fnFg });
      } else {
        spans.push({ text: word, color: colors.fg });
      }
      i = j;
      continue;
    }

    // Everything else (punctuation, whitespace)
    spans.push({ text: ch, color: colors.fg });
    i++;
  }

  return spans;
}

function isIdentChar(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '$';
}
