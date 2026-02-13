/**
 * Kingdom - Input handling
 * Proper key-down/key-up tracking using timestamp expiry.
 * Left/right are held states, space is a one-shot trigger.
 * Handles Title/GameOver phase inputs (Enter, R).
 */

import { type GameState, GamePhase } from '../types';

const KEY_HOLD_EXPIRY_MS = 200; // ms before a held key is considered released

let stdinListener: ((data: Buffer) => void) | null = null;

// Timestamp tracking for held keys
let leftPressedAt = 0;
let rightPressedAt = 0;
let sprintPressedAt = 0;

// One-shot flags (set on press, consumed by game systems)
let dropQueued = false;
let enterQueued = false;
let restartQueued = false;
let newGameQueued = false;
let continueGameQueued = false;
let interactQueued = false;
let pauseQueued = false;
let tabQueued = false;
let quitMenuQueued = false;
let numberKeyQueued: number | null = null;

/**
 * Set up raw mode input handling.
 * Phase-aware: Title expects Enter, GameOver expects R, Playing expects movement.
 */
export function setupInput(state: GameState): void {
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  stdinListener = (data: Buffer) => {
    const str = String(data);
    const now = Date.now();

    for (let i = 0; i < str.length; i++) {
      // Escape sequences (arrow keys)
      if (str[i] === '\x1b' && str[i + 1] === '[') {
        // Check for shift+arrow first (CSI 1;2 X)
        if (str[i + 2] === '1' && str[i + 3] === ';' && str[i + 4] === '2') {
          sprintPressedAt = now;
          const shiftCode = str[i + 5];
          if (shiftCode === 'D') {
            leftPressedAt = now;
            rightPressedAt = 0;
          } else if (shiftCode === 'C') {
            rightPressedAt = now;
            leftPressedAt = 0;
          }
          i += 5;
          continue;
        }

        const code = str[i + 2];
        if (code === 'D') {
          leftPressedAt = now;
          rightPressedAt = 0;
        } else if (code === 'C') {
          rightPressedAt = now;
          leftPressedAt = 0;
        }
        i += 2;
        continue;
      }

      const ch = str[i];

      // Ctrl+C: always quit immediately
      if (ch === '\x03') {
        state.running = false;
        return;
      }

      // WASD movement: handle before phase checks (like arrow keys)
      if (ch === 'a' || ch === 'A') {
        leftPressedAt = now;
        rightPressedAt = 0;
        if (ch === 'A') sprintPressedAt = now;
      }
      if (ch === 'd' || ch === 'D') {
        rightPressedAt = now;
        leftPressedAt = 0;
        if (ch === 'D') sprintPressedAt = now;
      }

      // Q: quit on non-playing screens, open quit menu during play
      if (ch === 'q' || ch === 'Q') {
        if (state.phase === GamePhase.Title || state.phase === GamePhase.GameOver || state.phase === GamePhase.Victory) {
          state.running = false;
          return;
        }
        quitMenuQueued = true;
        continue;
      }

      // Phase-specific keys
      if (state.phase === GamePhase.Title) {
        if (ch === '\r' || ch === '\n' || ch === 'n' || ch === 'N') {
          newGameQueued = true;
          enterQueued = true;
        }
        if (ch === 'c' || ch === 'C') {
          continueGameQueued = true;
        }
        continue;
      }

      if (state.phase === GamePhase.IslandSelect) {
        // Arrow keys handled above (leftPressedAt/rightPressedAt)
        if (ch === '\r' || ch === '\n') {
          enterQueued = true;
        }
        continue;
      }

      if (state.phase === GamePhase.GameOver || state.phase === GamePhase.Victory) {
        if (ch === 'r' || ch === 'R') {
          restartQueued = true;
        }
        continue;
      }

      // Playing phase keys
      if (ch === ' ') {
        dropQueued = true;
      }

      // Interact: e or Enter
      if (ch === 'e' || ch === 'E' || ch === '\r' || ch === '\n') {
        interactQueued = true;
      }

      // Pause: p
      if (ch === 'p' || ch === 'P') {
        pauseQueued = true;
      }

      // Tab: toggle minimap
      if (ch === '\t') {
        tabQueued = true;
      }

      // Number keys 1-9: quick action slots
      if (ch && ch >= '1' && ch <= '9') {
        numberKeyQueued = parseInt(ch, 10);
      }

      // 'a'/'d' and sprint handled above, before phase checks
    }
  };

  stdin.on('data', stdinListener as (data: any) => void);
}

/**
 * Poll input state each frame. Updates held key flags based on timestamp expiry.
 * Call this at the start of each game loop iteration.
 */
export function pollInput(state: GameState): void {
  const now = Date.now();

  // Held keys: true if pressed recently (within expiry window)
  state.inputLeft = (now - leftPressedAt) < KEY_HOLD_EXPIRY_MS;
  state.inputRight = (now - rightPressedAt) < KEY_HOLD_EXPIRY_MS;
  state.inputSprint = (now - sprintPressedAt) < KEY_HOLD_EXPIRY_MS;

  // One-shot: consume drop flag
  state.inputDrop = dropQueued;
  dropQueued = false;
}

/**
 * Check and consume the Enter key (for title screen).
 */
export function consumeEnter(): boolean {
  if (enterQueued) {
    enterQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Restart key (for game over/victory screen).
 */
export function consumeRestart(): boolean {
  if (restartQueued) {
    restartQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the New Game key (for title screen).
 */
export function consumeNewGame(): boolean {
  if (newGameQueued) {
    newGameQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Continue Game key (for title screen).
 */
export function consumeContinue(): boolean {
  if (continueGameQueued) {
    continueGameQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Interact key (e or Enter during play).
 */
export function consumeInteract(): boolean {
  if (interactQueued) {
    interactQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Pause key (p).
 */
export function consumePause(): boolean {
  if (pauseQueued) {
    pauseQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Tab key (minimap toggle).
 */
export function consumeTab(): boolean {
  if (tabQueued) {
    tabQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume the Quit menu key (q during play).
 */
export function consumeQuit(): boolean {
  if (quitMenuQueued) {
    quitMenuQueued = false;
    return true;
  }
  return false;
}

/**
 * Check and consume a number key press (1-9).
 */
export function consumeNumberKey(): number | null {
  const val = numberKeyQueued;
  numberKeyQueued = null;
  return val;
}

/**
 * Clean up input handling and restore terminal.
 */
export function cleanupInput(): void {
  if (stdinListener) {
    process.stdin.removeListener('data', stdinListener as (data: any) => void);
    stdinListener = null;
  }
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
}
