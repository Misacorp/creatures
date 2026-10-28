/**
 * The Workshop of a guild (`docs/design/gear-and-creatures-v2.md`): previews, starting a craft, supply or
 * job, dismantling a pile of marked items and claiming a job. Split from `Gear` (`gear.ts`), which delegates here. Every public method
 * opens its own `atomically` and runs the whole check-and-write inside it; the helpers run inside the
 * caller's transaction. Rolls are drawn with the live RNG at claim time, never when a job starts.
 */
import {
  RULES,
  chance,
  conversionBlock,
  conversionInputs,
  conversionJobMs,
  conversionOutputs,
  conversionRecipe,
  conversionXp,
  craftCostFor,
  craftHours,
  craftItemLevel,
  craftLevelNeeded,
  craftOdds,
  craftable,
  dismantleBoostLeft,
  dismantleLearnBp,
  dismantleRange,
  dismantleXp,
  pileDismantleXp,
  pileOrder,
  gearBase,
  jobDuration,
  jobXp,
  partsOfSpec,
  reachMinLevel,
  rollCraftItem,
  rollDismantle,
  skillLevel,
  stepUpBp,
  supplyDef,
  supplyJobMs,
  supplyJobXp,
  treatCost,
  applyXpBoost,
  creatureXpParts,
  dayParts,
  dayXpEffects,
  gearPart,
  jobWeather,
  legacyDayParts,
  weatherTimeMs,
  xpBoost,
  workshopExperience,
  workshopMods,
  PART_KINDS,
  REACH_IDS,
  type GearRarity,
  type JobKind,
  type PartsBundle,
  type WorkshopMods,
} from '@creatures/game';
import { awardExperience } from './creature-exp';
import { runKeyed, settleSpend } from './keyed-action';
import { GameError, atomically, type Outcome } from './outcome';
import { addSupply, supplyStock, takeSupplies } from './expedition-store';
import {
  addCreatureXp,
  addMark,
  blueprintMarks,
  creatureXp,
  creditParts,
  debitParts,
  getParts,
  hasParts,
  hasRoom,
  insertItem,
  learnBlueprint,
  openJobCount,
  openJobOf,
  rowToItem,
  type GearRow,
  type JobRow,
} from './gear-store';
import { fixFestivalRarity } from './gear-normalise';
import { dismantleLocks } from './dismantle-worn';
import { gearRulesOf, minusBp } from './gear-worn';
import { credit, spend } from './ledger';
import type {
  CraftOption,
  CraftPreview,
  DismantlePreview,
  ItemSnapshot,
  JobCommon,
  JobResult,
  StartJobInput,
} from './gear-types';
import {
  assertNotBusy,
  normaliseJobResult,
  ownedCreature,
  ownedItem,
  parseStoredInput,
  type CreatureRow,
  type GearDeps,
  type StoredInput,
  type StoredJobWeather,
} from './gear-access';
import { speciesOf } from './species';

/** The gear rarity a supply tier is logged as (analytics) and a supply job is sized as. */
const SUPPLY_RARITY = { basic: 'common', good: 'rare', great: 'epic' } as const;

/** An open job of a removed kind (Improve, Enchant) still holds this item: it cannot be dismantled under it. */
function openJobHoldsItem(sql: SqlStorage, itemId: string): boolean {
  return (
    sql
      .exec('SELECT 1 FROM workshop_jobs WHERE gear_id = ? AND claimed_at IS NULL', itemId)
      .toArray().length > 0
  );
}

