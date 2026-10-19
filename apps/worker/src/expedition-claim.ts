/**
 * The claim pipeline of an expedition (`Expeditions.claim` in `expeditions.ts` calls it): the end of a
 * trip that comes home or fails, rolled and paid in the claim's own transaction. These are plain
 * functions over a `ClaimEnv`; none opens a transaction, so everything here runs inside the caller's
 * `atomically` and a failure rolls the whole claim back. Randomness is live and drawn when needed:
 * catches use `rng`, parts and gear `gearRng`, the journal and push-on `tripRng`.
 */
import {
  RULES,
  applyCatchToCollection,
  effectiveStats,
  content,
  expeditionContent,
  explorerRank,
  familiarityStars,
  foundSupplyId,
  goalOddsBp,
  journalEntry,
  journalChanceBp,
  kitOf,
  lengthRules,
  milestoneBonuses,
  partsOfSpec,
  rankGiftsBetween,
  recallCatches,
  rollGearDrop,
  rollJournal,
  rollTripCatches,
  rollTripLoot,
  rollBlueprint,
  slotsFor,
  tripExperience,
  tripXp,
  chance,
  allSpecies,
  gearPart,
  creatureXpParts,
  xpBoost,
  type AccountStat,
  type DestinationDef,
  type PushOnGoalDef,
  type TripCatch,
  type FamiliarityRecord,
  type PartsBundle,
  type TripWeather,
  type TwistEffect,
  type XpBoostPart,
} from '@creatures/game';
import type { CatchProps, PushOnOutcome } from './analytics';
import {
  addExplorerTrip,
  addPage,
  bumpStat,
  familiarityOf,
  foundPages,
  saveFamiliarity,
  statsOf,
  visitPlace,
} from './expedition-store';
import { grantRankGift, grantTripLoot, type DraftItem } from './gear-grants';
import { gearRulesOf } from './gear-worn';
import { awardExperience } from './creature-exp';
import type { ChoiceResult } from './catch-choices';
import { recordServerFirst } from './server-firsts';
import { speciesOf } from './species';
import { insertCreature } from './talent-store';
import { talentViewOf } from './talent-view';
import type {
  CatchView,
  ExpeditionResult,
  ExplorerView,
  JournalFindView,
  PushOnResultView,
  RankGiftView,
} from './expedition-types';
import type { CreatureLite, ExpeditionRow, ExpeditionsDeps } from './expeditions';

export const HOUR_MS = 3_600_000;

/** What the claim pipeline needs of the `Expeditions` class: the storage, the deps and four reads. */
export interface ClaimEnv {
  readonly sql: SqlStorage;
  readonly deps: ExpeditionsDeps;
  tripWeatherOf(row: ExpeditionRow): TripWeather;
  /** The day's Boons and Omens that changed the trip's creature experience, by name (for the result's breakdown). */
  tripDayXpOf(row: ExpeditionRow): XpBoostPart[];
  kitIds(row: ExpeditionRow): string[];
  explorerView(userId: string, creatureId: string): ExplorerView;
  rankSumOf(userId: string): number;
  /** Dev tools only: whether the next push-on result is forced, and to what (the flag is used up). */
  devPushOutcome(userId: string): boolean | null;
}

export function twistOf(id: string | null): TwistEffect | null {
  if (id === null) return null;
  return expeditionContent.specials.twists.find((t) => t.id === id)?.effect ?? null;
}

/**
 * A stand-in for a push-on goal that is no longer in the content. Only the stored odds survive, so
 * the stand-in is risky when they are below certain and adds no reward when it works.
 */
export function vanishedGoal(id: string, expedition: ExpeditionRow): PushOnGoalDef {
  const oddsBp = expedition.push_odds_bp ?? 0;
  return {
    id,
    name: id,
    flavor: '',
    risk: oddsBp >= 10_000 ? 'safe' : 'risky',
    minRank: 1,
    extraHours: 1,
    lengths: {},
    reward: {},
  };
}

function pushView(
  expedition: ExpeditionRow,
  goal: PushOnGoalDef,
  outcome: PushOnOutcome,
): PushOnResultView {
  return {
    goalId: goal.id,
    risk: goal.risk,
    oddsBp: expedition.push_odds_bp ?? goalOddsBp(goal, expedition.duration) ?? 0,
    outcome,
  };
}

