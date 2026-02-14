# Collaborative Text Editor

A collaborative text editor built with blECSd demonstrating:

- **Text CRDT** - Conflict-free collaborative editing
- **Presence System** - Track active users and their cursors
- **Multi-Cursor Overlays** - Visual representation of remote user cursors
- **LWW Registers** - Last-Write-Wins cursor position tracking
- **Simulated Network** - Delayed operation sync simulation

## Features

- Real-time collaborative text editing with CRDT
- Visual presence indicators for remote users
- Multi-cursor display showing where other users are editing
- Simulated network delay for realistic collaboration testing
- Line numbers and status bar
- Full keyboard navigation (arrow keys, backspace, enter)

## Architecture

```
collab-editor/
  index.ts          # Main entry point and render loop
  editor.ts         # Text editing logic with CRDT
  presence.ts       # User presence tracking
  network.ts        # Simulated network operations
  ui.ts             # UI layout and rendering
```

### Core Components

**editor.ts** - Handles text editing state using Text CRDT:
- `createEditor()` - Initialize CRDT and cursor position
- `insertChar()` - Insert character at cursor
- `deleteChar()` - Delete character before cursor
- `moveCursor()` - Navigate with arrow keys
- `applyRemoteOperation()` - Apply remote edits from network

**presence.ts** - Manages user presence:
- `createPresence()` - Initialize presence manager
- `addRemoteUser()` - Add a remote user
- `updateRemoteUserCursor()` - Update remote cursor position
- `getPresenceBar()` - Format presence indicator

**network.ts** - Simulates collaborative network:
- `createNetwork()` - Initialize simulated users
- `startSimulation()` - Start random typing from remote users
- `applyNetworkOperation()` - Apply network ops to CRDT

**ui.ts** - Renders the interface:
- `createUI()` - Initialize overlay manager
- `render()` - Full frame render (top bar, editor, overlays, bottom bar)
- `initializeOverlays()` - Set up multi-cursor overlays
- `updateOverlayCursors()` - Sync overlay positions

## Usage

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Controls

- **Arrow Keys** - Move cursor
- **Backspace** - Delete character
- **Enter** - New line
- **Any character** - Insert at cursor
- **Ctrl+Q** - Quit

## Implementation Details

### Text CRDT

The editor uses blECSd's Text CRDT to handle concurrent edits. Each character insertion/deletion is an operation that can be applied in any order while maintaining consistency.

### Presence System

Remote users are tracked with the presence system. Each user has:
- Session ID (unique identifier)
- Display name
- Color (for cursor overlay)
- Cursor position (x, y)

### Multi-Cursor Overlays

The overlay manager renders cursors for all remote users on top of the text content. Each user's cursor is displayed in their assigned color.

### Network Simulation

The network module simulates 3 remote users (Alice, Bob, Charlie) who:
- Randomly type characters or delete text
- Have simulated network delay (50-200ms)
- Move their cursors after each action
- Perform actions every 2 seconds

### LWW Registers

Last-Write-Wins registers store the local cursor position. This allows cursor position to be synchronized across network updates while always preferring the most recent value.

## API Reference

All imports from `'blecsd'`:

**Text CRDT:**
- `createTextCRDT()` - Create CRDT instance
- `insertText(crdt, position, text)` - Insert text
- `deleteText(crdt, position, length)` - Delete text
- `applyRemoteOp(crdt, op)` - Apply remote operation
- `getTextValue(crdt)` - Get current text
- `getTextLength(crdt)` - Get text length

**Presence:**
- `createPresenceManager()` - Create manager
- `addUser(sessionId, name)` - Add user
- `removeUser(sessionId)` - Remove user
- `moveUserCursor(sessionId, x, y)` - Update cursor
- `getActiveUsers()` - Get user list
- `formatPresenceBar(maxWidth?)` - Format indicator
- `getUserCount()` - Get count

**Multi-Cursor Overlays:**
- `createOverlayManager()` - Create overlay system
- `addSessionOverlay(sessionId, name, config)` - Add overlay
- `setCursorOverlay(sessionId, x, y)` - Set cursor position
- `renderOverlaysToAnsi(width, height)` - Render to ANSI

**LWW Registers:**
- `createLWWRegister()` - Create register
- `getLWWValue(register)` - Get value
- `setLWWValue(register, value)` - Set value

## Example Output

```
 Alice, Bob, Charlie (3 users)
   1 Welcome to Collaborative Editor!
   2 Start typing to see CRDT in action.
   3 [Alice's cursor here]
   4
   5 [Bob typing...]
   6
   7
   8 [Charlie's cursor here]
   ...
 Ln 3, Col 0 | 64 chars | 3 users online
```

## License

MIT
