/**
 * Dev tools for the weekly raid. Staging only (see `dev-tools.ts`). Each function runs inside the tool's
 * one transaction and acts on the caller's guild: its current raid week, its roster and the caller.
 *
 * Moving the week through its phases uses the dev clock (the real scheduler then runs the real events);
 * "resolve now" and "simulate the week" resolve the phases directly, with the engine and live
 * randomness exactly as the scheduler would, and mark the events done so they never run twice.
 */
import { RULES, content, festivalCreatureFor, int, ribbonsForLevel } from '@creatures/game';
import type * as v from 'valibot';
import { advanceTo, phaseTarget } from './dev-tools-clock';
import { DevError, purgeUser, type ToolCtx } from './dev-context';
import type {
  RaidBossBodySchema,
  RaidFestivalBodySchema,
  RaidLiveBodySchema,
  RaidPhaseBodySchema,
  RaidResolveBodySchema,
  RaidRosterBodySchema,
  RaidSimulateBodySchema,
} from './dev-schemas';
import { readWeekProgression } from './raid-ladder';
import { ensureWeekRank } from './raid-ladder';
import { joinSmallestParty, leaveParty, partyOf, partyRowLength } from './raid-roster';
import { RAID_PHASES, weekIndex } from './raid-schedule';
import { autoTeam, loadCreatures } from './raid-teams';
import { insertCreature } from './talent-store';

type Body<S extends v.GenericSchema> = v.InferOutput<S>;

/** Simulated players have ids that are not Discord snowflakes, so they can never be a real user. */
export const GUEST_PREFIX = 'dev-guest-';
export const guestId = (n: number): string => `${GUEST_PREFIX}${String(n)}`;

const eventDone = (ctx: ToolCtx, weekId: string, event: string): boolean =>
  ctx.sql.exec('SELECT 1 FROM raid_events WHERE week_id = ? AND event = ?', weekId, event).toArray()
    .length > 0;

/** Moves the clock to a phase of the week (the scheduler runs whatever that makes due). */
export function raidPhase(ctx: ToolCtx, body: Body<typeof RaidPhaseBodySchema>) {
  advanceTo(ctx, phaseTarget(body.to, ctx.now, ctx.tz));
  const week = ctx.raid.currentWeek(ctx.tz);
  ctx.raid.settleDueLive();
  return { weekId: week.weekId, status: ctx.raid.week(week.weekId)?.status ?? week.status };
}

/** Resolves Phase 1, or Phase 1 and then Phase 2, for every party now. Phases already done stay as they were. */
export function raidResolve(ctx: ToolCtx, body: Body<typeof RaidResolveBodySchema>) {
  const week = ctx.raid.currentWeek(ctx.tz);
  const phases = body.phase === 'phase2' ? (['phase1', 'phase2'] as const) : (['phase1'] as const);
  const resolved: string[] = [];
  for (const phase of phases) {
    if (eventDone(ctx, week.weekId, phase)) continue;
    ctx.raid.resolvePhase(week, phase);
    resolved.push(phase);
  }
  return {
    weekId: week.weekId,
    resolved,
    status: ctx.raid.week(week.weekId)?.status ?? week.status,
  };
}

/** The rank the boss fights at in a week: the eased rank in a Festival. */
function effectiveRankOf(rank: number, festival: boolean): number {
  return festival ? Math.max(1, rank - RULES.progression.festivalEaseRanks) : rank;
}

