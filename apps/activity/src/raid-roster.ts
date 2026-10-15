/**
 * Small pure helpers for who is in this week: a player's initial (for the raid board's tiles). Names are other players' text: they are only ever drawn as text.
 */

/** The first character (code point) of a name, upper-cased; "?" for an empty one. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}
