/**
 * What an analytics event stores (`analytics.ts` writes it): the props of each kind, rebuilt field by
 * field from the typed event (`analytics-events.ts`). Every value is checked again here: an id that
 * is not in the content becomes `"unknown"`, a number is clamped, a list is capped, and nothing
 * free-text ever passes through. Pure functions, no storage, no clock.
 */
import {
  EXPEDITION_LENGTHS,
  GEAR_RARITIES,
  GEAR_SLOTS,
  GOAL_RISKS,
  JOB_KINDS,
  REACH_IDS,
  PART_KINDS,
  RARITIES,
  RULES,
  content,
  dungeonContent,
  dungeonEvents,
  dungeonKeepsakes,
  expeditionContent,
  gamesContent,
  gamesStall,
  gearContent,
  talentContent,
  weatherContent,
  type ExpeditionLength,
  type GearRarity,
  type GoalRisk,
  type PartKind,
  type PartsBundle,
} from '@creatures/game';
import { DEV_ACTION_TOOLS } from './dev-schemas';
import type { PostFailureKind } from './discord-posts';
import { BASE_IDS, DESTINATION_IDS, GOAL_IDS, SPECIES_IDS, SUPPLY_IDS } from './content-ids';
import {
  GEAR_SOURCES,
  type AnalyticsEvent,
  type CatchProps,
  type PushOnOutcome,
} from './analytics-events';

/** `props_json` is never longer than this; a longer one is replaced by `{"truncated":true}`. */
export const MAX_PROPS_CHARS = 1536;
/** Most catches listed in one claim event. */
const MAX_CATCHES = 12;

// --- Typed events: the shapes live in `analytics-events.ts` ---

const CATCH_RESULTS = ['new', 'duplicate', 'fused', 'converted'] as const;
const PUSH_ON_OUTCOMES = ['worked', 'failed', 'declined'] as const;

/** How a map run of the daily dungeon ended (`DungeonOutcome`), and what the camp offers. */
const DUNGEON_OUTCOMES = ['cleared', 'home', 'defeat'] as const;
const CAMP_CHOICES = ['rest', 'swap', 'keepsake'] as const;
const NODE_KIND_IDS = [
  'fight',
  'elite',
  'mystery',
  'cache',
  'camp',
  'boss',
  'door',
  'epic',
] as const;
/** What a carved door added to the Undercroft: a room kind, never a boss. */
const UNDERCROFT_MARK_IDS = ['fight', 'elite', 'mystery', 'cache', 'camp', 'epic'] as const;

/** Most items one `gear_drop` event lists. */
const MAX_DROP_ITEMS = 4;

// --- Sanitizers: every value is re-checked on write ---

const UNKNOWN = 'unknown';
const SPECIES_SET: ReadonlySet<string> = new Set(SPECIES_IDS);
const BOSS_IDS: ReadonlySet<string> = new Set(content.bosses.map((b) => b.id));
const ABILITY_IDS: ReadonlySet<string> = new Set(content.finaleAbilities.map((a) => a.id));
const GEAR_BASE_IDS: ReadonlySet<string> = new Set(BASE_IDS);
const GEAR_LINE_IDS: ReadonlySet<string> = new Set(gearContent.lines.map((l) => l.id));
const TALENT_IDS: ReadonlySet<string> = new Set(talentContent.byId.keys());
const MODIFIER_IDS: ReadonlySet<string> = new Set(dungeonContent.modifiers.map((m) => m.id));
const KEEPSAKE_IDS: ReadonlySet<string> = new Set(dungeonKeepsakes.map((k) => k.id));
const GAMES_EVENT_IDS: ReadonlySet<string> = new Set(gamesContent.events.map((e) => e.id));
const GAMES_OFFER_IDS: ReadonlySet<string> = new Set(gamesStall.map((o) => o.id));
const DUNGEON_EVENT_IDS: ReadonlySet<string> = new Set(dungeonEvents.map((e) => e.id));
const WEATHER_IDS: ReadonlySet<string> = new Set(weatherContent.map((d) => d.id));
const ROLE_IDS = ['setter', 'payoff', 'support', 'guard'] as const;
const DESTINATION_SET: ReadonlySet<string> = new Set(DESTINATION_IDS);
const SUPPLY_SET: ReadonlySet<string> = new Set(SUPPLY_IDS);
const GOAL_SET: ReadonlySet<string> = new Set(GOAL_IDS);
const JOURNAL_IDS: ReadonlySet<string> = new Set(
  expeditionContent.journal.entries.map((e) => e.id),
);
const JOURNAL_SET_IDS: ReadonlySet<string> = new Set(
  expeditionContent.journal.sets.map((s) => s.id),
);
/** A gear base or a supply (a supply craft is a workshop job too). */
const JOB_BASE_IDS: ReadonlySet<string> = new Set([...GEAR_BASE_IDS, ...SUPPLY_SET]);
const POST_ERRORS: ReadonlySet<string> = new Set<PostFailureKind>([
  'rate_limited',
  'server_error',
  'network',
  'timeout',
  'forbidden',
  'not_found',
  'rejected',
  'redirect',
]);

