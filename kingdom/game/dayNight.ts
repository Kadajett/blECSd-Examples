/**
 * Kingdom - Day/night cycle
 * Advances day time and computes the current time of day phase.
 */

import {
  type GameState,
  TimeOfDay,
  DAY_LENGTH,
  DAWN_START,
  DAY_START,
  DUSK_START,
  NIGHT_START,
} from '../types';

/**
 * Advance the day/night cycle by dt seconds.
 * Wraps dayTime at 1.0 and increments dayCount.
 * Sets state.timeOfDay based on threshold constants.
 */
export function updateDayNight(state: GameState, dt: number): void {
  state.dayTime += dt / DAY_LENGTH;

  // Wrap day cycle
  while (state.dayTime >= 1.0) {
    state.dayTime -= 1.0;
    state.dayCount++;
  }

  // Determine time of day from thresholds
  if (state.dayTime >= NIGHT_START) {
    state.timeOfDay = TimeOfDay.Night;
  } else if (state.dayTime >= DUSK_START) {
    state.timeOfDay = TimeOfDay.Dusk;
  } else if (state.dayTime >= DAY_START) {
    state.timeOfDay = TimeOfDay.Day;
  } else if (state.dayTime >= DAWN_START) {
    state.timeOfDay = TimeOfDay.Dawn;
  } else {
    state.timeOfDay = TimeOfDay.Night;
  }
}
