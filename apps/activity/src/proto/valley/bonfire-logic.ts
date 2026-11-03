/**
 * The bonfire's rules as plain functions (prototype, dev only; `systems/bonfire.md`, `commons.md`): who sits
 * by the fire (a rotating few, "+N" for the rest, V-BON-3), who is warming up (catch-up toward the server,
 * V-BON-2), which two creatures share a small moment (V-BON-9), the hearth project's stones (V-COM-2, V-COM-6,
 * V-COM-15) and where everything sits. No DOM, no clock, no randomness: the day number turns the seats.
 */

/** Levels below the target at which catch-up pays its full x2 (V-BON-2: "6 or more levels below"). */
export const CATCH_UP_SPAN = 6;

/**
 * The level a creature catches up toward: the higher of its player's 3rd-best creature's level and the
 * server's middle (the median of active players' top-three levels). Zero creatures count as level 0.
 */
export function catchUpTarget(levels: readonly number[], serverMiddle: number): number {
  const sorted = [...levels].sort((a, b) => b - a);
  return Math.max(sorted[2] ?? sorted[sorted.length - 1] ?? 0, serverMiddle);
}

/**
 * The XP multiplier of a creature: x2 at `CATCH_UP_SPAN` or more levels below the target, fading evenly to x1
 * at it; never above x1 at or over it (it never lifts a creature past the target).
 */
export function catchUpFactor(level: number, target: number): number {
  const gap = target - level;
  if (gap <= 0) return 1;
  return 1 + Math.min(gap, CATCH_UP_SPAN) / CATCH_UP_SPAN;
}

/** A creature shows the warming-up flame while it is catching up (its multiplier is above x1). */
export function isWarmingUp(level: number, target: number): boolean {
  return catchUpFactor(level, target) > 1;
}

/** `list` turned left by `by` places (any whole number, also past the length or negative). */
export function rotated<T>(list: readonly T[], by: number): T[] {
  if (list.length === 0) return [];
  const n = ((by % list.length) + list.length) % list.length;
  return [...list.slice(n), ...list.slice(0, n)];
}

/**
 * Who sits around the fire today: `seats` creatures, a different few as the days go by, and how many more are
 * resting out of sight. Every creature takes its turn; nobody is "benched".
 */
export function seatedFew<T>(
  resting: readonly T[],
  day: number,
  seats: number,
): { seated: T[]; more: number } {
  const turn = rotated(resting, day * 2);
  return { seated: turn.slice(0, seats), more: Math.max(0, resting.length - seats) };
}

/** The seats of the front arc, left to right: the left edge from the fire's middle, and the row down from the place's top. */
export function arcSeats(count: number): { dx: number; dy: number; flip: boolean }[] {
  // The middle seat sits lowest, the ends curve up around the fire.
  const byDistance = [42, 38, 30];
  const first = -Math.floor(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const k = first + i;
    return {
      dx: k * 20 - 8,
      dy: byDistance[Math.min(Math.abs(k), 2)] ?? 38,
      // The left of the fire faces it (the sprites face right), the right of it turns back.
      flip: k > 0,
    };
  });
}

/**
 * The two neighbours that share a small moment today: seats `a` and `a + 1`, the pair turning along with the
 * day. Null when fewer than two sit by the fire.
 */
export function momentPair(seatedCount: number, day: number): [number, number] | null {
  if (seatedCount < 2) return null;
  const a = day % (seatedCount - 1);
  return [a, a + 1];
}

/** A hearth project: stones up so far, how many it takes, the stones that are yours, and what a stone costs in Acorns. */
export interface Hearth {
  total: number;
  placed: number;
  yours: number;
  stoneCost: number;
}

/** The hearth after the player gives `stones` stones' worth (never past the total; Acorns are spent for what fits). */
export function giveToHearth(hearth: Hearth, stones: number): Hearth {
  const add = Math.max(0, Math.min(stones, hearth.total - hearth.placed));
  return { ...hearth, placed: hearth.placed + add, yours: hearth.yours + add };
}

/** What the hearth still needs, in stones and Acorns. */
export function hearthNeeds(hearth: Hearth): { stones: number; acorns: number } {
  const stones = hearth.total - hearth.placed;
  return { stones, acorns: stones * hearth.stoneCost };
}

/** The player's own share in whole percent (shown to them only, V-COM-2); 0 when nothing is up yet. */
export function yourSharePercent(hearth: Hearth): number {
  return hearth.placed === 0 ? 0 : Math.round((hearth.yours / hearth.placed) * 100);
}

export const hearthBuilt = (hearth: Hearth): boolean => hearth.placed >= hearth.total;