/** A risky goal that failed: nothing comes back, and the creature learns nothing. */
export function failTrip(
  env: ClaimEnv,
  userId: string,
  expedition: ExpeditionRow,
  dest: DestinationDef,
  goal: PushOnGoalDef,
): ExpeditionResult {
  const pushOn = pushView(expedition, goal, 'failed');
  bumpStat(env.sql, userId, 'trips_failed', 1);
  const analytics = env.deps.analytics;
  analytics?.record(
    {
      kind: 'push_on_result',
      goal: goal.id,
      risk: goal.risk,
      outcome: 'failed',
      destination: dest.id,
      duration: expedition.duration,
      oddsBp: pushOn.oddsBp,
    },
    userId,
  );
  analytics?.record(
    {
      kind: 'expedition_claim',
      duration: expedition.duration,
      destination: dest.id,
      supplies: env.kitIds(expedition),
      waitedMin: waitedMin(expedition, env.deps.now()),
      catches: [],
      pushOn: 'failed',
      xp: 0,
      stars: 0,
    },
    userId,
  );
  return { recalled: false, catches: [], failed: true, pushOn };
}

function waitedMin(expedition: ExpeditionRow, now: number): number {
  const readyAt = expedition.push_ends_at ?? expedition.ends_at;
  return Math.max(0, Math.floor((now - readyAt) / 60_000));
}

