import type { WidgetDemo } from './demoData.js';

export function renderCodePanel(
  widget: WidgetDemo,
  width: number,
  height: number
): string {
  const lines: string[] = [];
  const innerWidth = width - 2;

  // Top border
  lines.push(`┌${'─'.repeat(innerWidth)}┐`);

  // Title
  const title = ' Code Example';
  const paddedTitle = title.padEnd(innerWidth);
  lines.push(`│\x1b[1m\x1b[36m${paddedTitle}\x1b[0m│`);

  // Separator
  lines.push(`├${'─'.repeat(innerWidth)}┤`);

  // Syntax highlighted code
  const codeLines = widget.code.split('\n');
  const highlightedLines = codeLines.map(line => highlightSyntax(line));

  for (const codeLine of highlightedLines) {
    const strippedLine = stripAnsi(codeLine);
    if (strippedLine.length > innerWidth) {
      // Truncate long lines
      const truncated = truncateWithAnsi(codeLine, innerWidth - 3) + '...';
      lines.push(`│${truncated}│`);
    } else {
      const padded = padWithAnsi(codeLine, innerWidth);
      lines.push(`│${padded}│`);
    }
  }

  // Fill remaining space
  while (lines.length < height - 1) {
    lines.push(`│${' '.repeat(innerWidth)}│`);
  }

  // Bottom border
  lines.push(`└${'─'.repeat(innerWidth)}┘`);

  return lines.join('\n');
}

function highlightSyntax(line: string): string {
  // Keywords
  let highlighted = line.replace(
    /\b(import|from|const|let|var|function|return|if|else|for|while|export|default|new|type|interface)\b/g,
    '\x1b[35m$1\x1b[0m' // Magenta
  );

  // Strings
  highlighted = highlighted.replace(
    /(['"`])(?:(?=(\\?))\2.)*?\1/g,
    '\x1b[32m$&\x1b[0m' // Green
  );

  // Comments
  highlighted = highlighted.replace(
    /\/\/.*/g,
    '\x1b[90m$&\x1b[0m' // Gray
  );

  // Numbers
  highlighted = highlighted.replace(
    /\b(\d+)\b/g,
    '\x1b[33m$1\x1b[0m' // Yellow
  );

  // Function names (basic detection)
  highlighted = highlighted.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    '\x1b[36m$1\x1b[0m('
  );

  return highlighted;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function padWithAnsi(text: string, targetWidth: number): string {
  const stripped = stripAnsi(text);
  const padding = targetWidth - stripped.length;
  if (padding <= 0) {
    return text;
  }
  return text + ' '.repeat(padding);
}

function truncateWithAnsi(text: string, maxWidth: number): string {
  const stripped = stripAnsi(text);
  if (stripped.length <= maxWidth) {
    return text;
  }

  let result = '';
  let visibleCount = 0;
  let inEscape = false;
  let escapeSeq = '';

  for (const char of text) {
    if (char === '\x1b') {
      inEscape = true;
      escapeSeq = char;
      continue;
    }

    if (inEscape) {
      escapeSeq += char;
      if (char === 'm') {
        inEscape = false;
        result += escapeSeq;
        escapeSeq = '';
      }
      continue;
    }

    if (visibleCount >= maxWidth) {
      break;
    }

    result += char;
    visibleCount++;
  }

  return result;
}
