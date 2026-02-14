# Debug Showcase

A demonstration of blECSd's debugging and profiling capabilities with configurable workloads.

## Features

- **Entity Inspector**: View detailed component data for any selected entity
- **World Statistics**: Monitor entity count, component usage, and world state
- **Performance Monitoring**: Real-time FPS, frame time, and memory usage
- **System Timing**: Per-system execution time tracking
- **Configurable Workloads**: Test with different entity counts and speeds
- **Burst Mode**: Stress test with rapid entity creation/destruction

## Controls

| Key | Action |
|-----|--------|
| F12 or 'd' | Toggle debug overlay |
| 1 | Light workload (50 entities) |
| 2 | Medium workload (200 entities) |
| 3 | Heavy workload (500 entities) |
| b | Burst mode (rapid create/destroy) |
| Tab | Select next entity for inspection |
| q or Ctrl+C | Quit |

## Running

```bash
# Development mode (with hot reload)
pnpm dev

# Build and run
pnpm build
pnpm start
```

## What This Demonstrates

### Entity Inspector

Press Tab to cycle through entities. The debug overlay shows:
- Entity ID
- All components attached to the entity
- Component field values (Position x/y, Velocity x/y, etc.)

### World Statistics

Shows global state:
- Total entity count
- Component usage statistics
- Memory allocations

### Performance Monitoring

Real-time metrics:
- FPS (frames per second)
- Frame time in milliseconds
- Memory usage in MB

### System Timing

Tracks execution time for each system:
- Movement system (updates positions)
- Bounce system (handles collisions)

## Workload Descriptions

- **Light** (50 entities): Baseline performance test
- **Medium** (200 entities): Moderate stress test
- **Heavy** (500+ entities): High entity count test
- **Burst Mode**: Creates/destroys 20-50 entities every 100ms to test allocation performance

## Implementation Details

The debug overlay uses blECSd's debug API:
- `inspectEntity()` - Get entity component data
- `inspectWorld()` - Get world statistics
- `getPerformanceStats()` - Get FPS/memory metrics
- `getSystemTimings()` - Get per-system execution times
- `enableSystemTiming()` - Enable timing tracking
- `timedSystem()` - Wrap systems for automatic timing

All systems are pure functions operating on ECS components, following blECSd's functional programming principles.
