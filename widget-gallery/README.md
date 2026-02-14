# Widget Gallery Example

An interactive gallery showcasing all major blECSd widgets and components.

## Features

- **Interactive Navigation**: Browse through 25+ widgets using arrow keys or vim-style j/k
- **Live Previews**: See ANSI art representations of each widget
- **Code Examples**: View implementation code with syntax highlighting
- **Categorized**: Widgets organized by Layout, Text, Controls, Input, Data, Visualization, and Specialized

## Running

```bash
# Development mode (with tsx)
pnpm dev

# Or build and run
pnpm build
pnpm start
```

## Controls

- **↑/↓** or **j/k**: Navigate widget list
- **q** or **Ctrl+C**: Quit

## Layout

The gallery uses a 3-panel layout:

```
┌─────────────────────────────────────────────────┐
│         blECSd Widget Gallery                   │
├────────────┬────────────────────────────────────┤
│            │                                     │
│  Widget    │  Live Demo Preview                 │
│  List      │                                     │
│            ├─────────────────────────────────────┤
│            │                                     │
│            │  Code Example                       │
│            │                                     │
└────────────┴─────────────────────────────────────┘
```

## Showcased Widgets

### Layout
- Box, FlexContainer, Grid, Tabs, Accordion, Collapsible, SplitPane, Panel, Modal

### Text
- Text, BigText, Log, StreamingText, TaggedText

### Controls
- Button, Checkbox, RadioGroup, ProgressBar, Slider, Switch

### Input
- InputControl, Textarea, Select, Autocomplete, Prompt, MultiSelect

### Data
- List, Table, Tree, DataGrid, ListTable, SearchableList

### Visualization
- BarChart, LineChart, Sparkline, Gauge, Calendar, Canvas

### Specialized
- CommandPalette, Loading, Toast

## Minimum Requirements

- Terminal size: 80x24 or larger
- Node.js 18+
