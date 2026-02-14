import { widgetDemos, type WidgetCategory } from './demoData.js';

export interface SidebarState {
  readonly selectedIndex: number;
  readonly scrollOffset: number;
}

const categories: readonly WidgetCategory[] = [
  "Layout",
  "Text",
  "Controls",
  "Input",
  "Data",
  "Visualization",
  "Specialized",
];

export function createSidebarState(): SidebarState {
  return {
    selectedIndex: 0,
    scrollOffset: 0,
  };
}

export function navigateSidebar(state: SidebarState, delta: number, visibleLines: number): SidebarState {
  const totalItems = widgetDemos.length;
  const newIndex = Math.max(0, Math.min(totalItems - 1, state.selectedIndex + delta));

  let newScrollOffset = state.scrollOffset;
  if (newIndex < state.scrollOffset) {
    newScrollOffset = newIndex;
  } else if (newIndex >= state.scrollOffset + visibleLines - 1) {
    newScrollOffset = newIndex - visibleLines + 2;
  }

  return {
    selectedIndex: newIndex,
    scrollOffset: Math.max(0, newScrollOffset),
  };
}

export function renderSidebar(
  state: SidebarState,
  width: number,
  height: number
): string {
  const lines: string[] = [];
  const visibleLines = height - 2; // Account for top/bottom borders

  // Top border
  lines.push(`┌${'─'.repeat(width - 2)}┐`);

  let currentLine = 0;
  let itemIndex = 0;
  let lastCategory: WidgetCategory | null = null;

  for (const widget of widgetDemos) {
    // Add category header
    if (widget.category !== lastCategory) {
      lastCategory = widget.category;

      if (currentLine >= state.scrollOffset && currentLine < state.scrollOffset + visibleLines) {
        const categoryLine = ` ${widget.category}`.padEnd(width - 2);
        lines.push(`│\x1b[1m\x1b[33m${categoryLine}\x1b[0m│`);
      }
      currentLine++;
    }

    // Add widget item
    if (currentLine >= state.scrollOffset && currentLine < state.scrollOffset + visibleLines) {
      const isSelected = itemIndex === state.selectedIndex;
      const prefix = isSelected ? '>' : ' ';
      const name = `  ${prefix} ${widget.name}`;
      const paddedName = name.padEnd(width - 2);

      if (isSelected) {
        lines.push(`│\x1b[7m${paddedName}\x1b[0m│`); // Reverse video for selection
      } else {
        lines.push(`│${paddedName}│`);
      }
    }

    currentLine++;
    itemIndex++;
  }

  // Fill remaining lines
  while (lines.length < height - 1) {
    lines.push(`│${' '.repeat(width - 2)}│`);
  }

  // Bottom border
  lines.push(`└${'─'.repeat(width - 2)}┘`);

  return lines.join('\n');
}

export function getSelectedWidget(state: SidebarState): typeof widgetDemos[number] {
  const widget = widgetDemos[state.selectedIndex];
  if (!widget) {
    return widgetDemos[0]!;
  }
  return widget;
}
