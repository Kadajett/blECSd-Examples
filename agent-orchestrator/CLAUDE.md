# Agent Orchestrator - Orchestrator Instructions

You are the **lead orchestrator** in a multi-agent coding session. You have worker agents running in tmux panes that you control through MCP tools.

## Session Info

Read `.blecsd-orchestrator.md` in this directory for the tmux session name, pane addresses, and MCP server details. That file is generated at startup with the exact values.

## How to Control Workers (MCP Tools)

You have 5 MCP tools from `blecsd-orchestrator`. **Always prefer these over raw tmux commands.**

### send_prompt
Send a prompt to a worker pane. **Enter is pressed automatically** (no need to send it separately).
```json
{ "pane": "1.2", "text": "Implement the login endpoint" }
```

### read_output
Capture the current visible content of a worker pane.
```json
{ "pane": "1.2" }
```

### list_panes
List all tmux panes with their addresses, titles, and sizes. No arguments.

### add_worker
Create a new worker by splitting a pane.
```json
{ "agent": "claude" }
```
Agent types: `"claude"`, `"codex"`, `"gemini"`, `"custom:<command>"`
Optional: `"split_from"` (pane to split), `"horizontal"` (side-by-side split)

### remove_worker
Kill a worker pane (cannot kill the orchestrator pane).
```json
{ "pane": "1.4" }
```

## Workflow

1. Use `list_panes` to see all available panes
2. Use `send_prompt` to give tasks to workers
3. Use `read_output` to check worker progress
4. Use `add_worker` / `remove_worker` to scale the team

## Fallback: Raw Tmux Commands

If MCP tools are unavailable, use raw tmux commands via Bash. See `.blecsd-orchestrator.md` for the exact command format. **All tmux commands MUST use `-L blecsd`** to target the correct socket.

## Current Task

**Add a RAG Memories Panel to the orchestrator UI.**

### What to build

A new narrow (20-25 columns wide) full-height tmux pane on the far left of the layout that displays a live, scrollable list of all documents stored in the RAG/SQLite database.

### Requirements

1. **Viewer script** (`rag-viewer.ts`): A standalone Node.js/tsx script that:
   - Opens the SQLite database (`orchestrator.db`) using better-sqlite3
   - Queries the `rag_documents` table for all chunks
   - Displays each entry as a single truncated line (fit within ~22 char width)
   - Uses ANSI colors: dim gray for the source agent ID, white for the truncated text
   - Auto-refreshes every 3 seconds (clear screen + redraw)
   - Supports scrolling via arrow keys (up/down to move through the list)
   - Shows a header line: "RAG Memory (N docs)" with count
   - Shows "[empty]" when no documents exist

2. **Layout update** (`index.ts`): Modify `setupTmuxLayout()` to:
   - Add a narrow pane on the far LEFT (before the orchestrator)
   - Run `tsx rag-viewer.ts` in that pane
   - Keep the orchestrator at 30% and workers at the remaining space
   - Update the context file to document the new pane

3. **Formatting and scrolling** (`rag-viewer.ts`):
   - Each line: `[agent-id] truncated chunk text...`
   - Truncate to fit the pane width (detect from `process.stdout.columns`)
   - Arrow up/down scrolls the view
   - Page up/down jumps 10 lines
   - Show scroll position indicator: `[5/128]` at the bottom

### How to delegate

- **Worker 1**: Write `rag-viewer.ts` - the standalone viewer script with DB queries, ANSI formatting, and auto-refresh
- **Worker 2**: Update `index.ts` - modify `setupTmuxLayout()` to add the RAG pane on the far left and update the context file
- **Worker 3**: Add keyboard scrolling to `rag-viewer.ts` (arrow keys, page up/down, scroll position indicator) and ensure truncation works with variable pane widths

### Coordination notes

- Worker 1 should create the base `rag-viewer.ts` first
- Workers 2 and 3 can start in parallel since they touch different concerns
- Worker 3 should wait for Worker 1 to finish the basic script before adding scroll support
- After all workers finish, verify with `pnpm dev -- --mock` that the layout looks correct

## Rules

- Keep code functional (no classes). This project follows blECSd conventions.
- Use TypeScript with strict types
- Run `npx tsc --noEmit` before considering any task done
- Workers should commit their changes when done
