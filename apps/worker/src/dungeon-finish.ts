/**
 * The end of a dungeon run (`Dungeon.act` and the sweeps of `dungeon.ts` call these): progress, the
 * kept pack, the boss chest and the supply, the streak bonus, creature experience, the summary and
 * rewards, and the analytics. Plain functions over the deps. None opens a transaction: all of it runs
 * inside the caller's (an act's `atomically`, or the savepoint that closes a stale run), so a failure
 * pays nothing. Every payout is idempotent on its own through the ledger and grant keys.
 */
import {
  RULES,
  addParts,
  dayParts,
  dayXpEffects,
  dungeonExperience,
  isLandmark,
  keptOnDefeat,
  mapView,
  nodeFoe,
  rollDungeonLoot,
  streakBonus,
  creatureXpParts,
  undercroftOpen,
  xpBoost,
  xpWeather,
  type WeatherDay,
} from '@creatures/game';
import { type DungeonRoomResult } from '@creatures/engine';
import { awardExperience } from './creature-exp';
import { grantDungeonRun, grantDungeonStreak, type GrantDeps } from './gear-grants';
import { SUPPLIES_PER_RUN } from './dungeon-path';
import { currentHp, keepsakeViews, runNode, type RunState } from './dungeon-state';
import type {
  DungeonOutcome,
  DungeonPack,
  DungeonRewards,
  DungeonRoomSummary,
  DungeonRunSummary,
  DungeonExperienceView,
} from './dungeon-types';
import { addDays } from './time';
import {
  type DungeonDeps,
  type RunRow,
  type StoredFight,
  fightRows,
  progressOf,
} from './dungeon-rows';

/**
 * The Boons and Omens of the day that changed creature experience, by name, with the change in basis
 * points as it was applied (scaled by the day's strength; negative: less). One that changes only the
 * treat's multiplier shows no entry. Names come from the content. (The older field of the run's
 * experience; `boost` says the same with the treat.)
 */
function xpDayEffects(day: WeatherDay | null): { name: string; bp: number }[] {
  return dayParts(dayXpEffects(day)).flatMap((p) =>
    p.source === 'day' ? [{ name: p.name, bp: p.bp }] : [],
  );
}

const totalOf = (pack: DungeonPack): number => pack.bait + pack.essence + pack.scrap;

/**
 * Ends a run, paying everything in the caller's transaction: the progress (depth only after a clear),
 * the kept pack with the boss chest and the supply, the streak bonus of the day's first finished run,
 * creature experience, the summary and rewards, and the analytics. Idempotent per (player, day,
 * attempt) through the ledger and grant keys.
 */
