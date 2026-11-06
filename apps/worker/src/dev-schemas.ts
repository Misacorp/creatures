/**
 * Request bodies of the dev tools (`/api/dev/*`, staging only: see `dev-tools.ts` and
 * `docs/design/dev-tools.md`). Every body is a strict object: unknown keys are rejected, ids are
 * picklists of the shipped content, and every number has a range. The tools act on the session's player and
 * guild; the one exception is `apply-roster-preset`, which may name another player of the same guild (checked
 * against the guild's players, and confirmed by typing their name).
 */
import { RULES, dungeonContent, expeditionContent, weatherContent } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import * as v from 'valibot';
import { IdSchema } from './collection-schemas';
import { PRESET_IDS } from './dev-presets';
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
  'games-bots',
  'games-run-now',
  'games-reset',
  'analytics-rollup',
  'raid-clear',
  'raid-fill',
  'raid-rank',
  'raid-play',
  'combat-v2-convert',
  'reset-raids-dungeons',
  'valley-fresh',
  'apply-roster-preset',
  'reset-account',
] as const;
export type DevActionTool = (typeof DEV_ACTION_TOOLS)[number];

/** Read-only tools (GET). Not logged. */
export const DEV_READ_TOOLS = ['state', 'events', 'players'] as const;

const int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const JOURNAL_IDS = expeditionContent.journal.entries.map((e) => e.id) as [string, ...string[]];
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

// --- The raid test bench ---

/** The most simulated players one fill adds (a party holds `RULES.raid.maxPartySize`, and the caller is one of them). */
export const MAX_BENCH_PLAYERS = 14;

export const RaidFillBodySchema = v.strictObject({ count: v.optional(int(1, MAX_BENCH_PLAYERS)) });

/** The Boss Ranks of the track: one per slot of `raid-track.json`. */
export const TRACK_RANKS = combatV2.raidTrack.slots.length;
export const RaidRankBodySchema = v.strictObject({ rank: int(1, TRACK_RANKS) });

export const RAID_PLAY_STAGES = ['stage1', 'stage2', 'finale'] as const;
export const RaidPlayBodySchema = v.pipe(
  v.strictObject({
    stage: v.picklist(RAID_PLAY_STAGES),
    /** The finale only: start its live fight now instead of playing it to its end at once. */
    live: v.optional(v.boolean()),
  }),
  v.check((o) => o.live !== true || o.stage === 'finale', 'only the finale can be played live'),
);

// --- The Valley Games ---

/** Bots for the Games: the raid's guests (`dev-guest-<n>`), each with `GAMES_BOT_CREATURES` creatures, entered in every event of the next show day. */
export const MAX_GAMES_BOTS = 12;
export const GamesBotsBodySchema = v.strictObject({ count: v.optional(int(1, MAX_GAMES_BOTS)) });

/** Lock the next show day now and start its show in a few seconds (default 15). */
export const GamesRunNowBodySchema = v.strictObject({
  showInSeconds: v.optional(int(5, 120)),
});

// --- Roster presets ---

/**
 * Replace one player's creatures and gear bag with a preset, or every player's. The only dev tool that names a player
 * other than the caller: the id must be one of the guild's players (checked in the tool), and `confirm` must be what the
 * panel makes the manager type: the player's name, or `everyone`.
 */
export const ApplyRosterPresetBodySchema = v.union([
  v.strictObject({
    preset: v.picklist(PRESET_IDS),
    userId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    confirm: v.pipe(v.string(), v.maxLength(200)),
  }),
  v.strictObject({
    preset: v.picklist(PRESET_IDS),
    everyone: v.literal(true),
    confirm: v.pipe(v.string(), v.maxLength(200)),
  }),
]);

// --- The account ---

export const ResetAccountBodySchema = v.strictObject({ confirm: v.literal('RESET') });

/** Wipes every raid and dungeon of the guild: the word must be typed. */
export const ResetRaidsDungeonsBodySchema = v.strictObject({ confirm: v.literal('reset') });

export const NoBodySchema = Empty;
