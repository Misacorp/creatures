/**
 * Who sits at the Bonfire and what the place says (phase 5 step 1, `systems/bonfire.md` V-BON-1 and V-BON-3): with
 * `VALLEY_SYSTEMS` on, every creature rests at the fire. A rotating few sit around it (as many as fit with their
 * plates; the rotation turns once an hour from the server's settle time, never at random), each with the experience
 * it gained this visit ("+N"); the rest are "+N more", and a tap shows them all. Pure: the creatures and the
 * server's `valley` block in, plain data out. The numbers are the server's; nothing is worked out here.
 */
import type { Creature, ValleyVisit } from '../api';
import { CREATURE_PX, type Stand } from './place-cast';

/** A creature at the fire with what it gained this visit. */
export interface Resting {
  creature: Creature;
  gained: number;
}

/** A standing creature at the fire: its experience this visit rides on its nameplate. */
export interface FireStand extends Stand {
  gained: number;
}

/** The most creatures drawn round the fire (fewer where they do not fit with their plates, as everywhere). */
export const MAX_AT_FIRE = 7;

const HOUR_MS = 3_600_000;

/** The fire's art is this wide: seats are placed from its top-left, and a creature on its right faces left. */
const FIRE_MIDDLE = 28;

/** The player's creatures the server says are resting, in the server's order (an id the client does not hold is skipped). */
export function restingOf(creatures: readonly Creature[], visit: ValleyVisit): Resting[] {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  return visit.creatures.flatMap((r) => {
    const creature = byId.get(r.id);
    return r.state === 'resting' && creature !== undefined ? [{ creature, gained: r.gained }] : [];
  });
}

/** Everything the resting creatures gained this visit. */
export function totalGained(resting: readonly Resting[]): number {
  return resting.reduce((sum, r) => sum + r.gained, 0);
}

/**
 * The few who sit round the fire: everyone while they fit, else `MAX_AT_FIRE` of them starting further along the
 * list each hour (so over a day everyone gets a seat by the fire).
 */
export function firesideOf(resting: readonly Resting[], settledAt: number): Resting[] {
  if (resting.length <= MAX_AT_FIRE) return [...resting];
  const start = Math.floor(settledAt / HOUR_MS) % resting.length;
  const out: Resting[] = [];
  for (let i = 0; i < MAX_AT_FIRE; i += 1) {
    const one = resting[(start + i) % resting.length];
    if (one !== undefined) out.push(one);
  }
  return out;
}

/**
 * Where each seat is, in the order they fill, a creature's top-left in scene pixels from the fire art's top-left (the
 * art is 56 wide and 44 high): in front first, then to each side, then a second ring. The plates' gap pushes them
 * apart (`placeStands`), so a narrow scene keeps the first few.
 */
export const FIRE_SEATS: readonly { x: number; y: number }[] = [
  { x: 20, y: 44 },
  { x: -22, y: 28 },
  { x: 62, y: 28 },
  { x: -6, y: 62 },
  { x: 46, y: 62 },
  { x: -44, y: 50 },
  { x: 84, y: 50 },
];

/** The stands round the fire for the few who sit there: each faces the fire. */
export function fireStands(fireside: readonly Resting[]): FireStand[] {
  return fireside.flatMap((r, i) => {
    const seat = FIRE_SEATS[i];
    if (seat === undefined) return [];
    return [
      {
        creature: r.creature,
        gained: r.gained,
        x: seat.x,
        y: seat.y,
        flip: seat.x + CREATURE_PX / 2 > FIRE_MIDDLE,
        where:
          r.gained > 0 ? `resting by the fire, gained ${String(r.gained)}` : 'resting by the fire',
      },
    ];
  });
}

/** How many resting creatures are not drawn round the fire. */
export function moreCount(total: number, drawn: number): number {
  return Math.max(0, total - drawn);
}

/** The Places list's line for the Bonfire: how many rest, and what the visit gave them. Null while the valley's block has not come (flag off). */
export function bonfireLine(
  visit: ValleyVisit | null | undefined,
  creatures: readonly Creature[],
): string | null {
  if (visit === null || visit === undefined) return null;
  const resting = restingOf(creatures, visit);
  if (resting.length === 0) return 'nobody resting';
  const gained = totalGained(resting);
  const count = `${String(resting.length)} resting`;
  return gained > 0 ? `${count}, +${String(gained)} XP` : count;
}

/** The calm line under the Bonfire scene: only what the picture does not show, the visit's total ("" when there is none). */
export function bonfireCalm(resting: readonly Resting[]): string {
  const gained = totalGained(resting);
  return gained > 0 ? `+${String(gained)} XP this visit` : '';
}

/** The "+N more" button's label. */
export function moreLabel(more: number): string {
  return `+${String(more)} more`;
}
