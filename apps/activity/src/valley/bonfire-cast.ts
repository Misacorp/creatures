/**
 * Who sits at the Bonfire and what the place says (phase 5 step 1, `systems/bonfire.md` V-BON-1 and V-BON-3): with
 * `VALLEY_SYSTEMS` on, every creature rests at the fire. A rotating few sit around it (as many as fit with their
 * plates; the rotation turns once an hour from the server's settle time, never at random), each with the experience
 * it gained this visit ("+N"); the rest are "+N more", and a tap shows them all. Pure: the creatures and the
 * server's `valley` block in, plain data out. The numbers are the server's; nothing is worked out here.
 */
import type { Creature, ValleyVisit } from '../api';
import { CREATURE_PX } from './place-cast';
import type { StandCreature } from './PlaceScene';
import { PLATE_ROW_PX, crowded, plateGap, standBounds, type PlateScene } from './place-plates';

/**
 * A creature at the fire with what it gained this visit. `warm`: it is catching up toward the server (V-BON-2), so a small flame is
 * drawn over it. `owner`: another online player's creature (V-BON-4), with their name; it gains nothing and has no flame.
 */
export interface Resting {
  creature: StandCreature;
  gained: number;
  warm: boolean;
  owner?: string;
}

/** A standing creature at the fire: its experience this visit rides on its nameplate. */
export interface FireStand {
  creature: StandCreature;
  gained: number;
  warm: boolean;
  owner?: string;
  /** Scene pixels from the art's top-left. */
  x: number;
  y: number;
  /** Faces left. */
  flip: boolean;
  /** Where it is, for its spoken name. */
  where: string;
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
    return r.state === 'resting' && creature !== undefined
      ? [{ creature, gained: r.gained, warm: r.catchUpBp > 10_000 }]
      : [];
  });
}

/** The most visitors drawn round the fire: one creature of each online player (V-BON-4), so the fire stays calm. */
export const MAX_VISITORS = 3;

/** One creature of each player who is online now, with their name (the first of the up to three the server sends). */
export function visitorsOf(visit: ValleyVisit): Resting[] {
  return visit.online.flatMap((o) => {
    const c = o.creatures[0];
    return c === undefined
      ? []
      : [
          {
            creature: { id: c.id, species: c.species, level: c.level, shiny: c.shiny, nickname: c.name },
            gained: 0,
            warm: false,
            owner: o.name,
          },
        ];
  }).slice(0, MAX_VISITORS);
}

/** Who sits round the fire: the player's own first, the visitors on the seats after them (a visitor never takes an own creature's seat). */
export function atTheFire(
  resting: readonly Resting[],
  visitors: readonly Resting[],
  settledAt: number,
): Resting[] {
  return [...firesideOf(resting, settledAt, MAX_AT_FIRE - visitors.length), ...visitors];
}

/** Everything the resting creatures gained this visit. */
export function totalGained(resting: readonly Resting[]): number {
  return resting.reduce((sum, r) => sum + r.gained, 0);
}

/**
 * The few who sit round the fire: everyone while they fit, else `MAX_AT_FIRE` of them starting further along the
 * list each hour (so over a day everyone gets a seat by the fire).
 */
export function firesideOf(
  resting: readonly Resting[],
  settledAt: number,
  seats: number = MAX_AT_FIRE,
): Resting[] {
  if (resting.length <= seats) return [...resting];
  const start = Math.floor(settledAt / HOUR_MS) % resting.length;
  const out: Resting[] = [];
  for (let i = 0; i < seats; i += 1) {
    const one = resting[(start + i) % resting.length];
    if (one !== undefined) out.push(one);
  }
  return out;
}

/** The fire's art box in its own pixels (the seats are placed from its top-left). */
export const FIRE_BOX = { width: 56, height: 44 };

/**
 * The seats on the ring round the fire, in the order they fill: a creature's top-left in scene pixels from the fire art's
 * top-left. The ring is an ellipse about the fire's middle (28, 32), a little wider than the stone ring (radii about 24 by
 * 32, as narrow as a phone's scene (68 scene pixels at scale 5) allows): the front, then front right and left, the sides, and the two behind it, whose feet stand on the meadow, never on the hills (the grass starts 14 scene pixels under the art's top, so a creature's top is at -2 or lower). The same at every screen size, because it
 * is measured from the fire, not from the scene. Each seat is at least a plate's gap from every other at both pixel scales
 * (3 and 4), so a seat is lost only to the scene's edge.
 */
export const FIRE_SEATS: readonly { x: number; y: number }[] = [
  { x: 20, y: 64 },
  { x: 44, y: 42 },
  { x: -4, y: 42 },
  { x: 44, y: 20 },
  { x: -4, y: 20 },
  { x: 38, y: -2 },
  { x: 2, y: -2 },
];

/** A creature sitting at the fire at its real spot in the scene. */
export interface FireSpot extends FireStand {
  /** Scene pixels, the creature's top-left. */
  x: number;
  y: number;
}

/**
 * Who sits where, at the scene's real size: each creature takes the next seat whose creature and plate fit inside the
 * scene (`standBounds`) and are clear of the seats taken (`crowded`); a seat that does not fit is left empty, so a phone
 * seats fewer and the ring keeps its shape. A seat is never moved.
 */
export function fireSpots(
  fireside: readonly Resting[],
  art: { x: number; y: number },
  scene: PlateScene,
): FireSpot[] {
  const bounds = standBounds(scene);
  const gap = plateGap(scene.s);
  const out: FireSpot[] = [];
  let next = 0;
  for (const r of fireside) {
    for (; next < FIRE_SEATS.length; next += 1) {
      const seat = FIRE_SEATS[next];
      if (seat === undefined) break;
      const at = { x: art.x + seat.x, y: art.y + seat.y };
      const inside =
        at.x >= bounds.x &&
        at.x < bounds.x + bounds.width &&
        at.y >= bounds.y &&
        at.y < bounds.y + bounds.height;
      if (!inside || out.some((o) => crowded(o, at, gap))) continue;
      out.push({
        creature: r.creature,
        gained: r.gained,
        warm: r.warm,
        ...(r.owner === undefined ? {} : { owner: r.owner }),
        ...at,
        flip: seat.x + CREATURE_PX / 2 > FIRE_MIDDLE,
        where:
          r.owner !== undefined
            ? 'visiting the fire'
            : r.gained > 0
              ? `resting by the fire, gained ${String(r.gained)}`
              : 'resting by the fire',
      });
      next += 1;
      break;
    }
  }
  return out;
}

/** Where the "+N more" button's middle stands: on the ring's front edge, under the front seat's plate (scene pixels). */
export function moreSpot(art: { x: number; y: number }, s: number): { x: number; y: number } {
  const front = FIRE_SEATS[0] ?? { x: 20, y: 50 };
  return {
    x: art.x + front.x + CREATURE_PX / 2,
    y: art.y + front.y + CREATURE_PX + Math.ceil(PLATE_ROW_PX / s) + 2,
  };
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
