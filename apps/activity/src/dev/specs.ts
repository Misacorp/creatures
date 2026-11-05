/**
 * Every control of the panel, as data: one `ToolSpec` per button, grouped by the view it belongs to.
 * The body of each one has to match a strict schema in `apps/worker/src/dev-schemas.ts` (unknown keys
 * are refused with a 400), so a new field there needs a field here.
 */
import type { Place, Tab } from '../tabs';
import type { Field, Option, ToolSpec } from './forms';
import {
  BASE_OPTIONS,
  BOON_OPTIONS,
  DESTINATION_OPTIONS,
  GATE_OPTIONS,
  GOAL_OPTIONS,
  JOURNAL_OPTIONS,
  LIMITS,
  MAX_FILL_PLAYERS,
  MODIFIER_OPTIONS,
  OMEN_OPTIONS,
  OUTCOME_OPTIONS,
  PART_FIELDS,
  RANK_OPTIONS,
  RARITY_OPTIONS,
  SPECIES_OPTIONS,
  SUPPLY_OPTIONS,
} from './options';
import { resourceName } from '@creatures/game';

const HOUR = 3_600_000;
const MAX_AMOUNT = 1_000_000_000;

const int = (key: string, label: string, min: number, max: number, optional = false): Field => ({
  kind: 'int',
  key,
  label,
  min,
  max,
  ...(optional ? { optional: true } : {}),
});
const pick = (key: string, label: string, options: readonly Option[], optional = false): Field => ({
  kind: 'select',
  key,
  label,
  options,
  ...(optional ? { optional: true } : {}),
});
const flag = (key: string, label: string, optional = false): Field => ({
  kind: 'bool',
  key,
  label,
  ...(optional ? { optional: true } : {}),
});
const creature = (label = 'Creature'): Field => ({ kind: 'creature', key: 'creatureId', label });

/** The dev clock's buttons. The clock only moves forward; "Reset clock" puts it back to real time. */
export const CLOCK_SPECS: readonly ToolSpec[] = [
  { tool: 'clock', label: '+1 h', fields: [], fixed: { advanceMs: HOUR } },
  { tool: 'clock', label: '+6 h', fields: [], fixed: { advanceMs: 6 * HOUR } },
  { tool: 'clock', label: '+1 day', fields: [], fixed: { advanceMs: 24 * HOUR } },
  { tool: 'clock', label: 'Next 13:37', fields: [], fixed: { to: 'next-reset' } },
  { tool: 'clock', label: 'Next phase', fields: [], fixed: { to: 'next-phase' } },
  { tool: 'clock', label: 'Reset clock', fields: [], fixed: { reset: true } },
];

/** Shared by every view: goods and currencies. */
export const GOODS_SPECS: readonly ToolSpec[] = [
  {
    tool: 'set-balances',
    label: 'Set Bait and Essence',
    fields: [
      int('bait', resourceName('bait'), 0, MAX_AMOUNT, true),
      int('essence', resourceName('essence'), 0, MAX_AMOUNT, true),
    ],
    needOne: true,
  },
  {
    tool: 'grant-parts',
    label: 'Grant parts',
    fields: PART_FIELDS.map((p) => int(p.value, p.label, 0, MAX_AMOUNT, true)),
    needOne: true,
  },
  {
    tool: 'grant-supplies',
    label: 'Grant supplies',
    fields: [pick('supply', 'Supply', SUPPLY_OPTIONS), int('amount', 'Amount', 1, 99)],
  },
  {
    tool: 'grant-blueprints',
    label: 'Grant a blueprint',
    fields: [pick('baseId', 'Gear base', BASE_OPTIONS)],
  },
  { tool: 'grant-blueprints', label: 'Grant all blueprints', fields: [], fixed: { all: true } },
];

/** The account reset: needs the word RESET typed in the panel. */
export const RESET_ACCOUNT_SPEC: ToolSpec = {
  tool: 'reset-account',
  label: 'Reset my account',
  fields: [{ kind: 'text', key: 'confirm', label: 'Type RESET', must: 'RESET' }],
  danger: true,
  hint: 'Deletes all your data on this server (creatures, gear, trips, raid).',
};

const CREATURES_SPECS: readonly ToolSpec[] = [
  {
    tool: 'grant-creature',
    label: 'Grant a creature',
    fields: [
      pick('species', 'Species', SPECIES_OPTIONS),
      flag('shiny', 'Shiny', true),
      int('level', 'Level', 1, 99, true),
      int('fusion', 'Fusion', 0, 5, true),
    ],
  },
  {
    tool: 'set-creature',
    label: 'Set level, fusion or evolve',
    fields: [
      creature(),
      int('level', 'Level', 1, 99, true),
      int('fusion', 'Fusion', 0, 5, true),
      pick('species', 'Evolve to (same line)', SPECIES_OPTIONS, true),
    ],
    needOne: true,
  },
  {
    tool: 'set-explorer',
    label: 'Set explorer rank, XP or trips',
    fields: [
      creature(),
      int('rank', 'Rank', 1, LIMITS.maxExplorerRank, true),
      int('xp', 'XP (not with rank)', 0, LIMITS.maxExplorerXp, true),
      int('trips', 'Trips', 0, 99_999, true),
    ],
    needOne: true,
  },
  {
    tool: 'set-familiarity',
    label: 'Set familiarity at a place',
    fields: [
      creature(),
      pick('destination', 'Place', DESTINATION_OPTIONS),
      int('trips', 'Trips', 0, 9_999, true),
      flag('foundAll', 'All species found', true),
      flag('shiny', 'Shiny found', true),
    ],
    needOne: true,
  },
  {
    tool: 'set-crafting-xp',
    label: 'Set Crafting XP',
    fields: [creature(), int('xp', 'XP', 0, 1_000_000)],
  },
];

