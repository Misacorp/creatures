/**
 * Every way gear, parts and blueprints enter the game: a cleared raid phase (scrap), a won finale (the
 * reward slot: a gear piece or a new blueprint), a won Festival finale (a Festival piece), the daily
 * dungeon, an expedition claim (parts, blueprints and push-on finds) and the welcome kit. Every item
 * is rolled here with the live RNG at the grant (item level by source, lines and tiers), never before. Each grant is idempotent per (player, key) through `gear_grants`: the first call
 * draws from the live RNG and applies the grant, a repeat returns what the first one gave and draws
 * nothing. Call them inside the transaction of the action they belong to (they nest as savepoints).
 *
 * A full inventory never loses a drop: an item that does not fit becomes its dismantle yield, shown
 * as `converted`. A blueprint the player already knows adds a well-thumbed mark (scrap once it has the most).
 */
import {
  RULES,
  addParts,
  baseForTint,
  content,
  dismantleYield,
  gearBase,
  legacyBase,
  rollFestivalItem,
  rollFinaleReward,
  rollWelcomeKit,
  type Element,
  type GearItem,
  type GearRarity,
  type PartsBundle,
  type RankGift,
  type Rng,
} from '@creatures/game';
import type { Analytics, GearSource } from './analytics';
import { addSupply } from './expedition-store';
import {
  addMark,
  creditParts,
  hasRoom,
  insertItem,
  knownBlueprints,
  learnBlueprint,
  partsTotal,
  type ItemOrigin,
} from './gear-store';
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
  /**
   * Items now in the inventory. `itemLevel` is absent on grants stored before gear v2, which
   * `normaliseGrant` maps onto the new bases.
   */
  gear: { id: string; baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /** Items that would not fit and became parts (already counted in `parts`). */
  converted: { baseId: string; rarity: GearRarity; itemLevel?: number }[];
  /** All the parts the grant paid, including from converted items and duplicate blueprints. */
  parts: PartsBundle;
  /** `marks` is the blueprint's well-thumbed marks after a repeat find added one (absent when it was new or already at the most). */
  blueprints: { baseId: string; duplicate: boolean; marks?: number }[];
  /** Supplies the grant gave, one id per supply (absent in grants stored before expeditions v2). */
  supplies?: string[];
}

/** A stored grant, for the list of recent loot. */
export interface GrantRecord extends GrantView {
  key: string;
  source: GearSource;
  at: number;
}

/** An item a grant gives, rolled and with where it came from. */
export interface DraftItem {
  item: GearItem;
  origin: ItemOrigin;
}

export interface Draft {
  gear: DraftItem[];
  parts: PartsBundle;
  blueprints: string[];
  supplies?: string[];
}

/**
 * Grants stored before gear v2 name old bases (and a rarity on blueprints). Maps them onto the new
 * bases (the same slot and tint as the conversion) so history and repeats still show something real.
 * A grant already in the new shape (items with `itemLevel`, blueprints without `rarity`) is returned as is.
 */
