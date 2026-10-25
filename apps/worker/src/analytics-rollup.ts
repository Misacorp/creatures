/**
 * Daily analytics rollups of a guild (table `analytics_daily`, migration 20; plan in
 * `docs/design/analytics.md`). Once a day the guild alarm turns the raw events (and the ledger and
 * finale tables) of the previous game day into rows `(day, metric, dims, value)`, so reports stay
 * cheap and the raw events can expire after 90 days.
 *
 * - A day is a **game day**: it starts at the daily reset (`RULES.daily.reset`, 13:37) in the guild's
 *   timezone, which is passed in explicitly. The `day` of a row is the 'YYYY-MM-DD' date the game day
 *   started on.
 * - Every value is a non-negative integer: a count, or a sum of integers. `dims` hold content ids,
 *   enums and small integers only (each value is checked again when it is stored), never a user, a
 *   hash or text. Distinct-player counts are computed here from the hashed actors and only the count
 *   is stored.
 * - Recomputing a day replaces its rows in one transaction, so a rollup is idempotent. A `rolled`
 *   row marks a day as done (also when nothing happened), which is how missed days are found: the
 *   last rolled day is the newest `rolled` row, and a run catches up from the day after it, at most
 *   `MAX_CATCH_UP_DAYS` days back.
 * - Events of kind `dev_action` and ledger rows with `source = 'dev'` (the staging dev tools'
 *   set-balances) never count.
 * - Staging only, accepted: with the dev clock moved, ledger and `raid_live` times are on the game
 *   clock while events are stamped in real time, so a day's rows can mix the two and day
 *   attribution can be off.
 */
import { PART_KINDS, RULES, expeditionContent } from '@creatures/game';
import { addDays, gameDay, gameDayEnd, zonedTimeToEpoch } from './time';

/** Most game days one run rolls up when days were missed. */
export const MAX_CATCH_UP_DAYS = 14;
/** Rollup rows older than this are deleted (they are tiny; this only bounds the table). */
const RETENTION_DAYS = 400;
/** Event kinds that are never counted. */
const EXCLUDED_KINDS: ReadonlySet<string> = new Set(['dev_action']);

export type DimValue = string | number;

/** One rollup row as stored. `dimsJson` is the canonical (sorted keys) JSON of the dims. */
export interface DailyRow {
  day: string;
  metric: string;
  dimsJson: string;
  value: number;
}

