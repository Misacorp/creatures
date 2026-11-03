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

/** The art's own places to be (`ART_SPOTS` of `bonfire` and `bonfire-grand`): three on the logs, two on the grass. */
export type Slot = 'seatLeft' | 'seatFront' | 'seatRight' | 'groundLeft' | 'groundRight';

/** Where the player's own creatures sit, in order: the first two (neighbours) share the small moment. */
export const OWN_SLOTS: readonly Slot[] = ['seatLeft', 'seatFront', 'seatRight'];
/** Where friends who are online sit, in order. */
export const FRIEND_SLOTS: readonly Slot[] = ['groundLeft', 'groundRight'];

/** Slots whose creature turns back to face the fire (the sprites face right). */
const FACES_LEFT: readonly Slot[] = ['seatFront', 'seatRight', 'groundRight'];
export const facesLeft = (slot: Slot): boolean => FACES_LEFT.includes(slot);

/**
 * Who sits where: this many of the player's creatures and of friends take the art's seats and the grass spots,
 * and how many resting creatures of the player's are left behind the "+N" (V-BON-3).
 */
export function crowd(
  own: number,
  friends: number,
): { own: Slot[]; friends: Slot[]; more: number } {
  return {
    own: OWN_SLOTS.slice(0, own),
    friends: FRIEND_SLOTS.slice(0, friends),
    more: Math.max(0, own - OWN_SLOTS.length),
  };
}

/** The two neighbours that share a small moment today (the first two seats); null when fewer than two sit by the fire. */
export function momentPair(seatedCount: number): [number, number] | null {
  return seatedCount < 2 ? null : [0, 1];
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
