/**
 * Merchant NPC - appears on islands 1-2 only (state.islandIndex <= 2).
 * Has a camp in the forest at a fixed x position.
 * Mechanic: monarch drops 1 coin near merchant -> merchant returns 8 coins next dawn.
 * Only accepts during daytime, not during danger (no active greed nearby).
 */
import { getPosition } from 'blecsd';
import {
  type GameState,
  TimeOfDay,
  CAMP_CENTER_X,
  distance,
} from '../types';
import { collectCoins } from '../game/economy';

// ─── Module State ─────────────────────────────────────────────────
let pendingPayout = 0;
let merchantX = 100; // fixed position on the map
let lastPayoutDay = -1;

const MERCHANT_PAYOUT = 8;
const MERCHANT_ACCEPT_RANGE = 3;
const GREED_DANGER_RANGE = 20;

// ─── Public API ───────────────────────────────────────────────────

/** Create/initialize merchant for the current island. */
export function createMerchant(state: GameState): void {
  if (state.islandIndex > 2) return; // islands 1-2 only (0-indexed: 0,1,2)

  // Place merchant on opposite side from town center on island 1, nearby on island 2
  merchantX = state.islandIndex <= 1 ? 100 : 200;
  pendingPayout = 0;
  lastPayoutDay = -1;
}

/** Merchant accepts a coin from the monarch. Returns true if accepted. */
export function merchantAcceptCoin(state: GameState): boolean {
  if (state.islandIndex > 2) return false;

  // Only during daytime
  if (state.timeOfDay !== TimeOfDay.Day && state.timeOfDay !== TimeOfDay.Dawn) {
    state.messages.push('Merchant only trades during the day');
    return false;
  }

  // Check for danger (greed nearby)
  if (hasNearbyGreed(state, merchantX, GREED_DANGER_RANGE)) {
    state.messages.push('Merchant refuses to trade during danger!');
    return false;
  }

  // Check monarch is near merchant
  const monarchPos = getPosition(state.world, state.monarch.eid);
  if (!monarchPos || distance(monarchPos.x, merchantX) > MERCHANT_ACCEPT_RANGE) {
    return false;
  }

  if (state.monarchCoins < 1) {
    state.messages.push('No coins to pay merchant!');
    return false;
  }

  state.monarchCoins -= 1;
  pendingPayout += MERCHANT_PAYOUT;
  state.messages.push(`Paid merchant 1 coin (${MERCHANT_PAYOUT} coins at dawn)`);
  return true;
}

/** Update merchant each frame. At dawn, pay out pending coins. */
export function updateMerchant(state: GameState, _dt: number): void {
  if (state.islandIndex > 2) return;

  // Pay out at dawn
  if (state.timeOfDay === TimeOfDay.Dawn && pendingPayout > 0 && state.dayCount !== lastPayoutDay) {
    lastPayoutDay = state.dayCount;
    const payout = pendingPayout;
    pendingPayout = 0;
    collectCoins(state, payout);
    state.messages.push(`Merchant delivered ${payout} coins!`);
  }
}

/** Check if merchant is available for interaction. */
export function isMerchantAvailable(state: GameState): boolean {
  if (state.islandIndex > 2) return false;
  if (state.timeOfDay !== TimeOfDay.Day && state.timeOfDay !== TimeOfDay.Dawn) return false;
  if (hasNearbyGreed(state, merchantX, GREED_DANGER_RANGE)) return false;
  return true;
}

/** Get merchant's x position. */
export function getMerchantX(): number {
  return merchantX;
}

/** Get pending payout amount. */
export function getPendingPayout(): number {
  return pendingPayout;
}

function hasNearbyGreed(state: GameState, x: number, range: number): boolean {
  for (const greed of state.greeds) {
    const pos = getPosition(state.world, greed.eid);
    if (!pos) continue;
    if (distance(x, pos.x) <= range) return true;
  }
  return false;
}
