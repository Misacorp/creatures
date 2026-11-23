/**
 * The Fairground's scene as a canvas (`FairgroundCanvas.tsx`; the rule is "A place is a canvas" in `ux-patterns.md`; Misa's pick A,
 * stalls, 2026-11-20): the grandstand along the top, the show's tent under it with the Rules board on one side and the Prize Stall on
 * the other, then one stall for each event of the day, the wide team stall as wide as it needs. Pure: the scene's size and the day's
 * lineup go in; the scale, every box and where each entered creature stands come out. The pieces' sizes are the art's own
 * (`fairground-canvas-art.ts` draws them; the real art takes the same sizes), so a swap of art changes nothing here.
 *
 * The rows, top to bottom (scene pixels):
 * - the grandstand, tiles of `STAND_W` side by side to every edge;
 * - the tent row: the tent in the middle, the Rules board at its left and the Prize Stall at its right, their feet level with the
 *   tent's (a window too narrow for the three puts the board and the stall in the flow below instead);
 * - the stall rows: the stalls in lineup order, packed left to right and each row centred, a new row when the next stall does not fit.
 * Every thing you can tap has a plate under it, `plateRows` scene pixels tall, which each row leaves room for.
 */
import { PLATE_ROW_PX } from './place-plates';
import { grassTo } from './place-scene';
import type { SceneGeometry } from './SceneFrame';
import { TILE, type Placement } from './valley-art';
import {
  BOARD,
  POSTER,
  PRIZE,
  ROSETTE,
  type RosetteMetal,
  SINGLE_W,
  STALL_H,
  STAND_H,
  STAND_W,
  TEAM_W,
  TENT,
  boardArt,
  grandstandArt,
  prizeArt,
  rosetteArt,
  stallArt,
  tentArt,
} from './fairground-canvas-art';

import type { Box } from './fairground-canvas-art';

export type { Box };

/**
 * The scale range: a phone's 390 px is 195 scene pixels at 2, room for two single stalls side by side. A small phone with a long
 * day (four or five stalls) gets 1, the one scale where every stall and its name plate fit above the tray without panning.
 */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/** Scene pixels kept clear at each side edge, between two things in a row, and between rows (the plate's room is added). */
export const EDGE = 4;
export const GAP = 10;
const ROW_GAP = 4;
/** How far the tent's peak stands over the grandstand's bottom edge. */
const TENT_OVERLAP = 8;
/** The room between the tent and the board or the stall beside it: this much when there is room, down to `ASIDE_GAP_MIN`. */
const ASIDE_GAP = 18;
const ASIDE_GAP_MIN = 8;
/**
 * The corner buttons ("Last show", "Medals") lie in a row over the scene's top, this many CSS px tall with their plates
 * (`canvas.css`, `.pc-tools-row`). The scene keeps that band clear of art: bare grass, the grandstand starts under it.
 */
export const TOOLS_PX = 76;
/** The grandstand's height when the window is short: its lower benches only (the bunting and the top row are left off). */
export const STAND_SHORT = 24;
/** How many characters the tent's and the Prize Stall's plates can say ("Opens Wed 13:37"), for the room they need. */
const ASIDE_PLATE_CHARS = 16;

/** The most a plate can be wide (`canvas.css`: 7.5 rem) and how wide a character of it is, in CSS px. */
const PLATE_MAX_CSS = 120;
const PLATE_CHAR_CSS = 7;
const PLATE_PAD_CSS = 10;

/** A creature's box (`CREATURE_PX`) and where it stands at a stall: feet on the counter's ledge, from the stall's top-left. */
const CREATURE = 16;
export const COUNTER_FEET = 44;
const SINGLE_AT: readonly number[] = [Math.floor((SINGLE_W - CREATURE) / 2)];
const TEAM_AT: readonly number[] = [
  12,
  Math.floor((TEAM_W - CREATURE) / 2),
  TEAM_W - 12 - CREATURE,
];

/** The event as the layout needs it: its id and whether it is a team event. */
export interface StallEvent {
  id: string;
  team: 1 | 3;
  /** The name on its plate: a long one widens the stall's slot so two plates never meet. */
  name?: string;
}

/** How wide a stall is: a team stall is the wide one. */
export const stallWidth = (event: Pick<StallEvent, 'team'>): number =>
  event.team === 3 ? TEAM_W : SINGLE_W;

/** Scene pixels the plates under a row take at scale `s`. */
export const plateRows = (s: number): number => Math.ceil(PLATE_ROW_PX / s);