const fromSet = (set: ReadonlySet<string>, value: string): string =>
  set.has(value) ? value : UNKNOWN;
const species = (value: string): string => fromSet(SPECIES_SET, value);
const oneOf = <T extends string>(options: readonly T[], value: string, fallback: T): T =>
  (options as readonly string[]).includes(value) ? (value as T) : fallback;
const int = (value: number, max = 1_000_000_000): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;
const bool = (value: boolean): boolean => Boolean(value);

function catchProps(list: readonly CatchProps[]): unknown[] {
  return list.slice(0, MAX_CATCHES).map((c) => ({
    species: species(c.species),
    rarity: oneOf(RARITIES, c.rarity, 'common'),
    shiny: bool(c.shiny),
    result: oneOf(CATCH_RESULTS, c.result, 'new'),
    ...(c.talent === undefined
      ? {}
      : { talent: fromSet(TALENT_IDS, c.talent), golden: bool(c.golden === true) }),
  }));
}

/** A parts bundle as `{ kind: amount }` for the kinds that are present, or null when it is empty. */
function partsProps(bundle: PartsBundle | undefined): Partial<Record<PartKind, number>> | null {
  if (bundle === undefined) return null;
  const out: Partial<Record<PartKind, number>> = {};
  for (const kind of PART_KINDS) {
    const amount = int(bundle[kind] ?? 0);
    if (amount > 0) out[kind] = amount;
  }
  return Object.keys(out).length === 0 ? null : out;
}

const withParts = (bundle: PartsBundle | undefined): { parts?: Record<string, number> } => {
  const parts = partsProps(bundle);
  return parts === null ? {} : { parts };
};

const gearBase = (value: string): string => fromSet(GEAR_BASE_IDS, value);
const destination = (value: string): string => fromSet(DESTINATION_SET, value);
const length = (value: string): ExpeditionLength => oneOf(EXPEDITION_LENGTHS, value, 'short');
const supplyIds = (list: readonly string[]): string[] =>
  list.slice(0, RULES.expeditions.maxSupplies).map((id) => fromSet(SUPPLY_SET, id));
const risk = (value: string): GoalRisk => oneOf(GOAL_RISKS, value, 'safe');
const outcome = (value: string): PushOnOutcome => oneOf(PUSH_ON_OUTCOMES, value, 'declined');
const gearRarity = (value: string): GearRarity => oneOf(GEAR_RARITIES, value, 'common');

