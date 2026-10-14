/**
 * Small pure helpers for who is in this week: a player's initial (for the raid board's tiles) and the
 * count line of the boss card. Names are other players' text: they are only ever drawn as text.
 */

/** The first character (code point) of a name, upper-cased; "?" for an empty one. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}

/** "5 players this week", "1 player this week", "Nobody in yet". */
export function rosterCountText(count: number): string {
  if (count <= 0) return 'Nobody in yet';
  return `${String(count)} ${count === 1 ? 'player' : 'players'} this week`;
}
