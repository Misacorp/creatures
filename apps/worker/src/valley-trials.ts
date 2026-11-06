/**
 * Trials and graduation on the server (phase 5 step 9c, docs/design/valley/systems/trials.md V-TRIAL-1 to 5, school.md V-SCH-9), behind
 * `VALLEY_SYSTEMS`. The rules are pure and live in `@creatures/game` (`valley/trials.ts`); this keeps one row per creature in
 * `creature_trials` (migration 66) and applies them.
 *
 * - **Ticks as they happen.** A box that is an event is ticked where the event already happens (a dungeon clear and an Undercroft keeper, a
 *   raid kill, a find brought home, a small moment at the fire, a way found deeper, a keystone), by `tickEvent` outside the lazy pass or by
 *   the pass's own `TrialLog`. A box that is read off the creature's hours (a day at a post, Expert, Master, a week at a communal seat,
 *   V-TRIAL-5's smithing days) is ticked by the pass from the hours it already holds. Only a creature at or above the trial's level and not
 *   yet through it counts. A tick is a primary-key write; a creature nothing changed for is not written.
 * - **Graduation** (V-TRIAL-4) is part of the lazy pass: from the stamps of the completed trials and the ceremony hour (`ceremonyHour`, the
 *   School's evening in the guild's timezone) it works out which ceremonies have passed, so a creature graduates whether or not its owner
 *   was there, and looking at any moments in between gives the same answer as looking once (`graduate` in `@creatures/game`).
 * - **The return walk** tells the creatures that graduated since the last paper (`told`), once, ranked by `gazette.ts`.
 *
 * Reads: none of its own in a pass (the creature rows arrive joined with their trial row, by primary key); `tickEvent` reads a creature's
 * level and its trial row. Writes: one upsert per creature whose boxes, honour or told mark changed.
 */
import {
  TRIALS,
  VALLEY_RULES,
  emptyTrial,
  graduate,
  hoursTicks,
  nextTier,
  tick,
  trialView,
  waitsForCeremony,
  type TrialBoxId,
  type TrialHours,
  type TrialState,
  type ValleyTrialView,
} from '@creatures/game';
import type { LedgerStorage } from './ledger';
import { nextOccurrence } from './time';

/** The trial columns of a creature row joined with `creature_trials` (all null when the creature has no trial row yet). */
export type TrialColumns = {
  t_boxes1: number | null;
  t_boxes2: number | null;
  t_boxes3: number | null;
  t_ready1: number | null;
  t_ready2: number | null;
  t_ready3: number | null;
  t_honour: number | null;
  t_honour_at: number | null;
  t_told: number | null;
  t_seat_hours: number | null;
};

/** The select list to add to a creature query that joins `creature_trials t`. */
export const TRIAL_SELECT =
  't.boxes1 AS t_boxes1, t.boxes2 AS t_boxes2, t.boxes3 AS t_boxes3, t.ready1 AS t_ready1, t.ready2 AS t_ready2, ' +
  't.ready3 AS t_ready3, t.honour AS t_honour, t.honour_at AS t_honour_at, t.told AS t_told, t.seat_hours AS t_seat_hours';

const honourOf = (n: number | null): 0 | 1 | 2 | 3 => (n === 1 || n === 2 || n === 3 ? n : 0);

/** A creature's trial state from the joined columns (a creature with no row has the empty one). */
export function trialOfColumns(c: TrialColumns): TrialState {
  if (c.t_honour === null) return emptyTrial();
  return {
    honour: honourOf(c.t_honour),
    honourAt: c.t_honour_at,
    boxes: [c.t_boxes1 ?? 0, c.t_boxes2 ?? 0, c.t_boxes3 ?? 0],
    ready: [c.t_ready1, c.t_ready2, c.t_ready3],
    told: honourOf(c.t_told),
    seatHours: c.t_seat_hours ?? 0,
  };
}

