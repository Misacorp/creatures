/**
 * Who stands where in a place's scene (phase 4, step 3), worked out from what the game screen already holds
 * (the creatures, the attention block, the Games view, the raid glance, the lounger and the dungeon row of this
 * session; no request of its own). Pure: the same input gives the same scene, with no randomness. The game's
 * rules stay on the server; this only says which of the player's own creatures to draw and where.
 *
 * - House: the lounger of the living room, by the house door (its lounge spot picks the corner).
 * - Cave: the dungeon team standing at the cave mouth while a run waits or the team is set up.
 * - Arena: the raid party the player placed, and the week's boss, once the raid view has loaded on the map.
 * - Fairground: the creatures entered in today's Games, a group for each event.
 * - Paddock: the creatures at home (they wander; the map shows the same eight), and the waiting catches at the gate.
 *
 * Positions are scene pixels from the top-left of the place's art, a creature's own top-left (16 x 16).
 */
import type { Attention, Creature } from '../api';
import { emptyEvents, showLive } from '../games-view';
import type { GamesView } from '../games-types';
import type { RaidGlance } from '../home-view';
import { ROOM_SPOTS } from '../sprites/room-art';
import { isAtHome } from './tray-state';
import type { PlaceBubble } from './place-state';
import { bubbleAt } from './place-state';
import type { PlaceId } from './valley-art';
import type { Rect } from './valley-art';

/** The five places that have a scene of their own over today's page (not the Signpost or the Forge: phase 5's posts). */
export const CAST_PLACES = ['house', 'cave', 'arena', 'fair', 'paddock'] as const;
export type CastPlace = (typeof CAST_PLACES)[number];

export function hasScene(id: PlaceId): id is CastPlace {
  return (CAST_PLACES as readonly string[]).includes(id);
}

/** A creature's sprite is 16 x 16 scene pixels. */
export const CREATURE_PX = 16;
/** The most creatures drawn wandering the paddock (the map shows the same eight). */
export const MAX_ROAMERS = 8;
/** The most creatures drawn standing at the Fairground. */
export const MAX_AT_FAIR = 9;

/** What the scenes read besides `PlaceInput`: the game's own lounger, this session's dungeon row, the waiting catches. */
export interface CastExtra {
  loungerId: string | null;
  /** The id of the lounge spot the player chose (`ROOM_SPOTS`), or null. */
  loungeSpotId: string | null;
  /** The dungeon setup row of this session (the Dungeon page reports it as it changes); null until it has. */
  dungeonTeam: readonly (string | null)[] | null;
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
  gate: Newcomer[];
  /** How many catches wait in all (the gate draws at most two). */
  waiting: number;
  act: CastAct;
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

/** The three corners of the house's front a lounger can take: right of the door, left of it, in front. */
function houseCorners(art: Size): { x: number; y: number; flip: boolean }[] {
  const feet = art.height - 18;
  return [
    { x: art.width - 8, y: feet, flip: true },
    { x: -8, y: feet, flip: false },
    { x: Math.floor(art.width / 2) - CREATURE_PX / 2, y: art.height - 8, flip: false },
  ];
}

/** Which corner a lounge spot is: its place in the living room's list of spots, three ways round. */
export function cornerOf(spotId: string | null): number {
  if (spotId === null) return 0;
  const at = ROOM_SPOTS.findIndex((s) => s.id === spotId);
  return at < 0 ? 0 : at % 3;
}

function houseCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const lounger =
    input.loungerId === null ? undefined : input.creatures.find((c) => c.id === input.loungerId);
  if (lounger === undefined) {
    return { stands: [], act: { kind: 'calm', line: 'Nobody is home to lounge' } };
  }
  const spot = houseCorners(art)[cornerOf(input.loungeSpotId)];
  const stands: Stand[] =
    spot === undefined
      ? []
      : [
          {
            creature: lounger,
            x: spot.x,
            y: spot.y,
            flip: spot.flip,
            where: 'lounging by the house',
          },
        ];
  return { stands, act: { kind: 'calm', line: 'Lounging in the living room' } };
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
  const spots = row(shown.length, Math.floor(art.width / 2), art.height - 10, 15);
  const stands = shown.flatMap((creature, i) => {
    const spot = spots[i];
    return spot === undefined
      ? []
      : [{ creature, x: spot.x, y: spot.y, flip: false, where: 'at the cave mouth' }];
  });
  if (waits) {
    return {
      stands,
      act: {
        kind: 'step',
        label: 'Start the run',
        ...(team.length > 0 ? { detail: `${String(team.length)} ready` } : {}),
      },
    };
  }
  return { stands, act: { kind: 'calm', line: 'The cave is quiet' } };
}

