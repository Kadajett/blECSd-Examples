# Plugin System Example

Demonstrates blECSd's plugin system with lifecycle hooks, custom widgets, and themes.

## Features

- **Weather Plugin**: Simulates weather data with periodic updates
- **Custom Theme Plugin**: Registers a cyberpunk theme with neon colors
- **Charts Plugin**: Renders dynamic bar charts using block characters
- **Plugin Registry**: Central registry for managing plugin lifecycle

## Architecture

```
plugin-example/
  index.ts              # Main app with plugin loading and dashboard
  plugins/
    weather.ts          # Weather widget plugin with interval updates
    custom-theme.ts     # Custom theme registration plugin
    charts.ts           # Chart rendering plugin
```

## Running

```bash
pnpm install
pnpm dev
```

## Controls

- `1` - Toggle weather plugin
- `2` - Toggle theme plugin
- `3` - Toggle charts plugin
- `a` - Activate all plugins
- `d` - Deactivate all plugins
- `q` or `Ctrl+C` - Quit

## Plugin Lifecycle

Each plugin demonstrates the full lifecycle:

1. **init()** - Initialize plugin state
2. **activate()** - Start plugin behavior (intervals, event listeners)
3. **deactivate()** - Stop plugin behavior
4. **cleanup()** - Final cleanup on shutdown

## API Usage

### Plugin Definition

```typescript
import { definePlugin } from 'blecsd';

const myPlugin = definePlugin({
  name: 'my-plugin',
  version: '1.0.0',
  init() { /* initialize state */ },
  activate() { /* start behavior */ },
  deactivate() { /* stop behavior */ },
  cleanup() { /* final cleanup */ },
});
```

### Plugin Registry

```typescript
import {
  createPluginRegistry,
  registerPlugin,
  activatePlugin,
  deactivatePlugin,
  isPluginActive,
  getPlugins,
} from 'blecsd';

const registry = createPluginRegistry();
registerPlugin(myPlugin);
activatePlugin('my-plugin');
```

## Code Style

- Pure functions only (no classes, no `this`, no `new`)
- Early returns and guard clauses
- Explicit return types
- Import only from 'blecsd'