/** Migration 20: the rollup table. */
export function analyticsRollupMigration(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE analytics_daily (
    day TEXT NOT NULL,
    metric TEXT NOT NULL,
    dims_json TEXT NOT NULL,
    value INTEGER NOT NULL CHECK (value >= 0),
    PRIMARY KEY (day, metric, dims_json)
  )`);
}

// --- Tally ---

const LABEL_RE = /^[a-z0-9_.:-]{1,48}$/;
/** A hex run this long is a hash, never a content id. */
const HASH_LIKE_RE = /[0-9a-f]{24,}/;
/** 15 or more digits and nothing else is a Discord snowflake, never a content id. */
const SNOWFLAKE_LIKE_RE = /^\d{15,}$/;
/** A UUID, with or without dashes, is an identifier, never a content id. */
const UUID_LIKE_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** A dim value that is safe to store and show: an id-like string or a non-negative integer. */
function dimValue(value: unknown): DimValue {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, Math.trunc(value))) : 0;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (
    typeof value === 'string' &&
    LABEL_RE.test(value) &&
    !HASH_LIKE_RE.test(value) &&
    !SNOWFLAKE_LIKE_RE.test(value) &&
    !UUID_LIKE_RE.test(value)
  ) {
    return value;
  }
  return 'other';
}

/** The canonical JSON of dims: keys sorted, every value checked. */
export function canonicalDims(dims: Record<string, unknown>): string {
  const out: Record<string, DimValue> = {};
  for (const key of Object.keys(dims).sort()) out[key] = dimValue(dims[key]);
  return JSON.stringify(out);
}

class Tally {
  private readonly map = new Map<string, { metric: string; dimsJson: string; value: number }>();

  add(metric: string, dims: Record<string, unknown>, amount = 1): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    const dimsJson = canonicalDims(dims);
    const key = `${metric}\u0000${dimsJson}`;
    const row = this.map.get(key);
    if (row === undefined) this.map.set(key, { metric, dimsJson, value: amount });
    else row.value += amount;
  }

  rows(): { metric: string; dimsJson: string; value: number }[] {
    return [...this.map.values()];
  }
}

// --- Reading event props ---

type Props = Record<string, unknown>;

const str = (p: Props, key: string, fallback = 'unknown'): string => {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
};
const num = (p: Props, key: string): number => {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
};
const flag = (p: Props, key: string): number => (p[key] === true ? 1 : 0);
const list = (p: Props, key: string): unknown[] => {
  const v = p[key];
  return Array.isArray(v) ? v : [];
};
const record = (v: unknown): Props =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Props) : {};

/** The part kinds of a stored `parts` prop (an object by kind), or null when it is absent. */
function partsOf(p: Props): [string, number][] | null {
  const raw = p['parts'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const bag = raw as Props;
  return PART_KINDS.flatMap((kind) => {
    const n = bag[kind];
    return typeof n === 'number' && n > 0 ? [[kind, Math.trunc(n)] as [string, number]] : [];
  });
}

const USER_FEATURE: Record<string, string> = {
  expedition_send: 'expeditions',
  expedition_claim: 'expeditions',
  expedition_recall: 'expeditions',
  push_on_choose: 'expeditions',
  job_start: 'workshop',
  job_claim: 'workshop',
  dungeon_run: 'dungeon',
  gear_equip: 'gear',
  gear_upgrade: 'gear',
  gear_dismantle: 'gear',
  games_entry: 'games',
  games_buy: 'games',
  train: 'collection',
  creature_exp: 'collection',
  treat: 'collection',
  ribbon: 'collection',
  evolve: 'collection',
  team_set: 'raid',
  placement: 'raid',
  ability_pick: 'raid',
  autofire_toggle: 'raid',
  live_join: 'raid',
  live_action: 'raid',
};

const SUPPLY_YIELD: ReadonlyMap<string, number> = new Map(
  expeditionContent.supplies.map((s) => [s.id, s.blueprint.yield]),
);

type EventRow = { kind: string; actor_hash: string | null; props_json: string };

/** Flow rows: where a currency or part came from (`source`) and where it went (`sink`). */
function flow(tally: Tally, currency: string, dir: 'source' | 'sink', label: string, n: number) {
  tally.add('flow', { currency, dir, label }, n);
}

/** Tallies one event's feature use and resource flow. */
function tallyEvent(tally: Tally, kind: string, p: Props): void {
  switch (kind) {
    case 'starter_chosen':
      tally.add('starters', { species: str(p, 'species') });
      break;
    case 'daily_allowance':
      tally.add('economy.allowance', {});
      break;
    case 'train':
      tally.add('collection.train', {});
      break;
    case 'creature_exp':
      tally.add('collection.exp', { source: str(p, 'source'), treat: flag(p, 'treat') });
      tally.add('collection.exp_sum', { source: str(p, 'source') }, num(p, 'gained'));
      if (num(p, 'level') > num(p, 'levelBefore')) {
        tally.add(
          'collection.level_up',
          { source: str(p, 'source') },
          num(p, 'level') - num(p, 'levelBefore'),
        );
      }
      if (flag(p, 'waiting') === 1) tally.add('collection.exp_waiting', { level: num(p, 'level') });
      break;
    case 'treat':
      // The Bait itself is a ledger row (purpose `treat`) and reaches the flows from there.
      tally.add('collection.treat', { source: str(p, 'source') });
      break;
    case 'ribbon': {
      const ribbon = str(p, 'ribbon');
      tally.add('collection.ribbon', { ribbon });
      const def = RULES.experience.ribbons.find((r) => r.id === ribbon);
      if (def !== undefined) {
        flow(tally, 'scrap', 'sink', 'ribbon', def.scrap);
        flow(tally, 'shard-any', 'sink', 'ribbon', def.shards);
        flow(tally, 'glimmer', 'sink', 'ribbon', def.glimmer);
      }
      break;
    }
    case 'level_reset':
      // The refunded Bait is a ledger row (source `level_reset`) and reaches the flows from there.
      tally.add('collection.level_reset', {});
      tally.add('collection.level_reset_levels', {}, num(p, 'levels'));
      break;
    case 'catch_pity':
      tally.add('expedition.pity', { pity: str(p, 'pity') });
      break;
    case 'evolve':
      tally.add('collection.evolve', {});
      break;
    case 'fuse':
      tally.add('collection.fuse', { converted: flag(p, 'converted') });
      break;
    case 'talent_roll':
      tally.add('collection.talent_roll', {
        golden: flag(p, 'golden'),
        backfill: flag(p, 'backfill'),
      });
      break;
    case 'duplicate_choice':
      tally.add('collection.duplicate_choice', {
        choice: str(p, 'choice'),
        rarity: str(p, 'rarity'),
        auto: flag(p, 'auto'),
      });
      break;
    case 'talent_slot':
      tally.add('collection.talent_slot', { slot: num(p, 'slot') });
      flow(tally, 'bait', 'sink', 'talent_slot', RULES.talents.bookSlotBait);
      break;

    // --- Expeditions ---
    case 'expedition_send': {
      const supplies = list(p, 'supplies');
      tally.add('expedition.send', {
        destination: str(p, 'destination'),
        length: str(p, 'duration'),
      });
      tally.add('explorer.send_rank', { rank: num(p, 'rank') });
      for (const id of supplies) tally.add('expedition.supply_used', { supply: id });
      tally.add('expedition.supply_kit', { size: supplies.length });
      flow(tally, 'supplies', 'sink', 'expedition', supplies.length);
      // Trips sent before 2026-10-16 may carry supplies bought with Bait (`bought`); none are now.
      flow(tally, 'supplies', 'source', 'buy', num(p, 'bought'));
      break;
    }
    case 'expedition_claim':
    case 'expedition_recall': {
      const claim = kind === 'expedition_claim';
      tally.add(claim ? 'expedition.claim' : 'expedition.recall', {
        destination: str(p, 'destination'),
        length: str(p, 'duration'),
      });
      if (claim) {
        tally.add('expedition.wait_min_sum', {}, num(p, 'waitedMin'));
        tally.add('expedition.xp_sum', {}, num(p, 'xp'));
      } else {
        tally.add('expedition.recall_elapsed_pct_sum', {}, num(p, 'elapsedPct'));
      }
      for (const c of list(p, 'catches')) {
        const catchProps = record(c);
        tally.add('expedition.catch', {
          rarity: str(catchProps, 'rarity'),
          result: str(catchProps, 'result'),
        });
        if (catchProps['shiny'] === true) tally.add('expedition.catch_shiny', {});
      }
      break;
    }
    case 'push_on_offer': {
      const goals = list(p, 'goals');
      if (goals.length === 0) tally.add('pushon.offer_empty', {});
      else tally.add('pushon.offered', {});
      for (const goal of goals) tally.add('pushon.goal_offered', { goal });
      break;
    }
    case 'push_on_choose':
      tally.add('pushon.chosen', { goal: str(p, 'goal'), risk: str(p, 'risk') });
      break;
    case 'push_on_result':
      tally.add('pushon.result', { risk: str(p, 'risk'), outcome: str(p, 'outcome') });
      break;
    case 'journal_find':
      tally.add('journal.find', { entry: str(p, 'entry'), place: str(p, 'place') });
      if (flag(p, 'setComplete') === 1) tally.add('journal.set_complete', { set: str(p, 'set') });
      break;
    case 'explorer_rank':
      tally.add('explorer.rank_up', { rank: num(p, 'rank') });
      break;
    case 'familiarity_star':
      tally.add('expedition.stars', { destination: str(p, 'destination'), stars: num(p, 'stars') });
      break;
    case 'slot_unlock':
      tally.add('expedition.slots', { slots: num(p, 'slots') });
      break;

    // --- Workshop ---
    case 'job_start': {
      tally.add('workshop.job_start', { job: str(p, 'job') });
      tally.add('workshop.start_base', { job: str(p, 'job'), base: str(p, 'base') });
      for (const [part, n] of partsOf(p) ?? [])
        flow(tally, part, 'sink', `workshop_${str(p, 'job')}`, n);
      if (num(p, 'bait') > 0) flow(tally, 'bait', 'sink', 'lure', num(p, 'bait'));
      break;
    }
    case 'job_claim':
      tally.add('workshop.job_claim', { job: str(p, 'job') });
      tally.add('workshop.skill_level', { level: num(p, 'skillLevel') });
      if (flag(p, 'leveledUp') === 1)
        tally.add('workshop.level_up', { level: num(p, 'skillLevel') });
      if (flag(p, 'upgraded') === 1) tally.add('workshop.craft_upgraded', {});
      if (str(p, 'job') === 'supply') {
        const amount = num(p, 'yield') || (SUPPLY_YIELD.get(str(p, 'base')) ?? 0);
        flow(tally, 'supplies', 'source', 'craft', amount);
      }
      break;

    // --- Dungeon ---
    case 'dungeon_run': {
      const cleared = flag(p, 'cleared');
      tally.add('dungeon.run', { attempt: num(p, 'attempt'), cleared });
      tally.add('dungeon.depth', { depth: num(p, 'depth') });
      if (cleared === 1) tally.add('dungeon.clear_depth', { depth: num(p, 'depth') });
      tally.add('dungeon.rooms_cleared_sum', {}, num(p, 'roomsCleared'));
      tally.add('dungeon.gear_worn', { worn: num(p, 'gear') });
      for (const m of list(p, 'modifiers')) tally.add('dungeon.modifier', { modifier: m });
      // The map runs (docs/design/dungeon-paths.md): how they ended, what the camp gave, what came home.
      if (typeof p['outcome'] === 'string')
        tally.add('dungeon.outcome', { outcome: str(p, 'outcome') });
      if (typeof p['campChoice'] === 'string') {
        tally.add('dungeon.camp_choice', { choice: str(p, 'campChoice') });
      }
      tally.add('dungeon.elites_sum', {}, num(p, 'elites'));
      tally.add('dungeon.pack_found_sum', {}, num(p, 'packFound'));
      tally.add('dungeon.pack_kept_sum', {}, num(p, 'packKept'));
      // The Undercroft: how many levels a run cleared, and what its carved door added.
      if (typeof p['deepest'] === 'number')
        tally.add('dungeon.deepest', { levels: num(p, 'deepest') });
      for (const m of list(p, 'marks')) tally.add('dungeon.mark', { mark: m });
      for (const t of list(p, 'team')) {
        const member = record(t);
        tally.add('dungeon.team_species', { species: str(member, 'species') });
        tally.add('dungeon.team_role', { role: str(member, 'role') });
      }
      break;
    }
    case 'dungeon_event':
      tally.add('dungeon.event', { event: str(p, 'event'), option: num(p, 'option') });
      break;
    case 'dungeon_camp':
      tally.add('dungeon.camp', { choice: str(p, 'choice') });
      break;
    case 'dungeon_descend':
      tally.add('dungeon.descend', { level: num(p, 'level') });
      break;
    case 'dungeon_reward':
      if (num(p, 'streakBonusDay') > 0) {
        tally.add('dungeon.streak_bonus', { day: num(p, 'streakBonusDay') });
      }
      break;

    // --- Gear ---
    case 'gear_drop': {
      const source = str(p, 'source');
      tally.add('gear.drop_event', { source });
      for (const g of list(p, 'gear')) {
        const item = record(g);
        tally.add('gear.drop', { source, rarity: str(item, 'rarity') });
      }
      tally.add('gear.drop_converted', { source }, num(p, 'converted'));
      if (p['blueprint'] !== null && p['blueprint'] !== undefined) {
        tally.add('gear.blueprint', { duplicate: flag(p, 'blueprintDuplicate') });
      }
      const parts = partsOf(p);
      if (parts !== null) {
        for (const [part, n] of parts) flow(tally, part, 'source', source, n);
      } else {
        // Events from before the per-kind breakdown only have the totals.
        flow(tally, 'scrap', 'source', source, num(p, 'scrap'));
        flow(tally, 'shard-any', 'source', source, num(p, 'shards'));
        flow(tally, 'glimmer', 'source', source, num(p, 'glimmer'));
      }
      flow(tally, 'supplies', 'source', source, num(p, 'supplies'));
      break;
    }
    // --- Valley Games ---
    case 'games_entry':
      tally.add('games.entry', { event: str(p, 'event') });
      tally.add('games.entry_creatures_sum', { event: str(p, 'event') }, num(p, 'creatures'));
      break;
    case 'games_show':
      tally.add('games.show', {});
      tally.add('games.show_events_sum', {}, num(p, 'events'));
      tally.add('games.show_skipped_sum', {}, num(p, 'skipped'));
      tally.add('games.show_entrants_sum', {}, num(p, 'entrants'));
      tally.add('games.show_players_sum', {}, num(p, 'players'));
      break;
    case 'games_buy':
      tally.add('games.buy', { offer: str(p, 'offer') });
      // Medal points are not a ledger currency; the Prize Stall spend is counted here.
      flow(tally, 'medals', 'sink', 'prize_stall', num(p, 'price'));
      break;
    case 'gear_equip':
      tally.add('gear.equip', { action: str(p, 'action'), rarity: str(p, 'rarity') });
      break;
    case 'gear_upgrade':
      tally.add('gear.upgrade', { rarity: str(p, 'rarity'), to: num(p, 'to') });
      flow(tally, 'scrap', 'sink', 'upgrade', num(p, 'scrap'));
      break;
    case 'gear_dismantle': {
      tally.add('gear.dismantle', { rarity: str(p, 'rarity') });
      const parts = partsOf(p);
      if (parts !== null) {
        for (const [part, n] of parts) flow(tally, part, 'source', 'dismantle', n);
      } else {
        flow(tally, 'scrap', 'source', 'dismantle', num(p, 'scrap'));
        flow(tally, 'shard-any', 'source', 'dismantle', num(p, 'shards'));
        flow(tally, 'glimmer', 'source', 'dismantle', num(p, 'glimmer'));
      }
      break;
    }

    // --- Raid ---
    case 'phase_result':
      tally.add('raid.phase', {
        phase: str(p, 'phase'),
        rank: num(p, 'rank'),
        festival: flag(p, 'festival'),
        win: flag(p, 'win'),
      });
      tally.add('raid.party_size_sum', { phase: str(p, 'phase') }, num(p, 'partySize'));
      tally.add('raid.top_share_bp_sum', { phase: str(p, 'phase') }, num(p, 'topShareBp'));
      break;
    case 'rank_change': {
      const before = num(p, 'before');
      const after = num(p, 'after');
      tally.add('raid.rank_change', {
        direction: after > before ? 'up' : after < before ? 'down' : 'same',
        festival: flag(p, 'festival'),
      });
      break;
    }
    case 'festival_grant':
      tally.add('raid.festival_grant', { result: str(p, 'result') });
      break;
    case 'roster_optout':
      tally.add('raid.optout', { optOut: flag(p, 'optOut') });
      break;
    case 'team_set':
      tally.add('raid.team_set', { auto: flag(p, 'auto') });
      for (const s of list(p, 'species')) tally.add('raid.team_species', { species: s });
      break;
    case 'ability_pick':
      tally.add('raid.ability_pick', { ability: str(p, 'ability') });
      break;
    case 'autofire_toggle':
      tally.add('raid.autofire_toggle', { target: str(p, 'target'), on: flag(p, 'on') });
      break;
    case 'live_join':
      tally.add('raid.live_join', { stage: str(p, 'stage'), practice: flag(p, 'practice') });
      break;
    case 'live_action': {
      const action = str(p, 'action');
      const practice = flag(p, 'practice');
      tally.add('raid.live_action', { action, practice });
      if (action === 'fire') {
        const round = num(p, 'round');
        const base = num(p, 'defaultRound');
        tally.add('raid.hand_fire', {
          timing: round < base ? 'early' : round > base ? 'late' : 'on_default',
          practice,
        });
      }
      break;
    }
    case 'post_result':
      tally.add('post.result', { result: str(p, 'result'), error: str(p, 'error', 'none') });
      break;
    case 'dm_pref':
      tally.add('dm.pref', { which: str(p, 'which'), on: flag(p, 'on') === 1 ? 'on' : 'off' });
      break;
    case 'dm_result':
      tally.add('dm.result', { result: str(p, 'result'), error: str(p, 'error', 'none') });
      break;
    default:
      break;
  }
}

// --- The rollup ---

interface RollupStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

export interface RollupOptions {
  storage: RollupStorage;
  now: () => number;
  /** The guild's timezone, resolved by the caller (never defaulted here). */
  timezone: () => string;
}

export class AnalyticsRollup {
  constructor(private readonly options: RollupOptions) {}

  private get sql(): SqlStorage {
    return this.options.storage.sql;
  }

  /** The newest rolled day, or null when none was rolled yet. */
  lastRolledDay(): string | null {
    return (
      this.sql
        .exec<{ day: string | null }>(
          "SELECT MAX(day) AS day FROM analytics_daily WHERE metric = 'rolled'",
        )
        .one().day ?? null
    );
  }

  /**
   * Computes the rows of one game day from the events, the ledger and the finale tables. Pure with
   * respect to the rollup table: nothing is written.
   */
  compute(day: string, tz: string): { metric: string; dimsJson: string; value: number }[] {
    const start = zonedTimeToEpoch(day, RULES.daily.reset.hour, RULES.daily.reset.minute, tz);
    const end = gameDayEnd(day, tz, RULES.daily.reset);
    const tally = new Tally();

    const actors = new Set<string>();
    const newActors = new Set<string>();
    const featureActors = new Map<string, Set<string>>();
    const liveActors = new Set<string>();
    for (const event of this.sql
      .exec<EventRow>(
        'SELECT kind, actor_hash, props_json FROM analytics_events WHERE at >= ? AND at < ?',
        start,
        end,
      )
      .toArray()) {
      if (EXCLUDED_KINDS.has(event.kind)) continue;
      let props: Props = {};
      try {
        props = record(JSON.parse(event.props_json));
      } catch {
        // A damaged row still counts as an event of its kind.
      }
      tally.add('events', { kind: event.kind });
      const actor = event.actor_hash;
      if (actor !== null) {
        actors.add(actor);
        const feature = USER_FEATURE[event.kind];
        if (feature !== undefined) {
          const set = featureActors.get(feature) ?? new Set<string>();
          set.add(actor);
          featureActors.set(feature, set);
        }
        if (event.kind === 'live_join' && props['practice'] !== true) liveActors.add(actor);
      }
      if (event.kind === 'session_start') {
        tally.add('sessions', {});
        if (props['returning'] === false && actor !== null) newActors.add(actor);
      }
      tallyEvent(tally, event.kind, props);
    }
    tally.add('dau', {}, actors.size);
    tally.add('new_players', {}, newActors.size);
    for (const [feature, set] of featureActors) tally.add('users', { feature }, set.size);
    tally.add('raid.live_watchers', {}, liveActors.size);

    // Bait and Essence come from the ledger: every credit and debit has a source label.
    for (const row of this.sql
      .exec<{ currency: string; source: string; src: number; snk: number }>(
        `SELECT currency, source,
                SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS src,
                SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS snk
         FROM ledger WHERE created_at >= ? AND created_at < ? AND source <> 'dev'
         GROUP BY currency, source`,
        start,
        end,
      )
      .toArray()) {
      flow(tally, row.currency, 'source', row.source, row.src);
      flow(tally, row.currency, 'sink', row.source, row.snk);
    }

    // Finale fights that started in the day: who was in, and how the abilities were fired.
    for (const fight of this.sql
      .exec<{ practice: number; members: string; abilities: string }>(
        'SELECT practice, members, abilities FROM raid_live WHERE started_at >= ? AND started_at < ?',
        start,
        end,
      )
      .toArray()) {
      const practice = fight.practice === 1 ? 1 : 0;
      tally.add('raid.finale_fights', { practice });
      try {
        const members: unknown = JSON.parse(fight.members);
        if (Array.isArray(members)) tally.add('raid.finale_members', { practice }, members.length);
        const abilities: unknown = JSON.parse(fight.abilities);
        if (Array.isArray(abilities)) {
          for (const a of abilities) {
            const mode = record(a)['mode'];
            tally.add('raid.finale_ability', {
              practice,
              mode: mode === 'fired' || mode === 'held' ? mode : 'default',
            });
          }
        }
      } catch {
        // A damaged row only loses its details.
      }
    }

    tally.add('rolled', {});
    return tally.rows();
  }

  /** Rolls one game day up, replacing any rows it already has. Returns how many rows it wrote. */
  rollDay(day: string, tz: string): number {
    return this.store(day, this.compute(day, tz));
  }

  /**
   * Rolls up the game day in progress so far (the staging dev tools' "roll up now"). It leaves out the
   * `rolled` marker, so `runDue` still rolls the day again in full once it has finished.
   */
  rollToday(): string {
    const tz = this.options.timezone();
    const day = gameDay(this.options.now(), tz, RULES.daily.reset);
    this.store(
      day,
      this.compute(day, tz).filter((row) => row.metric !== 'rolled'),
    );
    return day;
  }

  private store(day: string, rows: { metric: string; dimsJson: string; value: number }[]): number {
    this.options.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM analytics_daily WHERE day = ?', day);
      for (const row of rows) {
        this.sql.exec(
          'INSERT INTO analytics_daily (day, metric, dims_json, value) VALUES (?, ?, ?, ?)',
          day,
          row.metric,
          row.dimsJson,
          row.value,
        );
      }
    });
    return rows.length;
  }

  /**
   * Rolls up every finished game day that is not rolled yet, oldest first, at most
   * `MAX_CATCH_UP_DAYS` back from the last finished day. Returns the days it rolled. Never throws:
   * a failure is logged and the next run tries again.
   */
  runDue(): string[] {
    const done: string[] = [];
    try {
      const tz = this.options.timezone();
      const now = this.options.now();
      const target = addDays(gameDay(now, tz, RULES.daily.reset), -1);
      const last = this.lastRolledDay();
      let first: string;
      if (last === null) {
        const earliest = this.sql
          .exec<{ at: number | null }>('SELECT MIN(at) AS at FROM analytics_events')
          .one().at;
        if (earliest === null) return done;
        first = gameDay(earliest, tz, RULES.daily.reset);
      } else {
        first = addDays(last, 1);
      }
      const floor = addDays(target, -(MAX_CATCH_UP_DAYS - 1));
      if (first < floor) first = floor;
      for (let day = first; day <= target; day = addDays(day, 1)) {
        this.rollDay(day, tz);
        done.push(day);
      }
      this.sql.exec('DELETE FROM analytics_daily WHERE day < ?', addDays(target, -RETENTION_DAYS));
    } catch (err) {
      console.error('analytics rollup failed', err instanceof Error ? err.name : 'unknown');
    }
    return done;
  }

  /** The stored rows of the days `from` to `to` (inclusive, 'YYYY-MM-DD'), oldest first. */
  rows(from: string, to: string): DailyRow[] {
    return this.sql
      .exec<{ day: string; metric: string; dims_json: string; value: number }>(
        `SELECT day, metric, dims_json, value FROM analytics_daily
         WHERE day >= ? AND day <= ? ORDER BY day, metric, dims_json`,
        from,
        to,
      )
      .toArray()
      .map((r) => ({ day: r.day, metric: r.metric, dimsJson: r.dims_json, value: r.value }));
  }
}
