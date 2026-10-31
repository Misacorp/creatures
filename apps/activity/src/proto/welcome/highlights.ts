/**
 * The welcome-back popup's choices, as pure functions (prototype, dev only; `docs/design/valley/systems/return.md`,
 * V-RET-0): from one visit of a journey, the two or three highlights worth telling (the best piece made or
 * rerolled while away, the most notable creature moment, a moment of the valley itself: at most one of each
 * kind, the biggest first), what the rest comes to ("...and 13 more things") and where those wait as markers
 * in the valley. Every highlight is a Valley Gazette story: a headline of a few words, at most one short line,
 * a picture of the place with the creatures that act, and the finds themselves (a piece, a blueprint, a
 * newcomer, parts) that do the talking and open their popovers when tapped. The player is never a figure in
 * it: creatures act. No DOM, no clock, no randomness: the same visit and cast give the same story.
 */
import { content, PART_KINDS, type PartKind } from '@creatures/game';
import { speciesName } from '../../game';
import type { GearRarity } from '../../gear-types';
import { PLACES, placeOf, type PlaceId } from '../valley/valley-art';
import { eventsOf, gapDays, type Journey, type JourneyEvent, type Visit } from './journey';

/** At most this many highlights, one per kind. */
export const MAX_HIGHLIGHTS = 3;
/** The popup shows after this many hours away (V-RET example: 3 hours). */
export const WELCOME_AFTER_HOURS = 3;
/** Most creatures in one picture. */
export const MAX_ACTORS = 3;
/** Most pieces one story shows (the rest is "N in all"). */
export const MAX_PIECES = 3;
/** The longest headline and line, in characters (the Gazette's columns are narrow). */
export const MAX_HEADLINE = 40;
export const MAX_BLURB = 60;

export type Kind = 'piece' | 'creature' | 'server';

/** A creature of the valley the story can name: its name, species (the sprite) and level (its popover). */
export interface CastMember {
  name: string;
  species: string;
  shiny: boolean;
  level: number;
}

/** A piece of the sample bag a story can show: its inventory id (so a tap opens its card), base id, name and rarity. */
export interface PieceMember {
  id: string;
  baseId: string;
  name: string;
  rarity: GearRarity;
  level: number;
}

export interface Cast {
  creatures: readonly CastMember[];
  pieces: readonly PieceMember[];
  /** Base ids of blueprints a visitor can sell. */
  blueprints: readonly string[];
}

/** Who acts in a picture: a member of the cast (by its place in it) or a species (a newcomer). */
export type Who = { kind: 'cast'; slot: number } | { kind: 'species'; species: string };

/** Something in a picture besides creatures: a glyph, the scouts' sack. */
export type Prop = { kind: 'glyph'; id: string } | { kind: 'sack' };

/** Where a creature or prop stands: valley pixels from the place's door (`dy` is the feet or the prop's middle). */
export interface Spot {
  dx: number;
  dy: number;
}

export interface Actor extends Spot {
  who: Who;
  flip?: boolean;
}

export interface Scene {
  place: PlaceId;
  actors: Actor[];
  props: (Spot & { prop: Prop; big?: boolean })[];
}

/** What a story shows as itself, each one a Find component that opens its popover when tapped. */
export type Find =
  | { kind: 'item'; piece: PieceMember }
  | { kind: 'blueprint'; baseId: string }
  | { kind: 'newcomer'; species: string }
  | { kind: 'parts'; parts: { part: PartKind; amount: number }[] };

export interface Story {
  id: string;
  kind: Kind;
  /** How notable it is: the highest of its kind is the highlight. */
  weight: number;
  place: PlaceId;
  /** How many things of the valley it stands for in "N more things"; 0 for a flourish that is never counted. */
  count: number;
  /** The headline, a few words in capitals. */
  headline: string;
  /** At most one short line; empty when the finds say it all. */
  blurb: string;
  scene: Scene;
  /** The things found, shown as themselves under the headline. */
  finds: Find[];
  /** The marker's picture when it stays for the valley. */
  glyph: string;
  species?: string | undefined;
}

/** A marker the valley keeps for what the popup did not tell. */
export interface Marker {
  place: PlaceId;
  count: number;
  glyph: string;
  species?: string | undefined;
}

