/**
 * The welcome-back Gazette's stories (`docs/design/valley/systems/return.md`, V-RET-0), made from today's away
 * notice (`AwaySummary`: what the raid, the Valley Games and the daily gift paid, and the trips and jobs waiting) and
 * from what the client already holds about the real things. Pure: no DOM, no clock, no randomness.
 *
 * - **Finds are the real things.** The notice only counts pieces, blueprints and creatures, but each piece carries
 *   `createdAt`, each blueprint `learnedAt` and each creature `caughtAt`: those obtained inside the away window
 *   (`since` to `until`) are the visit's finds. They go under the story of the source whose count matches (the raid
 *   paid 1 piece and exactly one new piece exists: it is the raid's). When that cannot be told (two sources paid
 *   pieces, or the counts differ), they are not guessed: they get a story of their own, "Found while you were away".
 *   Count badges stay for currencies, XP and medals.
 * - **Real actors or none.** A picture shows who really did it where the client knows: the raid party, the creatures
 *   entered in today's Games, the explorers home from a trip, the creatures whose job is done, a newcomer itself.
 *   Otherwise it shows the place alone. Never a stand-in.
 */
import type { AwaySource, AwaySummary, Creature } from '../../api';
import { speciesName } from '../../game';
import type { GamesView } from '../../games-types';
import type { GearItem, GearRarity } from '../../gear-types';
import { creatureName } from '../../game';
import type { RaidGlance } from '../../home-view';
import type { CountItem } from '../../ui/CountBadge';
import { baitCount, essenceCount } from '../../count-items';
import { fairEntries } from '../place-cast';
import { trayBadge, type TrayInput } from '../tray-state';
import type { PlaceId } from '../valley-art';

/** At most this many stories on the paper: the headline story and two small ones. */
export const MAX_STORIES = 3;
/** Most creatures standing in one picture. */
export const MAX_ACTORS = 3;

/** A creature the pictures can show: its name, species (the sprite) and level (its popover). */
export interface CastMember {
  name: string;
  species: string;
  shiny: boolean;
  level: number;
}

/** Where a creature stands: valley pixels from the place's door (`dy` is its feet). */
export interface Actor {
  member: CastMember;
  dx: number;
  dy: number;
  flip?: boolean;
}

/** A picture: a place of the valley and the creatures that really were there (none when the client does not know). */
export interface Scene {
  place: PlaceId;
  actors: Actor[];
}

/** A real thing a story found, shown as itself: a piece or a blueprint (they open their cards) or a newcomer (its face). */
export type Find =
  | { kind: 'item'; id: string; baseId: string; rarity: GearRarity; level: number }
  | { kind: 'blueprint'; baseId: string }
  | { kind: 'newcomer'; id: string; species: string; shiny: boolean };

export type StoryKind = 'raid' | 'games' | 'leet' | 'trips' | 'jobs' | 'found';

export interface Story {
  id: StoryKind;
  /** How notable it is: the highest is the headline story. */
  weight: number;
  /** The headline, a few words in capitals. */
  headline: string;
  /** At most one short line, empty when the finds say it. */
  blurb: string;
  /** The real things it found. */
  finds: Find[];
  /** Currencies, XP and medals, as the game's count badges. */
  badges: CountItem[];
  scene: Scene;
  /** How many things it stands for in "...and N more things". */
  count: number;
}

export interface GazettePlan {
  /** The paper's stories, the biggest first (at most `MAX_STORIES`). */
  stories: Story[];
  /** The things not told, as "...and N more things". */
  more: number;
}

/** What the client holds that the stories read (no request of their own). */
export interface AwayWorld {
  creatures: readonly Creature[];
  /** The bag, or null before the gear view has loaded. */
  items: readonly GearItem[] | null;
  /** The learned blueprints, or null before the gear view has loaded. */
  blueprints: readonly { baseId: string; learnedAt: number }[] | null;
  /** The trips and jobs, for who is home from a trip or done with a job. */
  tray: TrayInput;
  games: GamesView | null;
  raid: RaidGlance | null;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const num = (n: number): string => String(n);

/** "...and 13 more things": the button that closes the paper onto the valley. */
export function moreLabel(n: number): string {
  if (n <= 0) return 'Into the valley';
  return `...and ${num(n)} more ${plural(n, 'thing', 'things')}`;
}

/** The weekday and date in the guild's timezone ("Wednesday 4 November"); UTC when the timezone is not known yet. */
export function gazetteDate(now: number, timezone: string | null): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone ?? 'UTC',
  }).format(new Date(now));
}