/** The rows of bare grass kept for the corner buttons at scale `s`: whole grass tiles, so the grass patch that covers it has no seam. */
export const bandRows = (s: number): number => Math.ceil(Math.ceil(TOOLS_PX / s) / TILE) * TILE;

/** How wide a plate saying `text` is, in scene pixels at scale `s` (a long name is cut at the plate's greatest width). */
export function plateWidth(text: string, s: number): number {
  const css = Math.min(PLATE_MAX_CSS, [...text].length * PLATE_CHAR_CSS + PLATE_PAD_CSS);
  return Math.ceil(css / s);
}

/** Where the entered creatures of a stall stand: the top-left of each slot's creature, from the stall's top-left. */
export function slotSpots(event: Pick<StallEvent, 'team'>): { x: number; y: number }[] {
  return (event.team === 3 ? TEAM_AT : SINGLE_AT).map((x) => ({ x, y: COUNTER_FEET - CREATURE }));
}

/** The poster slot of a stall (the event's own scene strip), from the stall's top-left. */
export function posterBox(event: Pick<StallEvent, 'team'>): Box {
  return {
    x: Math.floor((stallWidth(event) - POSTER.w) / 2),
    y: POSTER.y,
    w: POSTER.w,
    h: POSTER.h,
  };
}

/** Who stands where: each stall's entered creatures (by id) with the spot they stand on, in slot order; an empty slot has none. */
export interface StallCast {
  eventId: string;
  stands: { creatureId: string; x: number; y: number; slot: number }[];
}

/**
 * The stalls' casts, in lineup order: an event's entries (the server's `entries`) stand at the stall's counter, slot by slot, up to
 * the stall's slots. A creature the player no longer owns (`owned` has the ids that exist) is left out, never a gap.
 */
export function stallCasts(
  lineup: readonly StallEvent[],
  entries: Readonly<Record<string, readonly string[]>>,
  owned: ReadonlySet<string>,
): StallCast[] {
  return lineup.map((event) => {
    const spots = slotSpots(event);
    const ids = entries[event.id] ?? [];
    return {
      eventId: event.id,
      stands: ids.flatMap((creatureId, slot) => {
        const spot = spots[slot];
        return spot === undefined || !owned.has(creatureId)
          ? []
          : [{ creatureId, x: spot.x, y: spot.y, slot }];
      }),
    };
  });
}

/** The stall an entry belongs to by id: the drop's id (`stall:<event>`), and its event back. */
export const stallSeat = (eventId: string): string => `stall:${eventId}`;
export function eventOfSeat(seat: string | null): string | null {
  return seat !== null && seat.startsWith('stall:') ? seat.slice('stall:'.length) : null;
}

/** One thing in the scene that takes up room on a row. */
interface Item {
  key: string;
  w: number;
  h: number;
}

/** Packs items left to right into rows no wider than `maxW`, `gap` between neighbours; an item wider than a row has one to itself. */
export function packRows<T extends { w: number }>(
  items: readonly T[],
  maxW: number,
  gap: number,
): T[][] {
  const rows: T[][] = [];
  let used = 0;
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (last !== undefined && used + gap + item.w <= maxW) {
      last.push(item);
      used += gap + item.w;
    } else {
      rows.push([item]);
      used = item.w;
    }
  }
  return rows;
}

/** The room the tent and the Prize Stall each take on the tent row at scale `s`: their art, or their plate when that is wider. */
const asideSlot = (art: number, s: number): number =>
  Math.max(art, plateWidth('x'.repeat(ASIDE_PLATE_CHARS), s));

/** The room between the tent and what stands beside it in a scene `width` wide at scale `s` (0: the three do not fit on one row). */
function asideGap(width: number, s: number): number {
  const rest = width - 2 * EDGE - BOARD.w - asideSlot(TENT.w, s) - asideSlot(PRIZE.w, s);
  const gap = Math.min(ASIDE_GAP, Math.floor(rest / 2));
  return gap >= ASIDE_GAP_MIN ? gap : 0;
}

/** Whether a scene `width` scene pixels wide has room for the board, the tent and the stall on one row at scale `s`. */
export const asideFits = (width: number, s: number): boolean => asideGap(width, s) > 0;

export interface FairLayout {
  /** The grandstand tiles' left edges (scene pixels), side by side to both edges. */
  stands: number[];
  /** The grandstand's top row and how many of its rows show (the whole strip, or its lower part on a short window). */
  standTop: number;
  standH: number;
  /** The rows kept for the corner buttons, bare grass from the top. */
  band: number;
  tent: Box;
  /** The Prize Stall and the Rules board. */
  prize: Box;
  rules: Box;
  /** Each event's stall, by id. */
  stalls: Record<string, Box>;
  /** The scene's rows used, from the top to the plates under the last row (the scene needs at least this many). */
  height: number;
  /** The board and the Prize Stall stand beside the tent (else they are in the flow with the stalls). */
  aside: boolean;
}