export interface Welcome {
  /** The popup shows at all (a while away). */
  show: boolean;
  /** Two or three, the biggest first (the Gazette's headline story first). */
  highlights: Story[];
  /** The things not told, as "...and N more things". */
  more: number;
  markers: Marker[];
  /** "Monday · week 2 · day 8". */
  date: string;
}

// --- Words ---

/** The shard element each destination of the Signpost gives (`destinations.json`). */
const DESTINATION_OF_ELEMENT: Record<string, string> = {
  tide: 'the Tidepools',
  ember: 'the Ember Caves',
  grove: 'Verdant Hollow',
  spark: 'Storm Ridge',
  mire: 'the Sunken Fen',
};

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

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const upper = (text: string): string => text.toUpperCase();

/** "...and 13 more things": the button that closes the popup onto the valley's markers. */
export function moreLabel(n: number): string {
  if (n <= 0) return 'Into the valley';
  return `...and ${String(n)} more ${plural(n, 'thing', 'things')}`;
}

/** Names in a sentence: "A", "A and B", "A, B and C", then "A, B and 2 more" (`total` names in all). */
export function nameList(names: readonly string[], total = names.length): string {
  const shown = names.slice(0, MAX_ACTORS);
  const more = total - shown.length;
  if (shown.length === 0) return '';
  if (more > 0) return `${shown.join(', ')} and ${String(more)} more`;
  if (shown.length === 1) return shown[0] ?? '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1] ?? ''}`;
}

/** The name of a creature line ("splashet" is Splashet); a line the content does not know is "a new creature". */
export function lineName(line: string): string {
  const first = content.creatures.find((c) => c.line === line && c.stage === 1);
  if (first !== undefined) return speciesName(first.id);
  return /^new line \d+/.test(line) ? 'a new creature' : line;
}

/** The first species of a line (for the sprite), else null. */
export function lineSpecies(line: string): string | null {
  return content.creatures.find((c) => c.line === line && c.stage === 1)?.id ?? null;
}

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
 * staged at the Paddock (where the resting creatures are) and the School's news at the House.
 */
export function placeOfLevelUp(place: string): PlaceId {
  if ((PLACES as readonly { id: string }[]).some((p) => p.id === place)) return place as PlaceId;
  return 'paddock';
}

// --- Who is who ---

/** Who plays which part: cast slots for the scouts, the smiths and the creatures that rest. */
export interface Crew {
  scouts: [number, number];
  smiths: [number, number];
  resting: number[];
}

/**
 * The scouts come first, then two smiths, and the rest rest by the fire; cast order decides, except that creatures
 * of the species `avoid` (a newcomer's: two alike in one picture read as one) come last.
 */
export function assignCast(cast: readonly CastMember[], avoid: string | null): Crew {
  const slots = cast.map((_, i) => i);
  // Creatures like the newcomer go last, so they rest and are not in a picture beside it.
  const order = [
    ...slots.filter((i) => cast[i]?.species !== avoid),
    ...slots.filter((i) => cast[i]?.species === avoid),
  ];
  const [s0, s1, m0, m1, ...resting] = order;
  return {
    scouts: [s0 ?? 0, s1 ?? s0 ?? 0],
    smiths: [m0 ?? s0 ?? 0, m1 ?? m0 ?? s0 ?? 0],
    resting,
  };
}

/** The species of a visit's newcomer (a new line), to keep the cast unlike it; null when there is none. */
export function findSpecies(visit: Visit): string | null {
  const first = eventsOf(visit).find((e) => e.kind === 'new-line');
  return first?.kind === 'new-line' ? lineSpecies(first.line) : null;
}

// --- The stories of a visit ---

type Of<K extends JourneyEvent['kind']> = Extract<JourneyEvent, { kind: K }>;
const ofKind = <K extends JourneyEvent['kind']>(events: JourneyEvent[], kind: K): Of<K>[] =>
  events.filter((e): e is Of<K> => e.kind === kind);

const STEP_RANK: Record<string, number> = { Apprentice: 1, Expert: 2, Master: 3 };

