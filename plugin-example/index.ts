import process from 'node:process';
import {
  createWorld,
  createScreenEntity,
  createScheduler,
  setOutputStream,
  enterAlternateScreen,
  clearScreen,
  cursorHome,
  writeRaw,
  hideCursor,
  showCursor,
  leaveAlternateScreen,
  createInputHandler,
  cleanup as cleanupOutput,
  createPluginRegistry,
  registerPlugin,
  activatePlugin,
  deactivatePlugin,
  isPluginActive,
  getPlugins,
  type KeyEvent,
} from 'blecsd';

import { weatherPlugin, renderWeather } from './plugins/weather.js';
import { customThemePlugin, getThemeStatus } from './plugins/custom-theme.js';
import { chartsPlugin, renderChart } from './plugins/charts.js';

function main(): void {
  // Initialize world, scheduler, and screen
  const world = createWorld();
  const scheduler = createScheduler();
  createScreenEntity(world, { width: 80, height: 24 });

  // Setup terminal
  setOutputStream(process.stdout);
  enterAlternateScreen();
  clearScreen();
  cursorHome();
  hideCursor();

  // Create plugin registry
  const registry = createPluginRegistry();

  // Register all plugins
  registerPlugin(registry, scheduler, world, weatherPlugin);
  registerPlugin(registry, scheduler, world, customThemePlugin);
  registerPlugin(registry, scheduler, world, chartsPlugin);

  let running = true;

  // Cleanup handler
  function cleanup(): void {
    running = false;
    showCursor();
    leaveAlternateScreen();
    cleanupOutput();
  }

  // Handle exit signals
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Input handler
  const inputHandler = createInputHandler(process.stdin);

  inputHandler.onKey((event: KeyEvent) => {
    const key = event.name;
    const ctrl = event.ctrl;

    if (key === 'q' || (key === 'c' && ctrl)) {
      cleanup();
      process.exit(0);
    }

    if (key === '1') {
      if (isPluginActive(registry, 'weather')) {
        deactivatePlugin(registry, scheduler, world, 'weather');
      } else {
        activatePlugin(registry, scheduler, world, 'weather');
      }
    }

    if (key === '2') {
      if (isPluginActive(registry, 'custom-theme')) {
        deactivatePlugin(registry, scheduler, world, 'custom-theme');
      } else {
        activatePlugin(registry, scheduler, world, 'custom-theme');
      }
    }

    if (key === '3') {
      if (isPluginActive(registry, 'charts')) {
        deactivatePlugin(registry, scheduler, world, 'charts');
      } else {
        activatePlugin(registry, scheduler, world, 'charts');
      }
    }

    if (key === 'a') {
      activatePlugin(registry, scheduler, world, 'weather');
      activatePlugin(registry, scheduler, world, 'custom-theme');
      activatePlugin(registry, scheduler, world, 'charts');
    }

    if (key === 'd') {
      deactivatePlugin(registry, scheduler, world, 'weather');
      deactivatePlugin(registry, scheduler, world, 'custom-theme');
      deactivatePlugin(registry, scheduler, world, 'charts');
    }
  });

  inputHandler.start();

  // Render loop
  function render(): void {
    if (!running) {
      return;
    }

    clearScreen();
    cursorHome();

    // Header
    writeRaw('\x1b[1;1H\x1b[1;37;44m Plugin System Demo '.padEnd(80) + '\x1b[0m');

    // Plugin status panel
    writeRaw('\x1b[3;2H\x1b[1;33m╔════════════════════════════════════════════════╗\x1b[0m');
    writeRaw('\x1b[4;2H\x1b[1;33m║\x1b[0m Plugin Status                                 \x1b[1;33m║\x1b[0m');
    writeRaw('\x1b[5;2H\x1b[1;33m╠════════════════════════════════════════════════╣\x1b[0m');

    const plugins = getPlugins(registry);
    let row = 6;
    for (const plugin of plugins) {
      const active = isPluginActive(registry, plugin.name);
      const status = active ? '\x1b[32mACTIVE\x1b[0m  ' : '\x1b[31mINACTIVE\x1b[0m';
      const name = plugin.name.padEnd(15);
      const version = plugin.version.padEnd(10);
      writeRaw(`\x1b[${row};2H\x1b[1;33m║\x1b[0m ${name} ${version} ${status} \x1b[1;33m║\x1b[0m`);
      row++;
    }

    writeRaw(`\x1b[${row};2H\x1b[1;33m╚════════════════════════════════════════════════╝\x1b[0m`);

    // Plugin outputs
    let outputY = row + 2;

    if (isPluginActive(registry, 'weather')) {
      renderWeather(2, outputY);
      outputY += 8;
    }

    if (isPluginActive(registry, 'charts')) {
      renderChart(2, outputY);
      outputY += 10;
    }

    if (isPluginActive(registry, 'custom-theme')) {
      const themeStatus = getThemeStatus();
      writeRaw(`\x1b[${outputY};2H\x1b[35m${themeStatus}\x1b[0m`);
    }

    // Controls help
    writeRaw('\x1b[22;2H\x1b[36mControls:\x1b[0m 1=Weather 2=Theme 3=Charts a=Activate All d=Deactivate All q=Quit');

    setTimeout(render, 100);
  }

  render();
}

main();
