/**
 * The welcome-back popup's choices, as pure functions (prototype, dev only; `docs/design/valley/systems/return.md`,
 * V-RET-0): from one visit of a journey, the two or three highlights worth telling (the best piece made or
 * rerolled while away, the most notable creature moment, a moment of the valley itself: at most one of each
 * kind, the biggest first), what the rest comes to ("...and 13 more things") and where those wait as markers
 * in the valley. Every highlight carries what both presentations need: the comic panel (a scene, a caption, a
 * sound word, a speech bubble) and the gazette story (a headline and a few lines of news). The player is never
 * a figure in it: creatures act. No DOM, no clock, no randomness: the same visit and cast give the same story.
 */
import { content } from '@creatures/game';
import { speciesName } from '../../game';
import { PLACES, placeOf, type PlaceId } from '../valley/valley-art';
import { eventsOf, gapDays, type Journey, type JourneyEvent, type Visit } from './journey';

/** At most this many highlights, one per kind. */
export const MAX_HIGHLIGHTS = 3;
/** The popup shows after this many hours away (V-RET example: 3 hours). */
export const WELCOME_AFTER_HOURS = 3;
/** Most creatures in one picture. */
export const MAX_ACTORS = 3;

export type Kind = 'piece' | 'creature' | 'server';

/** A creature of the valley the story can name: its name and species (the sprite). */
export interface CastMember {
  name: string;
  species: string;
  shiny: boolean;
}

/** A piece of gear a story can show: its base id (the sprite) and name. */
export interface PieceMember {
  baseId: string;
  name: string;
}

export interface Cast {
  creatures: readonly CastMember[];
  pieces: readonly PieceMember[];
}

/** Who acts in a picture: a member of the cast (by its place in it) or a species (a newcomer). */
export type Who = { kind: 'cast'; slot: number } | { kind: 'species'; species: string };

/** Something in a picture besides creatures: a piece of gear, a glyph, the scouts' sack. */
export type Prop =
  { kind: 'item'; baseId: string } | { kind: 'glyph'; id: string } | { kind: 'sack' };

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

export interface Story {
  id: string;
  kind: Kind;
  /** How notable it is: the highest of its kind is the highlight. */
  weight: number;
  place: PlaceId;
  /** How many things of the valley it stands for in "N more things"; 0 for a flourish that is never counted. */
  count: number;
  /** The gazette's headline, capitals. */
  headline: string;
  /** The gazette's lines: news about creatures and the valley. */
  blurb: string;
  /** The comic's caption after its lead ("at the Forge..."), and the sound word. */
  where: string;
  sfx: string;
  /** What an actor says (an index into `scene.actors`). */
  speech: { by: number; text: string } | null;
  scene: Scene;
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
  /** Two or three, the biggest first (the gazette's headline first; the comic tells them last first). */
  highlights: Story[];
  /** The things not told, as "...and N more things". */
  more: number;
  markers: Marker[];
  /** "Monday · week 2 · day 8". */
  date: string;
}

// --- Words ---

const PLACE_AT: Record<PlaceId, string> = {
  cave: 'at the Cave',
  fair: 'at the Fairground',
  house: 'at the House',
  paddock: 'at the Paddock gate',
  forge: 'at the Forge',
  arena: 'at the Arena',
  signpost: 'at the Signpost',
};

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
const MOMENTS: readonly { text: (n: string) => string; sfx: string; speech: string }[] = [
  {
    text: (n) => `${n} fell asleep on the log bench`,
    sfx: 'ZZZ...',
    speech: 'Five more minutes...',
  },
  { text: (n) => `${n} is warming its paws by the fire`, sfx: 'CRACKLE', speech: 'So cosy!' },
  { text: (n) => `${n} chased a spark round the fire`, sfx: 'WHEE!', speech: 'Got you!' },
  { text: (n) => `${n} yawned and stretched`, sfx: 'YAAAWN', speech: 'What a day.' },
];

interface Ctx {
  visit: Visit;
  cast: Cast;
  crew: Crew;
  name: (slot: number) => string;
  /** The piece of gear in the day's pictures (the cast's, in turn), or null when the cast has none. */
  piece: PieceMember | null;
}

const cast0 = (slot: number): Who => ({ kind: 'cast', slot });

