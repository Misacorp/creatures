/**
 * The return walk's choices, as pure functions (prototype, dev only; `docs/design/valley/systems/return.md`,
 * V-RET-1 to 9): which three or four places the walk visits for one visit of a journey, which story lines it
 * tells (three at most, each as who, what and where), the one surprise at most, the decision that ends the
 * walk, the piles carried home as count badges, and a welcome line after a long absence. No DOM, no clock,
 * no randomness: the same visit and cast always give the same plan.
 */
import { content } from '@creatures/game';
import type { IconRef } from '../../icon-ref';
import type { PartKind } from '../../gear-types';
import { speciesName } from '../../game';
import { PLACES, type PlaceId } from '../valley/valley-art';
import { eventsOf, gapDays, type Journey, type JourneyEvent, type Visit } from './journey';

/** At most this many story lines in a walk (V-RET-1). */
export const MAX_LINES = 3;
/** The walk visits at least this many places and at most `MAX_STOPS` (V-RET-1). */
export const MIN_STOPS = 3;
export const MAX_STOPS = 4;
/** A gap of this many days or more is a long absence: a welcome line and only the biggest things (V-RET-7). */
export const LONG_GAP_DAYS = 3;
/** Most count badges carried home. */
export const MAX_PILES = 6;

/** A creature of the valley the story can name: its name and species (the sprite). */
export interface CastMember {
  name: string;
  species: string;
  shiny: boolean;
}

/** Who a line is about: a member of the cast (by its place in the cast), or a species (a new friend), or no one. */
export type Who = { kind: 'cast'; slot: number } | { kind: 'species'; species: string } | null;

export interface WalkLine {
  place: PlaceId;
  /** Who, what and where, in one short sentence ("Pip became an Expert Smith"). */
  text: string;
  who: Who;
  /** The one find the camera eases to and pops out (V-RET-2). */
  surprise: boolean;
}

export interface WalkStop {
  place: PlaceId;
  lines: WalkLine[];
}

export interface Pile {
  key: string;
  icon: IconRef;
  amount: number;
  /** What assistive technology says ("Acorns"). */
  label: string;
}

export interface WalkDecision {
  place: PlaceId;
  /** The decision as the place's bubble says it. */
  text: string;
}

export interface WalkPlan {
  /** The line that opens a walk after a long absence; null otherwise. */
  welcome: string | null;
  /** The places in the order the walk goes; the surprise's place is last but for the decision's. */
  stops: WalkStop[];
  surprise: WalkLine | null;
  decision: WalkDecision | null;
  piles: Pile[];
}

// --- Where things happened ---

/** The shard element each destination of the Signpost gives (`destinations.json`). */
const DESTINATION_OF_ELEMENT: Record<string, string> = {
  tide: 'the Tidepools',
  ember: 'the Ember Caves',
  grove: 'Verdant Hollow',
  spark: 'Storm Ridge',
  mire: 'the Sunken Fen',
};

/** Where the scouts went: the element they brought the most shards of (else the first destination). */
export function scoutsDestination(visit: Visit): string {
  let best: string | null = null;
  let most = 0;
  for (const [element, amount] of Object.entries(visit.cameHome.shards)) {
    if (amount > most) {
      best = element;
      most = amount;
    }
  }
  return DESTINATION_OF_ELEMENT[best ?? 'tide'] ?? 'the road';
}

/**
 * The place a lab place's level-up happens at. The valley has no bonfire or School yet, so the bonfire is
 * staged at the Paddock (where the resting creatures are) and a graduation at the House.
 */
export function placeOfLevelUp(place: string): PlaceId {
  if ((PLACES as readonly { id: string }[]).some((p) => p.id === place)) return place as PlaceId;
  return 'paddock';
}

const PLACE_WORDS: Record<string, string> = {
  bonfire: 'The bonfire',
  forge: 'The Forge',
  signpost: 'The Signpost',
  paddock: 'The Paddock',
  house: 'The House',
  arena: 'The Arena',
  cave: 'The Cave',
  fair: 'The Fairground',
};

// --- Who is who ---

/** The cast slots: two scouts, two smiths, then the creatures that rest by the fire. */
const SCOUT_SLOT = 0;
const SMITH_SLOT = 2;
const RESTING_SLOT = 4;

const nameOf = (cast: readonly CastMember[], slot: number): string =>
  cast[slot % Math.max(1, cast.length)]?.name ?? 'A creature';

/** The name of a creature line ("splashet" is Splashet); a line the content does not know is shown as it is. */
export function lineName(line: string): string {
  const first = content.creatures.find((c) => c.line === line && c.stage === 1);
  if (first !== undefined) return speciesName(first.id);
  return /^new line \d+/.test(line) ? 'a new creature' : line;
}

