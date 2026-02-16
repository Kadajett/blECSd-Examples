import { renderText } from 'blecsd';
import { BOX_SINGLE, renderBox, renderHLine, type CellBuffer } from 'blecsd/utils';
import type { WidgetDemo } from './demoData.js';

function fill(buffer: CellBuffer, x: number, y: number, w: number, h: number, char: string, fg: number, bg: number): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      buffer.setCell(x + col, y + row, char, fg, bg);
    }
  }
}

export interface DemoColors {
  readonly fg: number;
  readonly bg: number;
  readonly borderFg: number;
  readonly headingFg: number;
  readonly descFg: number;
}

export function renderDemoToBuffer(
  buffer: CellBuffer,
  widget: WidgetDemo,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: DemoColors,
): void {
  // Background + border
  fill(buffer, x, y, width, height, ' ', colors.fg, colors.bg);
  renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: colors.borderFg, bg: colors.bg });

  const innerWidth = width - 2;
  const innerX = x + 1;

  // Title
  const title = `${widget.name} - ${widget.category}`;
  renderText(buffer, innerX + 1, y + 1, title.slice(0, innerWidth - 1), colors.headingFg, colors.bg);

  // Description (word-wrap)
  const descLines = wrapText(widget.description, innerWidth - 1);
  let row = y + 2;
  for (const line of descLines) {
    if (row >= y + height - 1) break;
    renderText(buffer, innerX + 1, row, line.slice(0, innerWidth - 1), colors.descFg, colors.bg);
    row++;
  }

  // Separator
  if (row < y + height - 1) {
    renderHLine(buffer, x, row, width, BOX_SINGLE.horizontal, colors.borderFg, colors.bg);
    // T-junctions
    buffer.setCell(x, row, '\u251c', colors.borderFg, colors.bg);
    buffer.setCell(x + width - 1, row, '\u2524', colors.borderFg, colors.bg);
    row++;
  }

  // Preview area
  const previewAvailable = y + height - 1 - row;
  const preview = widget.render(innerWidth - 4, previewAvailable);
  const previewLines = preview.split('\n');

  // Strip ANSI from preview lines for width calculation
  const stripped = previewLines.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));

  // Center vertically
  const topPad = Math.max(0, Math.floor((previewAvailable - previewLines.length) / 2));

  for (let i = 0; i < previewLines.length; i++) {
    const py = row + topPad + i;
    if (py >= y + height - 1) break;

    const visibleWidth = stripped[i]?.length ?? 0;
    const leftPad = Math.max(0, Math.floor((innerWidth - visibleWidth) / 2));

    // Write preview character by character (plain text only, strip ANSI)
    const cleanLine = stripped[i] ?? '';
    for (let c = 0; c < cleanLine.length; c++) {
      const ch = cleanLine[c];
      if (ch && innerX + leftPad + c < x + width - 1) {
        buffer.setCell(innerX + leftPad + c, py, ch, colors.fg, colors.bg);
      }
    }
  }
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
