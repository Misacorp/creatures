/** Trials as honours (phase 5 step 9c, trials.md V-TRIAL-1 to 5): the list, the ticks, the ceremony and the paper's line. */
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  EVENT_BOXES,
  NO_HOURS,
  PaperLogSchema,
  PaperSchema,
  TRIALS,
  TRIAL_BOX_IDS,
  VALLEY_RULES,
  ValleyTrialViewSchema,
  composePaper,
  crossedAt,
  emptyLog,
  emptyTrial,
  graduate,
  hoursTicks,
  mergeLogs,
  tick,
  tierOfBox,
  trialLevel,
  trialView,
  waitsForCeremony,
  boxMetByHours,
  type TrialHours,
  type TrialState,
} from '../src';

const DAY = 86_400_000;
/** A ceremony every day at 17:00 UTC for these tests. */
const nextCeremony = (after: number): number => {
  const at = Math.floor(after / DAY) * DAY + 17 * 3_600_000;
  return at > after ? at : at + DAY;
};

describe('the list (V-TRIAL-2)', () => {
  it('has Bronze from 10, Silver from 20, Gold from 30, each with one combat feat', () => {
    expect(TRIALS.map((t) => [t.name, trialLevel(t.tier)])).toEqual([
      ['Bronze', 10],
      ['Silver', 20],
      ['Gold', 30],
    ]);
    for (const trial of TRIALS) {
      expect(trial.boxes.filter((b) => b.kind === 'combat')).toHaveLength(1);
      expect(trial.boxes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every box to exactly one trial and covers the ids', () => {
    const ids = TRIALS.flatMap((t) => t.boxes.map((b) => b.id));
    expect([...ids].sort()).toEqual([...TRIAL_BOX_IDS].sort());
    for (const trial of TRIALS)
      for (const b of trial.boxes) expect(tierOfBox(b.id)).toBe(trial.tier);
  });
});

describe('ticks', () => {
  it('count only at or above the trial level and before the trial is held', () => {
    const s = emptyTrial();
    expect(tick(s, 9, ['dungeon'], () => 5)).toBe(s);
    expect(tick(s, 10, ['dungeon'], () => 5).boxes[0]).toBe(1);
    // Silver's box does not count at level 19 even though Bronze's does.
    expect(tick(s, 19, ['undercroft'], () => 5)).toBe(s);
    expect(tick(s, 20, ['undercroft'], () => 5).boxes[1]).toBe(1);
    // A creature already through Bronze takes no more Bronze boxes.
    const through: TrialState = { ...s, honour: 1 };
    expect(tick(through, 30, ['dungeon'], () => 5)).toBe(through);
  });

  it('a trial is ready when its last box ticks, stamped at the latest tick', () => {
    let s = emptyTrial();
    s = tick(s, 12, ['dungeon', 'fire'], (b) => (b === 'dungeon' ? 10 : 30));
    expect(s.ready[0]).toBeNull();
    s = tick(s, 12, ['home'], () => 20);
    expect(s.ready[0]).toBeNull();
    s = tick(s, 12, ['post'], () => 25);
    expect(s.ready[0]).toBe(25);
    expect(waitsForCeremony(s)).toBe(true);
  });

  it('a tick twice changes nothing', () => {
    const once = tick(emptyTrial(), 12, ['dungeon'], () => 5);
    expect(tick(once, 12, ['dungeon'], () => 9)).toBe(once);
  });
});

describe('boxes read off the hours', () => {
  const h = (o: Partial<TrialHours>): TrialHours => ({ ...NO_HOURS, ...o });
  it('a day at any post, a day of smithing, Expert and Master, a week at a seat', () => {
    expect(boxMetByHours('post', h({ scout: 10, smith: 10, trade: 4 }))).toBe(true);
    expect(boxMetByHours('post', h({ scout: 10 }))).toBe(false);
    expect(boxMetByHours('home', h({ smith: 24 }))).toBe(true);
    expect(boxMetByHours('home', h({ scout: 100 }))).toBe(false);
    expect(boxMetByHours('craft', h({ scout: 168 }))).toBe(true);
    expect(boxMetByHours('craft', h({ scout: 100 }))).toBe(false);
    expect(boxMetByHours('master', h({ trade: 504 }))).toBe(true);
    expect(boxMetByHours('master', h({ trade: 300 }))).toBe(false);
    expect(boxMetByHours('teacher', h({ seat: VALLEY_RULES.honours.teacherHours }))).toBe(true);
  });

  it('single-piece routes count over days of the creature own smithing, not pieces (V-TRIAL-5)', () => {
    const o = VALLEY_RULES.honours;
    expect(boxMetByHours('craft', h({ smith: o.rareRouteSmithHours }))).toBe(true);
    expect(boxMetByHours('craft', h({ smith: o.rareRouteSmithHours - 1 }))).toBe(false);
    expect(boxMetByHours('master', h({ smith: o.epicRouteSmithHours }))).toBe(true);
    // Time at other work does not make a smith: scouting for as long gives no route.
    expect(boxMetByHours('craft', h({ scout: o.rareRouteSmithHours }))).toBe(false);
  });

  it('no event box is ticked by hours alone', () => {
    for (const box of ['dungeon', 'fire', 'undercroft', 'further', 'raid'] as const) {
      expect(boxMetByHours(box, h({ scout: 1e6, smith: 1e6, trade: 1e6, seat: 1e6 }))).toBe(false);
      expect(EVENT_BOXES).toContain(box);
    }
  });

  it('hours tick where the level counts, stamped when they crossed', () => {
    const before = h({ smith: 20 });
    const after = h({ smith: 30 });
    const ticks = hoursTicks(emptyTrial(), 10, before, after, 0, 1000);
    expect(ticks.map((t) => t.box).sort()).toEqual(['home', 'post']);
    // `post` needs 24 of the 20 to 30: 40% of the way.
    expect(Math.abs((ticks.find((t) => t.box === 'post')?.at ?? 0) - 400)).toBeLessThanOrEqual(1);
    // Below level 10 nothing ticks (and it does later, when the level is there, at that pass's end).
    expect(hoursTicks(emptyTrial(), 9, before, after, 0, 1000)).toEqual([]);
    expect(hoursTicks(emptyTrial(), 10, after, after, 0, 1000).map((t) => t.at)).toEqual([
      1000, 1000,
    ]);
    expect(Math.abs(crossedAt('post', before, after, 0, 1000) - 400)).toBeLessThanOrEqual(1);
  });
});

describe('the ceremony (V-TRIAL-4)', () => {
  const ready = (r: [number | null, number | null, number | null]): TrialState => ({
    ...emptyTrial(),
    ready: r,
  });

  it('graduates at the first ceremony after the last tick, not before', () => {
    const noon = 5 * DAY + 12 * 3_600_000;
    const s = ready([noon, null, null]);
    expect(graduate(s, 5 * DAY + 16 * 3_600_000, nextCeremony).graduated).toEqual([]);
    const done = graduate(s, 5 * DAY + 17 * 3_600_000, nextCeremony);
    expect(done.graduated).toEqual([{ honour: 1, at: 5 * DAY + 17 * 3_600_000 }]);
    expect(done.state.honour).toBe(1);
    expect(done.state.honourAt).toBe(5 * DAY + 17 * 3_600_000);
  });

  it('a tick after the evening waits for the next day', () => {
    const late = 5 * DAY + 18 * 3_600_000;
    const done = graduate(ready([late, null, null]), 5 * DAY + 23 * 3_600_000, nextCeremony);
    expect(done.graduated).toEqual([]);
    expect(
      graduate(ready([late, null, null]), 6 * DAY + 17 * 3_600_000, nextCeremony).state.honour,
    ).toBe(1);
  });

  it('gives one honour a ceremony, even when the next trial was ticked long ago', () => {
    const s = ready([1 * DAY, 1 * DAY, 1 * DAY]);
    const end = graduate(s, 10 * DAY, nextCeremony);
    expect(end.graduated.map((g) => g.honour)).toEqual([1, 2, 3]);
    expect(end.graduated.map((g) => g.at)).toEqual([
      1 * DAY + 17 * 3_600_000,
      2 * DAY + 17 * 3_600_000,
      3 * DAY + 17 * 3_600_000,
    ]);
    // The same one day at a time.
    const two = graduate(s, 2 * DAY + 17 * 3_600_000, nextCeremony);
    expect(two.state.honour).toBe(2);
  });

  it('looking at any moments in between gives the same answer as looking once (a to c is a to b to c)', () => {
    const s = ready([1 * DAY + 3_600_000, 2 * DAY, null]);
    for (const [b, c] of [
      [1 * DAY + 18 * 3_600_000, 4 * DAY],
      [2 * DAY + 20 * 3_600_000, 9 * DAY],
      [3 * DAY, 3 * DAY + 1],
      [0, 100 * DAY],
    ] as const) {
      const viaB = graduate(graduate(s, b, nextCeremony).state, c, nextCeremony).state;
      expect(viaB).toEqual(graduate(s, c, nextCeremony).state);
    }
  });

  it('a creature with no completed trial never graduates, and Gold is the last', () => {
    expect(graduate(emptyTrial(), 100 * DAY, nextCeremony).state.honour).toBe(0);
    const gold = {
      ...emptyTrial(),
      honour: 3 as const,
      ready: [1, 1, 1] as [number, number, number],
    };
    expect(graduate(gold, 100 * DAY, nextCeremony).state).toBe(gold);
  });
});

describe('what players read (V-TRIAL-3)', () => {
  it('shows only the next trial and its ticked boxes', () => {
    const s = tick(emptyTrial(), 12, ['dungeon', 'fire'], () => 1);
    const view = trialView(s);
    expect(v.parse(ValleyTrialViewSchema, view)).toEqual({
      honour: 0,
      tier: 1,
      boxes: [true, false, false, true],
      ready: false,
    });
    expect(trialView({ ...emptyTrial(), honour: 3 })).toEqual({
      honour: 3,
      tier: null,
      boxes: [],
      ready: false,
    });
    expect(trialView({ ...s, honour: 1 }).tier).toBe(2);
  });
});

describe("the paper's line (V-TRIAL-4)", () => {
  const log = (n: number, honour: 1 | 2 | 3 = 1, prefix = 'c') => ({
    ...emptyLog(),
    graduates: Array.from({ length: Math.min(n, 6) }, (_, i) => ({
      creatureId: `${prefix}${String(i)}`,
      honour,
    })),
    graduateCount: n,
  });

  it('tells several graduates in one headline, with the best honour', () => {
    const merged = mergeLogs(log(2, 1), log(1, 2, 'd'));
    expect(merged.graduateCount).toBe(3);
    const paper = composePaper(merged);
    const line = paper.headlines.find((h) => h.kind === 'graduation');
    expect(line).toMatchObject({ count: 3, step: 2 });
    expect(line?.creatureIds).toHaveLength(3);
  });

  it('is capped, and an older stored log without the fields still parses', () => {
    expect(v.parse(PaperLogSchema, log(40)).graduates).toHaveLength(6);
    const older: Partial<ReturnType<typeof emptyLog>> = emptyLog();
    delete older.graduates;
    delete older.graduateCount;
    expect(v.parse(PaperLogSchema, older)).toMatchObject({ graduates: [], graduateCount: 0 });
    expect(
      v.safeParse(PaperSchema, {
        id: '1',
        at: 1,
        awayHours: 4,
        headlines: composePaper(log(3)).headlines,
        more: 0,
        brought: { acorns: 0, scrap: 0, shards: 0 },
        decision: null,
      }).success,
    ).toBe(true);
  });
});
