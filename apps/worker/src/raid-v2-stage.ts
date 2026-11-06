/**
 * One combat v2 raid stage for one party (docs/design/combat/integration.md, sections 4 and 5): the fighters from the party's placements,
 * the stored carry, a seed drawn now, `stageV2`, and everything that stores and pays the result. Stages 1 and 2 resolve instantly at their
 * event; stage 3 is the live finale (`raid-v2-live.ts`), which settles through the same `settleStageV2`.
 *
 * Server-authoritative and atomic: the fight, the stored result row, the carry, the payout and the analytics happen inside one
 * `transactionSync`, and the result row is the done marker. There are no HP floors: a boss that falls in a stage ends the weekend for
 * that party, and later stages are skipped.
 */
import { RULES, createSeededRng, creaturePower, effectiveStats } from '@creatures/game';
import {
  startCarry,
  stageV2,
  type BossDef,
  type FightEvent,
  type FightResult,
  type StageCarry,
  type StageInputV2,
  type StageOutput,
} from '@creatures/engine/v2';
import { bumpStat } from './expedition-store';
import { aliasFor, drawSeed, payStage, type ResolveDeps, type StoredSummary } from './raid-resolve';
import { queueStagePostV2 } from './raid-posts';
import { partyMembers } from './raid-roster';
import type { RaidPhase } from './raid-schedule';
import { partyPlacements, type PlacementRow } from './raid-teams';
import {
  V2_WORLD,
  colsFor,
  determinationBpFor,
  gridPlace,
  readPartyCarry,
  readTrack,
  seatsFor,
  slotBossInfo,
  weekendBoss,
} from './raid-v2-core';
import { fighterOf, knackOf, loadV2Creatures, type V2Creature } from './raid-v2-fighters';
import { speciesOf } from './species';

export type StageNo = 1 | 2 | 3;
/** The calendar event of a stage (a v2 week keeps the event names: `phase1` is stage 1). */
export const STAGE_EVENT: Record<StageNo, RaidPhase> = { 1: 'phase1', 2: 'phase2', 3: 'finale' };
/** The phase a stage's result row is stored under. */
export type ResultPhase = 'stage1' | 'stage2' | 'finale';
export const STAGE_PHASE: Record<StageNo, ResultPhase> = {
  1: 'stage1',
  2: 'stage2',
  3: 'finale',
};
export const RESULT_PHASES: readonly ResultPhase[] = ['stage1', 'stage2', 'finale'];

/** The week a stage belongs to. */
export interface WeekV2 {
  weekId: string;
  trackSlot: number;
}

/** A stage's fight as it will be played, with who is in it. */
export interface BuiltStageV2 {
  /** The members who fight (they have a live creature on the board); `aliases[i]` is `memberIds[i]`'s key in the fight. */
  memberIds: string[];
  aliases: string[];
  slot: number;
  /** The party's players at stage 1: they set the weekend's HP and the board's width. */
  players: number;
  boss: BossDef;
  input: StageInputV2;
  /** The carry the stage starts from. */
  carry: StageCarry;
  /** The owner's alias of each creature in the fight, by creature id. */
  ownerOf: Map<string, string>;
  /** The lineup of each fighting member, for the analytics log. */
  lineups: { userId: string; placed: number; withKnack: number; beyondTop3: number }[];
}

/** The share of `max` that `max - left` is, in basis points, floored and never above 10000. */
export const shareBp = (max: number, left: number): number =>
  max <= 0 ? 0 : Math.max(0, Math.min(10_000, Math.floor(((max - left) * 10_000) / max)));

/**
 * Moves a placement that stands beyond the board's width into the first free slot (a player left after others had placed past it); one
 * that does not fit is taken off the board. Stage 1 runs it, once the party's players are known. Returns nothing; writes placements.
 */