// --- What was found while away ---

/** What was obtained inside the away window, newest first. */
export interface Found {
  /** Pieces and blueprints. */
  things: Find[];
  newcomers: Find[];
}

const inWindow = (at: number, away: AwaySummary): boolean => at >= away.since && at <= away.until;

/** The pieces and blueprints (`createdAt`, `learnedAt`) and creatures (`caughtAt`) obtained from `since` to `until`. */
export function foundWhileAway(away: AwaySummary, world: AwayWorld): Found {
  const pieces = (world.items ?? [])
    .filter((i) => inWindow(i.createdAt, away))
    .map((i) => ({ at: i.createdAt, id: i.id, find: itemFind(i) }));
  const blueprints = (world.blueprints ?? [])
    .filter((b) => inWindow(b.learnedAt, away))
    .map((b) => ({
      at: b.learnedAt,
      id: b.baseId,
      find: { kind: 'blueprint', baseId: b.baseId } satisfies Find,
    }));
  const things = [...pieces, ...blueprints]
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id, 'en'))
    .map((t) => t.find);
  const newcomers = world.creatures
    .filter((c) => inWindow(c.caughtAt, away))
    .sort((a, b) => b.caughtAt - a.caughtAt || a.id.localeCompare(b.id, 'en'))
    .map((c): Find => ({ kind: 'newcomer', id: c.id, species: c.species, shiny: c.shiny }));
  return { things, newcomers };
}

function itemFind(i: GearItem): Find {
  return { kind: 'item', id: i.id, baseId: i.baseId, rarity: i.rarity, level: i.itemLevel };
}

/**
 * Which source a kind of find belongs to: the one source that paid any of it, when the number found is exactly the
 * number it paid. Otherwise null: it is not guessed.
 */
function owner(
  sources: readonly AwaySource[],
  paid: (s: AwaySource) => number,
  found: number,
): AwaySource | null {
  const paying = sources.filter((s) => paid(s) > 0);
  const only = paying[0];
  return paying.length === 1 && only !== undefined && paid(only) === found ? only : null;
}

/** The finds split by source (those whose source can be told) and the rest. */
export function attribute(
  sources: readonly AwaySource[],
  found: Found,
): { by: Map<AwaySource['kind'], Found>; rest: Found } {
  const by = new Map<AwaySource['kind'], Found>();
  const rest: Found = { things: [], newcomers: [] };
  const things = owner(sources, (s) => s.items, found.things.length);
  const newcomers = owner(sources, (s) => s.creatures, found.newcomers.length);
  const mine = (source: AwaySource): Found => {
    const have = by.get(source.kind) ?? { things: [], newcomers: [] };
    by.set(source.kind, have);
    return have;
  };
  if (things === null) rest.things = found.things;
  else mine(things).things = found.things;
  if (newcomers === null) rest.newcomers = found.newcomers;
  else mine(newcomers).newcomers = found.newcomers;
  return { by, rest };
}

// --- Pictures ---

/** Feet and gap: each creature stands a sprite's width and more apart; lower feet are drawn in front. */
const STANDS: readonly { dx: number; dy: number; flip: boolean }[] = [
  { dx: -22, dy: 12, flip: false },
  { dx: 22, dy: 14, flip: true },
  { dx: 0, dy: 20, flip: false },
];

const memberOf = (c: Creature): CastMember => ({
  name: creatureName(c),
  species: c.species,
  shiny: c.shiny,
  level: c.level,
});

