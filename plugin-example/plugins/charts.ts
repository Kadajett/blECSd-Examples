import { renderText, type World } from 'blecsd';
import { definePlugin } from 'blecsd/core';
import { BOX_SINGLE, packColor, renderBox, type CellBuffer } from 'blecsd/utils';

interface ChartData {
  values: number[];
  labels: string[];
}

let chartData: ChartData = {
  values: [0, 0, 0, 0, 0],
  labels: ['A', 'B', 'C', 'D', 'E'],
};

let intervalHandle: NodeJS.Timeout | null = null;

function generateChartData(): ChartData {
  return {
    values: Array.from({ length: 5 }, () => Math.round(Math.random() * 100)),
    labels: ['A', 'B', 'C', 'D', 'E'],
  };
}

export const chartsPlugin = definePlugin({
  name: 'charts',
  version: '1.0.0',

  init(world: World): World {
    chartData = generateChartData();
    return world;
  },

  onActivate() {
    intervalHandle = setInterval(() => {
      chartData = generateChartData();
    }, 2000);
  },

  onDeactivate() {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  },

  cleanup(world: World): World {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    return world;
  },
});

export function getChartData(): ChartData {
  return chartData;
}

export function renderChartToBuffer(
  buffer: CellBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const magenta = packColor(255, 0, 255);
  const white = packColor(255, 255, 255);
  const green = packColor(0, 255, 0);
  const black = packColor(0, 0, 0);

  // Draw box border
  renderBox(buffer, x, y, w, h, BOX_SINGLE, { fg: magenta, bg: black });

  // Draw title
  renderText(buffer, x + 2, y, ' Chart Data ', white, black);

  // Draw chart bars
  const maxValue = Math.max(...chartData.values, 1);
  const barHeight = 8;

  for (let i = 0; i < chartData.values.length; i++) {
    const value = chartData.values[i] ?? 0;
    const label = chartData.labels[i] ?? '?';
    const normalized = Math.round((value / maxValue) * barHeight);
    const bar = '█'.repeat(normalized);

    renderText(buffer, x + 2, y + 2 + i, `${label}: ${bar}`, white, black);
    renderText(buffer, x + 2 + 3 + barHeight + 1, y + 2 + i, `${value}`, green, black);
  }
}