/** The first species of a line (for the sprite), else null. */
export function lineSpecies(line: string): string | null {
  return content.creatures.find((c) => c.line === line && c.stage === 1)?.id ?? null;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// --- Candidates ---

/** A line that could be told, with its rank (lower is told first when only three fit). */
interface Candidate {
  rank: number;
  line: WalkLine;
}

/** How rare a find is: the surprise is the lowest number among the candidates that have one. */
const SURPRISE_RANK = {
  newLine: 1,
  placeLevel: 2,
  graduation: 3,
  master: 4,
  expert: 5,
  epicReroll: 6,
  newBlueprint: 7,
} as const;

/** An ordinary story line ranks after every surprise-class one, then the day's plain news. */
const RANK = { event: 10, newCreature: 20, scouts: 30, forge: 31, moment: 40 } as const;

type Of<K extends JourneyEvent['kind']> = Extract<JourneyEvent, { kind: K }>;
const ofKind = <K extends JourneyEvent['kind']>(events: JourneyEvent[], kind: K): Of<K>[] =>
  events.filter((e): e is Of<K> => e.kind === kind);

const STEP_RANK: Record<string, number> = { Apprentice: 1, Expert: 2, Master: 3 };

/** The small moments of a resting creature that close a quiet day (V-RET-2, V-BON-9); one per day, in turn. */
const MOMENTS: readonly ((name: string) => string)[] = [
  (n) => `${n} fell asleep on the log bench`,
  (n) => `${n} is warming its paws by the fire`,
  (n) => `${n} chased a spark round the fire`,
  (n) => `${n} yawned and stretched`,
];

/** The event-based candidates of a visit. */
function eventCandidates(visit: Visit, cast: readonly CastMember[]): Candidate[] {
  const events = eventsOf(visit);
  const out: Candidate[] = [];

  // New lines: one is a surprise; several are told as one line (a week away groups its finds).
  const lines = ofKind(events, 'new-line');
  if (lines.length === 1 && lines[0] !== undefined) {
    const line = lines[0].line;
    const species = lineSpecies(line);
    out.push({
      rank: SURPRISE_RANK.newLine,
      line: {
        place: 'paddock',
        text: `A new friend: ${lineName(line)}`,
        who: species === null ? null : { kind: 'species', species },
        surprise: true,
      },
    });
  } else if (lines.length > 1 && lines[0] !== undefined) {
    const species = lineSpecies(lines[0].line);
    out.push({
      rank: SURPRISE_RANK.newLine,
      line: {
        place: 'paddock',
        text: `${String(lines.length)} new friends came to the valley`,
        who: species === null ? null : { kind: 'species', species },
        surprise: true,
      },
    });
  }

  // Place level-ups: the highest level, with the others folded in.
  const ups = ofKind(events, 'place-level');
  const top = [...ups].sort((a, b) => b.level - a.level)[0];
  if (top !== undefined) {
    const text =
      ups.length === 1
        ? `${PLACE_WORDS[top.place] ?? 'A place'} grew to level ${String(top.level)}`
        : `${String(ups.length)} places of the valley grew`;
    out.push({
      rank: SURPRISE_RANK.placeLevel,
      line: { place: placeOfLevelUp(top.place), text, who: null, surprise: true },
    });
  }

  // Graduations: summed, at the highest honour.
  const grads = ofKind(events, 'graduation');
  if (grads.length > 0) {
    const count = grads.reduce((sum, g) => sum + g.count, 0);
    const honour = grads[grads.length - 1]?.honour ?? 'Bronze';
    out.push({
      rank: SURPRISE_RANK.graduation,
      line: {
        place: 'house',
        text: `${String(count)} ${plural(count, 'creature', 'creatures')} earned ${honour}`,
        who: null,
        surprise: true,
      },
    });
  }

  // Mastery: each seat's highest step; Expert and Master are surprises, Apprentice is plain news.
  for (const post of ['scout', 'anvil'] as const) {
    const best = new Map<number, number>();
    for (const m of ofKind(events, 'mastery').filter((e) => e.post === post)) {
      best.set(m.seat, Math.max(best.get(m.seat) ?? 0, STEP_RANK[m.step] ?? 0));
    }
    if (best.size === 0) continue;
    const top = Math.max(...best.values());
    const step = Object.keys(STEP_RANK).find((s) => STEP_RANK[s] === top) ?? 'Apprentice';
    const seats = [...best.entries()].filter(([, v]) => v === top).map(([seat]) => seat);
    const base = post === 'scout' ? SCOUT_SLOT : SMITH_SLOT;
    const job = post === 'scout' ? 'Scout' : 'Smith';
    const first = seats[0] ?? 1;
    const text =
      seats.length === 1
        ? `${nameOf(cast, base + ((first - 1) % 2))} became ${article(step)} ${step} ${job}`
        : `${String(seats.length)} ${job.toLowerCase()}s became ${step}s`;
    const rank =
      step === 'Master'
        ? SURPRISE_RANK.master
        : step === 'Expert'
          ? SURPRISE_RANK.expert
          : RANK.event;
    out.push({
      rank,
      line: {
        place: post === 'scout' ? 'signpost' : 'forge',
        text,
        who: { kind: 'cast', slot: base + ((first - 1) % 2) },
        surprise: rank < RANK.event,
      },
    });
  }

  // The visitor: a rare piece (an epic reroll) or a new blueprint is a find; his arrival is news.
  const rerolls = ofKind(events, 'visitor-reroll');
  const epic = rerolls.find((r) => r.rarity === 'epic');
  const blueprint = ofKind(events, 'visitor-blueprint')[0];
  if (epic !== undefined) {
    out.push({
      rank: SURPRISE_RANK.epicReroll,
      line: {
        place: 'fair',
        text: 'The visitor made an epic piece better',
        who: null,
        surprise: true,
      },
    });
  } else if (blueprint?.isNew === true) {
    out.push({
      rank: SURPRISE_RANK.newBlueprint,
      line: { place: 'fair', text: 'The visitor sold a new blueprint', who: null, surprise: true },
    });
  } else if (ofKind(events, 'visitor-arrives').length > 0) {
    out.push({
      rank: RANK.event,
      line: { place: 'fair', text: 'A visitor came to the valley', who: null, surprise: false },
    });
  }

  // What the lab wrote that the prototype does not know yet: a plain line, never dropped silently.
  for (const e of ofKind(events, 'plain')) {
    out.push({
      rank: RANK.event,
      line: { place: 'paddock', text: e.text, who: null, surprise: false },
    });
  }
  return out;
}

/** The plain news of the day: what the scouts brought, what the smiths made, who came home. */
function dayCandidates(visit: Visit, cast: readonly CastMember[]): Candidate[] {
  const out: Candidate[] = [];
  const home = visit.cameHome;

  // Creatures that are not a new line (a new line is the surprise's).
  const others = home.creatures.filter((c) => !c.newLine);
  const count = others.reduce((sum, c) => sum + Math.round(c.count), 0);
  const first = others[0];
  if (first !== undefined && count > 0) {
    const species = lineSpecies(first.line);
    const named = lineName(first.line);
    const text =
      others.length === 1
        ? `${nameOf(cast, SCOUT_SLOT)} brought ${count === 1 ? article(named) : String(count)} ${count === 1 ? named : `${named}s`} home`
        : `${nameOf(cast, SCOUT_SLOT)} brought ${String(count)} creatures home`;
    out.push({
      rank: RANK.newCreature,
      line: {
        place: 'paddock',
        text,
        who: species === null ? { kind: 'cast', slot: SCOUT_SLOT } : { kind: 'species', species },
        surprise: false,
      },
    });
  }

  // The scouts, home from where they went.
  if (home.acorns > 0 || home.scrap > 0 || Object.keys(home.shards).length > 0) {
    out.push({
      rank: RANK.scouts,
      line: {
        place: 'signpost',
        text: `${nameOf(cast, SCOUT_SLOT)} is home from ${scoutsDestination(visit)}`,
        who: { kind: 'cast', slot: SCOUT_SLOT },
        surprise: false,
      },
    });
  }

  // The smith's pieces.
  const worn = Math.round(home.pieces.worn);
  const bagged = Math.round(home.pieces.bagged);
  const pieces = worn > 0 ? worn : bagged;
  if (pieces > 0) {
    out.push({
      rank: RANK.forge,
      line: {
        place: 'forge',
        text: `${nameOf(cast, SMITH_SLOT)} ${worn > 0 ? 'fitted' : 'sorted'} ${String(pieces)} ${plural(pieces, 'piece', 'pieces')} at the Forge`,
        who: { kind: 'cast', slot: SMITH_SLOT },
        surprise: false,
      },
    });
  }
  return out;
}

/** The count badges of what came home (V-RET-4): Acorns, scrap, shards by element, pieces. Zero rounds away. */
export function pilesOf(visit: Visit): Pile[] {
  const home = visit.cameHome;
  const out: Pile[] = [];
  const add = (key: string, icon: IconRef, value: number, label: string): void => {
    const amount = Math.round(value);
    if (amount > 0) out.push({ key, icon, amount, label });
  };
  add('acorns', { kind: 'glyph', id: 'treat' }, home.acorns, 'Acorns');
  add('scrap', { kind: 'part', part: 'scrap' }, home.scrap, 'Scrap');
  const shards = Object.entries(home.shards).sort((a, b) => b[1] - a[1]);
  for (const [element, value] of shards) {
    add(
      `shard-${element}`,
      { kind: 'part', part: `${element}-shard` as PartKind },
      value,
      `${element[0]?.toUpperCase() ?? ''}${element.slice(1)} shards`,
    );
  }
  add('pieces', { kind: 'glyph', id: 'gear-piece' }, home.pieces.collected, 'Pieces');
  return out.slice(0, MAX_PILES);
}

/** The one decision that ends a walk: raid preparation on the Monday, when the threat is sighted (V-RET-3). */
export function decisionOf(visit: Visit): WalkDecision | null {
  return visit.weekday === 'Monday' ? { place: 'arena', text: 'Choose your defenders' } : null;
}

/** The order the walk goes: west to east, so the camera sweeps once and never doubles back. */
const WEST_TO_EAST: readonly PlaceId[] = [...PLACES]
  .sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y)
  .map((p) => p.id);