export function normaliseGrant(raw: GrantView): GrantView {
  const mapGear = <T extends { baseId: string; itemLevel?: number | undefined }>(g: T): T => {
    if (g.itemLevel !== undefined) return g;
    const old = legacyBase(g.baseId);
    if (old === undefined) return g;
    return {
      ...g,
      baseId: baseForTint(old.slot, old.tint, old.festival === true).id,
      itemLevel: 1,
    };
  };
  return {
    ...raw,
    gear: raw.gear.map(mapGear),
    converted: raw.converted.map(mapGear),
    blueprints: raw.blueprints.map((b) => {
      const old =
        (b as { rarity?: unknown }).rarity === undefined ? undefined : legacyBase(b.baseId);
      return {
        baseId:
          old === undefined ? b.baseId : baseForTint(old.slot, old.tint, old.festival === true).id,
        duplicate: b.duplicate,
        ...(b.marks === undefined ? {} : { marks: b.marks }),
      };
    }),
  };
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
    if (prior !== undefined) {
      return { view: normaliseGrant(JSON.parse(prior.result_json) as GrantView), fresh: false };
    }

    const now = deps.now();
    const draft = draw();
    const view = emptyView();
    const parts: PartsBundle = {};
    add(parts, draft.parts);
    for (const { item, origin } of draft.gear) {
      if (hasRoom(sql, userId)) {
        const id = insertItem(sql, userId, item, { source, now, origin });
        view.gear.push({ id, baseId: item.baseId, rarity: item.rarity, itemLevel: item.itemLevel });
      } else {
        add(parts, dismantleYield(item));
        view.converted.push({
          baseId: item.baseId,
          rarity: item.rarity,
          itemLevel: item.itemLevel,
        });
      }
    }
    for (const baseId of draft.blueprints) {
      if (gearBase(baseId) === undefined) throw new Error('grant of an unknown blueprint');
      const learned = learnBlueprint(sql, userId, baseId, now);
      // A blueprint the player knows adds a well-thumbed mark; only at the most marks does it turn into scrap.
      let marks: number | null = null;
      if (!learned) {
        marks = addMark(sql, userId, baseId);
        if (marks === null) add(parts, { scrap: RULES.gear.drops.duplicateBlueprintScrap });
      }
      view.blueprints.push({
        baseId,
        duplicate: !learned,
        ...(marks === null ? {} : { marks }),
      });
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
          gear: [...draft.gear.map((d) => d.item)].map((item) => ({
            base: item.baseId,
            rarity: item.rarity,
            level: item.itemLevel,
            lines: item.lines.map((l) => ({ id: l.id, tier: l.tier })),
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

/**
 * The finale's reward slot for a player of a party that won it: one gear piece (item level `3 + Boss
 * Rank`, the boss's element) or one blueprint the player does not know yet, by the week's Boss Rank.
 * Key `raid:<week>:finale`, the same key as when it was one gear roll, so a repeat pays nothing and
 * older grant rows stay valid.
 */
export function grantRaidFinale(
  deps: GrantDeps,
  userId: string,
  weekId: string,
  rank: number,
  bossId: string,
): GrantView {
  return grantOnce(deps, userId, `raid:${weekId}:finale`, 'raid_finale', () => {
    const owned = new Set(knownBlueprints(deps.storage.sql, userId).map((b) => b.baseId));
    const element = bossElement(bossId);
    const reward = rollFinaleReward(deps.rng, rank, element, owned);
    return reward.kind === 'blueprint'
      ? { gear: [], parts: {}, blueprints: [reward.baseId] }
      : {
          gear: [{ item: reward.item, origin: { kind: 'raid', boss: bossId, rank } }],
          parts: {},
          blueprints: [],
        };
  }).view;
}

/** The element of a raid boss (content); the finale and Festival drops take it as their tag. */
function bossElement(bossId: string): Element {
  const boss = content.bosses.find((b) => b.id === bossId);
  if (boss === undefined) throw new Error('grant for an unknown boss');
  return boss.element;
}

/** The Festival piece for a player of a party that won a Festival finale. Key `festival:<week>`. */
export function grantFestivalGear(
  deps: GrantDeps,
  userId: string,
  weekId: string,
  element: Element,
  rank: number,
  bossId: string,
): GrantView {
  return grantOnce(deps, userId, `festival:${weekId}`, 'festival', () => ({
    gear: [
      {
        item: rollFestivalItem(deps.rng, element, rank),
        origin: { kind: 'festival', boss: bossId, rank },
      },
    ],
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
    gear: DraftItem[];
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
 * The welcome kit: a common Hat, a blueprint and some scrap, so crafting can start on day 1.
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
        gear: [{ item: kit.item, origin: { kind: 'welcome' } }],
        parts: { scrap: RULES.gear.drops.welcomeScrap },
        blueprints: [kit.blueprint],
      };
    },
    userId,
  );
}

/** The Bait and Essence a payout adds to the ledger next to its grant (0 or absent: none). */
export interface PayoutCredits {
  bait?: number;
  essence?: number;
  meta?: Record<string, unknown>;
}

/**
 * Pays a server event once per (player, key): the Bait and Essence credits, then the grant (see
 * `grantOnce`). Key rule: the grant keeps `key`, each credit gets a `:<currency>` suffix
 * (`<key>:bait`, `<key>:essence`), so one event's ledger rows and grant row never share a key. The
 * credits are idempotent on their own keys, so a repeat pays nothing twice. Call it inside the
 * transaction of the action it belongs to.
 */
export function payOnce(
  deps: GrantDeps,
  userId: string,
  key: string,
  options: {
    source: GearSource;
    draw: () => Draft;
    credits?: PayoutCredits;
  },
): GrantView {
  const { source, draw, credits = {} } = options;
  return deps.storage.transactionSync(() => {
    for (const currency of ['bait', 'essence'] as const) {
      const amount = credits[currency] ?? 0;
      if (amount > 0) {
        credit(
          deps.storage,
          {
            userId,
            currency,
            amount,
            source,
            idempotencyKey: `${key}:${currency}`,
            ...(credits.meta === undefined ? {} : { meta: credits.meta }),
          },
          deps.now(),
        );
      }
    }
    return grantOnce(deps, userId, key, source, draw, userId).view;
  });
}

/**
 * What a dungeon run drops: the scrap, glimmer and shard of its rooms, the gear its dice gave, the
 * supplies of its rooms (put in the stock with the same grant, so they are paid once) and the run's
 * Bait and Essence. `draw` runs only for a first-time key, inside the transaction, and uses
 * the live gear RNG. Key `dungeon:<day>:<attempt>` (credits `...:bait`, `...:essence`), so a player's
 * run of a day is paid once however often it is retried.
 */
export function grantDungeonRun(
  deps: GrantDeps,
  userId: string,
  day: string,
  attempt: number,
  draw: (rng: Rng) => { parts: PartsBundle; gear: Draft['gear']; supplies?: string[] },
  credits?: PayoutCredits,
): GrantView {
  return payOnce(deps, userId, `dungeon:${day}:${String(attempt)}`, {
    source: 'dungeon',
    draw: () => {
      const drawn = draw(deps.rng);
      return {
        gear: drawn.gear,
        parts: addParts({}, drawn.parts),
        blueprints: [],
        ...(drawn.supplies === undefined ? {} : { supplies: drawn.supplies }),
      };
    },
    ...(credits === undefined ? {} : { credits }),
  });
}

/**
 * The streak bonus of a day, paid once per day: parts through the grant, Bait and Essence through the
 * credits. Key `dungeon:<day>:streak` (credits `...:bait`, `...:essence`).
 */
export function grantDungeonStreak(
  deps: GrantDeps,
  userId: string,
  day: string,
  parts: PartsBundle,
  credits?: PayoutCredits,
): GrantView {
  return payOnce(deps, userId, `dungeon:${day}:streak`, {
    source: 'dungeon',
    draw: () => ({ gear: [], parts: addParts({}, parts), blueprints: [] }),
    ...(credits === undefined ? {} : { credits }),
  });
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
      ...normaliseGrant(JSON.parse(row.result_json) as GrantView),
      key: row.key,
      source: row.source,
      at: row.created_at,
    }));
}
