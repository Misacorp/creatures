/**
 * Who stands where in a place's scene (phase 4, step 3), worked out from what the game screen already holds
 * (the creatures, the attention block, the Games view, the raid glance, the dungeon row of this
 * session; no request of its own). Pure: the same input gives the same scene, with no randomness. The game's
 * rules stay on the server; this only says which of the player's own creatures to draw and where.
 *
 * - House: nobody (the living room is dropped in the valley; Journal and Stats are inside).
 * - Cave: the dungeon team standing at the cave mouth while a run waits or the team is set up.
 * - Arena: the raid party the player placed, and the week's boss, once the raid view has loaded on the map.
 * - Fairground: the creatures entered in today's Games, a group for each event.
 * - Paddock: the creatures at home (they wander; the map shows the same eight), and the waiting catches at the gate.
 *
 * Positions are scene pixels from the top-left of the place's art, a creature's own top-left (16 x 16).
 */
import type { Attention, Creature, SchoolState, ValleyVisit } from '../api';
import type { DungeonPhase } from '../dungeon-flow';
import { emptyEvents, showLive } from '../games-view';
import type { GamesView } from '../games-types';
import type { RaidGlance } from '../home-view';
import { isAtHome } from './tray-state';
import type { PlaceBubble } from './place-state';
import { bubbleAt, raidTiming } from './place-state';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import { forgeCalm } from './forge-view';
import { scaffoldSteps } from './scaffold';
import { placeName, scoutsOut, signpostCalm } from './signpost-view';
import { teaching } from './school-view';
import { studentSpot, teacherSpecies } from './school-yard';
import type { PlaceId } from './valley-art';
import type { Rect } from './valley-art';

/**
 * The places that have a scene of their own over today's page. The Signpost's and the Forge's are drawn only with the valley's
 * systems on (the scouts and the smiths stand in them; `ValleyFrame` checks). The visitor's is drawn only while he is here.
 */
export const CAST_PLACES = [
  'house',
  'cave',
  'arena',
  'fair',
  'paddock',
  'signpost',
  'forge',
  'market',
  'visitor',
  'school',
] as const;
export type CastPlace = (typeof CAST_PLACES)[number];

/**
 * The places that are a canvas (`valley/PlaceCanvas.tsx`): their scene fills the page and is drawn by the place itself (the Forge's
 * is `ForgeCanvas`), so the frame draws no band scene above their page. Their cast is still the same data (`castFor`).
 */
export const CANVAS_PLACES: readonly string[] = ['forge'];

/** Whether the frame draws a band scene above this place's page: the places with a cast that are not a canvas. */
export function hasScene(id: PlaceId): id is CastPlace {
  return (CAST_PLACES as readonly string[]).includes(id) && !CANVAS_PLACES.includes(id);
}

/** A creature's sprite is 16 x 16 scene pixels. */
export const CREATURE_PX = 16;
/** The most creatures drawn wandering the paddock's meadow in its scene (the map draws four). */
export const MAX_ROAMERS = 8;
/** The most creatures drawn standing at the Fairground. */
export const MAX_AT_FAIR = 9;

/** What the scenes read besides `PlaceInput`: this session's dungeon row, the waiting catches. */
export interface CastExtra {
  /** The dungeon setup row of this session (the Dungeon page reports it as it changes); null until it has. */
  dungeonTeam: readonly (string | null)[] | null;
  /** What the Dungeon page last said about today's run (null until it has): in progress, can start, or neither. */
  dungeonPhase: DungeonPhase | null;
  /** The duplicates waiting for a choice. */
  waiting: readonly { id: string; species: string; shiny: boolean }[];
}

/** What a scene is made from: the place bubbles' own input plus `CastExtra`. */
export interface CastInput extends CastExtra {
  now: number;
  creatures: readonly Creature[];
  attention: Attention | null;
  games: GamesView | null;
  raid: RaidGlance | null;
  pending: number;
  /** The guild's timezone; null before the first full state. */
  timezone: string | null;
  /** The valley's scouts and seats (`VALLEY_SYSTEMS` on): the Signpost's scene is made from it. */
  visit?: ValleyVisit | null;
  /** What the server said of the School (`VALLEY_SYSTEMS` on): its scene is made from it (null until it has said). */
  school?: SchoolState | null;
}

