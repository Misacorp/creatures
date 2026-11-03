/**
 * The `raid-weekend` dev tool (staging only, and only with the `COMBAT_V2` flag on, on a combat v2 week; `docs/design/combat/integration.md`,
 * section 10): plays the week's weekend on the real scheduler by moving the dev clock, the way a long wait would.
 *
 * The events, in order, are the tool's steps:
 * 1. `stage1`: the clock moves to Saturday's stage 1 and the scheduler resolves it; then the guests replace the creatures knocked out
 *    from their spares and one guest asks the caller for a swap (through the swap code), so the caller finds a request waiting;
 * 2. `stage2`: the guests' replacements again (nothing new if nothing changed), the clock moves to Sunday's stage 2 and the scheduler
 *    resolves it (the open swap request ends with the lock, as any does);
 * 3. `finale-start`: the clock moves to the finale's start; the live fight begins, so the caller can watch it and press their input;
 * 4. `finale-end`: the clock moves past the last round; the fight settles and the week ends (the track moves or holds).
 *
 * Without `step` the tool runs up to `finale-start`. A `step` runs that step, after any earlier one that has not run (so the guests'
 * work between stages is never skipped). A step that has already run changes nothing, so the tool is safe to press twice. The whole
 * call is one transaction, then the dev clock's usual catch-up re-arms the alarm.
 */
import { RULES } from '@creatures/game';
import type * as v from 'valibot';
import { DevError, type ToolCtx } from './dev-context';
import { RAID_WEEKEND_STEPS, type RaidWeekendBodySchema } from './dev-schemas';
import { advanceTo } from './dev-tools-clock';
import { GUEST_PREFIX, ensureGuests, existingGuests, guestId, joinCaller } from './dev-tools-raid';
import { placeCreaturesV2 } from './dev-tools-raid-v2';
import { partyOf } from './raid-roster';
import { eventTimes, type RaidEvent } from './raid-schedule';
import { readPartyCarry, readTrack } from './raid-v2-core';

export const WEEKEND_STEPS = RAID_WEEKEND_STEPS;
export type WeekendStep = (typeof WEEKEND_STEPS)[number];

/** The calendar event each step waits for (`finale-end` has none: it waits for the live fight's last round). */
const EVENT_OF: Record<Exclude<WeekendStep, 'finale-end'>, RaidEvent> = {
  stage1: 'phase1',
  stage2: 'phase2',
  'finale-start': 'finale',
};

/** The most times `finale-end` moves the clock to the end of a fight that is still unresolved (one per party at worst). */
const MAX_FIGHTS_SETTLED = 60;

/** What the settle waits past a fight's last round, so it is certainly over. */
const SETTLE_MARGIN_MS = 1000;

const eventDone = (ctx: ToolCtx, weekId: string, event: RaidEvent): boolean =>
  ctx.sql.exec('SELECT 1 FROM raid_events WHERE week_id = ? AND event = ?', weekId, event).toArray()
    .length > 0;