export function compactBoard(
  sql: SqlStorage,
  weekId: string,
  party: number,
  rows: number,
  cols: number,
): void {
  const placed = sql
    .exec<{ slot: number; creature_id: string }>(
      'SELECT slot, creature_id FROM raid_placements WHERE week_id = ? AND party = ? ORDER BY rowid',
      weekId,
      party,
    )
    .toArray();
  const limit = rows * cols;
  const taken = new Set(placed.filter((p) => p.slot < limit).map((p) => p.slot));
  let next = 0;
  for (const p of placed.filter((x) => x.slot >= limit)) {
    while (next < limit && taken.has(next)) next++;
    if (next < limit) {
      sql.exec(
        'UPDATE raid_placements SET slot = ? WHERE week_id = ? AND creature_id = ?',
        next,
        weekId,
        p.creature_id,
      );
      taken.add(next);
    } else {
      sql.exec(
        'DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?',
        weekId,
        p.creature_id,
      );
    }
  }
}

/** The placed creatures that are not among the owner's three highest-level ones (ties by the species' power, then the id). */
function beyondTop3(sql: SqlStorage, userId: string, placedIds: readonly string[]): number {
  const owned = sql
    .exec<{ id: string; species: string; level: number }>(
      'SELECT id, species, level FROM creatures WHERE user_id = ?',
      userId,
    )
    .toArray()
    .map((c) => ({
      id: c.id,
      level: c.level,
      power: creaturePower(effectiveStats(speciesOf(c.species), c.level, 0)),
    }))
    .sort((a, b) => b.level - a.level || b.power - a.power || (a.id < b.id ? -1 : 1));
  const top = new Set(owned.slice(0, 3).map((c) => c.id));
  return placedIds.filter((id) => !top.has(id)).length;
}

/**
 * The fight of one party's stage, from its placements now and the stored carry. Reads only (stage 1 moves nothing here: call
 * `compactStage1` first). Null when the party has no stage to play: nobody has a live creature placed, the earlier stages were never
 * played, or the boss has already fallen.
 */
export function buildStageV2(
  sql: SqlStorage,
  week: WeekV2,
  party: number,
  stage: StageNo,
  actions?: StageInputV2['actions'],
): BuiltStageV2 | null {
  const prior = readPartyCarry(sql, week.weekId, party);
  if (stage > 1 && prior === null) return null;
  if (prior !== null && prior.carry.bossHp <= 0) return null;
  const out = new Set(prior?.carry.out ?? []);
  const { rows, seats } = slotBossInfo(week.trackSlot);
  const placements: PlacementRow[] = partyPlacements(sql, week.weekId, party, seats)
    .filter((p) => !out.has(p.creature_id))
    .sort((a, b) => a.slot - b.slot);
  const fightingIds = partyMembers(sql, week.weekId, party).filter((id) =>
    placements.some((p) => p.user_id === id),
  );
  if (fightingIds.length === 0) return null;
  const players = prior?.players ?? fightingIds.length;
  const cols = colsFor(players);
  const boss = weekendBoss(week.trackSlot, players);
  const aliases = fightingIds.map((_, i) => aliasFor(i));
  const creatures = loadV2Creatures(
    sql,
    placements.map((p) => p.creature_id),
  );
  const ownerOf = new Map<string, string>();
  const fighters = placements.flatMap((p) => {
    const c = creatures.get(p.creature_id);
    const alias = aliases[fightingIds.indexOf(p.user_id)];
    const place = gridPlace(p.slot, rows);
    if (c === undefined || c.userId !== p.user_id || alias === undefined || place.col >= cols)
      return [];
    ownerOf.set(c.id, alias);
    return [fighterOf(c, alias, place)];
  });
  if (fighters.length === 0) return null;
  const track = readTrack(sql);
  const determinationBp = determinationBpFor(week.trackSlot, track?.failedWeekends ?? 0);
  const input: StageInputV2 = {
    ...V2_WORLD,
    boss,
    fighters,
    options: { log: true, ...(determinationBp > 0 ? { determinationBp } : {}) },
    ...(actions === undefined || actions.length === 0 ? {} : { actions }),
  };
  const lineups = fightingIds.map((userId) => {
    const mine = placements
      .filter((p) => p.user_id === userId)
      .flatMap((p) => {
        const c = creatures.get(p.creature_id);
        return c === undefined ? [] : [c];
      });
    return {
      userId,
      placed: mine.length,
      withKnack: mine.filter((c: V2Creature) => knackOf(c) !== undefined).length,
      beyondTop3: beyondTop3(
        sql,
        userId,
        mine.map((c) => c.id),
      ),
    };
  });
  return {
    memberIds: fightingIds,
    aliases,
    slot: week.trackSlot,
    players,
    boss,
    input,
    carry: prior?.carry ?? startCarry(boss),
    ownerOf,
    lineups,
  };
}