/** The catches, loot and progress of a trip that comes home. */
export function payTrip(
  env: ClaimEnv,
  userId: string,
  expedition: ExpeditionRow,
  explorer: CreatureLite,
  dest: DestinationDef,
  now: number,
  finished: boolean,
  push: { goal: PushOnGoalDef; outcome: PushOnOutcome } | null,
): ExpeditionResult {
  const species = speciesOf(explorer.species);
  const kit = kitOf(env.kitIds(expedition));
  const twist = twistOf(expedition.special_id);
  // What the day did to this trip when it was sent: the claim reads this, never the weather.
  const wx = env.tripWeatherOf(expedition);
  const worked = push?.outcome === 'worked' ? push.goal : null;
  const extraRolls = worked?.reward.catchRolls ?? 0;
  const totalRolls = expedition.rolls + extraRolls;
  const count = finished
    ? totalRolls
    : recallCatches(expedition.rolls, expedition.started_at, expedition.ends_at, now);

  const stats = statsOf(env.sql, userId);
  const milestones = milestoneBonuses(stats);
  // What the explorer's gear does on trips (Lucky find, Keen nose, Packer, Trail XP), as it is worn now.
  const gearRules = gearRulesOf(env.sql, explorer);
  const explorerBefore = env.explorerView(userId, explorer.id);
  const famBefore = familiarityOf(env.sql, userId, explorer.id, dest.id);
  const starsBefore = familiarityStars(dest, famBefore);
  const progress = env.sql
    .exec<{
      expeditions_claimed: number;
      dupe_streak: number;
      pity_new: number;
      pity_creature: number;
    }>(
      'SELECT expeditions_claimed, dupe_streak, pity_new, pity_creature FROM player_progress WHERE user_id = ?',
      userId,
    )
    .toArray()[0] ?? { expeditions_claimed: 0, dupe_streak: 0, pity_new: 0, pity_creature: 0 };
  const owned = new Set(
    env.sql
      .exec<{ line: string }>('SELECT line FROM creatures WHERE user_id = ?', userId)
      .toArray()
      .map((r) => r.line),
  );

  // Rolled now, at claim time, from the live RNG: nothing is decided earlier.
  const rolled = rollTripCatches(env.deps.rng, count, {
    content,
    destination: dest,
    length: expedition.duration,
    explorer: { element: species.element, role: species.role },
    kit,
    stars: starsBefore,
    milestoneRarityBp: milestones.rarityBp + gearRules.luckyFindBp + wx.rarityBp,
    twist,
    ownedLines: owned,
    dupeStreak: progress.dupe_streak,
    firstExpedition: progress.expeditions_claimed === 0,
    // The pity: the counters move with this claim and are stored below, in the same transaction.
    pity: { sinceNew: progress.pity_new, sinceCreature: progress.pity_creature },
  });
  const settled: ChoiceResult[] = [];
  const catches = rolled.results.map((caught) => {
    const made = applyCatch(env, userId, expedition.id, caught, now, gearRules.secondLookBp);
    if (made.settled !== null) settled.push(made.settled);
    return made.view;
  });

  // A claim that brought nothing back (an early recall) must not use up the first-expedition
  // guarantee, so it is not counted (a trip whose rolls all came up empty did bring a roll).
  env.sql.exec(
    `INSERT INTO player_progress
       (user_id, expeditions_claimed, dupe_streak, pity_new, pity_creature) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       expeditions_claimed = expeditions_claimed + excluded.expeditions_claimed,
       dupe_streak = excluded.dupe_streak,
       pity_new = excluded.pity_new,
       pity_creature = excluded.pity_creature`,
    userId,
    count > 0 ? 1 : 0,
    rolled.dupeStreak,
    rolled.pity.sinceNew,
    rolled.pity.sinceCreature,
  );
  // What the pity forced is logged by kind (no counters, no player data beyond the species).
  for (const forced of rolled.forced) {
    env.deps.analytics?.record(
      { kind: 'catch_pity', pity: forced.pity, species: forced.species },
      userId,
    );
  }

  // Parts, supplies, gear and maybe a blueprint, from their own live RNG (the catches used `rng`).
  const rank = explorerBefore.rank;
  const loot = grantTripLoot(
    {
      storage: env.deps.storage,
      now: env.deps.now,
      rng: env.deps.gearRng,
      analytics: env.deps.analytics,
    },
    userId,
    expedition.id,
    (rng) => {
      const drawn = rollTripLoot(
        rng,
        {
          length: expedition.duration,
          shardElement: dest.element ?? species.element,
          role: species.role,
          kit,
          stars: starsBefore,
          milestonePartsBp: milestones.partsBp,
          twist,
          rank,
          gearPartsBp: gearRules.keenNoseBp,
          gearSupplyBp: gearRules.packerBp,
          gearGlimmerBp: gearRules.glimmerFindBp,
          weatherPartsBp: wx.partsBp,
          weatherShardsBp: wx.shardsBp,
          weatherSupplyBp: wx.supplyBp,
          emptyRolls: rolled.empty,
        },
        { completed: finished, caught: count, rolls: expedition.rolls },
      );
      const parts: PartsBundle = { ...drawn.parts };
      const blueprints = drawn.blueprint === null ? [] : [drawn.blueprint];
      const supplies = [...drawn.supplies];
      const gear: DraftItem[] = [];
      if (worked !== null) {
        for (const [kind, amount] of Object.entries(partsOfSpec(worked.reward.parts)) as [
          keyof PartsBundle,
          number,
        ][]) {
          parts[kind] = (parts[kind] ?? 0) + amount;
        }
        if (worked.reward.supply === true) supplies.push(foundSupplyId(rng, rank));
        if (worked.reward.blueprint === true) blueprints.push(rollBlueprint(rng));
        if (worked.reward.gear !== undefined) {
          // The place's element is the tag, the Old Crossroads gives explorer pieces, and the item
          // level is twice the finder's explorer rank.
          const item = rollGearDrop(
            rng,
            worked.reward.gear,
            { element: dest.element ?? null, crossroads: dest.id === RULES.gear.compassPlace },
            rank,
          );
          gear.push({ item, origin: { kind: 'trip', place: dest.id, rank } });
        }
      }
      return { parts, blueprints, supplies, gear };
    },
  );

  const result: ExpeditionResult = { recalled: !finished, catches, loot };
  if (rolled.empty > 0) result.noCatch = rolled.empty;
  if (settled.length > 0) result.autoSettled = settled;
  if (push !== null) result.pushOn = pushView(expedition, push.goal, push.outcome);

  // A recall brings what was caught and nothing more: no XP, no stars, no journal, no stats.
  if (finished) {
    finishProgress(env, userId, expedition, explorer, dest, now, {
      result,
      catches: rolled.results,
      views: catches,
      explorerBefore,
      famBefore,
      starsBefore,
      worked,
      milestoneXpBp: milestones.xpBp,
      twist,
      stats,
    });
  }
  logClaim(env, userId, expedition, result, now, dest);
  if (push !== null) {
    env.deps.analytics?.record(
      {
        kind: 'push_on_result',
        goal: push.goal.id,
        risk: push.goal.risk,
        outcome: push.outcome,
        destination: dest.id,
        duration: expedition.duration,
        oddsBp: result.pushOn?.oddsBp ?? 0,
      },
      userId,
    );
    if (push.outcome === 'worked') bumpStat(env.sql, userId, 'pushons_won', 1);
  }
  return result;
}

