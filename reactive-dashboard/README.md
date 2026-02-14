# Reactive Dashboard Example

A reactive system monitor dashboard demonstrating blECSd's signal system with live data sources, computed values, effects, and runtime theme switching.

## Features

- **Polling Signals**: Live system metrics using `createPollingSignal` (CPU, memory, network, system info)
- **Computed Signals**: Derived values using `createComputed` (color thresholds based on usage)
- **Reactive Effects**: Side effects using `createEffect` (automatic alert logging when thresholds exceeded)
- **Signal-Based Theme Switching**: Multiple themes switchable at runtime using `createSignal`
- **Automatic Dependency Tracking**: All signals and effects automatically track dependencies

## Architecture

```
reactive-dashboard/
  index.ts          # Main entry point with signal-based reactivity
  data.ts           # Signal factories (polling, computed)
  layout.ts         # Rendering functions for each panel
  effects.ts        # Effect factories (alerts with dependency tracking)
  theme.ts          # Theme definitions and switching
```

## Signal System

### Polling Signals (Data Sources)

These signals poll OS data at regular intervals and automatically notify dependents:

- `createCpuSignal()` - Returns `[getter, dispose]`. Polls CPU usage every 1s
- `createMemorySignal()` - Returns `[getter, dispose]`. Polls memory every 1s
- `createNetworkSignal()` - Returns `[getter, dispose]`. Simulated network I/O
- `createSystemSignal()` - Returns `[getter, dispose]`. System info every 5s

### Computed Signals (Derived Values)

These signals derive values from other signals and auto-update:

- `createCpuColorSignal(cpuGetter)` - Returns `getter`. Computes color based on CPU usage
- `createMemoryColorSignal(memoryGetter)` - Returns `getter`. Computes color based on memory usage

### Effects (Side Effects)

These effects run automatically when their dependencies change:

- `createCpuAlertEffect(cpuGetter)` - Logs alerts when CPU exceeds 80% (10s cooldown)
- `createMemoryAlertEffect(memoryGetter)` - Logs alerts when memory exceeds 80% (10s cooldown)

### Signal API Pattern

```typescript
// Create a basic signal [getter, setter]
const [getTheme, setTheme] = createSignal<Theme>(darkTheme);

// Create a polling signal [getter, dispose]
const [getCpu, disposeCpu] = createPollingSignal(async () => data, 1000, initialValue);

// Create a computed signal (just getter)
const getColor = createComputed(() => {
  const cpu = getCpu(); // Auto-tracks dependency
  return cpu.average >= 80 ? 'red' : 'green';
});

// Create an effect (runs when dependencies change)
createEffect(() => {
  const cpu = getCpu(); // Auto-tracks dependency
  console.log(`CPU: ${cpu.average}%`);
});
```

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

1. **Reactive Signals**: `createSignal`, `createPollingSignal` for reactive data sources
2. **Computed Values**: `createComputed` for derived values that auto-update
3. **Automatic Effects**: `createEffect` for side effects with dependency tracking
4. **No Manual Subscriptions**: Effects and computed values track dependencies automatically
5. **Clean Disposal**: Polling signals return dispose functions for cleanup
6. **Tuple API**: Signals use `[getter, setter]` tuples, not object methods

## Implementation Notes

- Signals are tuples: `const [get, set] = createSignal(value)`
- Call getters as functions: `const data = getCpu()` (not `getCpu.get()`)
- Effects automatically track which signals they read
- Polling signals require 3 args: `createPollingSignal(asyncFn, intervalMs, initialValue)`
- Computed signals are just getter functions (no setter)

## Extending This Example

- Add more polling signals for disk I/O, process list, network interfaces
- Create computed signals that combine multiple data sources
- Add effects for logging to file or sending notifications
- Build derived signals for historical data or moving averages
- Implement signal-driven animations or transitions
