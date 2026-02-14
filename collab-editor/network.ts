import { insertText, deleteText, getTextLength, type TextOp } from 'blecsd';
import type { EditorState } from './editor';
import type { PresenceState } from './presence';
import { updateRemoteUserCursor } from './presence';

export interface NetworkOperation {
  readonly type: 'insert' | 'delete';
  readonly sessionId: string;
  readonly position: number;
  readonly text?: string;
  readonly length?: number;
  readonly ops?: readonly TextOp[];
}

export interface SimulatedUser {
  readonly sessionId: string;
  readonly name: string;
  readonly color: number;
  cursorX: number;
  cursorY: number;
  lastActionTime: number;
}

export interface NetworkState {
  readonly users: readonly SimulatedUser[];
  readonly pendingOps: NetworkOperation[];
  intervalIds: NodeJS.Timeout[];
}

const CHARS = 'abcdefghijklmnopqrstuvwxyz     \n';
const ACTION_INTERVAL = 2000; // ms between actions
const NETWORK_DELAY_MIN = 50;
const NETWORK_DELAY_MAX = 200;

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)] ?? 'a';
}

function randomDelay(): number {
  return NETWORK_DELAY_MIN + Math.random() * (NETWORK_DELAY_MAX - NETWORK_DELAY_MIN);
}

export function createNetwork(): NetworkState {
  return {
    users: [
      {
        sessionId: 'user-1',
        name: 'Alice',
        color: 1, // Red
        cursorX: 5,
        cursorY: 2,
        lastActionTime: Date.now(),
      },
      {
        sessionId: 'user-2',
        name: 'Bob',
        color: 2, // Green
        cursorX: 10,
        cursorY: 5,
        lastActionTime: Date.now(),
      },
      {
        sessionId: 'user-3',
        name: 'Charlie',
        color: 3, // Yellow
        cursorX: 15,
        cursorY: 8,
        lastActionTime: Date.now(),
      },
    ],
    pendingOps: [],
    intervalIds: [],
  };
}

export function startSimulation(
  state: NetworkState,
  editorState: EditorState,
  presenceState: PresenceState,
  onOperation: (op: NetworkOperation) => void
): void {
  // Simulate random typing from users
  for (const user of state.users) {
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - user.lastActionTime < ACTION_INTERVAL) {
        return;
      }

      user.lastActionTime = now;

      const docLength = getTextLength(editorState.crdt);
      const action = Math.random();

      let op: NetworkOperation;

      if (action < 0.7) {
        // Insert
        const pos = Math.floor(Math.random() * (docLength + 1));
        const char = randomChar();
        const ops = insertText(editorState.crdt, pos, char);
        op = {
          type: 'insert',
          sessionId: user.sessionId,
          position: pos,
          text: char,
          ops,
        };
      } else {
        // Delete
        if (docLength === 0) return;
        const pos = Math.floor(Math.random() * docLength);
        const ops = deleteText(editorState.crdt, pos, 1);
        op = {
          type: 'delete',
          sessionId: user.sessionId,
          position: pos,
          length: 1,
          ops,
        };
      }

      // Simulate network delay
      setTimeout(() => {
        onOperation(op);

        // Update cursor position
        const x = Math.floor(Math.random() * 80);
        const y = Math.floor(Math.random() * 24);
        user.cursorX = x;
        user.cursorY = y;
        updateRemoteUserCursor(presenceState, user.sessionId, x, y);
      }, randomDelay());
    }, 1000);

    state.intervalIds.push(intervalId);
  }
}

export function stopSimulation(state: NetworkState): void {
  for (const id of state.intervalIds) {
    clearInterval(id);
  }
  state.intervalIds = [];
}

export function getNetworkOps(op: NetworkOperation): readonly TextOp[] {
  return op.ops ?? [];
}