/** What a stored v2 result holds: the trimmed fight (no creature specs, no Maps) and the carry after it. */
export interface StoredStageResult {
  rules: 2;
  stage: StageNo;
  won: boolean;
  wiped: boolean;
  /** The boss's HP at the end of the stage (0 when it fell) and its real HP. */
  bossHpLeft: number;
  bossHpReal: number;
  damage: number;
  knockouts: number;
  reactions: number;
  reactionsByMark: Record<string, number>;
  blocked: number;
  dodges: number;
  intercepts: number;
  healed: number;
  killingBlow: FightResult['killingBlow'];
  escalation: FightResult['escalation'];
  /** The rounds the stage played. */
  rounds: number;
  /** The creatures that were played: key (the creature id), owner alias, HP at the end and what they dealt. */
  fighters: {
    key: string;
    owner: string;
    hp: number;
    maxHp: number;
    damageDealt: number;
    hitDamage: number;
  }[];
  events: FightEvent[];
  /** The carry after the stage (the boss's HP, each creature's HP, who is out). */
  carry: StageCarry;
}

/** The rounds a result played: the `end` event's round. */
export function roundsPlayed(events: readonly FightEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const board = events[i]?.board;
    if (board?.type === 'end') return board.round;
  }
  return events.reduce((n, e) => Math.max(n, e.round), 0);
}

/** The trimmed result a row stores. */
export function storedResultOf(stage: StageNo, output: StageOutput): StoredStageResult {
  const { result, carry } = output;
  return {
    rules: 2,
    stage,
    won: result.won,
    wiped: result.wiped,
    bossHpLeft: result.bossHpLeft,
    bossHpReal: result.bossHpReal,
    damage: result.damage,
    knockouts: result.knockouts,
    reactions: result.reactions,
    reactionsByMark: { ...result.reactionsByMark },
    blocked: result.blocked,
    dodges: result.dodges,
    intercepts: result.intercepts,
    healed: result.healed,
    killingBlow: result.killingBlow,
    escalation: result.escalation,
    rounds: roundsPlayed(result.events),
    fighters: result.fighters.map((f) => ({
      key: f.key ?? f.uid,
      owner: f.owner,
      hp: f.hp,
      maxHp: f.maxHp,
      damageDealt: f.damageDealt,
      hitDamage: f.hitDamage,
    })),
    events: [...result.events],
    carry,
  };
}

/** The share of the weekend's HP that clears a stage for experience (cumulative, today's numbers): stage 1 and 2 by HP removed. */
function clearAtLossBp(stage: StageNo): number {
  const cfg = RULES.raid.phases.find((p) => p.id === STAGE_EVENT[stage]);
  if (cfg === undefined) throw new Error('unknown stage');
  return cfg.clearAtLossBp;
}

/**
 * The HP thresholds a stage crosses for the first time (Misa, 2026-11-04): those the weekend's HP removed (`afterBp`, 10,000 for a kill)
 * has reached and no earlier stage of the party has paid (`paid`, the ids the earlier stages stored). A kill crosses them all.
 */
export function crossedThresholds(
  afterBp: number,
  paid: ReadonlySet<string>,
): { id: string; pays: 'phase1' | 'phase2' }[] {
  return RULES.raid.v2.rewards.thresholds
    .filter((t) => afterBp >= t.removedBp && !paid.has(t.id))
    .map((t) => ({ id: t.id, pays: t.pays }));
}

