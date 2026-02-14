import type { WidgetDemo } from './demoData.js';

export function renderDemo(
  widget: WidgetDemo,
  width: number,
  height: number
): string {
  const lines: string[] = [];
  const innerWidth = width - 2;
  const innerHeight = height - 2;

  // Top border
  lines.push(`┌${'─'.repeat(innerWidth)}┐`);

  // Title and description
  const title = ` ${widget.name} - ${widget.category}`;
  const paddedTitle = title.padEnd(innerWidth);
  lines.push(`│\x1b[1m\x1b[36m${paddedTitle}\x1b[0m│`);

  const descLines = wrapText(widget.description, innerWidth);
  for (const descLine of descLines) {
    const paddedDesc = descLine.padEnd(innerWidth);
    lines.push(`│\x1b[90m${paddedDesc}\x1b[0m│`);
  }

  // Separator
  lines.push(`├${'─'.repeat(innerWidth)}┤`);

  // Render the widget preview
  const preview = widget.render(innerWidth - 4, innerHeight - descLines.length - 4);
  const previewLines = preview.split('\n');

  // Center the preview vertically
  const remainingLines = innerHeight - descLines.length - 2;
  const topPadding = Math.floor((remainingLines - previewLines.length) / 2);

  for (let i = 0; i < topPadding; i++) {
    lines.push(`│${' '.repeat(innerWidth)}│`);
  }

  for (const previewLine of previewLines) {
    // Center horizontally
    const strippedLine = stripAnsi(previewLine);
    const padding = Math.floor((innerWidth - strippedLine.length) / 2);
    const leftPad = ' '.repeat(padding);
    const rightPad = ' '.repeat(innerWidth - padding - strippedLine.length);
    lines.push(`│${leftPad}${previewLine}${rightPad}│`);
  }

  // Fill remaining space
  while (lines.length < height - 1) {
    lines.push(`│${' '.repeat(innerWidth)}│`);
  }

  // Bottom border
  lines.push(`└${'─'.repeat(innerWidth)}┘`);

  return lines.join('\n');
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}