/** The left edges of the grandstand tiles across a scene `width` wide: one tile centred, the rest beside it. */
export function standColumns(width: number, cx: number): number[] {
  const first = cx - Math.floor(STAND_W / 2);
  let x = first - Math.ceil(first / STAND_W) * STAND_W;
  const out: number[] = [];
  for (; x < width; x += STAND_W) out.push(x);
  return out;
}

/** The most rows the spare height of a tall window is spread over (the tent and what is under it move down by a part of it). */
const MAX_SHIFT = 24;

type Geo = Pick<SceneGeometry, 'W' | 'H' | 'cx' | 's'>;

/**
 * Where everything stands in a scene of `g`'s size for the day's `lineup`. The whole grandstand when the fair fits under it, else
 * its lower part (`STAND_SHORT`): the window decides, never who stands where.
 */
export function fairLayout(g: Geo, lineup: readonly StallEvent[]): FairLayout {
  const full = layoutAt(g, lineup, 0, STAND_H);
  if (full.height > g.H && g.H > 0) return layoutAt(g, lineup, 0, STAND_SHORT);
  // The spare height goes a little under the grandstand (the tent stands clear of it) and the rest below, so the fair is not pushed up.
  const shift = Math.min(MAX_SHIFT, Math.floor(Math.max(0, g.H - full.height) * 0.4));
  return shift === 0 ? full : layoutAt(g, lineup, shift, STAND_H);
}

/** The layout with the grandstand `standH` rows high, and the tent and everything under it `shift` rows lower. */
function layoutAt(
  g: Geo,
  lineup: readonly StallEvent[],
  shift: number,
  standH: number,
): FairLayout {
  const plates = plateRows(g.s);
  const gap = asideGap(g.W, g.s);
  const aside = gap > 0;
  const band = bandRows(g.s);
  const tentTop = band + standH - TENT_OVERLAP + shift;
  const tentBottom = tentTop + TENT.h;
  let tent: Box = { x: g.cx - Math.floor(TENT.w / 2), y: tentTop, w: TENT.w, h: TENT.h };
  let rules: Box = { x: 0, y: 0, w: BOARD.w, h: BOARD.h };
  let prize: Box = { x: 0, y: 0, w: PRIZE.w, h: PRIZE.h };
  let rowTop = tentBottom + plates + ROW_GAP;
  const flow: (Item & { place: 'stall' | 'rules' | 'prize'; id: string; art: number })[] =
    lineup.map((e) => ({
      key: e.id,
      id: e.id,
      place: 'stall',
      art: stallWidth(e),
      // The slot is the stall or its plate, whichever is wider, so neighbours' plates never meet.
      w: Math.max(stallWidth(e), e.name === undefined ? 0 : plateWidth(e.name, g.s)),
      h: STALL_H,
    }));
  if (aside) {
    // The tent and the Prize Stall keep the room their plates need (a long plate at a small scale is wider than the art).
    const prizeSlot = asideSlot(PRIZE.w, g.s);
    const tentSlot = asideSlot(TENT.w, g.s);
    const tentPad = Math.floor((tentSlot - TENT.w) / 2);
    // The tent stands in the middle; the Prize Stall is the wider side, so a narrow scene moves the three left together.
    const overflow = tent.x - tentPad + tentSlot + gap + prizeSlot - (g.W - EDGE);
    if (overflow > 0) tent = { ...tent, x: tent.x - overflow };
    const prizeX = tent.x - tentPad + tentSlot + gap + Math.floor((prizeSlot - PRIZE.w) / 2);
    const rulesX = tent.x - tentPad - gap - BOARD.w;
    rules = { x: rulesX, y: tentBottom - BOARD.h, w: BOARD.w, h: BOARD.h };
    prize = { x: prizeX, y: tentBottom - PRIZE.h, w: PRIZE.w, h: PRIZE.h };
  } else {
    flow.push({
      key: 'prize',
      id: 'prize',
      place: 'prize',
      art: PRIZE.w,
      w: asideSlot(PRIZE.w, g.s),
      h: PRIZE.h,
    });
    flow.push({ key: 'rules', id: 'rules', place: 'rules', art: BOARD.w, w: BOARD.w, h: BOARD.h });
  }
  const stalls: Record<string, Box> = {};
  let bottom = tentBottom;
  for (const row of packRows(flow, g.W - 2 * EDGE, GAP)) {
    const rowW = row.reduce((sum, item) => sum + item.w, 0) + GAP * (row.length - 1);
    const rowH = Math.max(...row.map((item) => item.h));
    let x = g.cx - Math.floor(rowW / 2);
    for (const item of row) {
      const box: Box = {
        x: x + Math.floor((item.w - item.art) / 2),
        y: rowTop + rowH - item.h,
        w: item.art,
        h: item.h,
      };
      if (item.place === 'stall') stalls[item.id] = box;
      else if (item.place === 'prize') prize = box;
      else rules = box;
      x += item.w + GAP;
    }
    bottom = rowTop + rowH;
    rowTop = bottom + plates + ROW_GAP;
  }
  return {
    stands: standColumns(g.W, g.cx),
    standTop: band,
    standH,
    band,
    tent,
    prize,
    rules,
    stalls,
    aside,
    height: bottom + plates + 2,
  };
}