/** One creature standing in a scene. */
export interface Stand {
  creature: Creature;
  /** Scene pixels from the art's top-left. */
  x: number;
  y: number;
  /** Faces left. */
  flip: boolean;
  /** Where it is, for its spoken name ("at the cave", "in Hurdles"). */
  where: string;
}

/** A newcomer waiting at the paddock's gate. */
export interface Newcomer {
  id: string;
  species: string;
  shiny: boolean;
  x: number;
  y: number;
}

/** The scene's one action: the next step (a button that goes to the part of the page that does it), or a calm line. */
export type CastAct =
  { kind: 'step'; label: string; detail?: string } | { kind: 'calm'; line: string };

export interface Cast {
  place: CastPlace;
  stands: Stand[];
  /** The creatures that wander (the paddock only); they stay inside `roam`. */
  roamers: Creature[];
  roam: Rect | null;
  /** The week's boss while the raid view is loaded (the arena only). */
  boss: { id: string; name: string } | null;
  /** When the raid comes ("Saturday", "today", "live now"), for the arena band's small label; null when not known or over. */
  timing: string | null;
  gate: Newcomer[];
  /** How many catches wait in all (the gate draws at most two). */
  waiting: number;
  act: CastAct;
  /** The steps of scaffolding standing round the place while its project fills (0 to 11; V-COM-6). */
  scaffold: number;
  /** The School's yard and the visit (the School only): what stands in the yard, null elsewhere. */
  school: SchoolCast | null;
}

/**
 * The School's yard (V-SCH-11): the yard is always there (a bench with room to join), the lectern stands and the bell hangs tilted from the
 * announcement to the end of the stay, and the teacher (in a mortarboard, a species the player does not own) stands at the lectern
 * while the teacher is here. Nothing in the yard when no teacher is at the School or announced.
 */
export interface SchoolCast {
  /** The lectern stands at the door. */
  lectern: boolean;
  /** The bell hangs tilted (the teacher is announced, not yet here). */
  bell: boolean;
  /** The teacher's species while the teacher is here; null otherwise. */
  teacher: string | null;
}

const byId = (creatures: readonly Creature[]): Map<string, Creature> =>
  new Map(creatures.map((c) => [c.id, c]));

/** The creatures of a list of ids, in that order; ids that are not the player's creatures any more are skipped. */
function pick(creatures: readonly Creature[], ids: readonly (string | null)[]): Creature[] {
  const all = byId(creatures);
  const out: Creature[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const c = all.get(id);
    if (c !== undefined) out.push(c);
  }
  return out;
}

/** A row of `count` creatures, centred on `centre`, `step` apart, feet on the row at `y`; the middle ones stand a pixel lower. */
function row(count: number, centre: number, y: number, step: number): { x: number; y: number }[] {
  const left = centre - Math.floor(((count - 1) * step) / 2) - CREATURE_PX / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: left + i * step,
    y: y + (i % 2 === 1 ? 2 : 0),
  }));
}

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : `${String(n)} ${many}`;

// --- House ---

/**
 * The house has no one standing by it: the living room is gone from the valley (Q16); Journal and Stats are its two
 * rows under the scene, so it says nothing more (a calm line shows only when it says what the picture does not).
 */
function houseCast(): Pick<Cast, 'stands' | 'act'> {
  return { stands: [], act: { kind: 'calm', line: '' } };
}

// --- Cave ---

