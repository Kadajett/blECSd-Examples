# Reactive Dashboard Example

A reactive-style system monitor dashboard demonstrating clean separation of concerns with live data sources, side effects, and runtime theme switching.

## Features

- **Data Polling**: Live system metrics (CPU, memory, network, system info)
- **Side Effects**: Alert logging when thresholds are exceeded
- **Theme Switching**: Multiple themes (Dark, Light, Nord, Dracula) switchable at runtime
- **Functional Architecture**: Pure functions with clear separation of data, rendering, and effects
- **Reactive Patterns**: Data-driven rendering with minimal manual state management

## Architecture

```
reactive-dashboard/
  index.ts          # Main entry point with polling and render loop
  data.ts           # Data collection functions (CPU, memory, network, system)
  layout.ts         # Rendering functions for each panel
  effects.ts        # Side effects (alerts, logging)
  theme.ts          # Theme definitions and switching
```

## Implementation Pattern

While this example uses polling with `setInterval` (matching the system-monitor pattern), it demonstrates reactive programming principles:

- **Pure Functions**: All data collection and rendering functions are pure
- **Separation of Concerns**: Data, rendering, and effects are cleanly separated
- **Data-Driven**: UI updates automatically when data changes
- **Composable**: Each module can be used independently

## Data Collection

- `calculateCpuUsage()` - Tracks CPU usage per core with delta calculation
- `getMemoryData()` - Collects memory usage statistics
- `getNetworkData()` - Simulated network I/O (can be replaced with real data source)
- `getSystemData()` - System info (uptime, hostname, platform)

## Side Effects

- `checkCpuAlert()` - Logs alerts when CPU exceeds 80%
- `checkMemoryAlert()` - Logs alerts when memory exceeds 80%

Both effects have 10-second cooldown to prevent alert spam.

## Usage

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start
```

## Controls

- `q` or `Ctrl+C`: Quit
- `t`: Cycle through themes (Dark → Light → Nord → Dracula)
- `r`: Force refresh

## What This Demonstrates

1. **Functional Programming**: Pure functions, no classes, explicit state
2. **Separation of Concerns**: Data, rendering, and effects are independent modules
3. **Theme Switching**: Runtime theme changes propagate through the entire UI
4. **Clean Architecture**: Easy to test, extend, and maintain
5. **Alert Side Effects**: Demonstrates running effects on data changes

## Extending This Example

- Add more data sources (disk I/O, process list, network interfaces)
- Implement real network I/O reading from `/proc/net/dev` or OS APIs
- Add logging to file or send notifications via external service
- Build time-series history and render sparklines
- Add more themes or allow custom theme configuration
- Implement data export or snapshot features