/** The stories of a visit, every one with its picture and words. */
function storiesOf(c: Ctx): Story[] {
  const { visit } = c;
  const events = eventsOf(visit);
  const home = visit.cameHome;
  const out: Story[] = [];
  const scout = c.crew.scouts[0];
  const smith = c.crew.smiths[0];
  const itemProp = (): Prop =>
    c.piece === null
      ? { kind: 'glyph', id: 'gear-piece' }
      : { kind: 'item', baseId: c.piece.baseId };
  const pieceName = c.piece?.name ?? 'piece';

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
      headline: sp === null ? 'A NEWCOMER ARRIVES' : upper(`${name} moves to the valley`),
      blurb: `${sp === null ? 'A new creature' : name} wandered up to the Paddock gate and decided to stay. ${c.name(scout)} showed it round.`,
      where: PLACE_AT.paddock,
      sfx: 'POP!',
      speech: { by: 0, text: 'Hello!' },
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
      blurb: `${nameList(names, newLines.length)} came to the Paddock gate this week, one after another. The valley is a little more crowded.`,
      where: PLACE_AT.paddock,
      sfx: 'POP! POP!',
      speech: { by: 0, text: 'Hello, everyone!' },
      scene: {
        place: 'paddock',
        actors: known.slice(0, MAX_ACTORS).map((sp, i, all) => ({
          who: { kind: 'species', species: sp },
          dx: (i - (all.length - 1) / 2) * 24,
          dy: 8,
        })),
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 0, dy: -30, big: true }],
      },
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
    const who =
      names.length === 0
        ? `${String(count)} ${plural(count, 'creature', 'creatures')}`
        : nameList(names, count);
    out.push({
      id: 'graduation',
      kind: 'creature',
      weight: WEIGHT.graduation,
      place: 'house',
      count,
      headline: upper(`${who} earn${count === 1 && names.length <= 1 ? 's' : ''} ${honour}`),
      blurb: `${who} finished their lessons with honours: ${honour}. There was cheering at the House.`,
      where: PLACE_AT.house,
      sfx: 'HOORAY!',
      speech: null,
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
          : `${nameList(names, slots.length)} become ${step} ${job}s`,
      ),
      blurb: one
        ? `After long hours ${post === 'scout' ? 'on the road' : 'at the anvil'}, ${names[0] ?? ''} is now ${article(step)} ${step} ${job}. The others took notice.`
        : `${nameList(names, slots.length)} have all reached ${step} at the ${post === 'scout' ? 'Signpost' : 'Forge'}.`,
      where: PLACE_AT[place],
      sfx: 'DING!',
      speech: { by: 0, text: step === 'Master' ? 'Ta-da!' : 'Look at me!' },
      scene: {
        place,
        actors: slots.slice(0, MAX_ACTORS).map((s, i, all) => ({
          who: cast0(s),
          dx: (i - (all.length - 1) / 2) * 24,
          dy: 8,
        })),
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 0, dy: -30, big: true }],
      },
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
      headline: upper(`${c.name(learner)} takes up a new talent`),
      blurb: `${c.name(learner)} sat down at the House and began learning a talent. It will take a few hours.`,
      where: PLACE_AT.house,
      sfx: 'HMM...',
      speech: { by: 0, text: 'Oh! I see!' },
      scene: {
        place: 'house',
        actors: [{ who: cast0(learner), dx: 0, dy: 8 }],
        props: [{ prop: { kind: 'glyph', id: 'sparkle' }, dx: 14, dy: -26, big: true }],
      },
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
      blurb: `A visiting teacher gave ${c.name(learner)} a lesson at the House.`,
      where: PLACE_AT.house,
      sfx: 'SCRIBBLE',
      speech: { by: 0, text: 'Thanks, teacher!' },
      scene: {
        place: 'house',
        actors: [{ who: cast0(learner), dx: 0, dy: 8 }],
        props: [],
      },
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
      headline: upper(`${c.name(scout)} brings ${what} home`),
      blurb: `${c.name(scout)} came back from ${scoutsDestination(visit)} with ${what} in tow.`,
      where: PLACE_AT.paddock,
      sfx: 'PLOP!',
      speech: { by: 0, text: 'Found some friends!' },
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
      glyph: 'paw',
      species: sp[0],
    });
  }
  if (home.acorns > 0 || home.scrap > 0 || Object.keys(home.shards).length > 0) {
    out.push({
      id: 'scouts-home',
      kind: 'creature',
      weight: WEIGHT.scoutsHome,
      place: 'signpost',
      count: 1,
      headline: upper(`${c.name(scout)} returns from ${scoutsDestination(visit)}`),
      blurb: `${c.name(scout)} trudged back down the road from ${scoutsDestination(visit)}, sack full.`,
      where: PLACE_AT.signpost,
      sfx: 'PHEW!',
      speech: { by: 0, text: "We're back!" },
      scene: {
        place: 'signpost',
        actors: [{ who: cast0(scout), dx: 0, dy: 8 }],
        props: [{ prop: { kind: 'sack' }, dx: 18, dy: -4 }],
      },
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
      headline: upper(moment.text(c.name(rester))),
      blurb: `${moment.text(c.name(rester))}. Nobody minded.`,
      where: PLACE_AT.paddock,
      sfx: moment.sfx,
      speech: { by: 0, text: moment.speech },
      scene: { place: 'paddock', actors: [{ who: cast0(rester), dx: 0, dy: 8 }], props: [] },
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
      headline: upper(`Visitor remakes ${article(rarity)} ${rarity} ${pieceName}`),
      blurb: `At his stall in the Fairground the visitor reworked ${c.name(smith)}'s ${rarity} ${pieceName}. New lines, new luck.`,
      where: PLACE_AT.fair,
      sfx: 'SHING!',
      speech: { by: 0, text: 'Ta-da!' },
      scene: {
        place: 'fair',
        actors: [{ who: cast0(smith), dx: -6, dy: 8 }],
        props: [{ prop: itemProp(), dx: 14, dy: -8, big: true }],
      },
      glyph: 'trophy',
      species: undefined,
    });
  }
  const made = Math.round(home.pieces.worn) + Math.round(home.pieces.bagged);
  if (made > 0) {
    out.push({
      id: 'fitted',
      kind: 'piece',
      weight: WEIGHT.fitted,
      place: 'forge',
      count: made,
      headline: upper(
        `${c.name(smith)} forges ${made === 1 ? `a new ${pieceName}` : `${String(made)} new pieces`}`,
      ),
      blurb: `${c.name(smith)} kept the Forge ringing: ${made === 1 ? `a new ${pieceName}` : `${String(made)} new pieces`} off the anvil.`,
      where: PLACE_AT.forge,
      sfx: 'CLANG!',
      speech: { by: 0, text: 'Ta-da!' },
      scene: {
        place: 'forge',
        actors: [{ who: cast0(smith), dx: -6, dy: 8 }],
        props: [{ prop: itemProp(), dx: 14, dy: -8, big: true }],
      },
      glyph: 'anvil',
      species: undefined,
    });
  }
  const found = Math.round(home.pieces.collected);
  if (found > 0) {
    out.push({
      id: 'found',
      kind: 'piece',
      weight: WEIGHT.found,
      place: 'signpost',
      count: found,
      headline: upper(
        `${c.name(scout)} finds ${found === 1 ? `a ${pieceName}` : `${String(found)} pieces`} on the road`,
      ),
      blurb: `${c.name(scout)} spotted ${found === 1 ? `a ${pieceName}` : `${String(found)} pieces`} half buried by the Signpost.`,
      where: PLACE_AT.signpost,
      sfx: 'CLINK!',
      speech: { by: 0, text: 'Look what I found!' },
      scene: {
        place: 'signpost',
        actors: [{ who: cast0(scout), dx: -6, dy: 8 }],
        props: [{ prop: itemProp(), dx: 14, dy: -8, big: true }],
      },
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
      blurb:
        ups.length === 1
          ? `${words} reached level ${String(top.level)}, thanks to everyone's gifts. It looks a little grander.`
          : `${String(ups.length)} places grew at once, the biggest to level ${String(top.level)}.`,
      where: top.place === 'bonfire' ? 'by the bonfire' : PLACE_AT[place],
      sfx: 'THUD!',
      speech: null,
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
      glyph: placeOf(place).glyph,
      species: undefined,
    });
  }
  const blueprint = ofKind(events, 'visitor-blueprint')[0];
  const arrives = ofKind(events, 'visitor-arrives')[0];
  if (blueprint !== undefined || arrives !== undefined) {
    const sold = blueprint?.isNew === true;
    out.push({
      id: 'visitor',
      kind: 'server',
      weight: sold ? WEIGHT.blueprint : WEIGHT.visitor,
      place: 'fair',
      count: (blueprint === undefined ? 0 : 1) + (arrives === undefined ? 0 : 1),
      headline: sold ? 'VISITOR SELLS A NEW BLUEPRINT' : 'A VISITOR ARRIVES IN THE VALLEY',
      blurb: sold
        ? 'The visitor set up his stall at the Fairground and sold a blueprint nobody had seen before.'
        : 'A traveller with a heavy pack set up a stall at the Fairground. He stays until the raid.',
      where: PLACE_AT.fair,
      sfx: sold ? 'CHING!' : 'KNOCK KNOCK',
      speech: { by: 0, text: sold ? 'A new blueprint!' : "Who's that?" },
      scene: {
        place: 'fair',
        actors: [{ who: cast0(c.crew.resting[0] ?? c.crew.scouts[1]), dx: -14, dy: 8 }],
        props: [{ prop: { kind: 'glyph', id: 'gift' }, dx: 22, dy: -2, big: true }],
      },
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
      headline: upper(e.text.slice(0, 40)),
      blurb: e.text,
      where: PLACE_AT.paddock,
      sfx: '!',
      speech: null,
      scene: { place: 'paddock', actors: [], props: [] },
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
  const piece =
    cast.pieces.length === 0 ? null : (cast.pieces[visit.day % cast.pieces.length] ?? null);
  const stories = storiesOf({ visit, cast, crew, name, piece });
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