/** XP, familiarity, journal and stats of a trip that finished (not a recall, not a failure). */
function finishProgress(
  env: ClaimEnv,
  userId: string,
  expedition: ExpeditionRow,
  explorer: CreatureLite,
  dest: DestinationDef,
  now: number,
  p: {
    result: ExpeditionResult;
    catches: readonly TripCatch[];
    views: readonly CatchView[];
    explorerBefore: ExplorerView;
    famBefore: FamiliarityRecord;
    starsBefore: number;
    worked: PushOnGoalDef | null;
    milestoneXpBp: number;
    twist: TwistEffect | null;
    stats: Partial<Record<AccountStat, number>>;
  },
): void {
  const analytics = env.deps.analytics;

  // Explorer XP and rank (and the slot it may unlock).
  const sumBefore = env.rankSumOf(userId);
  const tripsBefore = p.stats.trips_finished ?? 0;
  // Each share on top of the trip's explorer XP, named for the result's breakdown; they multiply, and the same
  // parts give the amount and the breakdown.
  const twistName =
    expeditionContent.specials.twists.find((t) => t.id === expedition.special_id)?.name ?? 'Twist';
  const shares: XpBoostPart[] = [
    { source: 'trip', name: 'Milestones', bp: p.milestoneXpBp },
    { source: 'trip', name: twistName, bp: p.twist?.kind === 'xp' ? p.twist.bp : 0 },
    { source: 'trip', name: p.worked?.name ?? 'Push on', bp: p.worked?.reward.xpBp ?? 0 },
    gearPart('trail-xp', gearRulesOf(env.sql, explorer).trailXpBp),
  ];
  const gained = tripXp(expedition.duration, shares);
  const after = addExplorerTrip(env.sql, userId, explorer.id, gained);
  const rankAfter = explorerRank(after.xp);
  const explorerBoost = xpBoost(shares);
  p.result.xp = {
    gained,
    total: after.xp,
    rank: rankAfter,
    rankBefore: p.explorerBefore.rank,
    ...(explorerBoost === null ? {} : { boost: explorerBoost }),
  };
  // Creature experience (training by activity): the explorer earns the trip's by its length, doubled
  // by the treat packed when it was sent. A recall and a failed trip never get here.
  const wx = env.tripWeatherOf(expedition);
  const treat = expedition.treat === 1;
  const expParts = creatureXpParts(treat, wx.treatMultiplier, env.tripDayXpOf(expedition));
  const experience = awardExperience(
    env.sql,
    analytics,
    userId,
    explorer.id,
    tripExperience(expedition.duration, expParts),
    'trip',
    treat,
    xpBoost(expParts),
  );
  if (experience !== null) p.result.experience = experience;
  if (rankAfter > p.explorerBefore.rank) {
    analytics?.record(
      { kind: 'explorer_rank', species: explorer.species, rank: rankAfter },
      userId,
    );
    // One-time gifts for every rank reached, inside the claim's transaction. Each is keyed by
    // (creature, rank), so a rank can never pay twice.
    const gifts: RankGiftView[] = [];
    for (const { rank, gift } of rankGiftsBetween(p.explorerBefore.rank, rankAfter)) {
      const granted = grantRankGift(
        {
          storage: env.deps.storage,
          now: env.deps.now,
          rng: env.deps.gearRng,
          analytics: env.deps.analytics,
        },
        userId,
        explorer.id,
        rank,
        gift,
      );
      if (granted.fresh) {
        gifts.push({
          rank,
          bait: gift.bait,
          parts: { ...gift.parts },
          supplies: [...gift.supplies],
        });
      }
    }
    if (gifts.length > 0) p.result.rankGifts = gifts;
  }
  // This trip counts as finished and may raise the rank: a slot may open.
  const sumAfter = sumBefore + (rankAfter - p.explorerBefore.rank);
  const slotsAfter = slotsFor(sumAfter, tripsBefore + 1);
  if (slotsAfter > slotsFor(sumBefore, tripsBefore)) {
    p.result.slotUnlocked = { total: slotsAfter };
    analytics?.record({ kind: 'slot_unlock', slots: slotsAfter, rankSum: sumAfter }, userId);
  }

  // Familiarity: the trip, the species caught here, a shiny.
  const found = new Set(p.famBefore.found);
  const here = new Set(allSpecies(dest));
  for (const c of p.catches) if (here.has(c.species.id)) found.add(c.species.id);
  const record: FamiliarityRecord = {
    trips: p.famBefore.trips + 1,
    found: [...found],
    shiny: p.famBefore.shiny || p.catches.some((c) => c.shiny),
  };
  saveFamiliarity(env.sql, userId, explorer.id, dest.id, record);
  const stars = familiarityStars(dest, record);
  p.result.familiarity = { stars, starsBefore: p.starsBefore, trips: record.trips };
  if (stars > p.starsBefore) {
    analytics?.record({ kind: 'familiarity_star', destination: dest.id, stars }, userId);
  }

  // The journal: a chance per trip, and a sure page from a goal that gives one.
  const pages = rollPages(
    env,
    userId,
    expedition,
    dest,
    now,
    p.twist,
    p.worked?.reward.journal === true,
  );
  if (pages.length > 0) p.result.journal = pages;

  // Account stats.
  bumpStat(env.sql, userId, 'trips_finished', 1);
  bumpStat(
    env.sql,
    userId,
    'trip_hours',
    Math.round(lengthRules(expedition.duration).ms / HOUR_MS),
  );
  if (visitPlace(env.sql, userId, dest.id, now)) bumpStat(env.sql, userId, 'places_visited', 1);
  bumpStat(env.sql, userId, 'species_found', p.views.filter((c) => c.outcome === 'new').length);
  bumpStat(env.sql, userId, 'shinies_found', p.catches.filter((c) => c.shiny).length);
}