const WORKSHOP_SPECS: readonly ToolSpec[] = [
  { tool: 'finish-jobs', label: 'Finish all jobs now', fields: [] },
  { tool: 'fill-bag', label: 'Fill the bag', fields: [], hint: 'To test the bag cap.' },
  {
    tool: 'grant-gear',
    label: 'Grant a gear item',
    fields: [
      pick('baseId', 'Base', BASE_OPTIONS),
      pick('rarity', 'Rarity', RARITY_OPTIONS),
      int('itemLevel', 'Item level', 1, LIMITS.maxItemLevel, true),
    ],
  },
];

const EXPEDITIONS_SPECS: readonly ToolSpec[] = [
  { tool: 'finish-trips', label: 'Finish trips now', fields: [] },
  { tool: 'slot-wipe-notice', label: 'Trigger the slot-wipe notice', fields: [] },
  {
    tool: 'journal',
    label: 'Unlock all journal pages',
    fields: [],
    fixed: { action: 'unlock-all' },
  },
  { tool: 'journal', label: 'Reset the journal', fields: [], fixed: { action: 'reset' } },
  {
    tool: 'journal',
    label: 'Unlock a journal page',
    fields: [pick('entryId', 'Page', JOURNAL_OPTIONS)],
    fixed: { action: 'unlock' },
  },
  {
    tool: 'force-offer',
    label: 'Force a push-on offer',
    fields: [
      pick('goal', 'Goal', GOAL_OPTIONS, true),
      pick('outcome', 'Outcome', OUTCOME_OPTIONS, true),
    ],
    needOne: true,
  },
  {
    tool: 'force-gates',
    label: 'Force night or Festival',
    fields: [
      pick('night', 'Night', GATE_OPTIONS, true),
      pick('festival', 'Festival', GATE_OPTIONS, true),
    ],
    needOne: true,
  },
  {
    tool: 'set-slots',
    label: 'Set slots or the rank sum',
    fields: [
      int('slots', 'Slots', 1, LIMITS.maxSlots, true),
      int('rankSum', 'Rank sum', 0, 9_999, true),
      int('tripsFinished', 'Trips finished', 0, 99_999, true),
    ],
    needOne: true,
  },
];

const DUNGEON_SPECS: readonly ToolSpec[] = [
  { tool: 'dungeon-reset', label: "Reset today's run", fields: [] },
  { tool: 'dungeon-retry', label: 'Force the first-day retry', fields: [] },
  { tool: 'dungeon-seed', label: "Re-roll the day's seed", fields: [] },
  { tool: 'dungeon-depth', label: 'Next landmark', fields: [], fixed: { nextLandmark: true } },
  { tool: 'dungeon-modifiers', label: 'Clear modifiers', fields: [], fixed: { clear: true } },
  { tool: 'dungeon-depth', label: 'Set depth', fields: [int('depth', 'Depth', 1, 9_999)] },
  { tool: 'dungeon-streak', label: 'Set streak', fields: [int('streak', 'Streak', 0, 9_999)] },
  {
    tool: 'dungeon-modifiers',
    label: "Pick the day's modifiers",
    fields: Array.from({ length: LIMITS.rooms }, (_, i) =>
      pick(`room${String(i)}`, `Room ${String(i + 1)}`, MODIFIER_OPTIONS),
    ),
    build: (values) => ({
      ids: Array.from({ length: LIMITS.rooms }, (_, i) => values[`room${String(i)}`] ?? ''),
    }),
  },
];

/** Sets the valley's Boon and Omen of today or tomorrow, to look at each and to test what it does. */
const WEATHER_SPECS: readonly ToolSpec[] = (['today', 'tomorrow'] as const).map(
  (day): ToolSpec => ({
    tool: 'set-weather',
    label: `Set ${day}'s sky`,
    fields: [pick('boon', 'Boon', BOON_OPTIONS), pick('omen', 'Omen', OMEN_OPTIONS)],
    build: (values) => ({
      day,
      boon: values['boon'] ?? '',
      omen: values['omen'] === 'none' || values['omen'] === undefined ? null : values['omen'],
    }),
    hint:
      day === 'today'
        ? 'Trips, jobs and runs started now keep it; the calendar shows it.'
        : 'Shown on the calendar as tomorrow; it counts from the next daily reset.',
  }),
);

