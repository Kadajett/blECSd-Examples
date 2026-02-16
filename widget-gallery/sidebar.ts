import { renderText } from 'blecsd';
import { BOX_SINGLE, renderBox, type CellBuffer } from 'blecsd/utils';
import { widgetDemos, type WidgetCategory } from './demoData.js';

function fill(buffer: CellBuffer, x: number, y: number, w: number, h: number, char: string, fg: number, bg: number): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      buffer.setCell(x + col, y + row, char, fg, bg);
    }
  }
}

export interface SidebarState {
  readonly selectedIndex: number;
  readonly scrollOffset: number;
}

export interface SidebarColors {
  readonly fg: number;
  readonly bg: number;
  readonly categoryFg: number;
  readonly selectedFg: number;
  readonly selectedBg: number;
  readonly borderFg: number;
}

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
  buffer: CellBuffer,
  state: SidebarState,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: SidebarColors,
): void {
  // Background fill
  fill(buffer, x, y, width, height, ' ', colors.fg, colors.bg);

  // Border
  renderBox(buffer, x, y, width, height, BOX_SINGLE, { fg: colors.borderFg, bg: colors.bg });

  const innerWidth = width - 2;
  const visibleLines = height - 2;

  // Build flat list of rows: category headers + widget items
  const rows: Array<{ type: 'category'; label: string } | { type: 'widget'; index: number; name: string }> = [];
  let lastCategory: WidgetCategory | null = null;
  let itemIndex = 0;

  for (const widget of widgetDemos) {
    if (widget.category !== lastCategory) {
      lastCategory = widget.category;
      rows.push({ type: 'category', label: widget.category });
    }
    rows.push({ type: 'widget', index: itemIndex, name: widget.name });
    itemIndex++;
  }

  // Render visible rows
  for (let i = 0; i < visibleLines; i++) {
    const rowIndex = state.scrollOffset + i;
    const row = rows[rowIndex];
    if (!row) break;

    const ry = y + 1 + i;

    if (row.type === 'category') {
      const label = row.label.slice(0, innerWidth);
      renderText(buffer, x + 2, ry, label, colors.categoryFg, colors.bg);
    } else {
      const isSelected = row.index === state.selectedIndex;
      const prefix = isSelected ? '> ' : '  ';
      const label = (prefix + row.name).slice(0, innerWidth);
      const lineBg = isSelected ? colors.selectedBg : colors.bg;
      const lineFg = isSelected ? colors.selectedFg : colors.fg;

      if (isSelected) {
        fill(buffer, x + 1, ry, innerWidth, 1, ' ', lineFg, lineBg);
      }
      renderText(buffer, x + 2, ry, label, lineFg, lineBg);
    }
  }
}

export function getSelectedWidget(state: SidebarState): typeof widgetDemos[number] {
  const widget = widgetDemos[state.selectedIndex];
  if (!widget) {
    return widgetDemos[0]!;
  }
  return widget;
}