/** The creatures of a picture: the first few of `who`, standing at the door, back to front by their feet. */
export function sceneOf(place: PlaceId, who: readonly CastMember[]): Scene {
  const actors: Actor[] = [];
  for (let i = 0; i < Math.min(MAX_ACTORS, who.length); i += 1) {
    const at = STANDS[i];
    const member = who[i];
    if (at === undefined || member === undefined) continue;
    actors.push({ member, dx: at.dx, dy: at.dy, ...(at.flip ? { flip: true } : {}) });
  }
  return { place, actors: actors.sort((a, b) => a.dy - b.dy || a.dx - b.dx) };
}

const byIds = (creatures: readonly Creature[], ids: readonly string[]): Creature[] =>
  ids.flatMap((id) => creatures.find((c) => c.id === id) ?? []);

/** The raid party the player placed this week, when the raid view has it. */
function raidParty(world: AwayWorld): CastMember[] {
  return byIds(world.creatures, world.raid?.scene?.party ?? []).map(memberOf);
}

/** The creatures entered in today's Games, in the lineup's order. */
function gamesEntered(world: AwayWorld): CastMember[] {
  return fairEntries(world.games, world.creatures)
    .flatMap((g) => g.creatures)
    .map(memberOf);
}

/** The creatures home from a trip with loot (`trips`) or done with a job at the Forge (`jobs`). */
function waitingCreatures(world: AwayWorld, state: 'loot' | 'ready'): CastMember[] {
  return world.creatures.filter((c) => trayBadge(c, world.tray).state === state).map(memberOf);
}

const newcomerMembers = (world: AwayWorld, finds: readonly Find[]): CastMember[] =>
  finds.flatMap((f) => {
    const c = f.kind === 'newcomer' ? world.creatures.find((x) => x.id === f.id) : undefined;
    return c === undefined ? [] : [memberOf(c)];
  });

// --- Words ---

/** "SQUELCH" for one newcomer, "2 NEWCOMERS" for several; null when none are known (the headline is then generic). */
function newcomerWords(newcomers: readonly Find[]): string | null {
  const first = newcomers[0];
  if (first === undefined || first.kind !== 'newcomer') return null;
  return newcomers.length === 1
    ? speciesName(first.species).toUpperCase()
    : `${num(newcomers.length)} NEWCOMERS`;
}

function badgesOf(source: AwaySource): CountItem[] {
  const plain = (key: string, glyph: string, amount: number, label: string): CountItem => ({
    key,
    icon: { kind: 'glyph', id: glyph },
    amount,
    label,
    name: label,
  });
  return [
    ...(source.bait > 0 ? [baitCount(source.bait)] : []),
    ...(source.essence > 0 ? [essenceCount(source.essence)] : []),
    ...(source.medals > 0 ? [plain('medals', 'trophy', source.medals, 'Medals')] : []),
    ...(source.xp > 0 ? [plain('xp', 'sparkle', source.xp, 'XP')] : []),
  ];
}

/** How notable a source's payout is: a newcomer, then pieces, then medals; coins and XP last. */
function weightOf(source: AwaySource): number {
  if (source.creatures > 0) return 100 + Math.min(source.creatures, 9);
  if (source.items > 0) return 80 + Math.min(source.items, 9);
  if (source.medals > 0) return 60 + Math.min(source.medals, 9);
  return 20 + Math.min(Math.floor((source.bait + source.essence) / 20), 20);
}

function sourceStory(
  source: AwaySource,
  found: Found,
  world: AwayWorld,
): (Omit<Story, 'scene'> & { place: PlaceId; who: CastMember[] }) | null {
  const finds = [...found.newcomers, ...found.things];
  const badges = badgesOf(source);
  // A source that paid only what could not be shown (pieces nobody can name) still tells its story, plainly.
  const paidThings = source.items + source.creatures > 0;
  if (finds.length === 0 && badges.length === 0 && !paidThings) return null;
  const words = newcomerWords(found.newcomers);
  const base = {
    weight: weightOf(source),
    blurb: '',
    finds,
    badges,
    count: Math.max(1, source.items + source.creatures + source.medals),
  };
  switch (source.kind) {
    case 'raid':
      return {
        ...base,
        id: 'raid',
        place: 'arena',
        who: raidParty(world),
        headline:
          source.creatures > 0
            ? `${words ?? 'A NEWCOMER'} CAME FROM THE RAID`
            : 'THE RAID PAID OUT',
      };
    case 'games':
      return {
        ...base,
        id: 'games',
        place: 'fair',
        who: gamesEntered(world),
        headline:
          source.creatures > 0
            ? `${words ?? 'A NEWCOMER'} CAME FROM THE FAIR`
            : 'PRIZES FROM THE FAIR',
      };
    case 'leet':
      // The daily gift is the quietest news: it never leads over a find.
      return {
        ...base,
        id: 'leet',
        place: 'house',
        who: [],
        weight: base.weight - 10,
        headline: 'A DAILY GIFT CAME IN',
      };
  }
}

