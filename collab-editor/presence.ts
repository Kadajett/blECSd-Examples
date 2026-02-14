import {
  createPresenceManager,
  addUser,
  removeUser,
  moveUserCursor,
  getActiveUsers,
  formatPresenceBar,
  getUserCount,
  type PresenceUser,
} from 'blecsd';

export interface PresenceState {
  readonly manager: ReturnType<typeof createPresenceManager>;
}

export function createPresence(): PresenceState {
  return {
    manager: createPresenceManager(),
  };
}

export function addRemoteUser(state: PresenceState, sessionId: string, name: string): PresenceUser {
  return addUser(sessionId, name);
}

export function removeRemoteUser(state: PresenceState, sessionId: string): void {
  removeUser(sessionId);
}

export function updateRemoteUserCursor(
  state: PresenceState,
  sessionId: string,
  x: number,
  y: number
): void {
  moveUserCursor(sessionId, x, y);
}

export function getPresenceBar(state: PresenceState, maxWidth?: number): string {
  return formatPresenceBar(maxWidth);
}

export function getRemoteUserCount(state: PresenceState): number {
  return getUserCount();
}

export function listActiveRemoteUsers(state: PresenceState): readonly PresenceUser[] {
  return getActiveUsers();
}
