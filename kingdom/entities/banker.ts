/**
 * Banker NPC - appears at TownCenterTier >= 4 (Town Hall).
 * Stands near town center during day, hides at night.
 * Deposits: monarch drops coin near banker (within 2 tiles of town center).
 *   Accumulates deposits, walks to castle door at 10+ coins.
 * Withdrawal: monarch interacts near banker.
 *   Returns min(floor(bankedCoins / 3), pouch space remaining).
 *   Minimum 7 coins in bank to withdraw.
 * Interest: 7% daily (applied at dawn), capped at 8 coins/day for 101+ stored.
 * Coins persist across islands.
 */
import {
  type GameState,
  TownCenterTier,
  TimeOfDay,
  CAMP_CENTER_X,
  MAX_COINS,
} from '../types';

// ─── Module State ─────────────────────────────────────────────────
let bankedCoins = 0;
let lastInterestDay = 0;
let pendingDeposit = 0;

const DEPOSIT_THRESHOLD = 10;
const WITHDRAW_MIN = 7;

// ─── Public API ───────────────────────────────────────────────────

/** Get current banked coins. */
export function getBankedCoins(): number {
  return bankedCoins;
}

/** Deposit coins into the bank. Returns the number actually deposited. */
export function depositCoins(state: GameState, amount: number): number {
  if (state.townCenterTier < TownCenterTier.TownHall) return 0;
  if (amount <= 0) return 0;

  const toDeposit = Math.min(amount, state.monarchCoins);
  if (toDeposit <= 0) return 0;

  state.monarchCoins -= toDeposit;
  pendingDeposit += toDeposit;

  // When pending reaches threshold, commit to bank
  if (pendingDeposit >= DEPOSIT_THRESHOLD) {
    bankedCoins += pendingDeposit;
    const deposited = pendingDeposit;
    pendingDeposit = 0;
    state.messages.push(`Banker deposited ${deposited} coins (bank: ${bankedCoins})`);
    return deposited;
  }

  state.messages.push(`Banker holds ${pendingDeposit} coins (need ${DEPOSIT_THRESHOLD} to deposit)`);
  return toDeposit;
}

/** Withdraw coins from the bank. Returns coins withdrawn. */
export function withdrawCoins(state: GameState): number {
  if (state.townCenterTier < TownCenterTier.TownHall) return 0;
  if (bankedCoins < WITHDRAW_MIN) {
    state.messages.push(`Bank needs at least ${WITHDRAW_MIN} coins to withdraw (has ${bankedCoins})`);
    return 0;
  }

  const pouchSpace = MAX_COINS - state.monarchCoins;
  const available = Math.floor(bankedCoins / 3);
  const amount = Math.min(available, pouchSpace);

  if (amount <= 0) {
    state.messages.push('Pouch is full!');
    return 0;
  }

  bankedCoins -= amount;
  state.monarchCoins += amount;
  state.messages.push(`Withdrew ${amount} coins from bank (remaining: ${bankedCoins})`);
  return amount;
}

/** Apply daily interest at dawn. Call once per dawn transition. */
export function applyBankerInterest(state: GameState): void {
  if (state.townCenterTier < TownCenterTier.TownHall) return;
  if (state.dayCount <= lastInterestDay) return;

  lastInterestDay = state.dayCount;

  // Commit any pending deposits first
  if (pendingDeposit > 0) {
    bankedCoins += pendingDeposit;
    pendingDeposit = 0;
  }

  if (bankedCoins < 3) return;

  let interest: number;
  if (bankedCoins <= 100) {
    interest = Math.ceil(bankedCoins * 0.07);
  } else {
    interest = 8;
  }

  bankedCoins += interest;
  state.messages.push(`Banker interest: +${interest} coins (bank: ${bankedCoins})`);
}

/** Update banker each frame. Banker is a virtual NPC (no ECS entity). */
export function updateBanker(state: GameState, _dt: number): void {
  // Banker only active during day at town hall tier+
  if (state.townCenterTier < TownCenterTier.TownHall) return;

  // Apply interest at dawn
  if (state.timeOfDay === TimeOfDay.Dawn) {
    applyBankerInterest(state);
  }
}

/** Check if banker is available (day time, town hall tier). */
export function isBankerAvailable(state: GameState): boolean {
  if (state.townCenterTier < TownCenterTier.TownHall) return false;
  return state.timeOfDay === TimeOfDay.Dawn || state.timeOfDay === TimeOfDay.Day;
}

/** Reset banker state (for new game). */
export function resetBanker(): void {
  bankedCoins = 0;
  lastInterestDay = 0;
  pendingDeposit = 0;
}