/**
 * The raid test bench, in the order it is used: clear the board, fill it, pick the Boss Rank, play the stages (each opens its replay)
 * and start again. The panel shows these in this order (`ordered`), not the buttons first and the forms after.
 */
const RAID_SPECS: readonly ToolSpec[] = [
  {
    tool: 'raid-clear',
    label: 'Clear the board',
    fields: [],
    hint: 'This week starts again: nothing placed, nothing fought, the same Boss Rank. Your creatures stay.',
  },
  {
    tool: 'raid-fill',
    label: 'Fill the empty spots',
    button: 'Fill',
    fields: [
      {
        kind: 'int',
        key: 'count',
        label: 'Simulated players',
        min: 1,
        max: MAX_FILL_PLAYERS,
        optional: true,
        placeholder: 'fill the board',
      },
    ],
    hint: 'Simulated players take the empty spots after what you placed, three creatures each. Yours never move.',
  },
  {
    tool: 'raid-rank',
    label: 'Boss and Boss Rank',
    button: 'Set',
    fields: [pick('rank', 'Rank', RANK_OPTIONS)],
    build: (values) => ({ rank: Number(values['rank']) }),
    hint: 'A rank comes with its own boss. Only before anything is fought: clear the board first otherwise.',
  },
  { tool: 'raid-play', label: 'Play stage 1', fields: [], fixed: { stage: 'stage1' } },
  { tool: 'raid-play', label: 'Play stage 2', fields: [], fixed: { stage: 'stage2' } },
  { tool: 'raid-play', label: 'Play the finale', fields: [], fixed: { stage: 'finale' } },
  {
    tool: 'raid-play',
    label: 'Watch the finale live',
    fields: [],
    fixed: { stage: 'finale', live: true },
    hint: 'Starts the finale live now, for the live screen.',
  },
  {
    tool: 'combat-v2-convert',
    label: 'Combat v2, Convert',
    fields: [],
    hint: 'Combat v2 (staging) only: every creature rolls its v2 talent, Knacks and finale choices go. Clear the board makes the week new.',
  },
  {
    tool: 'reset-raids-dungeons',
    label: 'Reset raids and dungeons',
    fields: [{ kind: 'text', key: 'confirm', label: 'Type reset', must: 'reset' }],
    danger: true,
    hint: 'Wipes every raid and dungeon of this server (all weeks, results, the track and ladder, dungeon runs and progress). Creatures, gear, balances and the clock stay. The next request starts a fresh week.',
  },
];

const GAMES_SPECS: readonly ToolSpec[] = [
  { tool: 'games-bots', label: 'Add bots', fields: [int('count', 'Bots', 1, 12, true)] },
  {
    tool: 'games-run-now',
    label: 'Run show now',
    fields: [int('showInSeconds', 'Show in (s)', 5, 120, true)],
  },
  { tool: 'games-reset', label: 'Reset the last show', fields: [] },
];

const ANALYTICS_SPECS: readonly ToolSpec[] = [
  { tool: 'analytics-rollup', label: 'Roll up now', fields: [] },
];

interface SectionDef {
  id: string;
  title: string;
  /** The tab whose view this section is about; null for Analytics. */
  tab: Tab | null;
  specs: readonly ToolSpec[];
  /** Show the controls one after the other, as listed (a sequence of steps), not the buttons first and the forms after. */
  ordered?: true;
}

/** The per-view sections, in the order of the navigation's places. The panel moves the current place's one to the top. */
export const SECTIONS: readonly SectionDef[] = [
  { id: 'creatures', title: 'Creatures', tab: 'collection', specs: CREATURES_SPECS },
  { id: 'workshop', title: 'Workshop', tab: 'workshop', specs: WORKSHOP_SPECS },
  { id: 'expeditions', title: 'Expeditions', tab: 'expeditions', specs: EXPEDITIONS_SPECS },
  { id: 'games', title: 'Games', tab: 'games', specs: GAMES_SPECS },
  { id: 'dungeon', title: 'Dungeon', tab: 'dungeon', specs: DUNGEON_SPECS },
  { id: 'raid', title: 'Raid', tab: 'raid', specs: RAID_SPECS, ordered: true },
  { id: 'weather', title: 'Weather', tab: null, specs: WEATHER_SPECS },
  { id: 'analytics', title: 'Analytics', tab: null, specs: ANALYTICS_SPECS },
];

/** Every spec, for tests. */
export const ALL_SPECS: readonly ToolSpec[] = [
  ...CLOCK_SPECS,
  ...GOODS_SPECS,
  RESET_ACCOUNT_SPEC,
  ...SECTIONS.flatMap((s) => s.specs),
];

/** The sections with the current tab's first (the others keep their order). */
export function orderedSections(tab: Place): SectionDef[] {
  const here = SECTIONS.filter((s) => s.tab === tab);
  return [...here, ...SECTIONS.filter((s) => s.tab !== tab)];
}