/** What the away notice tells, as stories. */
export function gazetteOf(away: AwaySummary, world: AwayWorld): GazettePlan {
  const { by, rest } = attribute(away.sources, foundWhileAway(away, world));
  const all: Story[] = [];
  for (const source of away.sources) {
    const made = sourceStory(source, by.get(source.kind) ?? { things: [], newcomers: [] }, world);
    if (made === null) continue;
    const { place, who, ...story } = made;
    all.push({ ...story, scene: sceneOf(place, who) });
  }
  const loose = [...rest.newcomers, ...rest.things];
  if (loose.length > 0) {
    // Found, but not told by which source: a story of its own, never a guess.
    const onlyNewcomers = rest.things.length === 0;
    const words = newcomerWords(rest.newcomers);
    all.push({
      id: 'found',
      weight: rest.newcomers.length > 0 ? 95 : 75,
      headline:
        onlyNewcomers && words !== null
          ? `${words} ${rest.newcomers.length === 1 ? 'MOVES' : 'MOVE'} IN`
          : 'FOUND WHILE YOU WERE AWAY',
      blurb: '',
      finds: loose,
      badges: [],
      scene: sceneOf(onlyNewcomers ? 'paddock' : 'house', newcomerMembers(world, rest.newcomers)),
      count: loose.length,
    });
  }
  if (away.tripsWaiting > 0) {
    all.push({
      id: 'trips',
      weight: 55,
      headline: `${num(away.tripsWaiting)} ${plural(away.tripsWaiting, 'TRIP IS', 'TRIPS ARE')} HOME`,
      blurb: 'They wait at the Signpost.',
      finds: [],
      badges: [],
      scene: sceneOf('signpost', waitingCreatures(world, 'loot')),
      count: away.tripsWaiting,
    });
  }
  if (away.jobsWaiting > 0) {
    all.push({
      id: 'jobs',
      weight: 50,
      headline: `${num(away.jobsWaiting)} ${plural(away.jobsWaiting, 'JOB IS', 'JOBS ARE')} DONE`,
      blurb: 'They wait at the Forge.',
      finds: [],
      badges: [],
      scene: sceneOf('forge', waitingCreatures(world, 'ready')),
      count: away.jobsWaiting,
    });
  }
  // Biggest first; equal weights keep the order they were made in.
  const ranked = all
    .map((story, i) => ({ story, i }))
    .sort((a, b) => b.story.weight - a.story.weight || a.i - b.i)
    .map((r) => r.story);
  return {
    stories: ranked.slice(0, MAX_STORIES),
    more: ranked.slice(MAX_STORIES).reduce((sum, s) => sum + s.count, 0),
  };
}

/** A currency the visit brought in, as a resource-library id and a whole amount. */
export interface HomeGain {
  resource: string;
  amount: number;
}

/** The currencies the away counts paid (summed over the sources), in the purse's order; empty when none. */
export function awayGains(away: AwaySummary): HomeGain[] {
  const bait = away.sources.reduce((sum, s) => sum + Math.max(0, s.bait), 0);
  const essence = away.sources.reduce((sum, s) => sum + Math.max(0, s.essence), 0);
  return [
    ...(bait > 0 ? [{ resource: 'bait', amount: bait }] : []),
    ...(essence > 0 ? [{ resource: 'essence', amount: essence }] : []),
  ];
}