type TrialRow = {
  creature_id: string;
  boxes1: number;
  boxes2: number;
  boxes3: number;
  ready1: number | null;
  ready2: number | null;
  ready3: number | null;
  honour: number;
  honour_at: number | null;
  told: number;
  seat_hours: number;
};

const sameState = (a: TrialState, b: TrialState): boolean =>
  a.honour === b.honour &&
  a.honourAt === b.honourAt &&
  a.told === b.told &&
  a.seatHours === b.seatHours &&
  a.boxes.every((m, i) => m === b.boxes[i]) &&
  a.ready.every((r, i) => r === b.ready[i]);

/** What a pass collects about the events of its stretch (plain memory for one pass). */
export class TrialLog {
  readonly ticks = new Map<string, Set<TrialBoxId>>();
  /** Effective hours credited from a communal seat, by creature. */
  readonly seat = new Map<string, number>();

  tick(creatureId: string | null, box: TrialBoxId): void {
    if (creatureId === null) return;
    let set = this.ticks.get(creatureId);
    if (set === undefined) {
      set = new Set();
      this.ticks.set(creatureId, set);
    }
    set.add(box);
  }

  seatHours(creatureId: string | null, hours: number): void {
    if (creatureId === null || hours <= 0) return;
    this.seat.set(creatureId, (this.seat.get(creatureId) ?? 0) + hours);
  }
}

export interface TrialPassCreature {
  id: string;
  level: number;
  state: TrialState;
  before: Omit<TrialHours, 'seat'>;
  after: Omit<TrialHours, 'seat'>;
}

export interface ValleyTrialsDeps {
  readonly storage: LedgerStorage;
  readonly timezone: () => string;
}

export class ValleyTrials {
  constructor(private readonly deps: ValleyTrialsDeps) {}

  private get sql(): SqlStorage {
    return this.deps.storage.sql;
  }

  /** The first ceremony strictly after an instant: the School's evening, in the guild's timezone. */
  nextCeremony = (after: number): number =>
    nextOccurrence(after, VALLEY_RULES.honours.ceremonyHour, 0, this.deps.timezone());

  private save(userId: string, creatureId: string, s: TrialState): void {
    this.sql.exec(
      `INSERT INTO creature_trials (creature_id, user_id, boxes1, boxes2, boxes3, ready1, ready2, ready3, honour, honour_at, told, seat_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(creature_id) DO UPDATE SET boxes1 = excluded.boxes1, boxes2 = excluded.boxes2, boxes3 = excluded.boxes3,
         ready1 = excluded.ready1, ready2 = excluded.ready2, ready3 = excluded.ready3, honour = excluded.honour,
         honour_at = excluded.honour_at, told = excluded.told, seat_hours = excluded.seat_hours`,
      creatureId,
      userId,
      s.boxes[0],
      s.boxes[1],
      s.boxes[2],
      s.ready[0],
      s.ready[1],
      s.ready[2],
      s.honour,
      s.honourAt,
      s.told,
      s.seatHours,
    );
  }

  /**
   * The trials' part of a pass over `[from, to]`: ticks the events the pass logged and the boxes the hours now meet, runs the ceremonies that
   * have passed, and (when `tell`) marks the new honours told for the paper. Returns every creature's state after, the graduations since the
   * last paper to tell (`tell` only) and how many graduated in this pass.
   */
  pass(
    userId: string,
    creatures: readonly TrialPassCreature[],
    log: TrialLog,
    from: number,
    to: number,
    tell: boolean,
  ): { states: Map<string, TrialState>; graduates: { creatureId: string; honour: 1 | 2 | 3 }[] } {
    const states = new Map<string, TrialState>();
    const graduates: { creatureId: string; honour: 1 | 2 | 3 }[] = [];
    for (const c of creatures) {
      let s = c.state;
      const seatHours = s.seatHours + (log.seat.get(c.id) ?? 0);
      if (seatHours !== s.seatHours) s = { ...s, seatHours };
      const events = [...(log.ticks.get(c.id) ?? [])];
      if (events.length > 0) s = tick(s, c.level, events, () => to);
      const crossed = hoursTicks(
        s,
        c.level,
        { ...c.before, seat: c.state.seatHours },
        { ...c.after, seat: s.seatHours },
        from,
        to,
      );
      if (crossed.length > 0) {
        const at = new Map(crossed.map((x) => [x.box, x.at]));
        s = tick(
          s,
          c.level,
          crossed.map((x) => x.box),
          (box) => at.get(box) ?? to,
        );
      }
      if (waitsForCeremony(s)) s = graduate(s, to, this.nextCeremony).state;
      if (tell && s.honour > s.told) {
        graduates.push({ creatureId: c.id, honour: s.honour as 1 | 2 | 3 });
        s = { ...s, told: s.honour };
      }
      if (!sameState(s, c.state)) this.save(userId, c.id, s);
      states.set(c.id, s);
    }
    return { states, graduates };
  }