function weekFlags(ctx: ToolCtx, weekId: string) {
  const row = ctx.sql
    .exec<{
      boss_id: string;
      rank: number | null;
      effective_rank: number | null;
      festival: number | null;
      difficulty_version: number;
    }>(
      'SELECT boss_id, rank, effective_rank, festival, difficulty_version FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .one();
  const poolFixed =
    ctx.sql
      .exec('SELECT 1 FROM raid_parties WHERE week_id = ? AND hp_max IS NOT NULL LIMIT 1', weekId)
      .toArray().length > 0;
  return {
    weekId,
    bossId: row.boss_id,
    rank: row.rank,
    effectiveRank: row.effective_rank,
    festival: row.festival === 1,
    difficultyVersion: row.difficulty_version,
    poolFixed,
  };
}

/**
 * Sets this week's boss and/or the server's Boss Rank (the week takes it, and the ladder keeps it for the
 * weeks after). The boss pool is fixed when Phase 1 resolves: after that a change only shows on the card
 * (`poolFixed` tells).
 */
export function raidBoss(ctx: ToolCtx, body: Body<typeof RaidBossBodySchema>) {
  const week = ctx.raid.currentWeek(ctx.tz);
  if (body.bossId !== undefined) {
    ctx.sql.exec('UPDATE raid_weeks SET boss_id = ? WHERE week_id = ?', body.bossId, week.weekId);
  }
  if (body.rank !== undefined) {
    const festival = weekFlags(ctx, week.weekId).festival;
    ctx.sql.exec(
      'UPDATE raid_weeks SET rank = ?, effective_rank = ? WHERE week_id = ?',
      body.rank,
      effectiveRankOf(body.rank, festival),
      week.weekId,
    );
    ctx.sql.exec('UPDATE raid_ladder SET rank = ? WHERE id = 1', body.rank);
  }
  ctx.raid.invalidateReadiness();
  return weekFlags(ctx, week.weekId);
}

/** Turns this week into a Festival week (with its Festival creature) or back into a normal one. */
export function raidFestival(ctx: ToolCtx, body: Body<typeof RaidFestivalBodySchema>) {
  const week = ctx.raid.currentWeek(ctx.tz);
  const species = body.on
    ? (festivalCreatureFor(weekIndex(week.weekId)) ??
      content.creatures.find((c) => c.festival === true) ??
      null)
    : null;
  ctx.sql.exec(
    'UPDATE raid_weeks SET festival = ?, festival_species = ? WHERE week_id = ?',
    body.on ? 1 : 0,
    species?.id ?? null,
    week.weekId,
  );
  const rank = readWeekProgression(ctx.sql, week.weekId)?.rank ?? null;
  if (rank !== null) {
    ctx.sql.exec(
      'UPDATE raid_weeks SET effective_rank = ? WHERE week_id = ?',
      effectiveRankOf(rank, body.on),
      week.weekId,
    );
  }
  ctx.raid.invalidateReadiness();
  return weekFlags(ctx, week.weekId);
}

// --- The roster ---

/** The number of the caller's team creatures' average level, or 5 for a player with no creature. */
export function referenceLevel(ctx: ToolCtx): number {
  const team = autoTeam(loadCreatures(ctx.sql, ctx.userId));
  if (team.length === 0) return 5;
  return Math.max(1, Math.floor(team.reduce((total, c) => total + c.level, 0) / team.length));
}

/**
 * Creates one simulated player: a player row and `creatures` creatures (default three) of different lines
 * near `level`. A guest that already exists keeps its creatures and gets more of lines it lacks, up to
 * `creatures` (the Games' bots need more than a raid team).
 */
export function createGuest(
  ctx: ToolCtx,
  n: number,
  level: number,
  creatures: number = RULES.raid.teamSize,
): void {
  const id = guestId(n);
  ctx.sql.exec(
    `INSERT INTO players (user_id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    id,
    `Guest ${String(n)}`,
    ctx.now,
    ctx.now,
  );
  // Shuffle the species with the live RNG (Fisher-Yates), then take the first of distinct lines.
  const pool = content.creatures.filter((c) => c.festival !== true);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = int(ctx.rng, i + 1);
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) continue;
    pool[i] = b;
    pool[j] = a;
  }
  const owned = ctx.sql
    .exec<{ line: string }>('SELECT line FROM creatures WHERE user_id = ?', id)
    .toArray();
  const lines = new Set(owned.map((r) => r.line));
  let have = owned.length;
  for (const species of pool) {
    if (have >= creatures) break;
    if (lines.has(species.line)) continue;
    have += 1;
    lines.add(species.line);
    const spread = int(ctx.rng, 5) - 2;
    const made = insertCreature(
      ctx.sql,
      { quirk: ctx.quirkRng, talent: ctx.talentRng },
      { userId: id, species: species.id, origin: 'dev', now: ctx.now },
    );
    const guestLevel = Math.min(species.levelCap, Math.max(1, level + spread));
    ctx.sql.exec(
      'UPDATE creatures SET level = ?, ribbons = ? WHERE id = ?',
      guestLevel,
      ribbonsForLevel(guestLevel),
      made.id,
    );
  }
}

/** The simulated players of the guild, by number. */
export function existingGuests(ctx: ToolCtx): number[] {
  return ctx.sql
    .exec<{ user_id: string }>(
      'SELECT user_id FROM players WHERE user_id LIKE ?',
      `${GUEST_PREFIX}%`,
    )
    .toArray()
    .map((r) => Number(r.user_id.slice(GUEST_PREFIX.length)))
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b);
}

/**
 * Joins a simulated player to this week's raid the way a real one does: it places its creatures (up to
 * three) in the lowest free slots of the party it joins. Nobody's creatures are placed for them
 * otherwise, so this is what makes a guest take part.
 */
export function placeGuest(
  ctx: ToolCtx,
  weekId: string,
  userId: string,
  /** The creatures to place (at most three); default the first three the player made. */
  creatureIds?: readonly string[],
): void {
  const party =
    partyOf(ctx.sql, weekId, userId) ?? joinSmallestParty(ctx.sql, weekId, userId, ctx.now);
  const creatures = (
    creatureIds ??
    ctx.sql
      .exec<{ id: string }>(
        'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid LIMIT ?',
        userId,
        RULES.raid.teamSize,
      )
      .toArray()
      .map((r) => r.id)
  )
    .slice(0, RULES.raid.teamSize)
    .map((id) => ({ id }));
  const placed = new Set(
    ctx.sql
      .exec<{ creature_id: string }>(
        'SELECT creature_id FROM raid_placements WHERE week_id = ? AND user_id = ?',
        weekId,
        userId,
      )
      .toArray()
      .map((r) => r.creature_id),
  );
  const length = partyRowLength(ctx.sql, weekId, party);
  const taken = new Set(
    ctx.sql
      .exec<{ slot: number }>(
        'SELECT slot FROM raid_placements WHERE week_id = ? AND party = ?',
        weekId,
        party,
      )
      .toArray()
      .map((r) => r.slot),
  );
  let slot = 0;
  for (const { id } of creatures) {
    if (placed.has(id)) continue;
    while (taken.has(slot) && slot < length) slot += 1;
    if (slot >= length) break;
    ctx.sql.exec(
      'INSERT INTO raid_placements (week_id, party, slot, user_id, creature_id) VALUES (?, ?, ?, ?, ?)',
      weekId,
      party,
      slot,
      userId,
      id,
    );
    taken.add(slot);
  }
  ensureWeekRank(ctx.sql, weekId);
}

/** Whether joining this week's raid is still open (Phase 1 has not resolved). */
function joiningOpen(ctx: ToolCtx, weekId: string): boolean {
  return (
    !eventDone(ctx, weekId, 'phase1') &&
    ctx.sql.exec('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1', weekId).toArray()
      .length === 0
  );
}

/**
 * Dev convenience for the tools that need the caller in the raid (the roster, a simulated week, a live
 * practice): when they have not joined and joining is open, their three strongest creatures are placed
 * for them, as if they had placed them. Real players are never given a team: this only exists on staging.
 */
export function joinCaller(ctx: ToolCtx, weekId: string): void {
  if (partyOf(ctx.sql, weekId, ctx.userId) !== null || !joiningOpen(ctx, weekId)) return;
  const team = autoTeam(loadCreatures(ctx.sql, ctx.userId));
  if (team.length === 0) return;
  placeGuest(
    ctx,
    weekId,
    ctx.userId,
    team.map((c) => c.id),
  );
  ctx.raid.invalidateReadiness();
}

/**
 * Makes the guild's simulated players exactly `count` (numbers 1 to `count`) and has each place its three
 * creatures (near the caller's level) on this week's board, so they are in the raid like any player who
 * placed. The caller joins with their three strongest (`joinCaller`). Allowed while joining is
 * open, that is until Phase 1 resolves; later it is locked and only a no-op change is accepted.
 */
export function ensureGuests(ctx: ToolCtx, count: number): { guests: number } {
  const week = ctx.raid.currentWeek(ctx.tz);
  const have = existingGuests(ctx);
  const locked =
    week.status !== 'open' ||
    ctx.sql.exec('SELECT 1 FROM raid_results WHERE week_id = ? LIMIT 1', week.weekId).toArray()
      .length > 0;
  const inRoster = have.filter((n) => partyOf(ctx.sql, week.weekId, guestId(n)) !== null).length;
  if (locked) {
    if (have.length === count && inRoster === count) return { guests: count };
    throw new DevError(409, 'roster_locked');
  }
  for (const n of have.filter((n) => n > count)) {
    leaveParty(ctx.sql, week.weekId, guestId(n));
    purgeUser(ctx.sql, guestId(n), false);
  }
  const level = referenceLevel(ctx);
  for (let n = 1; n <= count; n++) {
    if (have.includes(n)) {
      ctx.sql.exec('UPDATE players SET last_seen_at = ? WHERE user_id = ?', ctx.now, guestId(n));
    } else {
      createGuest(ctx, n, level);
    }
    placeGuest(ctx, week.weekId, guestId(n));
  }
  joinCaller(ctx, week.weekId);
  ctx.raid.invalidateReadiness();
  return { guests: count };
}

export function raidRoster(ctx: ToolCtx, body: Body<typeof RaidRosterBodySchema>) {
  const { guests } = ensureGuests(ctx, body.count);
  const week = ctx.raid.currentWeek(ctx.tz);
  const members = ctx.sql
    .exec<{ n: number }>(
      'SELECT COUNT(*) AS n FROM raid_party_members WHERE week_id = ?',
      week.weekId,
    )
    .one().n;
  return { weekId: week.weekId, guests, members };
}

// --- The finale and a whole week ---

/**
 * Starts a live practice finale for the caller's party now, with a short countdown (default 10 seconds):
 * the existing practice mode with the block and the cooldown lifted. It pays nothing and stores no result.
 */
export function raidLive(ctx: ToolCtx, body: Body<typeof RaidLiveBodySchema>) {
  joinCaller(ctx, ctx.raid.currentWeek(ctx.tz).weekId);
  const outcome = ctx.raid.startPractice(ctx.userId, ctx.tz, {
    lobbyMs: (body.countdownSeconds ?? 10) * 1000,
    unrestricted: true,
  });
  if (!outcome.ok) throw new DevError(outcome.status, outcome.error);
  return { snapshot: outcome.value };
}

/**
 * Plays the whole week now: Phase 1, Phase 2 and the finale resolve at once for every party (the finale as
 * an instant one, every ability at its default round), paying and logging as the scheduler would. With
 * `guests` the simulated roster is set first. Returns the caller's after-action for each phase.
 */
export function raidSimulate(ctx: ToolCtx, body: Body<typeof RaidSimulateBodySchema>) {
  if (body.guests !== undefined) ensureGuests(ctx, body.guests);
  const week = ctx.raid.currentWeek(ctx.tz);
  joinCaller(ctx, week.weekId);
  const party = partyOf(ctx.sql, week.weekId, ctx.userId);
  if (party === null) throw new DevError(409, 'not_in_roster');
  for (const phase of RAID_PHASES) {
    const fresh = ctx.raid.week(week.weekId) ?? week;
    ctx.raid.resolvePhase(fresh, phase);
  }
  const stats = Object.fromEntries(
    RAID_PHASES.map((phase) => [phase, ctx.raid.stats(ctx.userId, week.weekId, party, phase)]),
  );
  return {
    weekId: week.weekId,
    party,
    status: ctx.raid.week(week.weekId)?.status ?? week.status,
    stats,
    boss: ctx.raid.week(week.weekId)?.bossId ?? week.bossId,
  };
}
