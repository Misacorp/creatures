/**
 * Every way gear, parts and blueprints enter the game: a cleared raid phase (scrap), a won finale (one
 * gear roll), a won Festival finale (a Festival piece), an expedition claim (parts and blueprints) and
 * the welcome kit. Each grant is idempotent per (player, key) through `gear_grants`: the first call
 * draws from the live RNG and applies the grant, a repeat returns what the first one gave and draws
 * nothing. Call them inside the transaction of the action they belong to (they nest as savepoints).
 *
 * A full inventory never loses a drop: an item that does not fit becomes its dismantle yield, shown
 * as `converted`. A blueprint the player already knows becomes scrap.
 */
import {
  RULES,
  addParts,
  dismantleYield,
  gearBase,
  rollFestivalDrop,
  rollFinaleDrop,
  rollWelcomeKit,
  type Element,
  type GearRarity,
  type GearRolls,
  type PartsBundle,
  type RankGift,
  type Rng,
} from '@creatures/game';
import type { Analytics, GearSource } from './analytics';
import { addSupply } from './expedition-store';
import { creditParts, hasRoom, insertItem, learnBlueprint, partsTotal } from './gear-store';
import { credit, type LedgerStorage } from './ledger';

export interface GrantDeps {
  storage: LedgerStorage;
  now: () => number;
  /** Live randomness for drops. Crypto in production. */
  rng: Rng;
  analytics?: Analytics | undefined;
}

/** What a grant gave, as shown to the player. */
export interface GrantView {
  /** Items now in the inventory. */
  gear: { id: string; baseId: string; rarity: GearRarity }[];
  /** Items that would not fit and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity }[];
  /** All the parts the grant paid, including from converted items and duplicate blueprints. */
  parts: PartsBundle;
  blueprints: { baseId: string; rarity: GearRarity; duplicate: boolean }[];
  /** Supplies the grant gave, one id per supply (absent in grants stored before expeditions v2). */
  supplies?: string[];
}

/** A stored grant, for the list of recent loot. */
export interface GrantRecord extends GrantView {
  key: string;
  source: GearSource;
  at: number;
}

interface Draft {
  gear: { baseId: string; rarity: GearRarity; rolls: GearRolls }[];
  parts: PartsBundle;
  blueprints: string[];
  supplies?: string[];
}

const emptyView = (): GrantView => ({ gear: [], converted: [], parts: {}, blueprints: [] });

function shardCount(parts: PartsBundle): number {
  return (
    (parts['tide-shard'] ?? 0) +
    (parts['ember-shard'] ?? 0) +
    (parts['grove-shard'] ?? 0) +
    (parts['spark-shard'] ?? 0)
  );
}

function add(parts: PartsBundle, more: PartsBundle): void {
  for (const [kind, amount] of Object.entries(more) as [keyof PartsBundle, number][]) {
    if (amount > 0) parts[kind] = (parts[kind] ?? 0) + amount;
  }
}

/**
 * Applies a grant once. `draw` runs only for a first-time key (so a repeat consumes no randomness) and
 * is called inside the transaction. Returns what the grant gave and whether this call did it.
 */