/** Journal pages for a finished trip. Never repeats a page, and stops when none are left. */
function rollPages(
  env: ClaimEnv,
  userId: string,
  expedition: ExpeditionRow,
  dest: DestinationDef,
  now: number,
  twist: TwistEffect | null,
  sure: boolean,
): JournalFindView[] {
  const entries = expeditionContent.journal.entries;
  const found = foundPages(env.sql, userId);
  const finds: JournalFindView[] = [];
  const attempts: boolean[] = [
    chance(
      env.deps.tripRng,
      journalChanceBp(expedition.duration, twist, env.tripWeatherOf(expedition).journalBp),
      10_000,
    ),
  ];
  if (sure) attempts.push(true);
  for (const wanted of attempts) {
    if (!wanted) continue;
    const entryId = rollJournal(env.deps.tripRng, entries, dest.id, found);
    if (entryId === null) continue;
    if (!addPage(env.sql, userId, entryId, now, expedition.id)) continue;
    found.add(entryId);
    bumpStat(env.sql, userId, 'journal_pages', 1);
    const entry = journalEntry(entryId);
    const setId = entry?.set ?? null;
    let setComplete = false;
    if (setId !== null) {
      const members = entries.filter((e) => e.set === setId);
      setComplete = members.every((e) => found.has(e.id));
      if (setComplete) bumpStat(env.sql, userId, 'journal_sets', 1);
    }
    finds.push({ entryId, set: setId, setComplete });
    env.deps.analytics?.record(
      {
        kind: 'journal_find',
        entry: entryId,
        place: entry?.place ?? 'any',
        set: setId,
        setComplete,
      },
      userId,
    );
  }
  return finds;
}