/** How notable each story is. Within a kind the highest is the highlight. */
const WEIGHT = {
  // Pieces
  epicReroll: 95,
  rareReroll: 80,
  reroll: 60,
  fitted: 50,
  found: 40,
  // Creatures
  newLine: 100,
  master: 90,
  graduation: 80,
  expert: 70,
  learning: 55,
  apprentice: 40,
  lesson: 35,
  newcomersHome: 30,
  scoutsHome: 20,
  moment: 10,
  // The valley
  placeLevel: 85,
  blueprint: 60,
  visitor: 50,
} as const;

/** The small moments of a resting creature (V-BON-9): the day's, in turn. Never counted as a thing. */
const MOMENTS: readonly ((n: string) => string)[] = [
  (n) => `${n} fell asleep on the log bench`,
  (n) => `${n} is warming its paws by the fire`,
  (n) => `${n} chased a spark round the fire`,
  (n) => `${n} yawned and stretched`,
];

interface Ctx {
  visit: Visit;
  cast: Cast;
  crew: Crew;
  name: (slot: number) => string;
}

const cast0 = (slot: number): Who => ({ kind: 'cast', slot });

/** A line cut to `max` characters (a lab line the prototype does not know can be long). */
const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const isPart = (id: string): id is PartKind => (PART_KINDS as readonly string[]).includes(id);

/**
 * Up to `n` different pieces of the sample bag, starting from the day's turn so every visit shows others. With
 * a `rarity`, the pieces of that rarity come first (the story says "epic": the piece shown is one).
 */
export function piecesFor(
  pieces: readonly PieceMember[],
  day: number,
  n: number,
  rarity?: string,
): PieceMember[] {
  const matching = rarity === undefined ? [] : pieces.filter((p) => p.rarity === rarity);
  const pool = matching.length > 0 ? matching : pieces;
  const count = Math.min(n, pool.length);
  return Array.from({ length: count }, (_, i) => pool[(day + i) % pool.length]).filter(
    (p): p is PieceMember => p !== undefined,
  );
}

