/**
 * The welcome-back Gazette's stories (`docs/design/valley/systems/return.md`, V-RET-0), made from what today's
 * away notice already counts (`AwaySummary`: what the raid, the Valley Games and the daily gift paid, and the trips
 * and jobs waiting to be claimed). One story per source that has something; the biggest first. The first
 * is the headline story, the next two are small ones, and what is left is "...and N more things", which closes onto
 * the valley where the bubbles wait at their places. Pure: no DOM, no clock, no randomness.
 *
 * The away data holds counts, not identities: it does not say which piece, which creature or which fight. So a
 * story shows its counts as the game's count badges and never names a piece, a newcomer or a defender; the
 * creatures in a picture are the roster's strongest, standing at the place, and nothing happens to them.
 */
import type { AwaySource, AwaySummary, Creature } from '../../api';
import type { CountItem } from '../../ui/CountBadge';
import { awayBadges } from '../../home/away-notice';
import type { PlaceId } from '../valley-art';

/** At most this many stories on the paper: the headline story and two small ones. */
export const MAX_STORIES = 3;
/** Most creatures standing in one picture. */
export const MAX_ACTORS = 3;

/** A creature of the roster the pictures can show: its name, species (the sprite) and level (its popover). */
export interface CastMember {
  name: string;
  species: string;
  shiny: boolean;
  level: number;
}

/** Where a creature stands: valley pixels from the place's door (`dy` is its feet). */
export interface Actor {
  /** Which member of the cast. */
  slot: number;
  dx: number;
  dy: number;
  flip?: boolean;
}

/** A picture: a place of the valley and the creatures standing at its door. */
export interface Scene {
  place: PlaceId;
  actors: Actor[];
}

export type StoryKind = 'raid' | 'games' | 'leet' | 'trips' | 'jobs';

export interface Story {
  id: StoryKind;
  /** How notable it is: the highest is the headline story. */
  weight: number;
  /** The headline, a few words in capitals. */
  headline: string;
  /** At most one short line, empty when the finds say it. */
  blurb: string;
  /** What it found, as the game's count badges. */
  finds: CountItem[];
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

/** The things (not currencies) a source paid: pieces and blueprints, creatures, medals. */
const thingsOf = (s: AwaySource): number => s.items + s.creatures + s.medals;

/** How notable a source's payout is: a newcomer, then pieces, then medals; coins and XP last. */
function weightOf(source: AwaySource): number {
  if (source.creatures > 0) return 100 + Math.min(source.creatures, 9);
  if (source.items > 0) return 80 + Math.min(source.items, 9);
  if (source.medals > 0) return 60 + Math.min(source.medals, 9);
  return 20 + Math.min(Math.floor((source.bait + source.essence) / 20), 20);
}

interface Made {
  place: PlaceId;
  story: Omit<Story, 'scene'>;
}

function sourceStory(source: AwaySource): Made | null {
  const finds = awayBadges(source);
  if (finds.length === 0) return null;
  const base = { weight: weightOf(source), blurb: '', finds, count: Math.max(1, thingsOf(source)) };
  switch (source.kind) {
    case 'raid':
      return {
        place: 'arena',
        story: {
          ...base,
          id: 'raid',
          headline: source.creatures > 0 ? 'A NEWCOMER CAME FROM THE RAID' : 'THE RAID PAID OUT',
        },
      };
    case 'games':
      return {
        place: 'fair',
        story: {
          ...base,
          id: 'games',
          headline: source.creatures > 0 ? 'A NEWCOMER FROM THE FAIR' : 'PRIZES FROM THE FAIR',
        },
      };
    case 'leet':
      // The daily gift is the quietest news: it never leads over a find.
      return {
        place: 'house',
        story: { ...base, id: 'leet', weight: base.weight - 10, headline: 'A DAILY GIFT CAME IN' },
      };
  }
}

/** Feet and gap: each creature stands a sprite's width and more apart; lower feet are drawn in front. */
const STANDS: readonly { dx: number; dy: number; flip: boolean }[] = [
  { dx: -22, dy: 12, flip: false },
  { dx: 22, dy: 14, flip: true },
  { dx: 0, dy: 20, flip: false },
];

/** The creatures of a picture: the first of the cast, standing at the door, back to front by their feet. */
export function sceneOf(place: PlaceId, cast: readonly CastMember[]): Scene {
  const n = Math.min(MAX_ACTORS, cast.length);
  const actors: Actor[] = [];
  for (let slot = 0; slot < n; slot += 1) {
    const at = STANDS[slot];
    if (at === undefined) continue;
    actors.push({ slot, dx: at.dx, dy: at.dy, ...(at.flip ? { flip: true } : {}) });
  }
  return { place, actors: actors.sort((a, b) => a.dy - b.dy || a.dx - b.dx) };
}

/** The roster's strongest creatures at home, for the pictures: by level, then name, then species (a fixed order). */
export function castOf(creatures: readonly Creature[]): CastMember[] {
  return creatures
    .filter((c) => !c.away)
    .map((c) => ({
      name: c.nickname ?? c.species,
      species: c.species,
      shiny: c.shiny,
      level: c.level,
    }))
    .sort(
      (a, b) =>
        b.level - a.level ||
        a.name.localeCompare(b.name, 'en') ||
        a.species.localeCompare(b.species, 'en'),
    )
    .slice(0, MAX_ACTORS);
}

/** What the away notice tells, as stories: one per source with something, plus trips home and jobs done. */
export function gazetteOf(away: AwaySummary, cast: readonly CastMember[]): GazettePlan {
  const all: Story[] = [];
  for (const source of away.sources) {
    const made = sourceStory(source);
    if (made !== null) all.push({ ...made.story, scene: sceneOf(made.place, cast) });
  }
  if (away.tripsWaiting > 0) {
    all.push({
      id: 'trips',
      weight: 55,
      headline: `${num(away.tripsWaiting)} ${plural(away.tripsWaiting, 'TRIP IS', 'TRIPS ARE')} HOME`,
      blurb: 'They wait at the Signpost.',
      finds: [],
      scene: sceneOf('signpost', cast),
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
      scene: sceneOf('forge', cast),
      count: away.jobsWaiting,
    });
  }
  // Biggest first; equal weights keep the order they were made in (the server's, then trips, then jobs).
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