/** The threshold ids the party's earlier stages paid, from the summaries they stored (at most two rows). */
function thresholdsPaid(sql: SqlStorage, weekId: string, party: number): Set<string> {
  const paid = new Set<string>();
  for (const row of sql
    .exec<{ summary: string }>(
      'SELECT summary FROM raid_results WHERE week_id = ? AND party = ?',
      weekId,
      party,
    )
    .toArray()) {
    const ids = (JSON.parse(row.summary) as StoredSummary).v2?.paid?.thresholds ?? [];
    for (const id of ids) paid.add(id);
  }
  return paid;
}

/**
 * Stores a played stage and pays it: the party's pool and carry, Essence, experience, gear and the finale's loot through `payStage`
 * (the HP thresholds first crossed in this stage, the kill bonus, the finale's own payout when the boss falls; experience per stage as before), the result row, the analytics events and the knocked-out creatures' places. `input` is the exact input that was fought (the
 * live finale's carries its actions). Call it inside a transaction, once: the result row is the done marker.
 */
export function settleStageV2(
  deps: ResolveDeps,
  week: WeekV2,
  party: number,
  stage: StageNo,
  built: Pick<BuiltStageV2, 'memberIds' | 'aliases' | 'players' | 'slot' | 'carry' | 'ownerOf'>,
  seed: string,
  input: StageInputV2,
  output: StageOutput,
): void {
  const sql = deps.storage.sql;
  const now = deps.now();
  const { memberIds, aliases } = built;
  const { result, carry } = output;
  const hpMax = input.boss.hp;
  const removedBp = shareBp(hpMax, result.bossHpLeft);
  // The thresholds this stage crossed first: each is paid once in the weekend, by the stage whose result stores it.
  const crossed = crossedThresholds(
    result.won ? 10_000 : removedBp,
    thresholdsPaid(sql, week.weekId, party),
  );
  const cleared = stage === 3 ? result.won : result.won || removedBp >= clearAtLossBp(stage);
  const contributionOf = new Map<string, number>();
  for (const f of result.fighters) {
    contributionOf.set(f.owner, (contributionOf.get(f.owner) ?? 0) + f.damageDealt);
  }
  const phase = STAGE_EVENT[stage];
  const { essence, jackpot, userOf } = payStage(deps, week, party, phase, built, {
    cleared,
    contribution: (alias) => contributionOf.get(alias) ?? 0,
    fighters: result.fighters.map((f) => ({ id: f.key ?? f.uid, ownerAlias: f.owner })),
    bossId: input.boss.id,
    v2: { crossed: crossed.map((t) => t.pays), kill: result.won },
  });
  const contributors = aliases
    .map((alias) => ({
      userId: userOf.get(alias) as string,
      damage: contributionOf.get(alias) ?? 0,
      contribution: contributionOf.get(alias) ?? 0,
    }))
    .sort((a, b) => b.contribution - a.contribution || (a.userId < b.userId ? -1 : 1));
  const stored = storedResultOf(stage, output);
  const summary: StoredSummary = {
    cleared,
    rounds: stored.rounds,
    bossHpMax: hpMax,
    bossHpStart: built.carry.bossHp,
    bossHpEnd: result.bossHpLeft,
    reactions: result.reactions,
    damage: contributors.reduce((total, c) => total + c.damage, 0),
    contributors,
    essence,
    jackpot,
    members: aliases.map((alias) => ({ alias, userId: userOf.get(alias) as string })),
    v2: {
      stage,
      slot: built.slot,
      kill: result.won,
      knockouts: result.knockouts,
      hpRemovedBp: removedBp,
      // The thresholds this stage paid (each is paid once in the weekend, by the stage that first crosses it) and the kill bonus.
      paid: { thresholds: crossed.map((t) => t.id), killBonus: result.won },
    },
  };
  sql.exec(
    `UPDATE raid_parties SET hp_max = ?, hp_current = ?, boss_atk = ?, carry_json = ?, v2_players = ?
     WHERE week_id = ? AND party = ?`,
    hpMax,
    carry.bossHp,
    input.boss.atk,
    JSON.stringify(carry),
    built.players,
    week.weekId,
    party,
  );
  sql.exec(
    `INSERT INTO raid_results (week_id, party, phase, seed, input, result, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    week.weekId,
    party,
    STAGE_PHASE[stage],
    seed,
    JSON.stringify(input),
    JSON.stringify(stored),
    JSON.stringify(summary),
    now,
  );
  // A knocked-out creature is out for the weekend: its place is free for a fresh one.
  const before = new Set(built.carry.out);
  for (const key of carry.out) {
    if (before.has(key)) continue;
    sql.exec('DELETE FROM raid_placements WHERE week_id = ? AND creature_id = ?', week.weekId, key);
  }
  // The stage locks: open swap requests end.
  sql.exec(
    "UPDATE raid_swap_requests SET status = 'ended' WHERE week_id = ? AND party = ? AND status = 'open'",
    week.weekId,
    party,
  );
  deps.analytics?.record({
    kind: 'stage_result',
    slot: built.slot,
    stage,
    players: built.players,
    hpRemovedBp: removedBp,
    knockouts: result.knockouts,
    reactions: result.reactions,
    kill: result.won,
  });
  for (const userId of memberIds) bumpStat(sql, userId, 'reactions_seen', result.reactions);
  // Queued in this transaction, so the post exists exactly when the result does.
  queueStagePostV2(sql, {
    weekId: week.weekId,
    party,
    stage,
    now,
    bossId: input.boss.id,
    bossName: input.boss.name,
    kill: result.won,
    cleared,
    thresholds: crossed.map(
      (t) => (RULES.raid.v2.rewards.thresholds.find((x) => x.id === t.id)?.removedBp ?? 0) / 100,
    ),
    summary,
  });
}

/** Logs what each player brought to a stage when it locked. */
export function logLineups(
  deps: Pick<ResolveDeps, 'analytics'>,
  stage: StageNo,
  built: BuiltStageV2,
): void {
  for (const l of built.lineups) {
    deps.analytics?.record(
      {
        kind: 'raid_lineup',
        stage,
        placed: l.placed,
        withKnack: l.withKnack,
        beyondTop3: l.beyondTop3,
      },
      l.userId,
    );
  }
}

/**
 * Resolves stage `stage` (1, 2, or a finale that started too late to watch) for one party, instantly, in its own transaction. Returns
 * true if it resolved now, false if it had already been (or the party has no stage to play: nobody placed, or the boss has fallen).
 */
export function resolveStageV2(
  deps: ResolveDeps,
  week: WeekV2,
  party: number,
  stage: StageNo,
): boolean {
  const { storage } = deps;
  const sql = storage.sql;
  return storage.transactionSync(() => {
    const done = sql
      .exec(
        'SELECT 1 FROM raid_results WHERE week_id = ? AND party = ? AND phase = ?',
        week.weekId,
        party,
        STAGE_PHASE[stage],
      )
      .toArray();
    if (done.length > 0) return false;
    if (stage === 1) {
      const members = partyMembers(sql, week.weekId, party);
      const owners = new Set(
        partyPlacements(sql, week.weekId, party, seatsFor(week.trackSlot))
          .map((p) => p.user_id)
          .filter((id) => members.includes(id)),
      );
      compactBoard(
        sql,
        week.weekId,
        party,
        slotBossInfo(week.trackSlot).rows,
        colsFor(owners.size),
      );
    }
    const built = buildStageV2(sql, week, party, stage);
    if (built === null) return false;
    logLineups(deps, stage, built);
    // The seed is drawn now, from live randomness, and stored with the input: the stage can be replayed later, but nobody could have
    // known the seed before this moment.
    const seed = drawSeed(deps.rng);
    const output = stageV2(built.input, built.carry, createSeededRng(seed));
    settleStageV2(deps, week, party, stage, built, seed, built.input, output);
    return true;
  });
}