export function finishRun(
  deps: DungeonDeps,
  userId: string,
  row: RunRow,
  st: RunState,
  outcome: DungeonOutcome,
): { summary: DungeonRunSummary; rewards: DungeonRewards } {
  // The main boss was beaten: the run is cleared even when the Undercroft below it was lost.
  const cleared = outcome === 'cleared' || st.bossCleared;
  const { day, depth } = row;

  // --- Progress: counted when the run ends. A run that went home or was lost counts for the streak too. ---
  const progress = progressOf(deps.storage.sql, userId);
  // Progress only moves forward. A run that closes late (an earlier day's, after a later day's run
  // finished) must not roll the depth, the streak or the last day back: it leaves them alone.
  const forward = progress.last_day === null || day > progress.last_day;
  const newStreak =
    progress.last_day === day || !forward
      ? progress.streak
      : progress.last_day === addDays(day, -1)
        ? progress.streak + 1
        : 1;
  const newDepth = Math.max(progress.depth, cleared ? depth + 1 : depth);
  deps.storage.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth, streak, last_day, first_day, runs, clears)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       depth = MAX(depth, excluded.depth),
       streak = CASE WHEN last_day IS NULL OR excluded.last_day > last_day THEN excluded.streak ELSE streak END,
       last_day = CASE WHEN last_day IS NULL OR excluded.last_day > last_day THEN excluded.last_day ELSE last_day END,
       first_day = COALESCE(first_day, excluded.first_day),
       runs = runs + 1, clears = clears + excluded.clears`,
    userId,
    newDepth,
    newStreak,
    day,
    progress.first_day ?? day,
    cleared ? 1 : 0,
  );

  // --- Pay: the kept pack, the chest and the supply, and the streak bonus on the first run of a day ---
  const found = { ...st.pack };
  const kept = outcome === 'defeat' ? keptOnDefeat(found) : { ...found };
  const rewards = payRun(
    deps,
    userId,
    row,
    st,
    outcome,
    kept,
    newStreak,
    progress.last_day !== day,
  );

  // --- Creature experience, from the fights each creature stood in the row for (a treat doubles it) ---
  const inRow = new Set(st.input.team.map((slot) => slot.id));
  const experience: DungeonExperienceView[] = [];
  const dayEffects = xpDayEffects(st.weather);
  const days = dayParts(dayXpEffects(st.weather));
  const treatTimes = xpWeather(st.weather).treatMultiplier;
  for (const id of st.everyone) {
    const treat = st.treats.includes(id);
    // One list of parts gives the amount and the breakdown.
    const parts = creatureXpParts(treat, treatTimes, days);
    const gained = dungeonExperience(
      st.tally[id] ?? 0,
      // The full-clear bonus is for the row that beat the boss (a state stored before the Undercroft: the row at the end).
      st.fullClear !== undefined ? st.fullClear.includes(id) : cleared && inRow.has(id),
      parts,
    );
    const view = awardExperience(
      deps.storage.sql,
      deps.analytics,
      userId,
      id,
      gained,
      'dungeon',
      treat,
      xpBoost(parts),
    );
    if (view !== null) {
      experience.push({
        ...view,
        treatTimes: treat ? (treatTimes ?? RULES.experience.treat.multiplier) : null,
        dayEffects,
      });
    }
  }
  rewards.experience = experience;

  // --- Store ---
  const summary = summarise(deps, {
    row,
    st,
    outcome,
    newDepth,
    streak: newStreak,
    rewards,
    found,
    kept,
  });
  deps.storage.sql.exec(
    `UPDATE dungeon_runs SET status = 'done', outcome = ?, cleared = ?, rooms_cleared = ?,
       summary_json = ?, rewards_json = ? WHERE id = ?`,
    outcome,
    cleared ? 1 : 0,
    st.roomsCleared,
    JSON.stringify(summary),
    JSON.stringify(rewards),
    row.id,
  );
  logRun(deps, userId, summary, st, rewards, outcome, found, kept);
  return { summary, rewards };
}

/** Pays a run and returns what it paid. Call inside the run's transaction. */
function payRun(
  deps: DungeonDeps,
  userId: string,
  row: RunRow,
  st: RunState,
  outcome: DungeonOutcome,
  kept: DungeonPack,
  streak: number,
  firstOfDay: boolean,
): DungeonRewards {
  const { day, attempt, depth } = row;
  const cleared = outcome === 'cleared' || st.bossCleared;
  const landmark = cleared && isLandmark(depth);
  // A run that went down (or was offered the way down) opened the main boss's chest at that moment:
  // its gear, shard and supply are paid (`banked`) and its extras are in the pack, so nothing of the
  // chest is rolled or added again here.
  const chestPaid = st.banked !== null;
  // The boss chest of a clear: its Essence and scrap came into the pack with the boss's loot (and
  // are kept whole); on top come the full clear's Essence and the landmark's extras. The shard and
  // gear dice are rolled below, with the live gear rng.
  const bait = kept.bait;
  const essence =
    kept.essence +
    (cleared && !chestPaid ? RULES.dungeon.fullClear.essence : 0) +
    (landmark && !chestPaid ? RULES.dungeon.landmark.essence : 0);
  const scrap = kept.scrap + (landmark && !chestPaid ? RULES.dungeon.landmark.scrap : 0);
  const glimmer = landmark && !chestPaid ? RULES.dungeon.landmark.glimmer : 0;
  const bossNode = st.map.nodes.find((n) => n.kind === 'boss');
  const bossElement =
    (bossNode === undefined ? undefined : nodeFoe(bossNode, depth))?.element ?? 'tide';
  // The scrap, the glimmer and the shards the rooms dropped (all at risk in the pack, kept with it).
  const packParts = addParts({ scrap, glimmer }, kept.shards ?? {});
  const gearDeps = gearDepsOf(deps);
  const grant = grantDungeonRun(
    gearDeps,
    userId,
    day,
    attempt,
    (rng) => {
      if (chestPaid) return { parts: addParts(packParts, {}), gear: [], supplies: [] };
      const loot = rollDungeonLoot(
        rng,
        depth,
        {
          landmark,
          fullClear: cleared,
          bossCleared: cleared,
          supplies: st.supply ? SUPPLIES_PER_RUN : 0,
        },
        bossElement,
      );
      return {
        parts: addParts(packParts, loot.parts),
        gear: loot.gear.map((item) => ({ item, origin: { kind: 'dungeon' as const, depth } })),
        supplies: loot.supplies,
      };
    },
    { bait, essence, meta: { day, depth, attempt } },
    st.bagFull === undefined ? undefined : !st.bagFull,
  );
  let streakPaid: DungeonRewards['streak'] = null;
  const bonus = firstOfDay ? streakBonus(streak) : null;
  if (bonus !== null) {
    const parts = grantDungeonStreak(
      gearDeps,
      userId,
      day,
      {
        scrap: bonus.scrap,
        glimmer: bonus.glimmer,
      },
      { bait: bonus.bait, essence: bonus.essence, meta: { day, streak: bonus.day } },
    ).parts;
    streakPaid = { day: bonus.day, bait: bonus.bait, essence: bonus.essence, parts };
  }
  // What the boss chests paid on the way (see `chestPaid`) is part of what the run paid.
  const banked = st.banked;
  return {
    bait,
    essence,
    parts: addParts(banked?.parts ?? {}, grant.parts),
    gear: [...(banked?.gear ?? []), ...grant.gear],
    converted: [...(banked?.converted ?? []), ...grant.converted],
    supplies: [...(banked?.supplies ?? []), ...(grant.supplies ?? [])],
    landmark,
    streak: streakPaid,
  };
}

/** The deps of the gear grants: the live gear rng, and the same storage and clock. */
export function gearDepsOf(deps: DungeonDeps): GrantDeps {
  return {
    storage: deps.storage,
    now: deps.now,
    rng: deps.gearRng,
    analytics: deps.analytics,
  };
}

/**
 * Locks the player's depth in at `depth` the moment the main boss falls: it never goes down again, so
 * a defeat in the Undercroft or a run left open cannot undo it. Creates the progress row if there is
 * none yet (the run's end fills in the streak and the counts).
 */
export function lockDepth(deps: DungeonDeps, userId: string, depth: number): void {
  deps.storage.sql.exec(
    `INSERT INTO dungeon_progress (user_id, depth) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET depth = MAX(depth, excluded.depth)`,
    userId,
    depth,
  );
}

/** The summary of a run: the fights it played, the row at the end, what it paid and how it ended (null while it is open). */
export function summarise(
  deps: DungeonDeps,
  args: {
    row: RunRow;
    st: RunState;
    outcome: DungeonOutcome | null;
    newDepth: number;
    streak: number;
    rewards: DungeonRewards;
    found: DungeonPack;
    kept: DungeonPack;
  },
): DungeonRunSummary {
  const { row, st, outcome } = args;
  const hp = currentHp(st);
  const rooms: DungeonRoomSummary[] = [];
  for (const step of fightRows(deps.storage.sql, row.id)) {
    if (step.input_json === null || step.result_json === null) continue;
    const { input } = JSON.parse(step.input_json) as StoredFight;
    const result = JSON.parse(step.result_json) as DungeonRoomResult;
    const spec = input.rooms[0];
    if (spec === undefined) continue;
    const elite = spec.elite === true;
    rooms.push({
      index: spec.index,
      kind: spec.foe.kind,
      ...(elite ? { elite: true } : {}),
      ...(spec.epic === true ? { epic: true } : {}),
      foe: {
        id: spec.foe.id,
        name: spec.foe.name,
        element: spec.foe.element,
        hpMax: result.result.bossHpStart,
      },
      modifier: {
        id: spec.modifier.id,
        name: spec.modifier.name,
        description: spec.modifier.description,
      },
      played: true,
      cleared: result.cleared,
      rounds: result.result.rounds,
      foeHpEnd: result.result.bossHpEnd,
    });
  }
  return {
    id: row.id,
    day: row.day,
    attempt: row.attempt,
    depth: row.depth,
    newDepth: args.newDepth,
    cleared: outcome === 'cleared' || st.bossCleared,
    deepest: st.deepest,
    roomsCleared: st.roomsCleared,
    landmark: isLandmark(row.depth),
    streak: args.streak,
    createdAt: row.created_at,
    team: st.input.team.map((slot) => ({
      id: slot.id,
      name: slot.name,
      speciesId: slot.speciesId,
      element: slot.element,
      role: slot.role,
      level: slot.level,
      hpMax: st.hpMax[slot.id] ?? 0,
      hpEnd: hp[slot.id] ?? 0,
    })),
    rooms,
    rewards: args.rewards,
    ...(st.weather === null ? {} : { weather: { boon: st.weather.boon, omen: st.weather.omen } }),
    ...(outcome === null ? {} : { outcome }),
    // A carved door the player's depth does not open is a quiet room, shown as a mystery room everywhere.
    path: st.path.map((id) => {
      const kind = runNode(st, id)?.kind ?? 'fight';
      return kind === 'door' && !undercroftOpen(row.depth) ? 'mystery' : kind;
    }),
    pack: { found: { ...args.found }, kept: { ...args.kept } },
    keepsakes: keepsakeViews(st.keepsakes),
    ...(outcome === null
      ? {}
      : {
          route: {
            map: mapView(st.map, row.depth),
            path: [...st.path],
            history: structuredClone(st.history),
            ...(st.under.length === 0
              ? {}
              : { undercroft: st.under.map((m) => mapView(m, row.depth)) }),
          },
        }),
  };
}

/** The analytics events of a run: who went and how it ended, and what it paid. */
function logRun(
  deps: DungeonDeps,
  userId: string,
  summary: DungeonRunSummary,
  st: RunState,
  rewards: DungeonRewards,
  outcome: DungeonOutcome,
  found: DungeonPack,
  kept: DungeonPack,
): void {
  const analytics = deps.analytics;
  if (analytics === undefined) return;
  analytics.record(
    {
      kind: 'dungeon_run',
      depth: summary.depth,
      attempt: summary.attempt,
      roomsCleared: summary.roomsCleared,
      cleared: summary.cleared,
      landmark: summary.landmark,
      modifiers: summary.rooms.map((r) => r.modifier.id),
      team: st.input.team.map((s) => ({ species: s.speciesId, role: s.role })),
      gear: st.gearWorn,
      outcome,
      path: summary.path ?? [],
      keepsakes: st.keepsakes,
      campChoice: st.campChoice ?? 'none',
      elites: st.elites,
      packFound: totalOf(found),
      packKept: totalOf(kept),
      deepest: st.deepest,
      marks: st.marks,
    },
    userId,
  );
  if (summary.weather !== undefined) {
    analytics.record(
      {
        kind: 'weather_use',
        where: 'dungeon',
        boon: summary.weather.boon,
        omen: summary.weather.omen,
      },
      userId,
    );
  }
  const parts = addParts(rewards.parts, rewards.streak?.parts ?? {});
  const shards =
    (parts['tide-shard'] ?? 0) +
    (parts['ember-shard'] ?? 0) +
    (parts['grove-shard'] ?? 0) +
    (parts['spark-shard'] ?? 0) +
    (parts['mire-shard'] ?? 0);
  const bait = rewards.bait + (rewards.streak?.bait ?? 0);
  const essence = rewards.essence + (rewards.streak?.essence ?? 0);
  if (
    bait +
      essence +
      (parts.scrap ?? 0) +
      shards +
      (parts.glimmer ?? 0) +
      rewards.gear.length +
      (rewards.supplies?.length ?? 0) >
    0
  ) {
    analytics.record(
      {
        kind: 'dungeon_reward',
        depth: summary.depth,
        bait,
        essence,
        scrap: parts.scrap ?? 0,
        shards,
        glimmer: parts.glimmer ?? 0,
        gear: rewards.gear.length + rewards.converted.length,
        supplies: rewards.supplies?.length ?? 0,
        landmark: rewards.landmark,
        streakBonusDay: rewards.streak?.day ?? 0,
      },
      userId,
    );
  }
}