const weekEnded = (ctx: ToolCtx, weekId: string): boolean =>
  ctx.sql
    .exec<{ ladder_at: number | null }>(
      'SELECT ladder_at FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0]?.ladder_at != null;

function stepDone(ctx: ToolCtx, weekId: string, step: WeekendStep): boolean {
  return step === 'finale-end' ? weekEnded(ctx, weekId) : eventDone(ctx, weekId, EVENT_OF[step]);
}

/** Moves the clock to `target` and lets the scheduler run what that makes due (the same calls the alarm makes). */
function moveTo(ctx: ToolCtx, target: number): void {
  advanceTo(ctx, target);
  ctx.raid.runDue(ctx.tz);
  ctx.raid.settleDueLive();
}

/**
 * A guest replaces the creatures it lost: fresh ones from its spares (never one that fought, so never one that is out) go into empty
 * slots through the placement code, up to three on the board. Returns how many it brought in.
 */
function replaceFor(ctx: ToolCtx, weekId: string, userId: string): number {
  const party = partyOf(ctx.sql, weekId, userId);
  if (party === null) return 0;
  const carry = readPartyCarry(ctx.sql, weekId, party)?.carry;
  if (carry === undefined || carry.bossHp <= 0) return 0;
  const onBoard = new Set(
    ctx.sql
      .exec<{ creature_id: string }>(
        'SELECT creature_id FROM raid_placements WHERE week_id = ? AND user_id = ?',
        weekId,
        userId,
      )
      .toArray()
      .map((r) => r.creature_id),
  );
  const need = RULES.raid.teamSize - onBoard.size;
  if (need <= 0) return 0;
  const fought = new Set([...carry.out, ...Object.keys(carry.hp)]);
  const spares = ctx.sql
    .exec<{ id: string }>(
      'SELECT id FROM creatures WHERE user_id = ? ORDER BY caught_at, rowid',
      userId,
    )
    .toArray()
    .map((r) => r.id)
    .filter((id) => !fought.has(id) && !onBoard.has(id));
  return placeCreaturesV2(ctx, weekId, userId, spares.slice(0, need), { knack: true }).length;
}

/** Every guest replaces what it lost. Returns the number of creatures brought in. */
function replaceKnockedOut(ctx: ToolCtx, weekId: string): number {
  let brought = 0;
  for (const n of existingGuests(ctx)) brought += replaceFor(ctx, weekId, guestId(n));
  return brought;
}

/**
 * One guest of the caller's party asks the caller to swap places, through the swap code (its lowest slot for the caller's lowest slot).
 * Once a week: nothing happens if a guest has asked already. Returns the guest's name, or null.
 */
function requestSwap(ctx: ToolCtx, weekId: string): string | null {
  const callerParty = partyOf(ctx.sql, weekId, ctx.userId);
  if (callerParty === null) return null;
  const asked =
    ctx.sql
      .exec(
        'SELECT 1 FROM raid_swap_requests WHERE week_id = ? AND from_user LIKE ? LIMIT 1',
        weekId,
        `${GUEST_PREFIX}%`,
      )
      .toArray().length > 0;
  if (asked) return null;
  const lowestSlot = (userId: string): number | undefined =>
    ctx.sql
      .exec<{ slot: number }>(
        'SELECT slot FROM raid_placements WHERE week_id = ? AND party = ? AND user_id = ? ORDER BY slot LIMIT 1',
        weekId,
        callerParty,
        userId,
      )
      .toArray()[0]?.slot;
  const mine = lowestSlot(ctx.userId);
  if (mine === undefined) return null;
  for (const n of existingGuests(ctx)) {
    const guest = guestId(n);
    if (partyOf(ctx.sql, weekId, guest) !== callerParty) continue;
    const theirs = lowestSlot(guest);
    if (theirs === undefined) continue;
    if (ctx.raid.askSwap(guest, ctx.tz, theirs, mine).ok) return `Guest ${String(n)}`;
  }
  return null;
}

/** Plays the live finale out: the clock moves to the last round of each unresolved fight and the scheduler settles it. */
function settleFinale(ctx: ToolCtx): void {
  for (let i = 0; i < MAX_FIGHTS_SETTLED; i++) {
    const end = ctx.raid.nextLiveEndAt();
    if (end === null) break;
    moveTo(ctx, end + SETTLE_MARGIN_MS);
  }
}

interface StoredSummaryPart {
  bossHpMax?: number;
  bossHpStart?: number;
  bossHpEnd?: number;
  v2?: { hpRemovedBp?: number; knockouts?: number; kill?: boolean };
}

/** What each stored stage did, party by party: the HP it removed, the creatures it knocked out and whether the boss fell. */
function stageResults(ctx: ToolCtx, weekId: string) {
  const out: {
    party: number;
    stage: 1 | 2 | 3;
    removedBp: number;
    totalRemovedBp: number;
    knockedOut: number;
    bossHpLeft: number;
    kill: boolean;
  }[] = [];
  const rows = ctx.sql
    .exec<{ party: number; phase: string; summary: string }>(
      `SELECT party, phase, summary FROM raid_results
       WHERE week_id = ? AND phase IN ('stage1', 'stage2', 'finale') ORDER BY party, phase`,
      weekId,
    )
    .toArray();
  const order = { stage1: 1, stage2: 2, finale: 3 } as const;
  for (const row of rows) {
    const stage = order[row.phase as keyof typeof order];
    let summary: StoredSummaryPart = {};
    try {
      summary = JSON.parse(row.summary) as StoredSummaryPart;
    } catch {
      // A summary that does not parse reads as empty: the dev answer is only a report.
    }
    const max = summary.bossHpMax ?? 0;
    const start = summary.bossHpStart ?? 0;
    const end = summary.bossHpEnd ?? 0;
    out.push({
      party: row.party,
      stage,
      removedBp: max > 0 ? Math.floor(((start - end) * 10_000) / max) : 0,
      totalRemovedBp: summary.v2?.hpRemovedBp ?? 0,
      knockedOut: summary.v2?.knockouts ?? 0,
      bossHpLeft: end,
      kill: summary.v2?.kill === true,
    });
  }
  return out.sort((a, b) => a.stage - b.stage || a.party - b.party);
}

export function raidWeekend(ctx: ToolCtx, body: v.InferOutput<typeof RaidWeekendBodySchema>) {
  if (!ctx.combatV2) throw new DevError(404, 'not_found');
  const week = ctx.raid.currentWeek(ctx.tz);
  if (week.rules !== 2) throw new DevError(409, 'not_v2');
  if (week.festival) throw new DevError(409, 'festival');
  const weekId = week.weekId;
  const upto = body.step ?? 'finale-start';
  const wanted = WEEKEND_STEPS.slice(0, WEEKEND_STEPS.indexOf(upto) + 1);
  const times = eventTimes(weekId, ctx.tz, 2);

  // The roster: guests when asked for, and the caller joins with their strongest if stage 1 has not locked the players yet.
  if (body.guests !== undefined) ensureGuests(ctx, body.guests);
  if (!eventDone(ctx, weekId, 'phase1')) joinCaller(ctx, weekId);

  const ran: WeekendStep[] = [];
  let replaced = 0;
  let swapAskedBy: string | null = null;
  /** The guests' work between stage 1 and stage 2: idempotent, so it may be asked for again. */
  const between = (): void => {
    if (!eventDone(ctx, weekId, 'phase1') || eventDone(ctx, weekId, 'phase2')) return;
    replaced += replaceKnockedOut(ctx, weekId);
    swapAskedBy ??= requestSwap(ctx, weekId);
  };
  for (const step of wanted) {
    if (step === 'stage2') between();
    if (!stepDone(ctx, weekId, step)) {
      if (step === 'finale-end') settleFinale(ctx);
      else moveTo(ctx, times[EVENT_OF[step]]);
      if (stepDone(ctx, weekId, step)) ran.push(step);
    }
    if (step === 'stage1') between();
  }

  const done = Object.fromEntries(
    WEEKEND_STEPS.map((s) => [s, stepDone(ctx, weekId, s)]),
  ) as Record<WeekendStep, boolean>;
  const track = readTrack(ctx.sql);
  const ended = ctx.sql
    .exec<{ ladder_won: number | null; rank_after: number | null }>(
      'SELECT ladder_won, rank_after FROM raid_weeks WHERE week_id = ?',
      weekId,
    )
    .toArray()[0];
  return {
    weekId,
    ran,
    done,
    guestsReplaced: replaced,
    swapRequestedBy: swapAskedBy,
    stages: stageResults(ctx, weekId),
    track:
      track === null
        ? null
        : {
            slot: track.slot,
            bestShareBp: track.bestShareBp,
            failedWeekends: track.failedWeekends,
          },
    ...(done['finale-end']
      ? { kill: ended?.ladder_won === 1, slotAfter: ended?.rank_after ?? null }
      : {}),
  };
}