/** The stories of a visit, every one with its picture, words and finds. */
function storiesOf(c: Ctx): Story[] {
  const { visit } = c;
  const events = eventsOf(visit);
  const home = visit.cameHome;
  const out: Story[] = [];
  const scout = c.crew.scouts[0];
  const smith = c.crew.smiths[0];
  const itemFinds = (pieces: PieceMember[]): Find[] =>
    pieces.map((piece) => ({ kind: 'item', piece }));

  // -- Creatures: newcomers
  const newLines = ofKind(events, 'new-line');
  const species = newLines.map((l) => lineSpecies(l.line));
  const known = species.filter((s): s is string => s !== null);
  const [onlyLine] = newLines;
  if (newLines.length === 1 && onlyLine !== undefined) {
    const name = lineName(onlyLine.line);
    const sp = species[0] ?? null;
    out.push({
      id: 'new-line',
      kind: 'creature',
      weight: WEIGHT.newLine,
      place: 'paddock',
      count: 1,
      headline: sp === null ? 'A NEWCOMER ARRIVES' : upper(`${name} moves in`),
      blurb: '',
      scene: {
        place: 'paddock',
        actors: [
          sp === null
            ? { who: cast0(scout), dx: 0, dy: 8 }
            : { who: { kind: 'species', species: sp }, dx: 8, dy: 8 },
          { who: cast0(scout), dx: -26, dy: 6 },
        ],
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 22, dy: -26, big: true }],
      },
      finds: sp === null ? [] : [{ kind: 'newcomer', species: sp }],
      glyph: 'paw',
      species: sp ?? undefined,
    });
  } else if (newLines.length > 1) {
    const names = newLines.map((l) => lineName(l.line));
    out.push({
      id: 'new-lines',
      kind: 'creature',
      weight: WEIGHT.newLine - 5,
      place: 'paddock',
      count: newLines.length,
      headline: upper(`${String(newLines.length)} newcomers arrive`),
      blurb: clip(nameList(names, newLines.length), MAX_BLURB),
      scene: {
        place: 'paddock',
        actors: known.slice(0, MAX_ACTORS).map((sp, i, all) => ({
          who: { kind: 'species', species: sp },
          dx: (i - (all.length - 1) / 2) * 24,
          dy: 8,
        })),
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 0, dy: -30, big: true }],
      },
      finds: [],
      glyph: 'paw',
      species: known[0],
    });
  }

  // -- Creatures: graduations, naming the creatures that rest (the House stands in for the School)
  const grads = ofKind(events, 'graduation');
  if (grads.length > 0) {
    const count = grads.reduce((sum, g) => sum + g.count, 0);
    const honour = grads[grads.length - 1]?.honour ?? 'Bronze';
    const slots = c.crew.resting.slice(0, Math.min(count, MAX_ACTORS));
    const names = slots.map((s) => c.name(s));
    const single = count === 1 && names.length === 1;
    out.push({
      id: 'graduation',
      kind: 'creature',
      weight: WEIGHT.graduation,
      place: 'house',
      count,
      headline: single
        ? upper(`${names[0] ?? ''} graduates with ${honour}`)
        : upper(`${String(count)} graduate with ${honour}`),
      blurb: single || names.length === 0 ? '' : clip(nameList(names, count), MAX_BLURB),
      scene: {
        place: 'house',
        actors: slots.map((s, i, all) => ({
          who: cast0(s),
          dx: (i - (all.length - 1) / 2) * 24,
          dy: 8,
        })),
        props: slots.map((_, i, all) => ({
          prop: { kind: 'glyph', id: 'sparkle' },
          dx: (i - (all.length - 1) / 2) * 24,
          dy: -22,
        })),
      },
      finds: [],
      glyph: 'home',
      species: undefined,
    });
  }

  // -- Creatures: mastery, each post's highest step (Apprentice is plain news, Expert and Master are finds)
  for (const post of ['scout', 'anvil'] as const) {
    const best = new Map<number, number>();
    for (const m of ofKind(events, 'mastery').filter((e) => e.post === post)) {
      best.set(m.seat, Math.max(best.get(m.seat) ?? 0, STEP_RANK[m.step] ?? 0));
    }
    if (best.size === 0) continue;
    const topStep = Math.max(...best.values());
    const step = Object.keys(STEP_RANK).find((s) => STEP_RANK[s] === topStep) ?? 'Apprentice';
    const pair = post === 'scout' ? c.crew.scouts : c.crew.smiths;
    const job = post === 'scout' ? 'Scout' : 'Smith';
    const place: PlaceId = post === 'scout' ? 'signpost' : 'forge';
    const seats = [...best.entries()].filter(([, v]) => v === topStep).map(([seat]) => seat);
    const slots = seats
      .map((seat) => pair[(seat - 1) % 2] ?? 0)
      .filter((slot, i, all) => all.indexOf(slot) === i);
    const names = slots.map((s) => c.name(s));
    const one = slots.length === 1;
    const weight =
      step === 'Master' ? WEIGHT.master : step === 'Expert' ? WEIGHT.expert : WEIGHT.apprentice;
    out.push({
      id: `mastery-${post}`,
      kind: 'creature',
      weight,
      place,
      count: best.size,
      headline: upper(
        one
          ? `${names[0] ?? ''} becomes ${article(step)} ${step} ${job}`
          : `${String(slots.length)} become ${step} ${job}s`,
      ),
      blurb: one ? '' : clip(nameList(names, slots.length), MAX_BLURB),
      scene: {
        place,
        actors: slots.slice(0, MAX_ACTORS).map((s, i, all) => ({
          who: cast0(s),
          dx: (i - (all.length - 1) / 2) * 24,
          dy: 8,
        })),
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 0, dy: -30, big: true }],
      },
      finds: [],
      glyph: place === 'forge' ? 'anvil' : 'compass',
      species: undefined,
    });
  }

  // -- Creatures: the School's news (the House stands in for it)
  const learner =
    c.crew.resting[visit.day % Math.max(1, c.crew.resting.length)] ?? c.crew.scouts[1];
  const learning = ofKind(events, 'school-learning')[0];
  const lesson = ofKind(events, 'school-teacher')[0];
  if (learning !== undefined) {
    out.push({
      id: 'learning',
      kind: 'creature',
      weight: WEIGHT.learning,
      place: 'house',
      count: 1,
      headline: upper(`${c.name(learner)} learns a talent`),
      blurb: 'Ready in a few hours.',
      scene: {
        place: 'house',
        actors: [{ who: cast0(learner), dx: 0, dy: 8 }],
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 14, dy: -26, big: true }],
      },
      finds: [],
      glyph: 'home',
      species: undefined,
    });
  } else if (lesson !== undefined) {
    out.push({
      id: 'lesson',
      kind: 'creature',
      weight: WEIGHT.lesson,
      place: 'house',
      count: 1,
      headline: upper(`A teacher visits ${c.name(learner)}`),
      blurb: '',
      scene: {
        place: 'house',
        actors: [{ who: cast0(learner), dx: 0, dy: 8 }],
        props: [],
      },
      finds: [],
      glyph: 'home',
      species: undefined,
    });
  }

  // -- Creatures: who came home, and the scouts' return
  const others = home.creatures.filter((x) => !x.newLine);
  const homeCount = others.reduce((sum, x) => sum + Math.round(x.count), 0);
  const [firstOther] = others;
  if (firstOther !== undefined && homeCount > 0) {
    const sp = others
      .map((x) => lineSpecies(x.line))
      .filter((s): s is string => s !== null)
      .slice(0, MAX_ACTORS);
    const names = others.map((x) => lineName(x.line));
    const what =
      others.length === 1
        ? homeCount === 1
          ? `${article(names[0] ?? '')} ${names[0] ?? ''}`
          : `${String(homeCount)} ${names[0] ?? ''}s`
        : nameList(names);
    out.push({
      id: 'creatures-home',
      kind: 'creature',
      weight: WEIGHT.newcomersHome,
      place: 'paddock',
      count: homeCount,
      headline: upper(`${c.name(scout)} brings friends home`),
      blurb: clip(
        `${what.charAt(0).toUpperCase()}${what.slice(1)}, from ${scoutsDestination(visit)}.`,
        MAX_BLURB,
      ),
      scene: {
        place: 'paddock',
        actors: [
          { who: cast0(scout), dx: -26, dy: 6 },
          ...sp.map((s, i, all): Actor => ({
            who: { kind: 'species', species: s },
            dx: 4 + (i - (all.length - 1) / 2) * 22,
            dy: 8,
          })),
        ],
        props: [],
      },
      finds: [],
      glyph: 'paw',
      species: sp[0],
    });
  }
  const scrap = Math.round(home.scrap);
  const parts: { part: PartKind; amount: number }[] = [
    ...(scrap > 0 ? [{ part: 'scrap' as const, amount: scrap }] : []),
    ...Object.entries(home.shards)
      .map(([element, amount]) => ({ id: `${element}-shard`, amount: Math.round(amount) }))
      .flatMap((p) => (isPart(p.id) && p.amount > 0 ? [{ part: p.id, amount: p.amount }] : [])),
  ];
  if (home.acorns > 0 || parts.length > 0) {
    out.push({
      id: 'scouts-home',
      kind: 'creature',
      weight: WEIGHT.scoutsHome,
      place: 'signpost',
      count: 1,
      headline: upper(`${c.name(scout)} back from ${scoutsDestination(visit)}`),
      blurb: '',
      scene: {
        place: 'signpost',
        actors: [{ who: cast0(scout), dx: 0, dy: 8 }],
        props: [{ prop: { kind: 'sack' }, dx: 18, dy: -4 }],
      },
      finds: parts.length === 0 ? [] : [{ kind: 'parts', parts }],
      glyph: 'compass',
      species: undefined,
    });
  }
  // A resting creature's small moment: every visit has a small smile. It is never counted as a thing.
  const moment = MOMENTS[visit.day % MOMENTS.length] ?? MOMENTS[0];
  const rester =
    c.crew.resting[(visit.day + 1) % Math.max(1, c.crew.resting.length)] ?? c.crew.scouts[1];
  if (moment !== undefined) {
    out.push({
      id: 'moment',
      kind: 'creature',
      weight: WEIGHT.moment,
      place: 'paddock',
      count: 0,
      headline: upper(moment(c.name(rester))),
      blurb: '',
      scene: { place: 'paddock', actors: [{ who: cast0(rester), dx: 0, dy: 8 }], props: [] },
      finds: [],
      glyph: 'paw',
      species: undefined,
    });
  }

  // -- Pieces: the visitor's reroll, what the smith fitted, what the scouts found
  const rarityRank = (rarity: string): number => ['common', 'rare', 'epic'].indexOf(rarity);
  const epic = ofKind(events, 'visitor-reroll').sort(
    (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.itemLevel - a.itemLevel,
  )[0];
  if (epic !== undefined) {
    const rarity = epic.rarity;
    const weight =
      rarity === 'epic' ? WEIGHT.epicReroll : rarity === 'rare' ? WEIGHT.rareReroll : WEIGHT.reroll;
    out.push({
      id: 'reroll',
      kind: 'piece',
      weight,
      place: 'fair',
      count: 1,
      headline: 'VISITOR REMAKES A PIECE',
      blurb: '',
      scene: {
        place: 'fair',
        actors: [{ who: cast0(smith), dx: -6, dy: 8 }],
        props: [],
      },
      finds: itemFinds(piecesFor(c.cast.pieces, visit.day, 1, rarity)),
      glyph: 'trophy',
      species: undefined,
    });
  }
  const made = Math.round(home.pieces.worn) + Math.round(home.pieces.bagged);
  if (made > 0) {
    const shown = piecesFor(c.cast.pieces, visit.day, Math.min(made, MAX_PIECES));
    out.push({
      id: 'fitted',
      kind: 'piece',
      weight: WEIGHT.fitted,
      place: 'forge',
      count: made,
      headline: upper(`${c.name(smith)} at the forge`),
      blurb: made > shown.length ? `${String(made)} new pieces in all.` : '',
      scene: {
        place: 'forge',
        actors: [{ who: cast0(smith), dx: -6, dy: 8 }],
        props: [],
      },
      finds: itemFinds(shown),
      glyph: 'anvil',
      species: undefined,
    });
  }
  const found = Math.round(home.pieces.collected);
  if (found > 0) {
    const shown = piecesFor(c.cast.pieces, visit.day + 1, Math.min(found, MAX_PIECES));
    out.push({
      id: 'found',
      kind: 'piece',
      weight: WEIGHT.found,
      place: 'signpost',
      count: found,
      headline: upper(`${c.name(scout)} finds gear`),
      blurb: found > shown.length ? `${String(found)} pieces in all.` : '',
      scene: {
        place: 'signpost',
        actors: [{ who: cast0(scout), dx: -6, dy: 8 }],
        props: [],
      },
      finds: itemFinds(shown),
      glyph: 'compass',
      species: undefined,
    });
  }

  // -- The valley: a place grew, the visitor came
  const ups = ofKind(events, 'place-level');
  const top = [...ups].sort((a, b) => b.level - a.level)[0];
  if (top !== undefined) {
    const place = placeOfLevelUp(top.place);
    const words = PLACE_WORDS[top.place] ?? 'A place';
    out.push({
      id: 'place-level',
      kind: 'server',
      weight: WEIGHT.placeLevel,
      place,
      count: ups.length,
      headline:
        ups.length === 1
          ? upper(`${words} grows to level ${String(top.level)}`)
          : upper(`${String(ups.length)} places of the valley grow`),
      blurb: ups.length === 1 ? '' : `The biggest reached level ${String(top.level)}.`,
      scene: {
        place,
        actors: [
          { who: cast0(c.crew.resting[0] ?? c.crew.scouts[1]), dx: -26, dy: 8 },
          { who: cast0(c.crew.resting[1] ?? c.crew.smiths[1]), dx: 26, dy: 8, flip: true },
        ],
        props: [
          { prop: { kind: 'glyph', id: 'sparkle' }, dx: -4, dy: -36, big: true },
          { prop: { kind: 'glyph', id: 'sparkle' }, dx: 26, dy: -26 },
        ],
      },
      finds: [],
      glyph: placeOf(place).glyph,
      species: undefined,
    });
  }
  const blueprint = ofKind(events, 'visitor-blueprint')[0];
  const arrives = ofKind(events, 'visitor-arrives')[0];
  if (blueprint !== undefined || arrives !== undefined) {
    const sold = blueprint?.isNew === true;
    const sample = c.cast.blueprints[visit.day % Math.max(1, c.cast.blueprints.length)];
    out.push({
      id: 'visitor',
      kind: 'server',
      weight: sold ? WEIGHT.blueprint : WEIGHT.visitor,
      place: 'fair',
      count: (blueprint === undefined ? 0 : 1) + (arrives === undefined ? 0 : 1),
      headline: sold ? 'VISITOR SELLS A BLUEPRINT' : 'A VISITOR ARRIVES',
      blurb: sold ? '' : 'He stays until the raid.',
      scene: {
        place: 'fair',
        actors: [{ who: cast0(c.crew.resting[0] ?? c.crew.scouts[1]), dx: -14, dy: 8 }],
        props: [{ prop: { kind: 'glyph', id: 'gift' }, dx: 22, dy: -2, big: true }],
      },
      finds: sold && sample !== undefined ? [{ kind: 'blueprint', baseId: sample }] : [],
      glyph: 'trophy',
      species: undefined,
    });
  }

  // What the lab wrote that the prototype does not know yet: a plain story, never dropped silently.
  for (const e of ofKind(events, 'plain')) {
    out.push({
      id: `plain-${e.text}`,
      kind: 'server',
      weight: 5,
      place: 'paddock',
      count: 1,
      headline: upper(clip(e.text, MAX_HEADLINE)),
      blurb: clip(e.text, MAX_BLURB),
      scene: { place: 'paddock', actors: [], props: [] },
      finds: [],
      glyph: 'paw',
      species: undefined,
    });
  }
  return out;
}