// --- Arena ---

function arenaCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act' | 'boss'> {
  const scene = input.raid?.scene ?? null;
  const party = scene === null ? [] : pick(input.creatures, scene.party);
  const spots = row(party.length, Math.floor(art.width / 2) - 6, art.height - 10, 15);
  const stands = party.flatMap((creature, i) => {
    const spot = spots[i];
    return spot === undefined
      ? []
      : [{ creature, x: spot.x, y: spot.y, flip: false, where: "in this week's raid party" }];
  });
  const boss = scene === null ? null : scene.boss;
  if (input.attention?.raid === true) {
    return { stands, boss, act: { kind: 'step', label: 'Place your creatures' } };
  }
  const line =
    party.length > 0
      ? 'Your party is in the arena'
      : input.raid === null
        ? 'The arena waits'
        : 'No party placed';
  return { stands, boss, act: { kind: 'calm', line } };
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

function fairCast(input: CastInput, art: Size): Pick<Cast, 'stands' | 'act'> {
  const groups = fairEntries(input.games, input.creatures);
  const stands: Stand[] = [];
  let left = MAX_AT_FAIR;
  for (const [g, group] of groups.entries()) {
    const centre = Math.floor((art.width * (2 * g + 1)) / (2 * groups.length));
    const shown = group.creatures.slice(0, left);
    left -= shown.length;
    const spots = row(shown.length, centre, art.height - 10 + (g % 2 === 0 ? 0 : 6), 9);
    for (const [i, creature] of shown.entries()) {
      const spot = spots[i];
      if (spot !== undefined) {
        stands.push({
          creature,
          x: spot.x,
          y: spot.y,
          flip: false,
          where: `in ${group.eventName}`,
        });
      }
    }
  }
  const games = input.games;
  if (games === null) return { stands, act: { kind: 'calm', line: 'The fair is quiet' } };
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
      line:
        entered > 0 ? `Entered in ${plural(entered, 'an event', 'events')}` : 'The fair is quiet',
    },
  };
}

// --- Paddock ---

/** Where the creatures at home roam: the open grass inside the paddock's rails (the map's own area, from the art's top-left). */
export const PADDOCK_ROAM_AREA: Rect = { x: 10, y: 20, width: 30, height: 14 };

function paddockCast(
  input: CastInput,
  art: Size,
): Pick<Cast, 'roamers' | 'roam' | 'gate' | 'waiting' | 'act'> {
  const roamers = input.creatures.filter(isAtHome).slice(0, MAX_ROAMERS);
  // The waiting catches queue at the gate (the open side, bottom right of the rails), at most two drawn.
  const gate = input.waiting.slice(0, 2).map((w, i) => ({
    ...w,
    x: art.width - 14 + i * 13,
    y: art.height - 22 - (i % 2) * 3,
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
          kind: 'calm',
          line: roamers.length === 0 ? 'Nobody is home' : `${String(roamers.length)} at home`,
        };
  return { roamers, roam: PADDOCK_ROAM_AREA, gate, waiting: n, act };
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
    gate: [],
    waiting: 0,
    act: { kind: 'calm', line: '' },
  };
  switch (place) {
    case 'house':
      return { ...base, ...houseCast(input, art) };
    case 'cave':
      return { ...base, ...caveCast(input, art, bubbles) };
    case 'arena':
      return { ...base, ...arenaCast(input, art) };
    case 'fair':
      return { ...base, ...fairCast(input, art) };
    case 'paddock':
      return { ...base, ...paddockCast(input, art) };
  }
}
