/**
 * The valley prototype's pure rules: which building a need hangs its bubble on and what the bubble says,
 * how the valley fits a window (its scale, the margins of more world around it, where a phone starts), which
 * needs are off screen (the edge arrows), and the wandering of idle creatures. No DOM, no clock, no
 * randomness but a seeded generator handed in.
 */
import { content, int, type Rng } from '@creatures/game';
import { creatureName } from '../../game';
import { jobTitle } from '../../gear-view';
import { destinationName } from '../../trip-view';
import { whenText } from '../../home-view';
import { creatureOf, evolve, needs, placeRaid, type Need, type ProtoWorld } from '../world';
import { PLACES, TILE, VALLEY_SIZE, placeOf, type PlaceId, type Rect } from './valley-art';

// --- Needs on buildings ---

/** The building a need's bubble hangs on. Needs are pinned to buildings, never to wandering creatures. */
export function placeOfNeed(need: Need): PlaceId {
  switch (need.kind) {
    case 'trip-home':
      return 'signpost';
    case 'job-ready':
      return 'forge';
    case 'raid':
      return 'arena';
    case 'dungeon':
      return 'cave';
    case 'evolve':
      return 'house';
    case 'games':
      return 'fair';
  }
}

/** A marker's own picture: the place's glyph, a creature's face, and how many things wait there when it is more than one. */
export interface BubblePicture {
  glyph: string;
  species?: string | undefined;
  count?: number | undefined;
}

export interface Bubble {
  place: PlaceId;
  /** The world's need this is; null for a marker with its own `picture` (what the welcome-back popup leaves for the valley). */
  need: Need | null;
  picture?: BubblePicture | undefined;
  /** What the need is, in words, for the place's spoken name ("Craft Kelp Cap is ready"). */
  spoken: string;
  /** The only words a bubble may show: the time the Games close ("13:37"); else null. */
  time: string | null;
}

/** One bubble per building that has a need (its first need, in the order `needs` lists them). */
export function bubblesOf(world: ProtoWorld): Bubble[] {
  const out: Bubble[] = [];
  for (const need of needs(world)) {
    const place = placeOfNeed(need);
    if (out.some((b) => b.place === place)) continue;
    out.push({ place, need, spoken: needWords(world, need), time: needTime(world, need) });
  }
  return out;
}

function needWords(world: ProtoWorld, need: Need): string {
  switch (need.kind) {
    case 'trip-home': {
      const trip = world.trips.find((t) => t.id === need.tripId);
      const who = creatureName(creatureOf(world, need.creatureId));
      return trip === undefined
        ? `${who} is home`
        : `${who} is home from ${destinationName(trip.destination)}`;
    }
    case 'job-ready': {
      const job = world.jobs.find((j) => j.id === need.jobId);
      return job === undefined ? 'A job is ready' : `${jobTitle(job)} is ready`;
    }
    case 'raid': {
      const left = need.needed - need.placed;
      return left === 1 ? '1 creature to place' : `${String(left)} creatures to place`;
    }
    case 'dungeon':
      return "Today's run is open";
    case 'evolve':
      return `${creatureName(creatureOf(world, need.creatureId))} can evolve`;
    case 'games':
      return `Events open to enter until ${needTime(world, need) ?? 'later'}`;
  }
}

function needTime(world: ProtoWorld, need: Need): string | null {
  if (need.kind !== 'games') return null;
  return whenText(world.now, world.games.next.lockAt, world.timezone);
}

/** A place's spoken name: the place, what it is, and its need ("Forge, Workshop. Craft Kelp Cap is ready"). */
export function placeLabel(id: PlaceId, bubble: Bubble | undefined): string {
  const place = placeOf(id);
  const base = `${place.name}, ${place.what}`;
  return bubble === undefined ? base : `${base}. ${bubble.spoken}`;
}

// --- Fitting the window ---

/** The valley's pixel scale: 2 on every screen (a phone sees its full height and pans sideways). */
export const VALLEY_SCALE = 2;

export interface Fit {
  scale: number;
  /** Extra tiles of world drawn on each side, so a big window shows more valley, not a dark bar. */
  margin: { left: number; top: number; right: number; bottom: number };
  /** Where the drawing's top-left sits in the window (CSS px; negative when it overhangs). */
  left: number;
  top: number;
  /** True when the valley is wider than the window: it pans sideways. */
  pans: boolean;
}

