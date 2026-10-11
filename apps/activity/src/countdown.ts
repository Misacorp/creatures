/**
 * The pre-fight countdown over the stage: pure helpers. In the last 30 seconds before a live finale
 * (or a practice fight) starts, a big number counts down, calm first, then faster and orange, then
 * red with a stepped shake and a bigger number each second. At 0 it says "FIGHT!" for a moment and
 * the stage takes over. Everything is computed from the time left (server time, as the lobby
 * already tracks it), so nothing here polls or keeps a clock of its own.
 */

/** The countdown shows during this last stretch before the start. */
export const COUNTDOWN_MS = 30_000;
/** "FIGHT!" stays on screen this long after the start. */
export const FIGHT_FLASH_MS = 1_200;

/** calm: 30 to 11, fast: 10 to 6 (gold shifting to orange), final: 5 to 1 (red, shaking, growing). */
export type CountdownTier = 'calm' | 'fast' | 'final';

export type CountdownView =
  { phase: 'count'; n: number; tier: CountdownTier } | { phase: 'fight' } | null;

/** The tier of a whole second of the countdown (30 down to 1). */
export function tierOf(n: number): CountdownTier {
  if (n <= 5) return 'final';
  if (n <= 10) return 'fast';
  return 'calm';
}

/**
 * What to show with `remainingMs` left until the start: nothing before the last 30 seconds, then the
 * whole seconds left (the number rounds up, so "1" shows until the very start), then "FIGHT!" for a
 * moment, then nothing again.
 */
export function countdownView(remainingMs: number): CountdownView {
  if (remainingMs > COUNTDOWN_MS) return null;
  if (remainingMs > 0) {
    const n = Math.min(30, Math.max(1, Math.ceil(remainingMs / 1000)));
    return { phase: 'count', n, tier: tierOf(n) };
  }
  if (remainingMs > -FIGHT_FLASH_MS) return { phase: 'fight' };
  return null;
}

/**
 * The classes of the countdown number: its tier, and for the fast and final tiers the second itself
 * (`cd-n10` ... `cd-n1`), which the stylesheet turns into a colour and a size.
 */
export function countdownClasses(view: Exclude<CountdownView, null>): string {
  if (view.phase === 'fight') return 'cd-fight';
  const second = view.tier === 'calm' ? '' : ` cd-n${String(view.n)}`;
  return `cd-count cd-${view.tier}${second}`;
}

/**
 * Milliseconds until the countdown next changes what it shows (the next whole second, the start of
 * the last 30 seconds, the end of "FIGHT!"), or null when it never will again. Used to wake up
 * exactly when the number changes, rather than on a timer that drifts against it.
 */
export function nextCountdownChange(remainingMs: number): number | null {
  if (remainingMs > COUNTDOWN_MS) return remainingMs - COUNTDOWN_MS;
  if (remainingMs > 0) return remainingMs % 1000 === 0 ? 1000 : remainingMs % 1000;
  if (remainingMs > -FIGHT_FLASH_MS) return FIGHT_FLASH_MS + remainingMs;
  return null;
}

/**
 * What a screen reader hears: only at 30, 20, 10 and 5 seconds, and at the start, not at every
 * tick. The text stays the same between those moments, so a polite live region does not chatter.
 */
export function spokenCountdown(view: CountdownView): string {
  if (view === null) return '';
  if (view.phase === 'fight') return 'The fight starts now';
  const { n } = view;
  const bucket = n >= 30 ? 30 : n >= 20 ? 20 : n >= 10 ? 10 : 5;
  return `The fight starts in ${String(bucket)} seconds`;
}
