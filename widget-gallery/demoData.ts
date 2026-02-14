export type WidgetCategory = "Layout" | "Text" | "Controls" | "Input" | "Data" | "Visualization" | "Specialized";

export interface WidgetDemo {
  readonly name: string;
  readonly category: WidgetCategory;
  readonly description: string;
  readonly render: (width: number, height: number) => string;
  readonly code: string;
}

const colorize = (text: string, code: number): string => `\x1b[${code}m${text}\x1b[0m`;
const cyan = (text: string): string => colorize(text, 36);
const green = (text: string): string => colorize(text, 32);
const yellow = (text: string): string => colorize(text, 33);
const gray = (text: string): string => colorize(text, 90);

export const widgetDemos: readonly WidgetDemo[] = [
  // Layout
  {
    name: "Box",
    category: "Layout",
    description: "Container with borders, padding, and styling",
    render: (w: number, h: number): string => {
      const lines = [
        "┌────────────────────────┐",
        "│  Box Content Area      │",
        "│                        │",
        "│  Supports borders,     │",
        "│  padding, and styles   │",
        "└────────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createBox } from 'blecsd';

const box = createBox(world, {
  x: 10, y: 5, width: 30, height: 10,
  border: { type: 'line' },
  style: { fg: 0xffffff, bg: 0x000000 }
});`,
  },
  {
    name: "FlexContainer",
    category: "Layout",
    description: "Flexbox-style layout container",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─────┬─────┬─────┐",
        "│  A  │  B  │  C  │",
        "│     │     │     │",
        "└─────┴─────┴─────┘",
        "",
        "Flex direction: row",
      ];
      return lines.join('\n');
    },
    code: `import { createFlexContainer } from 'blecsd';

const flex = createFlexContainer(world, {
  x: 0, y: 0, width: 50, height: 20,
  direction: 'row',
  gap: 2
});`,
  },
  {
    name: "Grid",
    category: "Layout",
    description: "CSS Grid-style layout container",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─────┬─────┐",
        "│  1  │  2  │",
        "├─────┼─────┤",
        "│  3  │  4  │",
        "└─────┴─────┘",
        "",
        "2x2 Grid Layout",
      ];
      return lines.join('\n');
    },
    code: `import { createGrid } from 'blecsd';

const grid = createGrid(world, {
  x: 0, y: 0, width: 60, height: 30,
  rows: 2, cols: 2,
  gap: 1
});`,
  },
  {
    name: "Tabs",
    category: "Layout",
    description: "Tabbed interface with multiple panels",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─────┬─────┬─────┐",
        "│ Tab1│ Tab2│ Tab3│",
        "╞═════╧═════╧═════╡",
        "│ Content of Tab1  │",
        "│                  │",
        "└──────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createTabs } from 'blecsd';

const tabs = createTabs(world, {
  x: 0, y: 0, width: 60, height: 20,
  tabs: ['Home', 'Settings', 'About']
});`,
  },

  // Text
  {
    name: "Text",
    category: "Text",
    description: "Static text with styling and alignment",
    render: (w: number, h: number): string => {
      const lines = [
        yellow("Hello, World!"),
        "",
        cyan("Styled text with colors"),
        gray("and various alignments"),
      ];
      return lines.join('\n');
    },
    code: `import { createText } from 'blecsd';

const text = createText(world, {
  x: 10, y: 5,
  content: 'Hello, World!',
  style: { fg: 0xffff00 }
});`,
  },
  {
    name: "BigText",
    category: "Text",
    description: "Large ASCII art text",
    render: (w: number, h: number): string => {
      const lines = [
        " █████  ",
        "██   ██ ",
        "███████ ",
        "██   ██ ",
        "██   ██ ",
      ];
      return lines.join('\n');
    },
    code: `import { createBigText } from 'blecsd';

const bigText = createBigText(world, {
  x: 5, y: 5,
  text: 'HELLO',
  font: 'standard'
});`,
  },
  {
    name: "Log",
    category: "Text",
    description: "Scrolling log viewer with auto-scroll",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─ Log ──────────────┐",
        "│ [INFO] Started...  │",
        "│ [WARN] Memory low  │",
        "│ [INFO] Connected   │",
        "│ [ERROR] Failed!    │",
        "└────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createLog } from 'blecsd';

const log = createLog(world, {
  x: 0, y: 0, width: 40, height: 15,
  scrollable: true
});`,
  },

  // Controls
  {
    name: "Button",
    category: "Controls",
    description: "Clickable button with hover states",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "  [ Submit ]  [ Cancel ]",
        "",
        "  [ Primary ]  [ Secondary ]",
      ];
      return lines.join('\n');
    },
    code: `import { createButton } from 'blecsd';

const button = createButton(world, {
  x: 10, y: 5,
  label: 'Click Me',
  width: 15
});`,
  },
  {
    name: "Checkbox",
    category: "Controls",
    description: "Toggle checkbox control",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "  [x] Enable logging",
        "  [ ] Dark mode",
        "  [x] Auto-save",
        "  [ ] Notifications",
      ];
      return lines.join('\n');
    },
    code: `import { createCheckbox } from 'blecsd';

const checkbox = createCheckbox(world, {
  x: 5, y: 5,
  label: 'Enable feature',
  checked: true
});`,
  },
  {
    name: "RadioGroup",
    category: "Controls",
    description: "Radio button group for single selection",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "  (•) Option A",
        "  ( ) Option B",
        "  ( ) Option C",
      ];
      return lines.join('\n');
    },
    code: `import { createRadioGroup } from 'blecsd';

const radio = createRadioGroup(world, {
  x: 5, y: 5,
  options: ['Red', 'Green', 'Blue'],
  selected: 0
});`,
  },
  {
    name: "ProgressBar",
    category: "Controls",
    description: "Progress indicator with percentage",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "CPU:    [████████░░░░░░░░] 52%",
        "Memory: [██████████████░░] 88%",
        "Disk:   [███░░░░░░░░░░░░░] 20%",
      ];
      return lines.join('\n');
    },
    code: `import { createProgressBar } from 'blecsd';

const progress = createProgressBar(world, {
  x: 5, y: 5, width: 30,
  value: 0.75,
  showPercent: true
});`,
  },
  {
    name: "Slider",
    category: "Controls",
    description: "Interactive value slider",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "Volume: ├───────•───┤ 65%",
        "",
        "Bass:   ├─────•─────┤ 50%",
      ];
      return lines.join('\n');
    },
    code: `import { createSlider } from 'blecsd';

const slider = createSlider(world, {
  x: 5, y: 5, width: 20,
  min: 0, max: 100, value: 50
});`,
  },

  // Input
  {
    name: "InputControl",
    category: "Input",
    description: "Single-line text input field",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "Name: [Ada Lovelace____]",
        "",
        "Email: [ada@example.com_]",
      ];
      return lines.join('\n');
    },
    code: `import { createInputControl } from 'blecsd';

const input = createInputControl(world, {
  x: 5, y: 5, width: 30,
  placeholder: 'Enter text...'
});`,
  },
  {
    name: "Textarea",
    category: "Input",
    description: "Multi-line text editor",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─ Message ──────────┐",
        "│ Enter your text    │",
        "│ here. Multiple     │",
        "│ lines supported.   │",
        "│                    │",
        "└────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createTextareaEntity } from 'blecsd';

const textarea = createTextareaEntity(world, {
  x: 5, y: 5, width: 40, height: 10
});`,
  },
  {
    name: "Select",
    category: "Input",
    description: "Dropdown selection menu",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "Theme: [ Dark Mode     ▼ ]",
        "",
        "  > Dark Mode",
        "    Light Mode",
        "    Auto",
      ];
      return lines.join('\n');
    },
    code: `import { createSelect } from 'blecsd';

const select = createSelect(world, {
  x: 5, y: 5, width: 25,
  options: ['Red', 'Green', 'Blue']
});`,
  },

  // Data
  {
    name: "List",
    category: "Data",
    description: "Scrollable item list",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─ Items ────────────┐",
        "│ > Item One         │",
        "│   Item Two         │",
        "│   Item Three       │",
        "│   Item Four        │",
        "└────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createList } from 'blecsd';

const list = createList(world, {
  x: 5, y: 5, width: 30, height: 10,
  items: ['Item 1', 'Item 2', 'Item 3']
});`,
  },
  {
    name: "Table",
    category: "Data",
    description: "Data table with rows and columns",
    render: (w: number, h: number): string => {
      const lines = [
        "┌──────┬───────┬──────┐",
        "│ Name │ Role  │ Lvl  │",
        "├──────┼───────┼──────┤",
        "│ Ada  │ Dev   │  42  │",
        "│ Bob  │ Admin │  38  │",
        "│ Cam  │ QA    │  29  │",
        "└──────┴───────┴──────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createTable } from 'blecsd';

const table = createTable(world, {
  x: 5, y: 5,
  headers: ['Name', 'Age', 'Role'],
  rows: [['Alice', '30', 'Dev']]
});`,
  },
  {
    name: "Tree",
    category: "Data",
    description: "Hierarchical tree view",
    render: (w: number, h: number): string => {
      const lines = [
        "📁 Root",
        "├─ 📁 Folder A",
        "│  ├─ 📄 file1.txt",
        "│  └─ 📄 file2.txt",
        "└─ 📁 Folder B",
        "   └─ 📄 file3.txt",
      ];
      return lines.join('\n');
    },
    code: `import { createTree } from 'blecsd';

const tree = createTree(world, {
  x: 5, y: 5, width: 30, height: 15,
  data: { name: 'root', children: [] }
});`,
  },

  // Visualization
  {
    name: "BarChart",
    category: "Visualization",
    description: "Vertical or horizontal bar chart",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "Sales ████████░ 80%",
        "Users █████░░░░ 50%",
        "Views ██████░░░ 60%",
      ];
      return lines.join('\n');
    },
    code: `import { createBarChart } from 'blecsd';

const chart = createBarChart(world, {
  x: 5, y: 5, width: 40, height: 10,
  data: [80, 50, 60]
});`,
  },
  {
    name: "LineChart",
    category: "Visualization",
    description: "Line graph for time series data",
    render: (w: number, h: number): string => {
      const lines = [
        " 100│      ╱╲    ",
        "  75│    ╱  ╲   ",
        "  50│  ╱    ╲  ",
        "  25│╱      ╲ ",
        "   0└───────────",
      ];
      return lines.join('\n');
    },
    code: `import { createLineChart } from 'blecsd';

const chart = createLineChart(world, {
  x: 5, y: 5, width: 40, height: 10,
  data: [10, 50, 30, 70, 40]
});`,
  },
  {
    name: "Gauge",
    category: "Visualization",
    description: "Circular gauge meter",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "     ╭─────╮    ",
        "    │   •  │ 75%",
        "     ╰─────╯    ",
      ];
      return lines.join('\n');
    },
    code: `import { createGauge } from 'blecsd';

const gauge = createGauge(world, {
  x: 10, y: 5,
  value: 0.75,
  label: 'CPU Usage'
});`,
  },

  // Specialized
  {
    name: "CommandPalette",
    category: "Specialized",
    description: "Quick action command picker",
    render: (w: number, h: number): string => {
      const lines = [
        "┌─ Command Palette ──┐",
        "│ > save_____________│",
        "├────────────────────┤",
        "│ > Save File        │",
        "│   Save As...       │",
        "│   Save All         │",
        "└────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createCommandPalette } from 'blecsd';

const palette = createCommandPalette(world, {
  x: 10, y: 5, width: 50, height: 20,
  commands: [{ id: 'save', label: 'Save' }]
});`,
  },
  {
    name: "Loading",
    category: "Specialized",
    description: "Animated loading spinner",
    render: (w: number, h: number): string => {
      const lines = [
        "",
        "     ⠋ Loading...",
        "",
        "     Please wait",
      ];
      return lines.join('\n');
    },
    code: `import { createLoading } from 'blecsd';

const spinner = createLoading(world, {
  x: 20, y: 10,
  text: 'Loading...'
});`,
  },
  {
    name: "Toast",
    category: "Specialized",
    description: "Temporary notification message",
    render: (w: number, h: number): string => {
      const lines = [
        "┌────────────────────┐",
        "│ ✓ File saved!      │",
        "└────────────────────┘",
      ];
      return lines.join('\n');
    },
    code: `import { createToast } from 'blecsd';

const toast = createToast(world, {
  message: 'Success!',
  duration: 3000,
  type: 'success'
});`,
  },
];
