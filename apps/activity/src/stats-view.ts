/**
 * The Stats page (Home, "Stats") as plain data: the player's own numbers grouped by area, one stat sheet.
 * Every number is the server's (the profile's account stats and dungeon record) except the creature count,
 * which the game state already holds. A stat the server does not send reads 0.
 *
 * To add a stat: put its row in the group it belongs to in `STAT_GROUPS` (or add a group), and make the
 * worker send it (an account stat in `ACCOUNT_STATS`, or a field of the profile's `dungeon` record). The
 * page and the Home pin's teaser need no other change; a test keeps every account stat on the sheet.
 */
import type { Creature } from './api';
import type { Profile } from './expedition-types';
import { statLabel } from './journal-view';

export interface StatRowView {
  /** A stable id (the account stat's name, or `dungeon_runs` and the like). */
  key: string;
  label: string;
  value: number;
}

export interface StatGroupView {
  id: 'expeditions' | 'dungeon' | 'collection' | 'raid';
  title: string;
  /** The id of the glyph in `glyphs.ts`. */
  glyph: string;
  rows: StatRowView[];
}

/** What the sheet reads: the profile and the creatures the player owns. */
export interface StatsInput {
  profile: Pick<Profile, 'stats' | 'dungeon'>;
  creatures: readonly Pick<Creature, 'id'>[];
}

type Source = (input: StatsInput) => number;

interface RowDef {
  key: string;
  label: string;
  value: Source;
}

/** A row that is one of the server's account stats. */
const account = (stat: string, label: string = statLabel(stat)): RowDef => ({
  key: stat,
  label,
  value: ({ profile }) => profile.stats[stat] ?? 0,
});

const GROUPS: readonly {
  id: StatGroupView['id'];
  title: string;
  glyph: string;
  rows: readonly RowDef[];
}[] = [
  {
    id: 'expeditions',
    title: 'Expeditions',
    glyph: 'compass',
    rows: [
      account('trips_finished'),
      account('trips_failed'),
      account('trip_hours'),
      account('places_visited'),
      account('pushons_taken'),
      account('pushons_won'),
      account('supplies_used'),
    ],
  },
  {
    id: 'dungeon',
    title: 'Dungeon',
    glyph: 'door',
    rows: [
      {
        key: 'dungeon_runs',
        label: 'Runs finished',
        value: ({ profile }) => profile.dungeon.runs,
      },
      {
        key: 'dungeon_clears',
        label: 'Runs cleared',
        value: ({ profile }) => profile.dungeon.clears,
      },
      {
        key: 'dungeon_depth',
        label: 'Deepest depth cleared',
        // `depth` is where the next run fights (1 for a new player), so the deepest cleared is one less.
        value: ({ profile }) => Math.max(0, profile.dungeon.depth - 1),
      },
      {
        key: 'dungeon_streak',
        label: 'Days in a row',
        value: ({ profile }) => profile.dungeon.streak,
      },
    ],
  },
  {
    id: 'collection',
    title: 'Collection',
    glyph: 'paw',
    rows: [
      {
        key: 'creatures_owned',
        label: 'Creatures owned',
        value: ({ creatures }) => creatures.length,
      },
      account('species_found'),
      account('shinies_found'),
      account('journal_pages'),
      account('journal_sets'),
    ],
  },
  {
    id: 'raid',
    title: 'Raid',
    glyph: 'blade',
    rows: [account('reactions_seen')],
  },
];

/** The stat sheet: the groups in order, each with its rows. */
export function statGroups(input: StatsInput): StatGroupView[] {
  return GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    glyph: group.glyph,
    rows: group.rows.map((row) => ({ key: row.key, label: row.label, value: row.value(input) })),
  }));
}