/** How the valley fits a window of `width` x `height` CSS px. */
export function fitValley(width: number, height: number, scale = VALLEY_SCALE): Fit {
  const tile = TILE * scale;
  const vw = VALLEY_SIZE.width * scale;
  const vh = VALLEY_SIZE.height * scale;
  const pans = vw > width;
  const side = pans ? 0 : Math.ceil((width - vw) / 2 / tile);
  const updown = Math.max(0, Math.ceil((height - vh) / 2 / tile));
  // Centre the valley itself (not the drawing): the drawing overhangs by its margins.
  const left = pans ? 0 : Math.floor((width - vw) / 2) - side * tile;
  // A window shorter than the valley (a phone, with the tray under it) loses the top sky row and the
  // south's grass, never a building: the valley starts one sky row up and is cut at the bottom.
  const top = height < vh ? -tile : Math.floor((height - vh) / 2) - updown * tile;
  return {
    scale,
    margin: { left: side, top: updown, right: side, bottom: updown },
    left,
    top,
    pans,
  };
}

/** The furthest a panning valley scrolls (CSS px). */
export function maxScroll(width: number, scale = VALLEY_SCALE): number {
  return Math.max(0, VALLEY_SIZE.width * scale - width);
}

/** The scroll that centres the valley-pixel span `[from, to]` in a window `width` wide, clamped. */
export function scrollToSpan(
  from: number,
  to: number,
  width: number,
  scale = VALLEY_SCALE,
): number {
  const centre = ((from + to) / 2) * scale;
  return Math.round(Math.min(maxScroll(width, scale), Math.max(0, centre - width / 2)));
}

/** Where a phone starts: the house, the paddock and the forge in view (the middle third). */
export function startScroll(width: number, scale = VALLEY_SCALE): number {
  const house = placeOf('house').rect;
  const forge = placeOf('forge').rect;
  return scrollToSpan(house.x, forge.x + forge.width, width, scale);
}

/** The scroll that centres a place. */
export function scrollToPlace(id: PlaceId, width: number, scale = VALLEY_SCALE): number {
  const r = placeOf(id).rect;
  return scrollToSpan(r.x, r.x + r.width, width, scale);
}

export interface EdgeArrow {
  place: PlaceId;
  side: 'left' | 'right';
  /** The target's middle height, in valley pixels (the arrow sits at it). */
  y: number;
}

/**
 * The edge arrows of a panning valley: one per place in `wanted` whose middle is out of the window, on that
 * side, in the order given (the needs' order). Nothing when the valley does not pan.
 */
export function edgeArrows(
  wanted: readonly PlaceId[],
  scrollLeft: number,
  width: number,
  scale = VALLEY_SCALE,
): EdgeArrow[] {
  if (maxScroll(width, scale) === 0) return [];
  const out: EdgeArrow[] = [];
  for (const id of wanted) {
    const r = placeOf(id).rect;
    const mid = (r.x + r.width / 2) * scale;
    const y = r.y + r.height / 2;
    if (mid < scrollLeft) out.push({ place: id, side: 'left', y });
    else if (mid > scrollLeft + width) out.push({ place: id, side: 'right', y });
  }
  return out;
}

/**
 * The heights (valley pixels) of a side's edge tabs: each at its place's middle, moved down where it would
 * overlap the one above (`gap` valley pixels apart at least), in the order of their heights.
 */
export function stackTabs(arrows: readonly EdgeArrow[], gap: number): Map<PlaceId, number> {
  const out = new Map<PlaceId, number>();
  for (const side of ['left', 'right'] as const) {
    let last = -Infinity;
    for (const a of [...arrows].filter((x) => x.side === side).sort((p, q) => p.y - q.y)) {
      const y = Math.max(a.y, last + gap);
      out.set(a.place, y);
      last = y;
    }
  }
  return out;
}

/** The places in reading order (west to east, north to south): the list of buttons and the arrow keys. */
export function readingOrder(): PlaceId[] {
  return [...PLACES].sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y).map((p) => p.id);
}

// --- The raid's board ---

/**
 * Places a free creature in the raid on the slot the player tapped (`placeRaid` takes the first empty slot;
 * here the creature then moves to the tapped one when that one is empty too).
 */