function caveCast(
  input: CastInput,
  art: Size,
  bubbles: readonly PlaceBubble[],
): Pick<Cast, 'stands' | 'act'> {
  const waits = bubbleAt(bubbles, 'cave') !== undefined || input.attention?.dungeon === true;
  const team = input.dungeonTeam === null ? [] : pick(input.creatures, input.dungeonTeam);
  // The team stands at the mouth while a run waits or the row is set up; otherwise the cave is quiet.
  const shown = waits || team.length > 0 ? team : [];
  const spots = row(shown.length, Math.floor(art.width / 2), art.height - 10, 16);
  const stands = shown.flatMap((creature, i) => {
    const spot = spots[i];
    return spot === undefined
      ? []
      : [{ creature, x: spot.x, y: spot.y, flip: false, where: 'at the cave mouth' }];
  });
  // What the cave says is what the dungeon really is. The server's pip alone is "a run can start or is open", so it
  // cannot tell them apart: the Dungeon page's own word (`dungeonPhase`) does once the page has loaded this session.
  // A word that disagrees with the pip is stale (a new day began while the player was away): ask the player in.
  const phase = settledPhase(input.dungeonPhase, input.attention);
  if (phase === 'active') return { stands, act: { kind: 'step', label: 'Continue the run' } };
  if (phase === 'ready') {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Start the run',
        ...(team.length > 0 ? { detail: `${String(team.length)} ready` } : {}),
      },
    };
  }
  // Something is up but not known which: no claim either way (and never "quiet").
  if (waits) return { stands, act: { kind: 'step', label: 'Enter the cave' } };
  // Nothing is up for certain: the pip says so. Before the first state arrives, no line at all.
  return {
    stands,
    act: { kind: 'calm', line: input.attention === null ? '' : 'The cave is quiet' },
  };
}

/** The dungeon's phase to trust: the page's, unless the pip contradicts it (then unknown). */
function settledPhase(
  phase: DungeonPhase | null,
  attention: Attention | null,
): DungeonPhase | null {
  if (phase === null) return null;
  if (attention === null) return phase;
  if (phase === 'none' && attention.dungeon) return null;
  if (phase === 'ready' && !attention.dungeon) return 'none';
  return phase;
}

// --- Arena ---

function arenaCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act' | 'boss' | 'timing'> {
  const scene = input.raid?.scene ?? null;
  const party = scene === null ? [] : pick(input.creatures, scene.party);
  const spots = row(party.length, Math.floor(art.width / 2) - 6, art.height - 10, 16);
  const stands = party.flatMap((creature, i) => {
    const spot = spots[i];
    return spot === undefined
      ? []
      : [{ creature, x: spot.x, y: spot.y, flip: false, where: "in this week's raid party" }];
  });
  const boss = scene === null ? null : scene.boss;
  const timing = raidTiming(input.raid, input.now, input.timezone);
  if (input.attention?.raid === true) {
    return { stands, boss, timing, act: { kind: 'step', label: 'Place your creatures' } };
  }
  // The party stands in the picture: a line that says so would repeat it.
  // Before the raid has loaded there is nothing to say ("The arena waits" would only repeat the picture).
  const line = party.length > 0 || input.raid === null ? '' : 'No party placed';
  return { stands, boss, timing, act: { kind: 'calm', line } };
}

// --- Fairground ---

/** The entered creatures, a group for each event that has some, in the lineup's order. */
export function fairEntries(
  games: GamesView | null,
  creatures: readonly Creature[],
): { eventName: string; creatures: Creature[] }[] {
  if (games === null) return [];
  const out: { eventName: string; creatures: Creature[] }[] = [];
  for (const event of games.next.lineup) {
    const there = pick(creatures, games.next.entries[event.id] ?? []);
    if (there.length > 0) out.push({ eventName: event.name, creatures: there });
  }
  return out;
}

/** The fair's creatures stand this far apart sideways in a row, and the second row this far below the first. */
const FAIR_STEP = 16;
const FAIR_ROW = 16;

function fairCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const groups = fairEntries(input.games, input.creatures);
  // The entered creatures in the lineup's order, two staggered rows a gap apart (events side by side, never a heap).
  const flat = groups.flatMap((g) =>
    g.creatures.map((creature) => ({ creature, event: g.eventName })),
  );
  const shown = flat.slice(0, MAX_AT_FAIR);
  const cols = Math.ceil(shown.length / 2);
  const left =
    Math.floor(art.width / 2) - Math.floor(((cols - 1) * FAIR_STEP) / 2) - CREATURE_PX / 2;
  const stands: Stand[] = shown.map(({ creature, event }, i) => ({
    creature,
    x: left + Math.floor(i / 2) * FAIR_STEP + (i % 2) * 8,
    y: art.height - 14 + (i % 2) * FAIR_ROW,
    flip: false,
    where: `in ${event}`,
  }));
  const games = input.games;
  // Not loaded yet: no line ("The fair is quiet" would only repeat the picture).
  if (games === null) return { stands, act: { kind: 'calm', line: '' } };
  if (showLive(games, input.now)) return { stands, act: { kind: 'step', label: 'Watch the show' } };
  const empty = emptyEvents(games.next, input.creatures).length;
  if (empty > 0 && input.now < games.next.lockAt) {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Enter an event',
        detail: plural(empty, 'one to enter', 'to enter'),
      },
    };
  }
  const entered = groups.length;
  return {
    stands,
    act: {
      kind: 'calm',
      line: entered > 0 ? `Entered in ${plural(entered, 'an event', 'events')}` : '',
    },
  };
}

