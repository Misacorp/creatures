/**
 * Request bodies of the dev tools (`/api/dev/*`, staging only: see `dev-tools.ts` and
 * `docs/design/dev-tools.md`). Every body is a strict object: unknown keys are rejected, ids are
 * picklists of the shipped content, and every number has a range. Nothing here takes a user id: the
 * tools always act on the session's player and guild.
 */
import { RULES, content, dungeonContent, expeditionContent, weatherContent } from '@creatures/game';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { BASE_IDS, DESTINATION_IDS, GOAL_IDS, SPECIES_IDS, SUPPLY_IDS } from './content-ids';

/** The most one clock call may move the clock: 30 days. */
export const MAX_ADVANCE_MS = 30 * 86_400_000;

/** Tools that change something (POST). Each is logged as an analytics `dev_action` with this id. */
export const DEV_ACTION_TOOLS = [
  'clock',
  'set-balances',
  'grant-parts',
  'grant-supplies',
  'grant-blueprints',
  'grant-creature',
  'set-creature',
  'set-explorer',
  'set-familiarity',
  'set-crafting-xp',
  'finish-jobs',
  'grant-gear',
  'fill-bag',
  'finish-trips',
  'force-offer',
  'force-gates',
  'set-slots',
  'journal',
  'slot-wipe-notice',
  'dungeon-depth',
  'dungeon-reset',
  'dungeon-streak',
  'dungeon-retry',
  'dungeon-modifiers',
  'dungeon-seed',
  'set-weather',
  'raid-phase',
  'raid-resolve',
  'raid-boss',
  'raid-festival',
  'raid-roster',
  'raid-live',
  'raid-simulate',
  'games-bots',
  'games-run-now',
  'games-reset',
  'analytics-rollup',
  'reset-account',
] as const;
export type DevActionTool = (typeof DEV_ACTION_TOOLS)[number];

/** Read-only tools (GET). Not logged. */
export const DEV_READ_TOOLS = ['state', 'events'] as const;

const int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const JOURNAL_IDS = expeditionContent.journal.entries.map((e) => e.id) as [string, ...string[]];
const BOSS_IDS = content.bosses.map((b) => b.id) as [string, ...string[]];
const MODIFIER_IDS = dungeonContent.modifiers.map((m) => m.id) as [string, ...string[]];
const liveWeather = (kind: 'boon' | 'omen') =>
  weatherContent.filter((d) => d.kind === kind && d.status === 'live').map((d) => d.id) as [
    string,
    ...string[],
  ];
const BOON_IDS = liveWeather('boon');
const OMEN_IDS = liveWeather('omen');

const MAX_AMOUNT = 1_000_000_000;
const MAX_RANK = RULES.expeditions.rank.xpForRank.length;
const MAX_XP = (RULES.expeditions.rank.xpForRank.at(-1) ?? 0) * 2;

const NEED_ONE = 'give at least one of the optional fields';

const Empty = v.strictObject({});

// --- The clock ---

export const ClockBodySchema = v.union([
  v.strictObject({ advanceMs: int(1, MAX_ADVANCE_MS) }),
  v.strictObject({ to: v.picklist(['next-reset', 'next-phase']) }),
  v.strictObject({ reset: v.literal(true) }),
]);

// --- Currencies and goods ---

export const SetBalancesBodySchema = v.pipe(
  v.strictObject({
    bait: v.optional(int(0, MAX_AMOUNT)),
    essence: v.optional(int(0, MAX_AMOUNT)),
  }),
  v.check((o) => o.bait !== undefined || o.essence !== undefined, NEED_ONE),
);

const partAmount = v.optional(int(0, MAX_AMOUNT));

export const GrantPartsBodySchema = v.pipe(
  v.strictObject({
    scrap: partAmount,
    'tide-shard': partAmount,
    'ember-shard': partAmount,
    'grove-shard': partAmount,
    'spark-shard': partAmount,
    'mire-shard': partAmount,
    glimmer: partAmount,
  }),
  v.check((o) => Object.values(o).some((n) => n !== undefined), NEED_ONE),
);

export const GrantSuppliesBodySchema = v.strictObject({
  supply: v.picklist(SUPPLY_IDS),
  amount: int(1, 99),
});

export const GrantBlueprintsBodySchema = v.union([
  v.strictObject({ baseId: v.picklist(BASE_IDS) }),
  v.strictObject({ all: v.literal(true) }),
]);

// --- Creatures ---

export const GrantCreatureBodySchema = v.strictObject({
  species: v.picklist(SPECIES_IDS),
  shiny: v.optional(v.boolean()),
  level: v.optional(int(1, 99)),
  fusion: v.optional(int(0, 5)),
});

export const SetCreatureBodySchema = v.pipe(
  v.strictObject({
    creatureId: IdSchema,
    level: v.optional(int(1, 99)),
    fusion: v.optional(int(0, 5)),
    /** An evolution: the creature's species becomes this one (it must be of the same line). */
    species: v.optional(v.picklist(SPECIES_IDS)),
  }),
  v.check(
    (o) => o.level !== undefined || o.fusion !== undefined || o.species !== undefined,
    NEED_ONE,
  ),
);

export const SetExplorerBodySchema = v.pipe(
  v.strictObject({
    creatureId: IdSchema,
    rank: v.optional(int(1, MAX_RANK)),
    xp: v.optional(int(0, MAX_XP)),
    trips: v.optional(int(0, 99_999)),
  }),
  v.check((o) => o.rank !== undefined || o.xp !== undefined || o.trips !== undefined, NEED_ONE),
  v.check((o) => o.rank === undefined || o.xp === undefined, 'give rank or xp, not both'),
);