export function placeRaidAt(world: ProtoWorld, creatureId: string, slot: number): ProtoWorld {
  const next = placeRaid(world, creatureId);
  const party = next.raid.party;
  const team = next.raid.you.team;
  if (party === null || team === null) return next;
  const landed = party.row.find((s) => s.creature?.creatureId === creatureId);
  const target = party.row.find((s) => s.slot === slot);
  if (landed === undefined || target === undefined || landed.slot === slot) return next;
  if (target.creature !== null) return next;
  const row = party.row.map((s) => {
    if (s.slot === slot) return { ...s, creature: landed.creature };
    if (s.slot === landed.slot) return { ...s, creature: null };
    return s;
  });
  return {
    ...next,
    raid: {
      ...next.raid,
      party: { ...party, row },
      you: {
        ...next.raid.you,
        team: {
          creatures: team.creatures.map((c) => (c.creatureId === creatureId ? { ...c, slot } : c)),
        },
      },
    },
  };
}

// --- Evolving ---

/** Evolves a creature into one of its forms (`evolve` goes to the main form; the alternative form is set after). */
export function evolveInto(world: ProtoWorld, creatureId: string, species: string): ProtoWorld {
  const next = evolve(world, creatureId);
  const target = content.creatures.find((c) => c.id === species);
  if (target === undefined) throw new Error(`no species ${species}`);
  return {
    ...next,
    creatures: next.creatures.map((c) =>
      c.id === creatureId
        ? { ...c, species: target.id, line: target.line, levelCap: target.levelCap }
        : c,
    ),
  };
}

/** The flash of an evolution: 8 frames, old and new form in turn, faster and faster (ms each). */
export const EVOLVE_FLASH_MS: readonly number[] = [160, 160, 120, 120, 80, 80, 40, 40];

// --- Wandering creatures ---

export interface Walker {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** Faces left (the sprite is drawn mirrored). */
  flip: boolean;
  /** Steps taken; a hop on every other step while walking. */
  steps: number;
  /** Ticks left to stand still at a waypoint. */
  rest: number;
}

/** A waypoint inside `area` (whole pixels), from the seeded generator. */
function waypoint(rng: Rng, area: Rect): { x: number; y: number } {
  return {
    x: area.x + int(rng, Math.max(1, area.width)),
    y: area.y + int(rng, Math.max(1, area.height)),
  };
}

/**
 * A new walker in `area`. With `spread`, it starts in its own column (the `index`th of `of`), so idle
 * creatures do not start in a heap; its row and first waypoint come from the generator.
 */
export function newWalker(rng: Rng, area: Rect, spread?: { index: number; of: number }): Walker {
  const rnd = waypoint(rng, area);
  const at =
    spread === undefined
      ? rnd
      : {
          x: area.x + Math.floor(((spread.index + 0.5) * area.width) / Math.max(1, spread.of)),
          y: rnd.y,
        };
  const to = waypoint(rng, area);
  return { x: at.x, y: at.y, tx: to.x, ty: to.y, flip: false, steps: 0, rest: int(rng, 8) };
}

/**
 * One tick of a walker: 1 px towards its waypoint (x first, then y), turning to face the way it goes; at the
 * waypoint it rests a few ticks and picks the next one.
 */
export function stepWalker(w: Walker, rng: Rng, area: Rect): Walker {
  if (w.rest > 0) return { ...w, rest: w.rest - 1 };
  if (w.x === w.tx && w.y === w.ty) {
    const to = waypoint(rng, area);
    return { ...w, tx: to.x, ty: to.y, rest: 4 + int(rng, 12) };
  }
  const dx = Math.sign(w.tx - w.x);
  const dy = dx === 0 ? Math.sign(w.ty - w.y) : 0;
  return {
    ...w,
    x: w.x + dx,
    y: w.y + dy,
    flip: dx === 0 ? w.flip : dx < 0,
    steps: w.steps + 1,
  };
}

/** The hop: 1 px up on every other step while walking. */
export function hopOf(w: Walker): number {
  const walking = w.rest === 0 && (w.x !== w.tx || w.y !== w.ty);
  return walking && w.steps % 2 === 1 ? 1 : 0;
}