// --- Picking ---

/** The fewest highlights a popup tells when it can. */
export const MIN_HIGHLIGHTS = 2;

/**
 * The best story of each kind, the biggest first, at most `MAX_HIGHLIGHTS`. When only one kind has anything
 * (a quiet day) the next best story of any kind joins it, so the popup is never one line.
 */
export function pickHighlights(stories: readonly Story[]): Story[] {
  const best = (['piece', 'creature', 'server'] as const)
    .map((kind) => stories.filter((s) => s.kind === kind).sort((a, b) => b.weight - a.weight)[0])
    .filter((s): s is Story => s !== undefined);
  const picked = best.sort((a, b) => b.weight - a.weight).slice(0, MAX_HIGHLIGHTS);
  if (picked.length < MIN_HIGHLIGHTS) {
    const next = [...stories]
      .filter((s) => !picked.includes(s))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MIN_HIGHLIGHTS - picked.length);
    return [...picked, ...next].sort((a, b) => b.weight - a.weight);
  }
  return picked;
}

/** The markers the rest leaves in the valley: one per place, with the number of things waiting there. */
export function markersOf(rest: readonly Story[]): Marker[] {
  const out: Marker[] = [];
  for (const story of rest) {
    if (story.count <= 0) continue;
    const marker = out.find((m) => m.place === story.place);
    if (marker === undefined) {
      out.push({
        place: story.place,
        count: story.count,
        glyph: placeOf(story.place).glyph,
        species: story.species,
      });
    } else {
      marker.count += story.count;
      marker.species ??= story.species;
    }
  }
  return out;
}

