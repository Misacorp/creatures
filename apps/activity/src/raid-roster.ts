/**
 * The "who is in this week" avatar strip: one small tile per player (their initial), the count, and
 * the names behind a tap. Pure. Names are other players' text: they are only ever drawn as text.
 */
import type { RaidView, RosterEntry } from './raid-api';
import { ownerColour } from './raid-slots';

/** At most this many tiles are drawn in the strip; the rest are counted as "+N". */
export const AVATAR_LIMIT = 8;

interface Avatar {
  initial: string;
  name: string;
  you: boolean;
  party: number;
  /** The player's colour index: the same one their creatures have in the party row. */
  colour: number;
}

/** The first character (code point) of a name, upper-cased; "?" for an empty one. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}

function avatarOf(entry: RosterEntry, names: readonly string[]): Avatar {
  return {
    initial: initialOf(entry.displayName),
    name: entry.displayName,
    you: entry.you,
    party: entry.party,
    colour: ownerColour(entry.displayName, names),
  };
}

/** The tiles to draw (you first, then the roster's order) and how many more there are. */
export function avatarStrip(
  roster: readonly RosterEntry[],
  limit: number = AVATAR_LIMIT,
): { shown: Avatar[]; extra: number } {
  const names = roster.map((r) => r.displayName);
  const all = roster.map((entry) => avatarOf(entry, names));
  const ordered = [...all.filter((a) => a.you), ...all.filter((a) => !a.you)];
  return { shown: ordered.slice(0, limit), extra: Math.max(0, ordered.length - limit) };
}

/** "5 players this week", "1 player this week", "Nobody in yet". */
export function rosterCountText(count: number): string {
  if (count <= 0) return 'Nobody in yet';
  return `${String(count)} ${count === 1 ? 'player' : 'players'} this week`;
}

/** The text after a name in the opened list: "you" and, with several parties, the party number. */
export function rosterNote(
  entry: Pick<RosterEntry, 'you' | 'party'>,
  parties: RaidView['parties'],
): string {
  const bits: string[] = [];
  if (entry.you) bits.push('you');
  if (parties.length > 1) bits.push(`party ${String(entry.party)}`);
  return bits.join(', ');
}