/** One `expedition_claim` or `expedition_recall` event per claim that actually paid out. */
function logClaim(
  env: ClaimEnv,
  userId: string,
  expedition: ExpeditionRow,
  result: ExpeditionResult,
  now: number,
  dest: DestinationDef,
): void {
  const analytics = env.deps.analytics;
  if (analytics === undefined) return;
  const catches: CatchProps[] = result.catches.map((c) => ({
    species: c.species,
    rarity: speciesOf(c.species).rarity,
    shiny: c.shiny,
    result: c.outcome,
    ...(c.talent === undefined ? {} : { talent: c.talent.id, golden: c.talent.golden }),
  }));
  const base = {
    duration: expedition.duration,
    destination: dest.id,
    supplies: env.kitIds(expedition),
    catches,
  };
  if (result.recalled) {
    const length = Math.max(1, expedition.ends_at - expedition.started_at);
    const elapsedPct = Math.floor(((now - expedition.started_at) * 100) / length);
    analytics.record({ kind: 'expedition_recall', ...base, elapsedPct }, userId);
  } else {
    analytics.record(
      {
        kind: 'expedition_claim',
        ...base,
        waitedMin: waitedMin(expedition, now),
        pushOn: result.pushOn?.outcome ?? 'none',
        xp: result.xp?.gained ?? 0,
        stars: result.familiarity?.stars ?? 0,
      },
      userId,
    );
  }
}

/**
 * Turns one catch into a creature (a species the player lacks) or a pending duplicate card. Either way
 * the catch has rolled its talent now, from live randomness: a new creature's goes in its first slot, a
 * duplicate's waits on the card. A shiny duplicate makes the creature the player owns shiny at once.
 */
function applyCatch(
  env: ClaimEnv,
  userId: string,
  expeditionId: string,
  caught: TripCatch,
  now: number,
  /** The explorer's Second look chance (basis points; 0 when it has none). */
  secondLookBp: number,
): { view: CatchView; settled: ChoiceResult | null } {
  const species = caught.species;
  const owned = env.sql
    .exec<CreatureLite>(
      `SELECT id, species, line, level, fusion_count, shiny, away_expedition_id FROM creatures
       WHERE user_id = ? AND line = ? ORDER BY line_slot`,
      userId,
      species.line,
    )
    .toArray();
  const existing = owned[0];
  const outcome = applyCatchToCollection(
    existing === undefined
      ? undefined
      : { fusionCount: existing.fusion_count, shiny: owned.some((c) => c.shiny === 1) },
    caught,
  );
  const firstOnServer = recordServerFirst(env.sql, 'catch', species.id, userId, expeditionId, now);
  const wearer = { role: species.role, element: species.element };
  const base = {
    species: species.id,
    shiny: caught.shiny,
    firstOnServer,
    ...(caught.deep ? { deep: true as const } : {}),
  };

  switch (outcome.kind) {
    case 'new': {
      // Drawn now from live randomness, after the catch itself is decided: the quirk (cosmetic) and
      // the talent.
      const made = insertCreature(
        env.sql,
        { quirk: env.deps.quirkRng, talent: env.deps.talentRng },
        { userId, species: species.id, origin: 'expedition', shiny: caught.shiny, now },
        env.deps.analytics,
      );
      const talent = talentViewOf(made.talent, wearer);
      return {
        view: { ...base, outcome: 'new', ...(talent === null ? {} : { talent }) },
        settled: null,
      };
    }
    case 'duplicate': {
      if (existing === undefined) throw new Error('a duplicate without a creature');
      if (outcome.becameShiny) {
        env.sql.exec('UPDATE creatures SET shiny = 1 WHERE id = ?', existing.id);
      }
      // "The better" is judged for the creature of the line the player has (the first, if they Kept two).
      const stats = effectiveStats(
        speciesOf(existing.species),
        existing.level,
        existing.fusion_count,
      );
      const pending = env.deps.choices.addPending(
        userId,
        { species: species.id, shiny: caught.shiny },
        { kind: 'expedition', id: expeditionId },
        secondLookBp > 0
          ? {
              bp: secondLookBp,
              wearer: {
                role: speciesOf(existing.species).role,
                element: speciesOf(existing.species).element,
                stats,
              },
            }
          : undefined,
      );
      const talent = talentViewOf(pending.talent, wearer);
      return {
        view: {
          ...base,
          outcome: 'duplicate',
          pendingId: pending.id,
          ...(talent === null ? {} : { talent }),
          ...(pending.looked ? { secondLook: true as const } : {}),
        },
        settled: pending.settled,
      };
    }
  }
}