/** The rows a scene of width `width` needs at scale `s` for the lineup (with the short grandstand: the least the fair can take). */
export function neededRows(width: number, s: number, lineup: readonly StallEvent[]): number {
  const W = Math.ceil(width / s);
  return layoutAt({ W, H: 0, cx: Math.floor(W / 2), s }, lineup, 0, STAND_SHORT).height;
}

/**
 * The scene's one pixel scale: the largest whole number from `SCALE_MIN` to `SCALE_MAX` at which the whole fair fits the window's
 * height (with the short grandstand if need be), so it fills it. It depends on the window and the lineup, never on who stands where,
 * so the scene keeps its size while you are in it. A window too short even at `SCALE_MIN` still gets `SCALE_MIN`.
 */
export function fairScale(width: number, height: number, lineup: readonly StallEvent[]): number {
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= 1) {
    if (neededRows(width, s, lineup) <= Math.ceil(height / s)) return s;
  }
  return SCALE_MIN;
}

/** Where the day's rosettes hang on the tent: `n` of them in a row across its lower front, from the tent's top-left. */
export function rosetteSpots(n: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const y = TENT.h - ROSETTE.h - 4;
  const room = TENT.w - 8 - ROSETTE.w;
  const step = n === 1 ? 0 : Math.min(ROSETTE.w + 2, Math.floor(room / (n - 1)));
  const span = step * (n - 1) + ROSETTE.w;
  const x0 = Math.floor((TENT.w - span) / 2);
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * step, y }));
}

/** What the scene's pictures depend on besides the lineup. */
export interface FairLook {
  /** Entries are closed: the stalls are shut and the tent's flaps are closed. */
  locked: boolean;
  /** The Prize Stall is open (Wednesdays). */
  prizeOpen: boolean;
  /** The medals of the last show hanging on the tent as rosettes, in order. */
  medals: readonly RosetteMetal[];
}

/** A piece's placements moved to (`x`, `y`). */
const at = (pieces: readonly Placement[], x: number, y: number): Placement[] =>
  pieces.map((p) => ({ sprite: p.sprite, x: p.x + x, y: p.y + y }));

/** The scene: grass to every edge, the grandstand along the top, the tent with its rosettes, the board, the Prize Stall and the stalls. */
export function fairSceneDraw(lineup: readonly StallEvent[], look: FairLook) {
  return (g: SceneGeometry): Placement[] => {
    const lay = fairLayout(g, lineup);
    const out: Placement[] = [...grassTo(g)];
    // The grandstand's lower `standH` rows stand under the band; the strip's top rows lie in the band and are grassed over.
    for (const x of lay.stands)
      out.push(...at(grandstandArt(), x, lay.standTop + lay.standH - STAND_H));
    out.push(...grassTo({ ...g, H: lay.band }));
    out.push(...at(boardArt(), lay.rules.x, lay.rules.y));
    out.push(...at(prizeArt(look.prizeOpen), lay.prize.x, lay.prize.y));
    out.push(...at(tentArt(look.locked), lay.tent.x, lay.tent.y));
    rosetteSpots(look.medals.length).forEach((spot, i) => {
      const metal = look.medals[i];
      if (metal !== undefined)
        out.push(...at(rosetteArt(metal), lay.tent.x + spot.x, lay.tent.y + spot.y));
    });
    for (const event of lineup) {
      const box = lay.stalls[event.id];
      if (box !== undefined) out.push(...at(stallArt(event.team === 3, look.locked), box.x, box.y));
    }
    return out;
  };
}