function grantOnce(
  deps: GrantDeps,
  userId: string,
  key: string,
  source: GearSource,
  draw: () => Draft,
  actor?: string,
): { view: GrantView; fresh: boolean } {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const prior = sql
      .exec<{
        result_json: string;
      }>('SELECT result_json FROM gear_grants WHERE user_id = ? AND key = ?', userId, key)
      .toArray()[0];
    if (prior !== undefined)
      return { view: JSON.parse(prior.result_json) as GrantView, fresh: false };

    const now = deps.now();
    const draft = draw();
    const view = emptyView();
    const parts: PartsBundle = {};
    add(parts, draft.parts);
    for (const item of draft.gear) {
      if (hasRoom(sql, userId)) {
        const id = insertItem(sql, userId, item, source, now);
        view.gear.push({ id, baseId: item.baseId, rarity: item.rarity });
      } else {
        add(parts, dismantleYield({ baseId: item.baseId, rarity: item.rarity, level: 0 }));
        view.converted.push({ baseId: item.baseId, rarity: item.rarity });
      }
    }
    for (const baseId of draft.blueprints) {
      const base = gearBase(baseId);
      if (base === undefined) throw new Error('grant of an unknown blueprint');
      const learned = learnBlueprint(sql, userId, baseId, base.blueprint, now);
      if (!learned) add(parts, { scrap: RULES.gear.drops.duplicateBlueprintScrap });
      view.blueprints.push({ baseId, rarity: base.blueprint, duplicate: !learned });
    }
    creditParts(sql, userId, parts);
    view.parts = parts;
    const supplies = draft.supplies ?? [];
    for (const id of supplies) addSupply(sql, userId, id, 1);
    if (supplies.length > 0) view.supplies = [...supplies];
    sql.exec(
      'INSERT INTO gear_grants (user_id, key, source, result_json, created_at) VALUES (?, ?, ?, ?, ?)',
      userId,
      key,
      source,
      JSON.stringify(view),
      now,
    );
    if (
      view.gear.length > 0 ||
      view.converted.length > 0 ||
      view.blueprints.length > 0 ||
      supplies.length > 0 ||
      partsTotal(parts) > 0
    ) {
      const first = view.blueprints[0];
      deps.analytics?.record(
        {
          kind: 'gear_drop',
          source,
          gear: [...view.gear, ...view.converted].map((g) => ({
            base: g.baseId,
            rarity: g.rarity,
          })),
          converted: view.converted.length,
          scrap: parts.scrap ?? 0,
          shards: shardCount(parts),
          glimmer: parts.glimmer ?? 0,
          blueprint: first?.baseId ?? null,
          blueprintDuplicate: first?.duplicate ?? false,
          ...(supplies.length > 0 ? { supplies: supplies.length } : {}),
          parts,
        },
        actor,
      );
    }
    return { view, fresh: true };
  });
}

/** Scrap for a player of a party that cleared phase 1 or 2. Key `raid:<week>:<phase>`. */
export function grantRaidPhase(
  deps: GrantDeps,
  userId: string,
  weekId: string,
  phase: 'phase1' | 'phase2',
): GrantView {
  return grantOnce(deps, userId, `raid:${weekId}:${phase}`, 'raid_phase', () => ({
    gear: [],
    parts: { scrap: RULES.gear.drops.phaseScrap[phase] },
    blueprints: [],
  })).view;
}

/** One gear roll for a player of a party that won the finale, by the week's Boss Rank. Key `raid:<week>:finale`. */
export function grantRaidFinale(
  deps: GrantDeps,
  userId: string,
  weekId: string,
  rank: number,
): GrantView {
  return grantOnce(deps, userId, `raid:${weekId}:finale`, 'raid_finale', () => ({
    gear: [rollFinaleDrop(deps.rng, rank)],
    parts: {},
    blueprints: [],
  })).view;
}

/** The Festival piece for a player of a party that won a Festival finale. Key `festival:<week>`. */
export function grantFestivalGear(
  deps: GrantDeps,
  userId: string,
  weekId: string,
  element: Element,
): GrantView {
  return grantOnce(deps, userId, `festival:${weekId}`, 'festival', () => ({
    gear: [rollFestivalDrop(deps.rng, element)],
    parts: {},
    blueprints: [],
  })).view;
}

/**
 * What a claimed trip drops besides the catches: parts, maybe a blueprint, found supplies and (from a
 * push-on goal) gear. Key `expedition:<id>`. `draw` rolls it with `deps.rng` and runs only the first time,
 * so a repeat draws nothing and returns what the first claim gave.
 */
export function grantTripLoot(
  deps: GrantDeps,
  userId: string,
  expeditionId: string,
  draw: (rng: Rng) => {
    parts: PartsBundle;
    blueprints: string[];
    supplies: string[];
    gear: { baseId: string; rarity: GearRarity; rolls: GearRolls }[];
  },
): GrantView {
  return grantOnce(
    deps,
    userId,
    `expedition:${expeditionId}`,
    'expedition',
    () => {
      const loot = draw(deps.rng);
      return {
        gear: loot.gear,
        parts: loot.parts,
        blueprints: loot.blueprints,
        supplies: loot.supplies,
      };
    },
    userId,
  ).view;
}