/** The places that always have something to show, in the order they fill a walk that visits fewer than three. */
const FILLERS: readonly PlaceId[] = ['signpost', 'forge', 'paddock'];

/**
 * The plan of one visit of a journey. `cast` names the creatures the lines are about (the valley's own);
 * `gap` is the days since the last visit (`gapDays`).
 */
export function planWalk(visit: Visit, cast: readonly CastMember[], gap: number): WalkPlan {
  const long = gap >= LONG_GAP_DAYS;
  const all = [...eventCandidates(visit, cast), ...dayCandidates(visit, cast)];

  // A quiet day (nothing rare) closes with a resting creature's small moment, so it is never a bare total.
  const hasSurprise = all.some((c) => c.line.surprise);
  if (!hasSurprise) {
    const moment = MOMENTS[visit.day % MOMENTS.length] ?? MOMENTS[0];
    const slot = RESTING_SLOT + (visit.day % 4);
    if (moment !== undefined) {
      all.push({
        rank: RANK.moment,
        line: {
          place: 'paddock',
          text: moment(nameOf(cast, slot)),
          who: { kind: 'cast', slot },
          surprise: false,
        },
      });
    }
  }

  // The three that matter most; only the best surprise stays a surprise.
  const chosen = [...all].sort((a, b) => a.rank - b.rank).slice(0, MAX_LINES);
  const surpriseLine = chosen.find((c) => c.line.surprise)?.line ?? null;
  const lines = chosen.map((c) => ({ ...c.line, surprise: c.line === surpriseLine }));
  const surprise = lines.find((l) => l.surprise) ?? null;

  // Group the lines by place; the surprise's place goes last, then the decision's.
  const decision = decisionOf(visit);
  const places: PlaceId[] = [];
  for (const l of lines) if (!places.includes(l.place)) places.push(l.place);
  // Fewer than three places: pass by the ones that have piles to drop (the walk visits places where something happened).
  for (const filler of FILLERS) {
    if (places.length >= MIN_STOPS) break;
    if (!places.includes(filler)) places.push(filler);
  }
  const last = (id: PlaceId | undefined): void => {
    if (id === undefined) return;
    const at = places.indexOf(id);
    if (at >= 0) places.splice(at, 1);
    places.push(id);
  };
  const ordered = [...places].sort((a, b) => WEST_TO_EAST.indexOf(a) - WEST_TO_EAST.indexOf(b));
  places.splice(0, places.length, ...ordered);
  last(surprise?.place);
  // At most three places hold lines and the decision adds one, so four is never passed.
  if (decision !== null) last(decision.place);
  // Within a place the surprise is told last: the ordinary news first, then the find.
  const stops = places.map((place) => {
    const here = lines.filter((l) => l.place === place);
    return {
      place,
      lines: [...here.filter((l) => !l.surprise), ...here.filter((l) => l.surprise)],
    };
  });

  return {
    welcome: long ? 'The valley kept the fire going.' : null,
    stops,
    surprise,
    decision,
    piles: pilesOf(visit),
  };
}

/** The plan of visit `index` of a journey. */
export function planOf(journey: Journey, index: number, cast: readonly CastMember[]): WalkPlan {
  const visit = journey.visits[index];
  if (visit === undefined) throw new Error(`the journey has no visit ${String(index)}`);
  return planWalk(visit, cast, gapDays(journey, index));
}