  /**
   * An event outside the pass ticks a box for creatures of the caller (a dungeon clear, a raid kill, a way found deeper). The level is read
   * from the creature, so only one at or above the trial's level counts. Creatures that are not the caller's are ignored.
   */
  tickEvent(userId: string, creatureIds: readonly string[], box: TrialBoxId, now: number): void {
    for (const id of new Set(creatureIds)) {
      const level = this.sql
        .exec<{ level: number }>(
          'SELECT level FROM creatures WHERE id = ? AND user_id = ?',
          id,
          userId,
        )
        .toArray()[0]?.level;
      if (level === undefined) continue;
      const before = this.row(id);
      const next = tick(before, level, [box], () => now);
      if (next !== before) this.save(userId, id, next);
    }
  }

  private row(creatureId: string): TrialState {
    const r = this.sql
      .exec<TrialRow>(
        `SELECT creature_id, boxes1, boxes2, boxes3, ready1, ready2, ready3, honour, honour_at, told, seat_hours
         FROM creature_trials WHERE creature_id = ?`,
        creatureId,
      )
      .toArray()[0];
    if (r === undefined) return emptyTrial();
    return trialOfColumns({
      t_boxes1: r.boxes1,
      t_boxes2: r.boxes2,
      t_boxes3: r.boxes3,
      t_ready1: r.ready1,
      t_ready2: r.ready2,
      t_ready3: r.ready3,
      t_honour: r.honour,
      t_honour_at: r.honour_at,
      t_told: r.told,
      t_seat_hours: r.seat_hours,
    });
  }

  /** The state of one creature (a primary-key read), for the tests and the staging tools. */
  stateOf(creatureId: string): TrialState {
    return this.row(creatureId);
  }

  /** The valley's view of one creature's honours (V-TRIAL-3). */
  static view(state: TrialState): ValleyTrialView {
    return trialView(state);
  }

  /**
   * Staging tool: ticks every box of a creature's next trial now, whatever its level, so the ceremony can be seen. A creature that already
   * holds Gold is left alone. Returns false when it has nothing left to tick.
   */
  forceTicks(userId: string, creatureId: string, now: number): boolean {
    const before = this.row(creatureId);
    const tier = nextTier(before);
    if (tier === null) return false;
    const boxes: [number, number, number] = [...before.boxes];
    boxes[tier - 1] = (1 << (TRIALS[tier - 1]?.boxes.length ?? 0)) - 1;
    const ready: [number | null, number | null, number | null] = [...before.ready];
    ready[tier - 1] = ready[tier - 1] ?? now;
    this.save(userId, creatureId, { ...before, boxes, ready });
    return true;
  }

  /**
   * Staging tool: runs the ceremony now for the caller's creatures whose next trial is complete: one honour each, stamped at `now`. Returns
   * how many graduated.
   */
  ceremonyNow(userId: string, creatureIds: readonly string[], now: number): number {
    let n = 0;
    for (const id of creatureIds) {
      const s = this.row(id);
      if (!waitsForCeremony(s)) continue;
      this.save(userId, id, { ...s, honour: (s.honour + 1) as 1 | 2 | 3, honourAt: now });
      n += 1;
    }
    return n;
  }
}