export const SetFamiliarityBodySchema = v.pipe(
  v.strictObject({
    creatureId: IdSchema,
    destination: v.picklist(DESTINATION_IDS),
    trips: v.optional(int(0, 9_999)),
    /** True: every species of the place counts as found. False: none. Absent: unchanged. */
    foundAll: v.optional(v.boolean()),
    shiny: v.optional(v.boolean()),
  }),
  v.check(
    (o) => o.trips !== undefined || o.foundAll !== undefined || o.shiny !== undefined,
    NEED_ONE,
  ),
);

export const SetCraftingXpBodySchema = v.strictObject({
  creatureId: IdSchema,
  xp: int(0, 1_000_000),
});

// --- The Workshop ---

export const GrantGearBodySchema = v.strictObject({
  baseId: v.picklist(BASE_IDS),
  rarity: v.picklist(['common', 'rare', 'epic']),
  /** The item level (1 to 20); default 1. */
  itemLevel: v.optional(int(1, RULES.gear.maxItemLevel)),
});

// --- Expeditions ---

export const ForceOfferBodySchema = v.pipe(
  v.strictObject({
    goal: v.optional(v.picklist(GOAL_IDS)),
    outcome: v.optional(v.picklist(['success', 'fail', 'random'])),
  }),
  v.check((o) => o.goal !== undefined || o.outcome !== undefined, NEED_ONE),
);

const Gate = v.picklist(['on', 'off', 'auto']);
export const ForceGatesBodySchema = v.pipe(
  v.strictObject({ night: v.optional(Gate), festival: v.optional(Gate) }),
  v.check((o) => o.night !== undefined || o.festival !== undefined, NEED_ONE),
);

export const SetSlotsBodySchema = v.pipe(
  v.strictObject({
    slots: v.optional(int(1, 1 + 1 + RULES.expeditions.slots.thresholds.length)),
    rankSum: v.optional(int(0, 9_999)),
    tripsFinished: v.optional(int(0, 99_999)),
  }),
  v.check(
    (o) => o.slots !== undefined || o.rankSum !== undefined || o.tripsFinished !== undefined,
    NEED_ONE,
  ),
);

export const JournalBodySchema = v.union([
  v.strictObject({ action: v.literal('unlock'), entryId: v.picklist(JOURNAL_IDS) }),
  v.strictObject({ action: v.literal('unlock-all') }),
  v.strictObject({ action: v.literal('reset') }),
]);

// --- The dungeon ---

export const DungeonDepthBodySchema = v.union([
  v.strictObject({ depth: int(1, 9_999) }),
  v.strictObject({ nextLandmark: v.literal(true) }),
]);

export const DungeonStreakBodySchema = v.strictObject({ streak: int(0, 9_999) });

export const DungeonModifiersBodySchema = v.union([
  v.strictObject({
    ids: v.pipe(v.array(v.picklist(MODIFIER_IDS)), v.length(RULES.dungeon.rooms)),
  }),
  v.strictObject({ clear: v.literal(true) }),
]);

// --- The weather ---

/** Sets the Boon and Omen of today or tomorrow by hand (staging): to look at each and to test what they do. */
export const SetWeatherBodySchema = v.strictObject({
  day: v.picklist(['today', 'tomorrow']),
  boon: v.picklist(BOON_IDS),
  omen: v.nullable(v.picklist(OMEN_IDS)),
});

// --- The raid ---

export const RaidPhaseBodySchema = v.strictObject({
  to: v.picklist(['preparation', 'phase1', 'phase2', 'finale', 'done']),
});

export const RaidResolveBodySchema = v.strictObject({ phase: v.picklist(['phase1', 'phase2']) });

export const RaidBossBodySchema = v.pipe(
  v.strictObject({
    bossId: v.optional(v.picklist(BOSS_IDS)),
    rank: v.optional(int(1, RULES.raid.scaling.maxRank)),
  }),
  v.check((o) => o.bossId !== undefined || o.rank !== undefined, NEED_ONE),
);

export const RaidFestivalBodySchema = v.strictObject({ on: v.boolean() });

/** Guests are other players: a party holds at most `maxPartySize`, and the caller is one of them. */
export const MAX_GUESTS = 40;
export const RaidRosterBodySchema = v.strictObject({ count: int(0, MAX_GUESTS) });

export const RaidLiveBodySchema = v.strictObject({
  countdownSeconds: v.optional(int(1, 60)),
});

export const RaidSimulateBodySchema = v.strictObject({
  guests: v.optional(int(0, MAX_GUESTS)),
});

// --- The Valley Games ---

/** Bots for the Games: the raid's guests (`dev-guest-<n>`), each with `GAMES_BOT_CREATURES` creatures, entered in every event of the next show day. */
export const MAX_GAMES_BOTS = 12;
export const GamesBotsBodySchema = v.strictObject({ count: v.optional(int(1, MAX_GAMES_BOTS)) });

/** Lock the next show day now and start its show in a few seconds (default 15). */
export const GamesRunNowBodySchema = v.strictObject({
  showInSeconds: v.optional(int(5, 120)),
});

// --- The account ---

export const ResetAccountBodySchema = v.strictObject({ confirm: v.literal('RESET') });

export const NoBodySchema = Empty;