/**
 * The one-time gift of reaching an explorer rank: parts and supplies through the grant ledger, Bait
 * through the Bait ledger. Idempotent per (creature, rank): key `rank:<creature>:<rank>` in both, so a
 * repeat gives nothing and returns what the first call gave. Call it inside the claim's transaction.
 * `fresh` is false for a repeat.
 */
export function grantRankGift(
  deps: GrantDeps,
  userId: string,
  creatureId: string,
  rank: number,
  gift: RankGift,
): { view: GrantView; fresh: boolean } {
  const key = `rank:${creatureId}:${String(rank)}`;
  return deps.storage.transactionSync(() => {
    const granted = grantOnce(
      deps,
      userId,
      key,
      'rank_gift',
      () => ({
        gear: [],
        parts: addParts({}, gift.parts),
        blueprints: [],
        supplies: [...gift.supplies],
      }),
      userId,
    );
    if (granted.fresh && gift.bait > 0) {
      credit(
        deps.storage,
        {
          userId,
          currency: 'bait',
          amount: gift.bait,
          source: 'rank_gift',
          idempotencyKey: key,
          meta: { creature: creatureId, rank },
        },
        deps.now(),
      );
    }
    return granted;
  });
}

/**
 * The welcome kit: a common item, a common blueprint and some scrap, so crafting can start on day 1.
 * Granted once per player (key `welcome`). Returns the grant and whether this call made it.
 */
export function grantWelcomeKit(
  deps: GrantDeps,
  userId: string,
): { view: GrantView; fresh: boolean } {
  return grantOnce(
    deps,
    userId,
    'welcome',
    'welcome',
    () => {
      const kit = rollWelcomeKit(deps.rng);
      return {
        gear: [kit.item],
        parts: { scrap: RULES.gear.drops.welcomeScrap },
        blueprints: [kit.blueprint],
      };
    },
    userId,
  );
}

/**
 * What a dungeon run drops: the scrap, glimmer and shard of its rooms and the gear its dice gave.
 * `draw` runs only for a first-time key, inside the transaction, and uses the live gear RNG. Key
 * `dungeon:<day>:<attempt>`, so a player's run of a day is paid once however often it is retried.
 */
export function grantDungeonRun(
  deps: GrantDeps,
  userId: string,
  day: string,
  attempt: number,
  draw: (rng: Rng) => { parts: PartsBundle; gear: Draft['gear'] },
): GrantView {
  return grantOnce(
    deps,
    userId,
    `dungeon:${day}:${String(attempt)}`,
    'dungeon',
    () => {
      const drawn = draw(deps.rng);
      return { gear: drawn.gear, parts: addParts({}, drawn.parts), blueprints: [] };
    },
    userId,
  ).view;
}

/** The parts of a streak bonus, paid once per day. Key `dungeon:<day>:streak`. */
export function grantDungeonStreak(
  deps: GrantDeps,
  userId: string,
  day: string,
  parts: PartsBundle,
): GrantView {
  return grantOnce(
    deps,
    userId,
    `dungeon:${day}:streak`,
    'dungeon',
    () => ({ gear: [], parts: addParts({}, parts), blueprints: [] }),
    userId,
  ).view;
}

/** The player's newest grants, newest first. */
export function recentGrants(sql: SqlStorage, userId: string, limit: number): GrantRecord[] {
  return sql
    .exec<{ key: string; source: GearSource; result_json: string; created_at: number }>(
      `SELECT key, source, result_json, created_at FROM gear_grants
       WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      userId,
      limit,
    )
    .toArray()
    .map((row) => ({
      ...(JSON.parse(row.result_json) as GrantView),
      key: row.key,
      source: row.source,
      at: row.created_at,
    }));
}