// --- Paddock ---

/**
 * Where the creatures at home roam in the scene, from the art's top-left: the meadow in front of and beside the
 * fence as well as inside it, clear of the gate newcomers to its right.
 */
export const PADDOCK_ROAM_AREA: Rect = { x: -24, y: 8, width: 68, height: 46 };

/** Where the Paddock's communal helper stands, from the art's top-left (beside the rails, clear of the meadow and the gate). */
const PADDOCK_HELPER = { x: -34, y: 24 };

function paddockCast(
  input: CastInput,
  art: Size,
): Pick<Cast, 'stands' | 'roamers' | 'roam' | 'gate' | 'waiting' | 'act'> {
  // The helper on the Paddock's communal seat stands at the gate post instead of wandering (V-COM-6).
  const helper = helperOf(input, 'paddock');
  const roamers = input.creatures
    .filter((c) => isAtHome(c) && c.id !== helper?.id)
    .slice(0, MAX_ROAMERS);
  const stands: Stand[] =
    helper === undefined
      ? []
      : [
          {
            creature: helper,
            x: PADDOCK_HELPER.x,
            y: PADDOCK_HELPER.y,
            flip: false,
            where: 'helping build the Paddock',
          },
        ];
  // The waiting catches queue at the gate (the open side, bottom right of the rails), one below the other, at most two drawn.
  const gate = input.waiting.slice(0, 2).map((w, i) => ({
    ...w,
    x: art.width - 2,
    y: art.height - 22 + i * 16,
  }));
  const n = input.pending;
  const act: CastAct =
    n > 0
      ? {
          kind: 'step',
          label: n === 1 ? 'Choose for the newcomer' : 'Choose for the newcomers',
          detail: plural(n, 'one waits', 'wait'),
        }
      : {
          // The creatures at home are in the picture: a count would repeat it. An empty meadow says so.
          kind: 'calm',
          line: roamers.length === 0 ? 'Nobody is home' : '',
        };
  return { stands, roamers, roam: PADDOCK_ROAM_AREA, gate, waiting: n, act };
}

// --- The commons in the scene (V-COM-6) ---

/** The player's creature on a place's communal seat, if one stands there (it is drawn working in the scene). */
function helperOf(input: CastInput, place: string): Creature | undefined {
  const id = commonsOf(input.visit)?.communal.find((c) => c.place === place)?.creatureId ?? null;
  return id === null ? undefined : input.creatures.find((c) => c.id === id);
}

/** The scaffolding's steps for a place's scene: how full its open project is (0 when none is open). */
function scaffoldOf(input: CastInput, place: string): number {
  const p = placeOf(commonsOf(input.visit), place);
  return p?.state === 'open' ? scaffoldSteps(percentFilled(p) / 100) : 0;
}

// --- Signpost ---

/** The scouts stand this far apart sideways in front of the signpost (scene pixels). */
const SCOUT_STEP = 24;

/**
 * The scouts at their seats in front of the signpost, in the order the seats were bought, each saying where it is out. A free
 * seat shows nobody (the page under the scene says it is free). The scene's one action is the next step: take the first seat,
 * or post a scout to a free seat; else a calm line of how many are out.
 */
function signpostCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const visit = input.visit;
  if (visit == null) return { stands: [], act: { kind: 'calm', line: '' } };
  const scouts = visit.seats.flatMap((seat) => {
    const creature = input.creatures.find((c) => c.id === seat.creatureId);
    return creature === undefined
      ? []
      : [{ creature, where: `scouting at ${placeName(seat.destination)}` }];
  });
  // The helper on the Signpost's communal seat stands with them (V-COM-6): it works on the road.
  const helper = helperOf(input, 'signpost');
  if (helper !== undefined) {
    scouts.push({ creature: helper, where: 'helping build the road' });
  }
  const spots = row(scouts.length, Math.floor(art.width / 2), art.height - 10, SCOUT_STEP);
  const stands = scouts.flatMap(({ creature, where }, i) => {
    const spot = spots[i];
    return spot === undefined ? [] : [{ creature, x: spot.x, y: spot.y, flip: i % 2 === 1, where }];
  });
  if (visit.seats.length === 0 && visit.seatPrices.next !== null) {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Take your first seat',
        ...(visit.seatPrices.next === 0 ? { detail: 'free' } : {}),
      },
    };
  }
  const free = visit.seats.filter((s) => s.creatureId === null).length;
  const posted = new Set(visit.seats.map((s) => s.creatureId));
  const spare = input.creatures.filter((c) => !posted.has(c.id) && isAtHome(c)).length;
  if (free > 0 && spare > 0) {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Post a scout',
        detail: plural(free, 'a seat is free', 'seats are free'),
      },
    };
  }
  return {
    stands,
    act: { kind: 'calm', line: scoutsOut(visit) === 0 ? '' : signpostCalm(visit) },
  };
}

// --- Forge ---

/** The smiths stand this far apart sideways in front of the forge (scene pixels). */
const SMITH_STEP = 24;

/**
 * The smiths at their anvils in front of the forge, in the order the anvils were bought, each saying which anvil. A free anvil shows
 * nobody (the page under the scene says it is free). The scene's one action is the next step: take the first anvil, or post a smith to a
 * free anvil; else a calm line of how many smiths are at work.
 */
function forgeCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const visit = input.visit;
  if (visit == null) return { stands: [], act: { kind: 'calm', line: '' } };
  const smiths = visit.anvils.flatMap((anvil, n) => {
    const creature = input.creatures.find((c) => c.id === anvil.creatureId);
    return creature === undefined
      ? []
      : [{ creature, where: `smithing at anvil ${String(n + 1)}` }];
  });
  // The helper on the Forge's communal seat stands with them (V-COM-6): it hauls for the building.
  const helper = helperOf(input, 'forge');
  if (helper !== undefined) smiths.push({ creature: helper, where: 'helping build the Forge' });
  // Right of the door: the anvil stands at its left, and a smith in front of it would hide it.
  const spots = row(smiths.length, Math.floor(art.width / 2) + 10, art.height - 10, SMITH_STEP);
  const stands = smiths.flatMap(({ creature, where }, i) => {
    const spot = spots[i];
    return spot === undefined ? [] : [{ creature, x: spot.x, y: spot.y, flip: i % 2 === 1, where }];
  });
  if (visit.anvils.length === 0 && visit.anvilPrices.next !== null) {
    const free = visit.anvilPrices.next.acorns === 0 && visit.anvilPrices.next.scrap === 0;
    return {
      stands,
      act: { kind: 'step', label: 'Take your first anvil', ...(free ? { detail: 'free' } : {}) },
    };
  }
  const free = visit.anvils.filter((a) => a.creatureId === null).length;
  const posted = new Set(visit.anvils.map((a) => a.creatureId));
  const spare = input.creatures.filter((c) => !posted.has(c.id) && isAtHome(c)).length;
  if (free > 0 && spare > 0) {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Post a smith',
        detail: plural(free, 'an anvil is free', 'anvils are free'),
      },
    };
  }
  return { stands, act: { kind: 'calm', line: smiths.length === 0 ? '' : forgeCalm(visit) } };
}

// --- Market ---

/** The broker and the Market's helper stand this far apart sideways in front of the stall (scene pixels). */
const MARKET_STEP = 24;

/**
 * The broker at its seat in front of the stall, with the Market's helper beside it while the project is built (V-COM-6). The scene's one
 * action is the next step: post a broker to the free seat; else nothing (the broker's line is on its card under the scene).
 */
function marketCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const visit = input.visit;
  if (visit == null) return { stands: [], act: { kind: 'calm', line: '' } };
  const seat = visit.market?.seat ?? null;
  const people: { creature: Creature; where: string }[] = [];
  const broker = seat === null ? undefined : input.creatures.find((c) => c.id === seat.creatureId);
  if (broker !== undefined) people.push({ creature: broker, where: 'trading at the Market' });
  const helper = helperOf(input, 'market');
  if (helper !== undefined) people.push({ creature: helper, where: 'helping build the Market' });
  const spots = row(people.length, Math.floor(art.width / 2), art.height - 10, MARKET_STEP);
  const stands = people.flatMap(({ creature, where }, i) => {
    const spot = spots[i];
    return spot === undefined ? [] : [{ creature, x: spot.x, y: spot.y, flip: i % 2 === 1, where }];
  });
  if (seat !== null && seat.creatureId === null) {
    const posted = new Set(visit.creatures.filter((c) => c.seatId !== null).map((c) => c.id));
    const spare = input.creatures.filter((c) => !posted.has(c.id) && isAtHome(c)).length;
    if (spare > 0) {
      return { stands, act: { kind: 'step', label: 'Post a broker', detail: 'a seat is free' } };
    }
  }
  return { stands, act: { kind: 'calm', line: '' } };
}

// --- School ---

/**
 * The School's students on the bench (V-SCH-13), in the order of the seats, each saying it learns it by morning; the yard's props from the
 * teacher's phase. The scene says nothing under its picture: the page under it has the teacher's line and the Send buttons.
 */
function schoolCast(input: CastInput): Pick<Cast, 'stands' | 'act' | 'school'> {
  const view = input.school ?? null;
  const students = (view?.seats ?? []).flatMap((seat) => {
    const creature =
      seat.creatureId === null ? undefined : input.creatures.find((c) => c.id === seat.creatureId);
    return creature === undefined ? [] : [creature];
  });
  const stands = students.flatMap((creature, i) => {
    const spot = studentSpot(i);
    return spot === null
      ? []
      : [
          {
            creature,
            x: spot.x,
            y: spot.y,
            flip: false,
            where: 'at the School, learns it by morning',
          },
        ];
  });
  const open = teaching(view);
  const talent = view?.talent?.id ?? null;
  const owned = new Set(input.creatures.map((c) => c.species));
  const here = open && view?.phase === 'here';
  return {
    stands,
    school: {
      lectern: open,
      bell: open && view?.phase === 'announced',
      teacher: here && talent !== null ? teacherSpecies(talent, owned) : null,
    },
    // The page under the scene says where the teacher stands, so the scene says nothing (as the visitor's).
    act: { kind: 'calm', line: '' },
  };
}

interface Size {
  width: number;
  height: number;
}

/** The cast of a place's scene; `art` is the place's art size in scene pixels. */
export function castFor(
  place: CastPlace,
  input: CastInput,
  art: Size,
  bubbles: readonly PlaceBubble[],
): Cast {
  const base: Cast = {
    place,
    stands: [],
    roamers: [],
    roam: null,
    boss: null,
    timing: null,
    gate: [],
    waiting: 0,
    act: { kind: 'calm', line: '' },
    scaffold: 0,
    school: null,
  };
  const scaffold = scaffoldOf(input, place);
  switch (place) {
    case 'house':
      return { ...base, ...houseCast() };
    case 'cave':
      return { ...base, ...caveCast(input, art, bubbles) };
    case 'arena':
      return { ...base, ...arenaCast(input, art) };
    case 'fair':
      return { ...base, ...fairCast(input, art) };
    case 'paddock':
      return { ...base, ...paddockCast(input, art), scaffold };
    case 'signpost':
      return { ...base, ...signpostCast(input, art), scaffold };
    case 'forge':
      return { ...base, ...forgeCast(input, art), scaffold };
    case 'market':
      return { ...base, ...marketCast(input, art), scaffold };
    case 'school':
      return { ...base, ...schoolCast(input) };
    case 'visitor':
      // His stall stands alone (nobody of yours is posted there); the page under it says everything, so the scene says nothing.
      return base;
  }
}
