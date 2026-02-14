import { definePlugin, writeRaw, type World } from 'blecsd';

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

export function renderChart(x: number, y: number): void {
  const maxValue = Math.max(...chartData.values, 1);
  const barHeight = 8;

  writeRaw(`\x1b[${y};${x}H\x1b[35m╔════════════════════════╗\x1b[0m`);
  writeRaw(`\x1b[${y + 1};${x}H\x1b[35m║\x1b[0m Chart Data           \x1b[35m║\x1b[0m`);
  writeRaw(`\x1b[${y + 2};${x}H\x1b[35m╠════════════════════════╣\x1b[0m`);

  for (let i = 0; i < chartData.values.length; i++) {
    const value = chartData.values[i] ?? 0;
    const label = chartData.labels[i] ?? '?';
    const normalized = Math.round((value / maxValue) * barHeight);
    const bar = '█'.repeat(normalized).padEnd(barHeight, ' ');

    writeRaw(`\x1b[${y + 3 + i};${x}H\x1b[35m║\x1b[0m ${label}: ${bar} \x1b[32m${value}\x1b[0m \x1b[35m║\x1b[0m`);
  }

  writeRaw(`\x1b[${y + 8};${x}H\x1b[35m╚════════════════════════╝\x1b[0m`);
}