function failSupply(): never {
  throw new Error('stored supply job has an unknown supply');
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The analytics base and rarity of a conversion: the first supply it takes (ids only, never numbers of effects). */
function convertAnalytics(
  recipeId: string,
  took: Readonly<Record<string, number>>,
): { base: string; rarity: GearRarity } {
  const from = supplyDef(Object.keys(took)[0] ?? '');
  return from === undefined
    ? { base: recipeId, rarity: 'common' }
    : { base: from.id, rarity: SUPPLY_RARITY[from.tier] };
}

const sumShards = (bundle: PartsBundle): number =>
  PART_KINDS.filter((k) => k.endsWith('-shard')).reduce((n, k) => n + (bundle[k] ?? 0), 0);

export class Workshop {
  constructor(private readonly deps: GearDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  private atomically<T>(fn: () => T): Outcome<T> {
    return atomically(this.deps.storage, fn);
  }

  private jobRow(userId: string, id: string): JobRow {
    const row = this.sql
      .exec<JobRow>('SELECT * FROM workshop_jobs WHERE id = ? AND user_id = ?', id, userId)
      .toArray()[0];
    // Same answer for "does not exist" and "belongs to someone else".
    if (row === undefined) throw new GameError(404, 'not_found');
    return row;
  }

  private mods(userId: string, job: 'craft' | 'dismantle'): WorkshopMods {
    const injected = this.deps.workshopMods?.(userId, job);
    if (injected !== undefined) return injected;
    const weather = this.deps.weather;
    const day = weather?.at() ?? null;
    if (weather === undefined || day === null) return {};
    // Market Day boosts only the day's first craft and first dismantle jobs: every job of that kind the
    // player started this game day counts, boosted or not (so saving up for the day pays nothing).
    const { startsAt, endsAt } = weather.dayBounds();
    const before = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM workshop_jobs
         WHERE user_id = ? AND kind = ? AND started_at >= ? AND started_at < ?`,
        userId,
        job,
        startsAt,
        endsAt,
      )
      .one().n;
    return workshopMods(day, job, before);
  }

  /** What the day's weather does to a job started now: its time and experience. Nothing without weather. */
  private weatherNow(): StoredJobWeather | null {
    const day = this.deps.weather?.at() ?? null;
    if (day === null) return null;
    const fx = jobWeather(day);
    return { boon: day.boon, omen: day.omen, ...fx, xpEffects: dayXpEffects(day) };
  }

  /** A job's time under the day's weather (the screens show this one and the job is started with it). */
  private weatherMs(ms: number): number {
    return weatherTimeMs(ms, this.weatherNow()?.timeBp ?? 0);
  }

  /** The weather to store with a job, or nothing to store when the day changes nothing about it. */
  private storedWeather(userId: string): { weather: StoredJobWeather } | Record<string, never> {
    const w = this.weatherNow();
    if (w === null || (w.timeBp === 0 && w.xpBp === 0 && w.treatMultiplier === null)) return {};
    this.deps.analytics?.record(
      { kind: 'weather_use', where: 'job', boon: w.boon, omen: w.omen },
      userId,
    );
    return { weather: w };
  }

  /**
   * The items of a pile request, owned and distinct (404 for anyone else's, 400 `invalid_items` for
   * a repeat). Worn items are fine. The caller's schema has limited the count.
   */
  private pileRows(userId: string, itemIds: readonly string[]): GearRow[] {
    if (new Set(itemIds).size !== itemIds.length) throw new GameError(400, 'invalid_items');
    return itemIds.map((id) => ownedItem(this.sql, userId, id));
  }

  /**
   * How many items of the pile today's Market Day boosts, and what to store: the day's first 2 dismantles,
   * counted in items (the old timed jobs of the day count one each, so a day that began with one still
   * leaves what remains).
   */
  private pileBoost(userId: string, count: number): number {
    const injected = this.deps.workshopMods?.(userId, 'dismantle');
    if (injected !== undefined) {
      return injected.dismantleTopOfRange === true
        ? count
        : Math.min(count, injected.dismantleTopItems ?? 0);
    }
    const weather = this.deps.weather;
    const day = weather?.at() ?? null;
    if (weather === undefined || day === null) return 0;
    const { startsAt, endsAt } = weather.dayBounds();
    const old = this.sql
      .exec<{ n: number }>(
        `SELECT COUNT(*) AS n FROM workshop_jobs
         WHERE user_id = ? AND kind = 'dismantle' AND started_at >= ? AND started_at < ?`,
        userId,
        startsAt,
        endsAt,
      )
      .one().n;
    const piled =
      this.sql
        .exec<{ items: number }>(
          'SELECT items FROM dismantle_days WHERE user_id = ? AND day_start = ?',
          userId,
          startsAt,
        )
        .toArray()[0]?.items ?? 0;
    return Math.min(count, dismantleBoostLeft(day, old + piled));
  }

  /** The Crafting level and the Busy paws and Apprentice shares of a creature. */
  private workerOf(
    userId: string,
    creature: CreatureRow,
  ): { level: number; busyBp: number; apprenticeBp: number } {
    const rules = gearRulesOf(this.sql, creature);
    return {
      level: skillLevel(creatureXp(this.sql, userId, creature.id)),
      busyBp: rules.busyPawsBp,
      apprenticeBp: rules.apprenticeBp,
    };
  }

  /**
   * What a craft of a blueprint would cost, take and give with this creature, for every way to start it
   * (plain, Reach for Rare, Reach for Epic): exact parts and Essence, time, XP and the odds of each
   * rarity. Changes nothing and draws nothing. The screen shows these numbers and never works any out.
   */
  previewCraft(userId: string, creatureId: string, blueprintId: string): Outcome<CraftPreview> {
    return this.atomically(() => {
      const creature = ownedCreature(this.sql, userId, creatureId);
      const base = gearBase(blueprintId);
      if (base === undefined || !craftable(base)) throw new GameError(400, 'invalid_blueprint');
      const marks = blueprintMarks(this.sql, userId, base.id);
      if (marks === null) throw new GameError(409, 'blueprint_unknown');
      const { level, busyBp, apprenticeBp } = this.workerOf(userId, creature);
      const held = getParts(this.sql, userId);
      const mods = this.mods(userId, 'craft');
      return {
        kind: 'craft' as const,
        blueprintId: base.id,
        creatureId: creature.id,
        craftingLevel: level,
        itemLevel: craftItemLevel(level),
        needsCraftingLevel: craftLevelNeeded(base.id),
        locked: level < craftLevelNeeded(base.id),
        marks,
        marksMax: RULES.gear.craft.marks.max,
        stepUpBp: stepUpBp(level, marks, mods),
        options: REACH_IDS.map((reach): CraftOption => {
          const cost = craftCostFor(base.id, reach, held, craftItemLevel(level));
          return {
            reach,
            unlocked: level >= reachMinLevel(reach),
            minLevel: reachMinLevel(reach),
            parts: cost.parts,
            essence: cost.essence,
            durationMs: this.weatherMs(jobDuration(level, busyBp, craftHours(reach))),
            xp: jobXp(apprenticeBp, craftHours(reach)),
            oddsBp: craftOdds(reach, level, marks, mods),
          };
        }),
      };
    });
  }

  /**
   * What taking these items apart as a pile would give with this creature: the refund range (the same for
   * any creature), the Crafting XP, the chance each item teaches its blueprint, how many items Market Day
   * would boost, and the creature's Tinker's luck. Changes nothing. A busy creature is not refused here
   * (the dismantle is).
   */
  previewDismantle(
    userId: string,
    creatureId: string,
    itemIds: readonly string[],
  ): Outcome<DismantlePreview> {
    return this.atomically(() => {
      const creature = ownedCreature(this.sql, userId, creatureId);
      const rows = pileOrder(
        this.pileRows(userId, itemIds).map((row) => ({
          row,
          rarity: row.rarity,
          itemLevel: row.item_level,
        })),
      ).map((e) => e.row);
      const { level, apprenticeBp } = this.workerOf(userId, creature);
      const teachers = rows.filter((r) => {
        const base = gearBase(r.base_id);
        return base !== undefined && craftable(base);
      }).length;
      return {
        kind: 'dismantle' as const,
        creatureId: creature.id,
        items: rows.map((r) => ({
          id: r.id,
          baseId: r.base_id,
          rarity: r.rarity,
          itemLevel: r.item_level,
        })),
        range: dismantleRange(rows.map(rowToItem)),
        xp: applyXpBoost(pileDismantleXp(rows.map((r) => r.rarity)), [
          gearPart('apprentice', apprenticeBp),
        ]),
        learnBp: teachers === 0 ? null : dismantleLearnBp(level),
        teachers,
        boosted: this.pileBoost(userId, rows.length),
        tinkersLuckBp: gearRulesOf(this.sql, creature).tinkersLuckBp,
      };
    });
  }

  /**
   * Dismantles the named items at once with one free creature (decisions.md, 2026-10-27, "Bulk selection
   * replaces marking"). Worn items go too and come off their wearer in the same transaction; a wearer that is
   * away or on a job keeps an item a running trip or job reads at its claim (409 `item_locked`, nothing is
   * taken; see `dismantle-worn.ts`). The dismantler must not be away or on a job (same rule as starting a
   * Workshop job); it gains Crafting XP (what the old timed jobs paid for the same items) and no creature
   * experience. Each item's refund, its blueprint chance (with the creature's Crafting level) and Tinker's
   * luck are rolled now with the live RNG, the dismantler's own gear read before any item comes off;
   * Market Day's top-of-range goes to the most valuable items; the Essence is paid once through the ledger.
   * One keyed transaction: a retry returns the stored result.
   */
  dismantlePile(
    userId: string,
    input: { creatureId: string; itemIds: readonly string[]; idempotencyKey: string },
  ): Outcome<Extract<JobResult, { kind: 'dismantle' }>> {
    const fingerprint = JSON.stringify([input.creatureId, [...input.itemIds].sort()]);
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.idempotencyKey, kind: 'dismantle_pile', fingerprint },
        () => {
          const creature = ownedCreature(this.sql, userId, input.creatureId);
          assertNotBusy(this.sql, creature);
          const rows = this.pileRows(userId, input.itemIds);
          // An item in an open (removed-kind) job is not in the bag's hands; a worn item may go, taken off by
          // the delete below, unless its wearer is away or on a job that reads it live (`dismantle-worn.ts`).
          for (const row of rows) {
            if (openJobHoldsItem(this.sql, row.id)) throw new GameError(409, 'item_in_job');
          }
          const locked = dismantleLocks(this.sql, userId, rows)[0];
          if (locked !== undefined) throw new GameError(409, 'item_locked');
          const now = this.deps.now();
          const before = skillLevel(creatureXp(this.sql, userId, creature.id));
          const worn = gearRulesOf(this.sql, creature);
          const items: ItemSnapshot[] = pileOrder(
            rows.map((row) => ({
              baseId: row.base_id,
              rarity: row.rarity,
              itemLevel: row.item_level,
            })),
          );
          const boosted = this.pileBoost(userId, items.length);
          const rolled = rollDismantle(
            this.deps.rng,
            items,
            boosted > 0 ? { dismantleTopItems: boosted } : {},
            worn.tinkersLuckBp,
          );
          creditParts(this.sql, userId, rolled.parts);
          if (rolled.essence > 0) {
            credit(
              this.deps.storage,
              {
                userId,
                currency: 'essence',
                amount: rolled.essence,
                source: 'dismantle',
                idempotencyKey: `dismantle-pile:${input.idempotencyKey}`,
                meta: { items: items.length },
              },
              now,
            );
          }
          // Each item that can teach a blueprint has its chance: the dismantler's level counts here, not in the refund.
          const learnBp = dismantleLearnBp(before);
          const learned: string[] = [];
          const marked: { baseId: string; marks: number }[] = [];
          for (const item of items) {
            const base = gearBase(item.baseId);
            if (base === undefined || !craftable(base)) continue;
            if (!chance(this.deps.rng, learnBp, 10_000)) continue;
            if (learnBlueprint(this.sql, userId, base.id, now)) learned.push(base.id);
            else {
              const marks = addMark(this.sql, userId, base.id);
              if (marks !== null) marked.push({ baseId: base.id, marks });
            }
          }
          for (const row of rows) this.sql.exec('DELETE FROM gear_items WHERE id = ?', row.id);
          const day = this.deps.weather?.dayBounds().startsAt;
          if (day !== undefined) {
            this.sql.exec(
              `INSERT INTO dismantle_days (user_id, day_start, items) VALUES (?, ?, ?)
               ON CONFLICT (user_id, day_start) DO UPDATE SET items = items + excluded.items`,
              userId,
              day,
              items.length,
            );
          }
          // Crafting XP: what the old timed jobs paid for these items, Apprentice on top. No creature experience.
          const craftParts = [gearPart('apprentice', worn.apprenticeBp)];
          const xp = applyXpBoost(pileDismantleXp(items.map((i) => i.rarity)), craftParts);
          const skillXp = addCreatureXp(this.sql, userId, creature.id, xp);
          const after = skillLevel(skillXp);
          const craftBoost = xpBoost(craftParts);
          const first = items[0] as ItemSnapshot;
          this.deps.analytics?.record(
            {
              kind: 'gear_dismantle',
              base: first.baseId,
              rarity: first.rarity,
              level: first.itemLevel,
              scrap: rolled.parts.scrap ?? 0,
              shards: sumShards(rolled.parts),
              glimmer: rolled.parts.glimmer ?? 0,
              unequipped: rows.some((r) => r.equipped_on !== null),
              parts: rolled.parts,
              items: items.length,
              essence: rolled.essence,
              learned: learned.length,
              marks: marked.length,
            },
            userId,
          );
          return {
            kind: 'dismantle' as const,
            items,
            parts: rolled.parts,
            essence: rolled.essence,
            learned,
            marked,
            ...(rolled.tinkered === undefined ? {} : { tinkered: rolled.tinkered }),
            creatureId: creature.id,
            boosted,
            xp,
            ...(craftBoost === null ? {} : { xpBoost: craftBoost }),
            skillXp,
            skillLevel: after,
            leveledUp: after > before,
          };
        },
      ),
    );
  }

  /** Inserts the open job row; the creature and the slot were checked by the caller. */
  private insertJob(
    userId: string,
    creatureId: string,
    kind: JobKind,
    stored: StoredInput,
    durationMs: number,
  ): string {
    const now = this.deps.now();
    const id = crypto.randomUUID();
    this.sql.exec(
      `INSERT INTO workshop_jobs (id, user_id, creature_id, kind, gear_id, input_json, started_at, ends_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
      id,
      userId,
      creatureId,
      kind,
      JSON.stringify(stored),
      now,
      now + durationMs,
    );
    return id;
  }

  /**
   * Starts a job on a creature that is not busy, in a free workshop slot. A craft pays its parts (and a
   * Reach's Essence) now, all or nothing. The result is
   * rolled when the job is claimed. Busy paws lines on the creature shorten it.
   */
  startJob(userId: string, input: StartJobInput): Outcome<{ jobId: string }> {
    const fingerprint = JSON.stringify([
      ...(input.kind === 'craft'
        ? [input.kind, input.creatureId, input.blueprintId, input.reach ?? 'none']
        : input.kind === 'supply'
          ? [input.kind, input.creatureId, input.supplyId]
          : [input.kind, input.creatureId, input.recipeId]),
      ...(input.treat === true ? ['treat'] : []),
    ]);
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: input.idempotencyKey, kind: 'job_start', fingerprint: fingerprint },
        () => {
          const creature = ownedCreature(this.sql, userId, input.creatureId);
          if (creature.away_expedition_id !== null) throw new GameError(409, 'creature_away');
          if (openJobOf(this.sql, creature.id) !== null)
            throw new GameError(409, 'creature_on_job');
          if (openJobCount(this.sql, userId) >= RULES.gear.workshopSlots) {
            throw new GameError(409, 'workshop_full');
          }
          const worker = this.workerOf(userId, creature);
          const started = ((): { jobId: string } => {
            switch (input.kind) {
              case 'craft':
                return this.startCraft(userId, input, creature, worker);
              case 'supply':
                return this.startSupply(userId, input, creature, worker);
              case 'convert':
                return this.startConvert(userId, input, creature, worker);
            }
          })();
          if (input.treat === true) this.packTreat(userId, creature, started.jobId);
          return started;
        },
      ),
    );
  }

  /**
   * Pays the treat of a job that was just started and marks the job: the Bait is spent in the start's own
   * transaction under a key derived from the job's id, so a retry of the start never pays it twice and short
   * Bait fails the whole start.
   */
  private packTreat(userId: string, creature: CreatureRow, jobId: string): void {
    const cost = treatCost(creature.level);
    settleSpend(
      spend(
        this.deps.storage,
        {
          userId,
          currency: 'bait',
          amount: cost,
          purpose: 'treat',
          idempotencyKey: `treat:job:${jobId}`,
          apply: () => ({ jobId }),
        },
        this.deps.now(),
      ),
    );
    this.sql.exec(
      "UPDATE workshop_jobs SET input_json = json_set(input_json, '$.treat', json('true')) WHERE id = ?",
      jobId,
    );
    this.deps.analytics?.record(
      { kind: 'treat', source: 'job', species: creature.species, level: creature.level, cost },
      userId,
    );
  }

  private startCraft(
    userId: string,
    input: Extract<StartJobInput, { kind: 'craft' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const base = gearBase(input.blueprintId);
    if (base === undefined || !craftable(base)) throw new GameError(400, 'invalid_blueprint');
    const marks = blueprintMarks(this.sql, userId, base.id);
    if (marks === null) throw new GameError(409, 'blueprint_unknown');
    if (!hasRoom(this.sql, userId)) throw new GameError(409, 'inventory_full');
    // A better base unlocks at its item level: this creature's Crafting level has to make an item that high.
    if (worker.level < craftLevelNeeded(base.id)) throw new GameError(409, 'base_locked');
    const reach = input.reach ?? 'none';
    if (worker.level < reachMinLevel(reach)) throw new GameError(409, 'skill_too_low');
    const { parts: cost, essence } = craftCostFor(
      base.id,
      reach,
      getParts(this.sql, userId),
      craftItemLevel(worker.level),
    );
    if (!hasParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
    const mods = this.mods(userId, 'craft');
    const duration = this.weatherMs(jobDuration(worker.level, worker.busyBp, craftHours(reach)));
    // The Essence, the parts and the job are one transaction: the ledger's keyed spend carries the
    // grant. A plain craft has no Essence to spend and just pays its parts.
    const commit = (): { jobId: string } => {
      if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
      const stored: StoredInput = {
        baseId: base.id,
        cost,
        reach,
        marks,
        level: worker.level,
        ...(Object.keys(mods).length === 0 ? {} : { mods }),
        ...this.storedWeather(userId),
      };
      const jobId = this.insertJob(userId, creature.id, 'craft', stored, duration);
      this.deps.analytics?.record(
        {
          kind: 'job_start',
          job: 'craft',
          base: base.id,
          rarity: 'common',
          species: creature.species,
          hours: Math.round(duration / 3_600_000),
          skillLevel: worker.level,
          parts: cost,
          reach,
          essence,
        },
        userId,
      );
      return { jobId };
    };
    if (essence === 0) return commit();
    const spent = spend(
      this.deps.storage,
      {
        userId,
        currency: 'essence',
        amount: essence,
        purpose: 'craft',
        idempotencyKey: input.idempotencyKey,
        apply: commit,
      },
      this.deps.now(),
    );
    if (spent.status === 'insufficient_funds') throw new GameError(409, 'insufficient_essence');
    return settleSpend(spent);
  }

  private startSupply(
    userId: string,
    input: Extract<StartJobInput, { kind: 'supply' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const def = supplyDef(input.supplyId);
    if (def === undefined) throw new GameError(400, 'invalid_supply');
    // The better the supply, the higher the Crafting level its blueprint asks for.
    if (worker.level < def.blueprint.craftingLevel) throw new GameError(409, 'skill_too_low');
    const cost = partsOfSpec(def.blueprint.parts);
    if (!debitParts(this.sql, userId, cost)) throw new GameError(409, 'insufficient_parts');
    // A lure costs Bait besides its parts: checked, debited and the job created in one transaction (a
    // failure rolls the parts back too).
    const baitCost = def.blueprint.bait ?? 0;
    if (baitCost > 0) {
      settleSpend(
        spend(
          this.deps.storage,
          {
            userId,
            currency: 'bait',
            amount: baitCost,
            purpose: 'lure',
            idempotencyKey: input.idempotencyKey,
            apply: () => ({ supplyId: input.supplyId }),
          },
          this.deps.now(),
        ),
      );
    }
    const duration = this.weatherMs(minusBp(supplyJobMs(def, worker.level), worker.busyBp));
    const jobId = this.insertJob(
      userId,
      creature.id,
      'supply',
      {
        supplyId: def.id,
        cost,
        ...(baitCost > 0 ? { bait: baitCost } : {}),
        ...this.storedWeather(userId),
      },
      duration,
    );
    this.deps.analytics?.record(
      {
        kind: 'job_start',
        job: 'supply',
        base: def.id,
        rarity: SUPPLY_RARITY[def.tier],
        species: creature.species,
        hours: Math.round(duration / 3_600_000),
        skillLevel: worker.level,
        parts: cost,
        ...(baitCost > 0 ? { bait: baitCost } : {}),
      },
      userId,
    );
    return { jobId };
  }

  /**
   * Refine or recycle: takes the recipe's supplies and parts now, all or nothing, and stores the recipe's
   * resolved inputs and outputs with the job so the claim pays exactly what was shown. The request names
   * only the recipe.
   */
  private startConvert(
    userId: string,
    input: Extract<StartJobInput, { kind: 'convert' }>,
    creature: CreatureRow,
    worker: { level: number; busyBp: number },
  ): { jobId: string } {
    const def = conversionRecipe(input.recipeId);
    if (def === undefined) throw new GameError(400, 'invalid_recipe');
    const block = conversionBlock(def, worker.level, {
      supplies: supplyStock(this.sql, userId),
      parts: getParts(this.sql, userId),
    });
    if (block !== null) throw new GameError(409, block);
    const took = conversionInputs(def);
    const gave = conversionOutputs(def);
    for (const [id, amount] of Object.entries(took.supplies)) {
      if (!takeSupplies(this.sql, userId, id, amount)) {
        throw new GameError(409, 'insufficient_supplies');
      }
    }
    if (!debitParts(this.sql, userId, took.parts)) throw new GameError(409, 'insufficient_parts');
    const duration = this.weatherMs(minusBp(conversionJobMs(def, worker.level), worker.busyBp));
    const jobId = this.insertJob(
      userId,
      creature.id,
      'convert',
      {
        recipeId: def.id,
        took,
        gave,
        hours: def.hours,
        cost: {},
        ...this.storedWeather(userId),
      },
      duration,
    );
    this.deps.analytics?.record(
      {
        kind: 'job_start',
        job: 'convert',
        ...convertAnalytics(def.id, took.supplies),
        species: creature.species,
        hours: Math.round(duration / 3_600_000),
        skillLevel: worker.level,
        ...(Object.keys(took.parts).length === 0 ? {} : { parts: took.parts }),
      },
      userId,
    );
    return { jobId };
  }

  /**
   * Finishes a job that has run its time: rolls the result with live randomness, gives the creature
   * its Crafting XP (more with Apprentice lines) and frees it. A craft is the blueprint's base at item
   * level twice the crafter's Crafting level, its rarity drawn from the Reach's odds and the one-step-up
   * chance (the odds shown when it started), made by this creature. A dismantle rolls each item's
   * refund inside its range (nothing about the worker counts), credits the parts and the Essence, and
   * gives each item that can teach a blueprint its chance to teach it or add a mark. The job also
   * records the nominal minutes it worked, for the creature experience of the creatures step. Claiming
   * again (with any key) returns the stored result and rolls nothing. An Improve or Enchant job from
   * before gear v2 still finishes: it pays its XP and returns its parts.
   */
  claimJob(userId: string, jobId: string, idempotencyKey: string): Outcome<JobResult> {
    return this.atomically(() =>
      runKeyed(
        this.sql,
        this.deps.now,
        { userId, key: idempotencyKey, kind: 'job_claim', fingerprint: jobId },
        () => {
          const job = this.jobRow(userId, jobId);
          if (job.claimed_at !== null) {
            if (job.result_json === null) throw new Error('claimed job has no stored result');
            const stored: unknown = JSON.parse(job.result_json);
            fixFestivalRarity(stored);
            return normaliseJobResult(stored);
          }
          const now = this.deps.now();
          if (now < job.ends_at) throw new GameError(409, 'not_ready');
          const input = parseStoredInput(job.input_json);
          const creature = ownedCreature(this.sql, userId, job.creature_id);
          const before = skillLevel(creatureXp(this.sql, userId, creature.id));
          const worn = gearRulesOf(this.sql, creature);
          const apprenticeBp = worn.apprenticeBp;

          // Rolled now, at claim time, from the live RNG: nothing was decided when the job started.
          let result: DistributiveOmit<JobResult, keyof JobCommon>;
          let analyticsBase: string;
          let analyticsRarity: GearRarity;
          let upgraded = false;
          let xpBase: number;
          let workMinutes = 0;
          switch (job.kind) {
            case 'craft': {
              const baseId = input.baseId;
              const base = baseId === undefined ? undefined : gearBase(baseId);
              if (base === undefined) throw new Error('stored craft has an unknown base');
              // A craft held its place in the bag when it started: it always goes in, even past the cap
              // (a grant can fill the bag over it meanwhile).
              // A craft started before gear v2 was sized by its blueprint's rarity: it keeps that
              // promise (never less than the old rarity) and pays the XP of its old hours.
              const legacyRarity = input.rarity;
              const reach = input.reach ?? 'none';
              const made = rollCraftItem(this.deps.rng, base.id, input.level ?? before, {
                reach,
                marks: input.marks ?? 0,
                ...(legacyRarity === undefined ? {} : { floor: legacyRarity }),
                ...(input.mods === undefined ? {} : { mods: input.mods }),
              });
              upgraded = made.upgraded;
              const gearId = insertItem(this.sql, userId, made.item, {
                source: 'craft',
                now,
                origin: { kind: 'craft' },
                madeBy: {
                  creatureId: creature.id,
                  name: creature.nickname ?? speciesOf(creature.species).name,
                },
              });
              result = {
                kind: 'craft',
                gearId,
                baseId: base.id,
                rarity: made.item.rarity,
                itemLevel: made.item.itemLevel,
                reach,
                upgraded,
              };
              analyticsBase = base.id;
              analyticsRarity = made.item.rarity;
              const hours =
                legacyRarity === undefined
                  ? craftHours(reach)
                  : RULES.gear.legacy.craftHours[legacyRarity];
              xpBase = jobXp(0, hours);
              workMinutes = Math.round(hours * 60);
              break;
            }
            case 'supply': {
              const def = input.supplyId === undefined ? undefined : supplyDef(input.supplyId);
              if (def === undefined) throw new Error('stored supply job has an unknown supply');
              addSupply(this.sql, userId, def.id, def.blueprint.yield);
              result = { kind: 'supply', supplyId: def.id, amount: def.blueprint.yield };
              analyticsBase = def.id;
              analyticsRarity = SUPPLY_RARITY[def.tier];
              xpBase = supplyJobXp(supplyDef(input.supplyId ?? '') ?? failSupply());
              workMinutes = Math.round(def.blueprint.hours * 60);
              break;
            }
            case 'convert': {
              const took = input.took;
              const gave = input.gave;
              const recipeId = input.recipeId;
              if (took === undefined || gave === undefined || recipeId === undefined) {
                throw new Error('stored convert job has no recipe');
              }
              for (const [id, amount] of Object.entries(gave.supplies)) {
                addSupply(this.sql, userId, id, amount);
              }
              creditParts(this.sql, userId, gave.parts);
              result = { kind: 'convert', recipeId, took, gave };
              const made = convertAnalytics(recipeId, took.supplies);
              analyticsBase = made.base;
              analyticsRarity = made.rarity;
              const hours = input.hours ?? conversionRecipe(recipeId)?.hours ?? 1;
              xpBase = conversionXp({ hours });
              workMinutes = Math.round(hours * 60);
              break;
            }
            case 'dismantle': {
              const items = input.items;
              const first = items?.[0];
              if (items === undefined || first === undefined) {
                throw new Error('stored dismantle has no items');
              }
              // Tinker's luck: the worker's line, as it is worn now, adds a die for each item (none without it).
              const rolled = rollDismantle(
                this.deps.rng,
                items,
                input.mods ?? {},
                worn.tinkersLuckBp,
              );
              creditParts(this.sql, userId, rolled.parts);
              if (rolled.essence > 0) {
                credit(
                  this.deps.storage,
                  {
                    userId,
                    currency: 'essence',
                    amount: rolled.essence,
                    source: 'dismantle',
                    idempotencyKey: `dismantle:${job.id}`,
                    meta: { items: items.length },
                  },
                  now,
                );
              }
              // Each item that can teach a blueprint has its chance: the worker's level counts here, not in the refund.
              const learnBp = dismantleLearnBp(input.level ?? before);
              const learned: string[] = [];
              const marked: { baseId: string; marks: number }[] = [];
              for (const item of items) {
                const base = gearBase(item.baseId);
                if (base === undefined || !craftable(base)) continue;
                if (!chance(this.deps.rng, learnBp, 10_000)) continue;
                if (learnBlueprint(this.sql, userId, base.id, now)) learned.push(base.id);
                else {
                  const marks = addMark(this.sql, userId, base.id);
                  if (marks !== null) marked.push({ baseId: base.id, marks });
                }
              }
              result = {
                kind: 'dismantle',
                items,
                parts: rolled.parts,
                essence: rolled.essence,
                learned,
                marked,
                ...(rolled.tinkered === undefined ? {} : { tinkered: rolled.tinkered }),
              };
              analyticsBase = first.baseId;
              analyticsRarity = first.rarity;
              xpBase = dismantleXp(first.rarity);
              workMinutes = RULES.gear.dismantle.minutes[first.rarity];
              break;
            }
            case 'improve':
            case 'enchant': {
              // Started before gear v2: nothing is left to work on, so the parts come back and the
              // creature keeps its XP.
              creditParts(this.sql, userId, input.cost);
              result = { kind: 'retired', was: job.kind, refund: input.cost };
              analyticsBase = 'retired';
              analyticsRarity = 'common';
              xpBase = RULES.gear.legacy.jobHours[job.kind] * RULES.gear.skill.xpPerHour;
              break;
            }
          }

          // XP follows the job's nominal length (the skill shortens the time, not the experience). The
          // Apprentice share is one part: the amount and the breakdown come from the same one.
          const craftParts = [gearPart('apprentice', apprenticeBp)];
          const xp = applyXpBoost(xpBase, craftParts);
          const skillXp = addCreatureXp(this.sql, userId, creature.id, xp);
          const after = skillLevel(skillXp);
          // Creature experience (training by activity): 4 an hour of nominal work, doubled by a treat.
          const treat = input.treat === true;
          // The day the job started under (Hearty Breakfast, Cold Snap) is what it stored, never today's. One
          // list of parts gives the amount and the result's breakdown.
          const w = input.weather;
          const days =
            w === undefined
              ? []
              : w.xpEffects === undefined
                ? legacyDayParts(w)
                : dayParts(w.xpEffects);
          const expParts = creatureXpParts(treat, w?.treatMultiplier ?? null, days);
          const gainedExp = workshopExperience(workMinutes, expParts);
          const expBoost = xpBoost(expParts);
          const experience =
            gainedExp > 0
              ? awardExperience(
                  this.sql,
                  this.deps.analytics,
                  userId,
                  creature.id,
                  gainedExp,
                  'job',
                  treat,
                  expBoost,
                )
              : null;
          const craftBoost = xpBoost(craftParts);
          const full = {
            ...result,
            ...(experience === null ? {} : { experience }),
            xp,
            ...(craftBoost === null ? {} : { xpBoost: craftBoost }),
            skillXp,
            skillLevel: after,
            leveledUp: after > before,
          };
          this.sql.exec(
            'UPDATE workshop_jobs SET claimed_at = ?, result_json = ?, work_minutes = ? WHERE id = ? AND claimed_at IS NULL',
            now,
            JSON.stringify(full),
            workMinutes,
            job.id,
          );
          this.deps.analytics?.record(
            {
              kind: 'job_claim',
              job:
                job.kind === 'craft' ||
                job.kind === 'supply' ||
                job.kind === 'dismantle' ||
                job.kind === 'convert'
                  ? job.kind
                  : 'craft',
              base: analyticsBase,
              rarity: analyticsRarity,
              upgraded,
              xp,
              skillLevel: after,
              leveledUp: after > before,
              ...(job.kind === 'supply' && result.kind === 'supply'
                ? { yield: result.amount }
                : {}),
              ...(result.kind === 'convert' && Object.keys(result.gave.supplies).length > 0
                ? { yield: Object.values(result.gave.supplies).reduce((n, a) => n + a, 0) }
                : {}),
              ...(result.kind === 'craft' ? { reach: result.reach } : {}),
              ...(result.kind === 'dismantle' ? { items: result.items.length } : {}),
            },
            userId,
          );
          if (result.kind === 'dismantle') {
            const first = result.items[0] as ItemSnapshot;
            this.deps.analytics?.record(
              {
                kind: 'gear_dismantle',
                base: first.baseId,
                rarity: first.rarity,
                level: first.itemLevel,
                scrap: result.parts.scrap ?? 0,
                shards: sumShards(result.parts),
                glimmer: result.parts.glimmer ?? 0,
                unequipped: false,
                parts: result.parts,
                items: result.items.length,
                essence: result.essence,
                learned: result.learned.length,
                marks: result.marked.length,
              },
              userId,
            );
          }
          return full;
        },
      ),
    );
  }
}