/** The props object of an event, rebuilt field by field from checked values. */
export function propsOf(event: AnalyticsEvent): Record<string, unknown> {
  switch (event.kind) {
    case 'session_start':
      return { returning: bool(event.returning) };
    case 'starter_chosen':
      return { species: species(event.species) };
    case 'daily_allowance':
      return { amount: int(event.amount, 100_000) };
    case 'expedition_send':
      return {
        species: species(event.species),
        duration: length(event.duration),
        destination: destination(event.destination),
        supplies: supplyIds(event.supplies),
        rank: int(event.rank, 99),
      };
    case 'expedition_claim':
      return {
        duration: length(event.duration),
        destination: destination(event.destination),
        supplies: supplyIds(event.supplies),
        waitedMin: int(event.waitedMin),
        catches: catchProps(event.catches),
        pushOn: event.pushOn === 'none' ? 'none' : outcome(event.pushOn),
        xp: int(event.xp, 100_000),
        stars: int(event.stars, 3),
      };
    case 'expedition_recall':
      return {
        duration: length(event.duration),
        destination: destination(event.destination),
        supplies: supplyIds(event.supplies),
        elapsedPct: int(event.elapsedPct, 100),
        catches: catchProps(event.catches),
      };
    case 'push_on_offer':
      return {
        destination: destination(event.destination),
        duration: length(event.duration),
        rank: int(event.rank, 99),
        goals: event.goals
          .slice(0, RULES.expeditions.pushOn.maxGoals)
          .map((id) => fromSet(GOAL_SET, id)),
      };
    case 'push_on_choose':
      return {
        goal: fromSet(GOAL_SET, event.goal),
        risk: risk(event.risk),
        destination: destination(event.destination),
        duration: length(event.duration),
        oddsBp: int(event.oddsBp, 10_000),
      };
    case 'push_on_result':
      return {
        goal: fromSet(GOAL_SET, event.goal),
        risk: risk(event.risk),
        outcome: outcome(event.outcome),
        destination: destination(event.destination),
        duration: length(event.duration),
        oddsBp: int(event.oddsBp, 10_000),
      };
    case 'journal_find':
      return {
        entry: fromSet(JOURNAL_IDS, event.entry),
        place: event.place === 'any' ? 'any' : destination(event.place),
        set: event.set === null ? null : fromSet(JOURNAL_SET_IDS, event.set),
        setComplete: bool(event.setComplete),
      };
    case 'explorer_rank':
      return { species: species(event.species), rank: int(event.rank, 99) };
    case 'familiarity_star':
      return { destination: destination(event.destination), stars: int(event.stars, 3) };
    case 'slot_unlock':
      return { slots: int(event.slots, 99), rankSum: int(event.rankSum, 9_999) };
    case 'train':
      return { species: species(event.species), level: int(event.level), cost: int(event.cost) };
    case 'creature_exp':
      return {
        source: oneOf(
          ['trip', 'dungeon', 'raid', 'job', 'lounge', 'games', 'ribbon', 'evolve'] as const,
          event.source,
          'trip',
        ),
        species: species(event.species),
        gained: int(event.gained, 1_000_000),
        treat: bool(event.treat),
        levelBefore: int(event.levelBefore, 99),
        level: int(event.level, 99),
        waiting: bool(event.waiting),
      };
    case 'treat':
      return {
        source: oneOf(['trip', 'dungeon', 'job'] as const, event.source, 'trip'),
        species: species(event.species),
        level: int(event.level, 99),
        cost: int(event.cost, 1_000),
      };
    case 'ribbon':
      return {
        species: species(event.species),
        ribbon: oneOf(['bronze', 'silver', 'gold'] as const, event.ribbon, 'bronze'),
      };
    case 'level_reset':
      return {
        creatures: int(event.creatures, 10_000),
        levels: int(event.levels, 1_000_000),
        bait: int(event.bait, 100_000_000),
        unequipped: int(event.unequipped, 10_000),
        talentsToBook: int(event.talentsToBook, 10_000),
      };
    case 'catch_pity':
      return {
        pity: oneOf(['new', 'creature'] as const, event.pity, 'creature'),
        species: species(event.species),
      };
    case 'evolve':
      return { from: species(event.from), to: species(event.to), cost: int(event.cost) };
    case 'fuse':
      return {
        species: species(event.species),
        rarity: oneOf(RARITIES, event.rarity, 'common'),
        converted: bool(event.converted),
        fusionCount: int(event.fusionCount, 99),
        bait: int(event.bait),
      };
    case 'talent_roll':
      return {
        species: species(event.species),
        talent: fromSet(TALENT_IDS, event.talent),
        golden: bool(event.golden),
        ...(event.backfill === true ? { backfill: true } : {}),
      };
    case 'duplicate_choice':
      return {
        choice: oneOf(['teach', 'fuse', 'release', 'keep'] as const, event.choice, 'release'),
        auto: bool(event.auto),
        species: species(event.species),
        rarity: oneOf(RARITIES, event.rarity, 'common'),
        talent: fromSet(TALENT_IDS, event.talent),
        golden: bool(event.golden),
      };
    case 'talent_slot':
      return {
        species: species(event.species),
        talent: fromSet(TALENT_IDS, event.talent),
        golden: bool(event.golden),
        slot: int(event.slot, 3),
      };
    case 'roster_optout':
      return { optOut: bool(event.optOut) };
    case 'team_set':
      return { auto: bool(event.auto), species: event.species.slice(0, 3).map(species) };
    case 'placement':
      return {
        action: oneOf(['place', 'unplace'] as const, event.action, 'place'),
        species: species(event.species),
        slot: int(event.slot, 99),
        swap: bool(event.swap),
      };
    case 'ability_pick':
      return { ability: fromSet(ABILITY_IDS, event.ability) };
    case 'autofire_toggle':
      return {
        target: event.target === 'creature' ? 'creature' : 'basic',
        species: event.species === null ? null : species(event.species),
        on: bool(event.on),
      };
    case 'live_join':
      return { stage: event.stage === 'lobby' ? 'lobby' : 'fight', practice: bool(event.practice) };
    case 'live_action':
      return {
        action: oneOf(['fire', 'hold', 'unhold'] as const, event.action, 'fire'),
        ability: fromSet(ABILITY_IDS, event.ability),
        round: int(event.round, 99),
        defaultRound: int(event.defaultRound, 99),
        practice: bool(event.practice),
      };
    case 'phase_result':
      return {
        phase: oneOf(['phase1', 'phase2', 'finale'] as const, event.phase, 'phase1'),
        boss: fromSet(BOSS_IDS, event.boss),
        rank: int(event.rank, 999),
        festival: bool(event.festival),
        partySize: int(event.partySize, 999),
        win: bool(event.win),
        rounds: int(event.rounds, 99),
        topShareBp: int(event.topShareBp, 10_000),
      };
    case 'rank_change':
      return {
        before: int(event.before, 999),
        after: int(event.after, 999),
        won: bool(event.won),
        festival: bool(event.festival),
        parties: int(event.parties, 999),
        partiesWon: int(event.partiesWon, 999),
      };
    case 'raid_week_redeclared':
      return {
        boss: fromSet(BOSS_IDS, event.boss),
        versionBefore: int(event.versionBefore, 9_999),
        versionAfter: int(event.versionAfter, 9_999),
        rankBefore: event.rankBefore === null ? null : int(event.rankBefore, 999),
        rankAfter: event.rankAfter === null ? null : int(event.rankAfter, 999),
        effectiveRankBefore:
          event.effectiveRankBefore === null ? null : int(event.effectiveRankBefore, 999),
        effectiveRankAfter:
          event.effectiveRankAfter === null ? null : int(event.effectiveRankAfter, 999),
        placedAgain: bool(event.placedAgain),
      };
    case 'festival_grant':
      return {
        species: species(event.species),
        result: oneOf(CATCH_RESULTS, event.result, 'new'),
      };
    case 'gear_drop':
      return {
        source: oneOf(GEAR_SOURCES, event.source, 'raid_phase'),
        gear: event.gear.slice(0, MAX_DROP_ITEMS).map((g) => ({
          base: gearBase(g.base),
          rarity: gearRarity(g.rarity),
          ...(g.level === undefined ? {} : { level: int(g.level, RULES.gear.maxItemLevel) }),
          ...(g.lines === undefined
            ? {}
            : {
                lines: g.lines.slice(0, 3).map((l) => ({
                  id: fromSet(GEAR_LINE_IDS, l.id),
                  tier: int(l.tier, 4),
                })),
              }),
        })),
        converted: int(event.converted, 99),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        blueprint: event.blueprint === null ? null : gearBase(event.blueprint),
        blueprintDuplicate: bool(event.blueprintDuplicate),
        ...(event.supplies === undefined || event.supplies <= 0
          ? {}
          : { supplies: int(event.supplies, 99) }),
        ...withParts(event.parts),
      };
    case 'gear_equip':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        level: int(event.level, RULES.gear.maxItemLevel),
        ...(event.slot === undefined ? {} : { slot: oneOf(GEAR_SLOTS, event.slot, 'hat') }),
        species: species(event.species),
        action: event.action === 'unequip' ? 'unequip' : 'equip',
        swap: bool(event.swap),
      };
    case 'gear_upgrade':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        from: int(event.from, 5),
        to: int(event.to, 5),
        essence: int(event.essence),
        scrap: int(event.scrap),
      };
    case 'gear_dismantle':
      return {
        base: gearBase(event.base),
        rarity: gearRarity(event.rarity),
        level: int(event.level, RULES.gear.maxItemLevel),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        unequipped: bool(event.unequipped),
        ...withParts(event.parts),
        ...(event.items === undefined ? {} : { items: int(event.items, 5) }),
        ...(event.essence === undefined ? {} : { essence: int(event.essence, 1_000) }),
        ...(event.learned === undefined ? {} : { learned: int(event.learned, 5) }),
        ...(event.marks === undefined ? {} : { marks: int(event.marks, 5) }),
      };
    case 'job_start':
      return {
        job: oneOf(JOB_KINDS, event.job, 'craft'),
        base: fromSet(JOB_BASE_IDS, event.base),
        rarity: gearRarity(event.rarity),
        species: species(event.species),
        hours: int(event.hours, 99),
        skillLevel: int(event.skillLevel, 99),
        ...withParts(event.parts),
        ...(event.reach === undefined ? {} : { reach: oneOf(REACH_IDS, event.reach, 'none') }),
        ...(event.essence === undefined ? {} : { essence: int(event.essence, 1_000) }),
        ...(event.items === undefined ? {} : { items: int(event.items, 5) }),
        ...(event.bait === undefined || event.bait <= 0 ? {} : { bait: int(event.bait, 100_000) }),
      };
    case 'job_claim':
      return {
        job: oneOf(JOB_KINDS, event.job, 'craft'),
        base: fromSet(JOB_BASE_IDS, event.base),
        rarity: gearRarity(event.rarity),
        upgraded: bool(event.upgraded),
        xp: int(event.xp, 100_000),
        skillLevel: int(event.skillLevel, 99),
        leveledUp: bool(event.leveledUp),
        ...(event.yield === undefined || event.yield <= 0 ? {} : { yield: int(event.yield, 99) }),
        ...(event.reach === undefined ? {} : { reach: oneOf(REACH_IDS, event.reach, 'none') }),
        ...(event.items === undefined ? {} : { items: int(event.items, 5) }),
      };
    case 'dungeon_run':
      return {
        depth: int(event.depth, 9_999),
        attempt: int(event.attempt, 2),
        roomsCleared: int(event.roomsCleared, 99),
        cleared: bool(event.cleared),
        landmark: bool(event.landmark),
        modifiers: event.modifiers.slice(0, 6).map((m) => fromSet(MODIFIER_IDS, m)),
        team: event.team
          .slice(0, 3)
          .map((t) => ({ species: species(t.species), role: oneOf(ROLE_IDS, t.role, 'setter') })),
        gear: int(event.gear, 9),
        ...(event.outcome === undefined
          ? {}
          : { outcome: oneOf(DUNGEON_OUTCOMES, event.outcome, 'defeat') }),
        ...(event.path === undefined
          ? {}
          : { path: event.path.slice(0, 24).map((k) => oneOf(NODE_KIND_IDS, k, 'fight')) }),
        ...(event.keepsakes === undefined
          ? {}
          : { keepsakes: event.keepsakes.slice(0, 12).map((k) => fromSet(KEEPSAKE_IDS, k)) }),
        ...(event.campChoice === undefined
          ? {}
          : { campChoice: oneOf([...CAMP_CHOICES, 'none'] as const, event.campChoice, 'none') }),
        ...(event.elites === undefined ? {} : { elites: int(event.elites, 9) }),
        ...(event.packFound === undefined ? {} : { packFound: int(event.packFound, 999) }),
        ...(event.packKept === undefined ? {} : { packKept: int(event.packKept, 999) }),
        ...(event.deepest === undefined ? {} : { deepest: int(event.deepest, 3) }),
        ...(event.marks === undefined
          ? {}
          : { marks: event.marks.slice(0, 2).map((m) => oneOf(UNDERCROFT_MARK_IDS, m, 'fight')) }),
      };
    case 'dungeon_descend':
      return { level: int(event.level, 3) };
    case 'dungeon_event':
      return {
        event: fromSet(DUNGEON_EVENT_IDS, event.event),
        option: int(event.option, 1),
        ...(event.won === undefined ? {} : { won: bool(event.won) }),
      };
    case 'dungeon_camp':
      return { choice: oneOf(CAMP_CHOICES, event.choice, 'rest') };
    case 'dungeon_reward':
      return {
        depth: int(event.depth, 9_999),
        bait: int(event.bait),
        essence: int(event.essence),
        scrap: int(event.scrap),
        shards: int(event.shards),
        glimmer: int(event.glimmer),
        gear: int(event.gear, 99),
        supplies: int(event.supplies, 99),
        landmark: bool(event.landmark),
        streakBonusDay: int(event.streakBonusDay, 99),
      };
    case 'weather_draw':
      return {
        boon: fromSet(WEATHER_IDS, event.boon),
        omen: event.omen === null ? null : fromSet(WEATHER_IDS, event.omen),
        wild: bool(event.wild),
        rank: int(event.rank, 99),
        festival: bool(event.festival),
        boonBp: int(event.boonBp, 100_000),
        omenBp: int(event.omenBp, 100_000),
      };
    case 'weather_use':
      return {
        where: oneOf(['trip', 'job', 'dungeon', 'raid'] as const, event.where, 'trip'),
        boon: fromSet(WEATHER_IDS, event.boon),
        omen: event.omen === null ? null : fromSet(WEATHER_IDS, event.omen),
      };
    case 'dev_action':
      return { tool: oneOf(DEV_ACTION_TOOLS, event.tool, 'clock') };
    case 'games_entry':
      return { event: fromSet(GAMES_EVENT_IDS, event.event), creatures: int(event.creatures, 9) };
    case 'games_show':
      return {
        events: int(event.events, 99),
        skipped: int(event.skipped, 99),
        entrants: int(event.entrants, 10_000),
        players: int(event.players, 10_000),
      };
    case 'games_buy':
      return { offer: fromSet(GAMES_OFFER_IDS, event.offer), price: int(event.price, 999) };
    case 'post_result':
      return {
        result: oneOf(['sent', 'retry', 'failed'] as const, event.result, 'failed'),
        error:
          event.error === null ? null : POST_ERRORS.has(event.error) ? event.error : 'rejected',
        attempts: int(event.attempts, 99),
      };
    case 'dm_pref':
      return {
        which: oneOf(['trip', 'job', 'finale', 'stall'] as const, event.which, 'trip'),
        on: event.on === true,
      };
    case 'dm_result':
      return {
        result: oneOf(['sent', 'retry', 'failed', 'blocked'] as const, event.result, 'failed'),
        error:
          event.error === null ? null : POST_ERRORS.has(event.error) ? event.error : 'rejected',
        attempts: int(event.attempts, 99),
      };
  }
}

/** A props JSON string, or `{"truncated":true}` if it is longer than `MAX_PROPS_CHARS`. */
export function capJson(json: string): string {
  return json.length <= MAX_PROPS_CHARS ? json : '{"truncated":true}';
}

/** The stored JSON of an event's props: never longer than `MAX_PROPS_CHARS`. */
export function serializeProps(event: AnalyticsEvent): string {
  return capJson(JSON.stringify(propsOf(event)));
}