/** "Monday · week 2 · day 8". */
export function dateLine(visit: Visit): string {
  return `${visit.weekday} · week ${String(visit.week)} · day ${String(visit.day)}`;
}

/**
 * What the popup shows for a visit. `cast` names the creatures and pieces the stories use (the valley's own);
 * `gap` is the days since the last visit (`gapDays`): the popup shows after `WELCOME_AFTER_HOURS` away.
 */
export function welcomeFor(visit: Visit, cast: Cast, gap: number): Welcome {
  const crew = assignCast(cast.creatures, findSpecies(visit));
  const name = (slot: number): string =>
    cast.creatures[slot % Math.max(1, cast.creatures.length)]?.name ?? 'A creature';
  const stories = storiesOf({ visit, cast, crew, name });
  const highlights = pickHighlights(stories);
  const rest = stories.filter((s) => !highlights.includes(s));
  return {
    show: gap * 24 >= WELCOME_AFTER_HOURS,
    highlights,
    more: rest.reduce((sum, s) => sum + s.count, 0),
    markers: markersOf(rest),
    date: dateLine(visit),
  };
}

/** The welcome of visit `index` of a journey. */
export function welcomeOf(journey: Journey, index: number, cast: Cast): Welcome {
  const visit = journey.visits[index];
  if (visit === undefined) throw new Error(`the journey has no visit ${String(index)}`);
  return welcomeFor(visit, cast, gapDays(journey, index));
}
