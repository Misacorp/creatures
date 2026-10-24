/**
 * The Journal and the milestones as plain data. The journal groups the pre-written pages by place with
 * progress and sets (a page not found yet shows as a blank, never its text); the profile side names the
 * account stats, the milestones and their tiny bonuses. Names and texts come from the
 * shared content; what has been found, the stats and the milestones come from the server's profile.
 */
import { JOURNAL_ANY_PLACE, expeditionContent } from '@creatures/game';
import type { Milestone, Profile } from './expedition-types';
import { destinationName, percentText } from './trip-view';

interface JournalPageView {
  id: string;
  /** The title and text; null for a page that has not been found yet. */
  title: string | null;
  text: string | null;
  found: boolean;
  /** The set it belongs to, or null. */
  setId: string | null;
}

interface JournalSetView {
  id: string;
  name: string;
  found: number;
  total: number;
  complete: boolean;
}

export interface JournalPlace {
  /** A destination id, or `any`. */
  place: string;
  name: string;
  pages: JournalPageView[];
  found: number;
  total: number;
  sets: JournalSetView[];
}

/** The name of the group of pages that any trip can turn up. */
export const ANY_PLACE_NAME = 'Anywhere';

/** The journal grouped by place, in the order of the places (the "anywhere" pages last). */
export function journalPlaces(profile: Pick<Profile, 'journal'>): JournalPlace[] {
  const foundIds = new Set(profile.journal.found.map((f) => f.entryId));
  const serverSets = new Map(profile.journal.sets.map((s) => [s.id, s]));
  const places = [...expeditionContent.destinations.map((d) => d.id), JOURNAL_ANY_PLACE];
  return places.flatMap((place) => {
    const entries = expeditionContent.journal.entries.filter((e) => e.place === place);
    if (entries.length === 0) return [];
    const pages = entries.map<JournalPageView>((e) => {
      const found = foundIds.has(e.id);
      return {
        id: e.id,
        title: found ? e.title : null,
        text: found ? e.text : null,
        found,
        setId: e.set ?? null,
      };
    });
    const sets = expeditionContent.journal.sets
      .filter((s) => s.place === place)
      .map<JournalSetView>((s) => {
        const mine = serverSets.get(s.id);
        const total =
          mine?.total ?? expeditionContent.journal.entries.filter((e) => e.set === s.id).length;
        const found =
          mine?.found ??
          expeditionContent.journal.entries.filter((e) => e.set === s.id && foundIds.has(e.id))
            .length;
        return { id: s.id, name: s.name, found, total, complete: total > 0 && found >= total };
      });
    return [
      {
        place,
        name: place === JOURNAL_ANY_PLACE ? ANY_PLACE_NAME : destinationName(place),
        pages,
        found: pages.filter((p) => p.found).length,
        total: pages.length,
        sets,
      },
    ];
  });
}

/** "7 / 40 pages found". */
export function journalProgressText(profile: Pick<Profile, 'journal'>): string {
  return `${String(profile.journal.found.length)} / ${String(profile.journal.total)} pages found`;
}

/** The Home pin's teaser for the Journal: "3 / 45 pages found". */
export function journalTeaser(profile: Pick<Profile, 'journal'>): string {
  return `${String(profile.journal.found.length)} / ${String(profile.journal.total)} pages found`;
}

// --- The profile (milestones and bonuses; the stat sheet is `stats-view.ts`) ---

const STAT_LABELS: Readonly<Record<string, string>> = {
  trips_finished: 'Trips finished',
  trips_failed: 'Trips that failed',
  trip_hours: 'Hours explored',
  species_found: 'Creatures found on trips',
  places_visited: 'Places visited',
  journal_pages: 'Journal pages',
  journal_sets: 'Journal sets completed',
  reactions_seen: 'Raid reactions seen',
  pushons_taken: 'Push-ons taken',
  pushons_won: 'Push-ons that worked',
  supplies_used: 'Supplies used',
  shinies_found: 'Shinies found',
};

export function statLabel(stat: string): string {
  return STAT_LABELS[stat] ?? stat.replaceAll('_', ' ');
}

const BONUS_WORDS: Readonly<Record<string, string>> = {
  rarity: 'rare catches',
  parts: 'parts from trips',
  offer: 'chance of a push-on choice',
  xp: 'explorer XP',
};

/** "+1% parts from trips". */
export function bonusText(bonus: { kind: string; bp: number }): string {
  return `+${percentText(bonus.bp)} ${BONUS_WORDS[bonus.kind] ?? bonus.kind}`;
}

const MILESTONE_NAMES: Readonly<Record<string, string>> = {
  'first-steps': 'First steps',
  seasoned: 'Seasoned',
  veteran: 'Veteran',
  wanderer: 'Wanderer',
  globetrotter: 'Globetrotter',
  collector: 'Collector',
  scholar: 'Scholar',
  archivist: 'Archivist',
  gambler: 'Gambler',
  'raid-watcher': 'Raid watcher',
};

export function milestoneName(id: string): string {
  const named = MILESTONE_NAMES[id];
  if (named !== undefined) return named;
  const words = id.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface MilestoneView {
  id: string;
  name: string;
  /** "Trips finished: 3 / 5". */
  progress: string;
  /** How far, for a bar: `value` of `max`. */
  value: number;
  max: number;
  reached: boolean;
  /** "+1% parts from trips" once the milestone is reached; null while it is locked. */
  bonus: string | null;
}

/** What a milestone's bonus shows: its value once reached, nothing while it is locked. */
export function milestoneBonusText(m: Pick<Milestone, 'reached' | 'bonus'>): string | null {
  return m.reached ? bonusText(m.bonus) : null;
}

export function milestoneViews(milestones: readonly Milestone[]): MilestoneView[] {
  return milestones.map((m) => ({
    id: m.id,
    name: milestoneName(m.id),
    progress: `${statLabel(m.stat)}: ${String(Math.min(m.value, m.at))} / ${String(m.at)}`,
    // `value` of `max`, for a bar; a milestone that needs nothing is full.
    value: m.at <= 0 ? 1 : Math.min(m.value, m.at),
    max: m.at <= 0 ? 1 : m.at,
    reached: m.reached,
    bonus: milestoneBonusText(m),
  }));
}

/** The permanent bonuses that are on, as words; null when none is yet. */
export function bonusSummary(bonuses: Profile['bonuses']): string | null {
  const parts = [
    ['rarity', bonuses.rarityBp],
    ['parts', bonuses.partsBp],
    ['offer', bonuses.offerBp],
    ['xp', bonuses.xpBp],
  ] as const;
  const on = parts.filter(([, bp]) => bp > 0).map(([kind, bp]) => bonusText({ kind, bp }));
  return on.length === 0 ? null : on.join(', ');
}
