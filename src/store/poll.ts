// How often the app asks the server "did my doc list or invitations change?".
// Quick while the person is using the app, slow while a tab is just sitting
// open, with a little randomness so many tabs don't ask at the same instant.

export const FAST_MS = 30_000;
export const SLOW_MS = 120_000;
/** "Using the app" means a click or key press within this long. */
export const ACTIVE_WINDOW_MS = 120_000;

/** Wait before the next refresh, given how long since the last click or key press. */
export function nextDelay(msSinceActivity: number, random = Math.random()): number {
  const base = msSinceActivity < ACTIVE_WINDOW_MS ? FAST_MS : SLOW_MS;
  return Math.round(base * (0.85 + random * 0.3));
}

/** Coming back after sitting idle: refresh at once instead of waiting out a slow interval. */
export const wasIdle = (msSinceActivity: number) => msSinceActivity >= ACTIVE_WINDOW_MS;
