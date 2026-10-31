/** The path simulator: the walk with fake fights, the Festival weeks, the summary, the servers and determinism across job counts. */
import { describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';
import { inProcessExecutor } from '../src/jobRunners';
import { runJobs, type Executor } from '../src/jobs';
import {
  BUILDERS,
  DETERMINATION,
  determinationOf,
  DEDICATED,
  FESTIVAL_EASE,
  FESTIVAL_EVERY,
  MIXED,
  STUCK_WEEKS,
  type PathServer,
  pathOf,
  planPath,
  serverWeekend,
  spreadOf,
  summarisePath,
  walkPath,
  weekendKill,
} from '../src/path';
import { rosterLevels } from '../src/roster';
import { VALLEY_ROSTER } from '../src/valley';
import { MIXED_ORDER } from '../src/raidMeasure';
import { preparedOf } from '../src/tuner';
import {
  SLOT_MIXED_ANSWER,
  TRACK_ORDER,
  slotAnswersOf,
  slotBoss,
  slotMixedOf,
  slotPreparedOf,
} from '../src/track';

describe('walkPath with a fake fight', () => {
  it('always winning: one slot a week, a Festival week only skips the raid', () => {
    const fights: number[][] = [];
    const path = walkPath((slot, week) => {
      fights.push([slot, week]);
      return true;
    });
    expect(path.fought.slice(0, 9)).toEqual([1, 2, 3, 4, 0, 5, 6, 7, 8]);
    // The arrival week is the first week a slot is fought: slot 5 is won in week 4, so it is first fought in week 6 (week 5 is the Festival).
    expect(path.reached.slice(0, 6)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(path.attempts.every((a) => a === 1)).toBe(true);
    expect(path.longestRun).toBe(1);
    // Four Festival weeks in 24: twenty fights.
    expect(fights).toHaveLength(20);
  });

  it('always losing: slot 1 for ever, every weekend counted, stuck', () => {
    const path = walkPath(() => false);
    expect(path.reached).toEqual([1]);
    expect(path.weekends).toEqual([20]);
    expect(path.attempts).toEqual([20]);
    expect(path.longestRun).toBe(20);
    expect(path.fought.filter((s) => s === 0)).toHaveLength(4);
    expect(summarisePath('x', 'expected', [path]).stuckShare).toBe(1);
  });

  it('winning every second weekend: two tries a boss, Festival detours not counted', () => {
    let n = 0;
    const path = walkPath(() => ++n % 2 === 0);
    expect(path.fought.slice(0, 9)).toEqual([1, 1, 2, 2, 0, 3, 3, 4, 4]);
    expect(path.reached.slice(0, 4)).toEqual([1, 3, 6, 8]);
    expect(path.attempts.slice(0, 3)).toEqual([2, 2, 2]);
    // The Festival moves nobody back: slot 2 was fought twice, and beaten at the second try.
    expect(path.weekends[1]).toBe(2);
    expect(path.longestRun).toBe(2);
    expect(summarisePath('x', 'expected', [path]).stuckShare).toBe(0);
  });

  it('keeps the Festival rule (Misa, 2026-10-30): the track waits, then goes on where it was', () => {
    const calls: number[] = [];
    walkPath((slot, week) => {
      calls.push(week);
      return slot < 3;
    });
    for (let w = FESTIVAL_EVERY; w <= 24; w += FESTIVAL_EVERY) expect(calls).not.toContain(w);
    // Lost at slot 3 from week 3: weeks 3 and 4, then the Festival, then the same boss returns.
    const path = walkPath((slot) => slot < 3);
    expect(path.fought.slice(0, 8)).toEqual([1, 2, 3, 3, 0, 3, 3, 3]);
    // A server that had won goes on to the next boss.
    const won = walkPath((slot, week) => slot < 3 || week === 4);
    expect(won.fought.slice(0, 8)).toEqual([1, 2, 3, 3, 0, 4, 4, 4]);
    const stuck = walkPath(() => false);
    expect(stuck.fought.slice(4, 7)).toEqual([0, 1, 1]);
  });

  it('can still ease by one (the shipped rule), turn the Festival off or ease by more', () => {
    expect(FESTIVAL_EASE).toBe(0);
    const one = walkPath(() => true, { festivalEase: 1 });
    expect(one.fought.slice(0, 7)).toEqual([1, 2, 3, 4, 0, 4, 5]);
    const slotOne = walkPath(() => false, { festivalEase: 1 });
    expect(slotOne.fought.slice(4, 7)).toEqual([0, 1, 1]);
    const none = walkPath(() => true, { festivalEvery: 0 });
    expect(none.fought.every((s) => s > 0)).toBe(true);
    expect(none.reached).toHaveLength(24);
    const two = walkPath(() => true, { festivalEase: 2 });
    expect(two.fought.slice(0, 7)).toEqual([1, 2, 3, 4, 0, 3, 4]);
  });

  it('counts a boss beaten in the last week as beaten but not reached', () => {
    const late = walkPath((_, week) => week === 3, { weeks: 3 });
    expect(late.reached).toEqual([1]);
    expect(late.attempts).toEqual([3]);
    const win = walkPath(() => true, { weeks: 2 });
    expect(win.reached).toEqual([1, 2]);
  });
});

describe('the arrival week is the week of the first fight (design panel 6)', () => {
  it('counts the Festival clock from the server’s first week: a server that wins slot 4 in week 4 fights slot 5 first in week 6', () => {
    expect(FESTIVAL_EVERY).toBe(5);
    const path = walkPath(() => true);
    expect(path.fought.slice(0, 7)).toEqual([1, 2, 3, 4, 0, 5, 6]);
    expect(path.reached[4]).toBe(6);
    // Every slot's arrival is a week it was fought, never a Festival week.
    for (const [i, week] of path.reached.entries()) {
      expect(week % FESTIVAL_EVERY, `slot ${i + 1}`).not.toBe(0);
      expect(path.fought[week - 1]).toBe(i + 1);
    }
  });

  it('keeps a lost boss’s slot, and reaches the next one only when it is fought', () => {
    // Slot 4 is lost in week 4 and again in week 6, won in week 7: slot 5 is first fought in week 8.
    const path = walkPath((slot, week) => slot < 4 || week === 7);
    expect(path.fought.slice(0, 8)).toEqual([1, 2, 3, 4, 0, 4, 4, 5]);
    expect(path.reached.slice(0, 5)).toEqual([1, 2, 3, 4, 8]);
  });
});

describe('the builder server', () => {
  it('is four daily players with random legal talents, played only when asked', () => {
    expect(BUILDERS.players).toHaveLength(4);
    expect(BUILDERS.players.every((p) => p.roster === 'daily' && p.talents === 'random')).toBe(
      true,
    );
    const ids = (kinds?: readonly PathServer['id'][]) =>
      planPath({ quick: true, servers: 1, ...(kinds ? { kinds } : {}) }).jobs.map((j) => j.id);
    expect(ids().some((id) => id.includes('builders'))).toBe(false);
    expect(ids(['builders'])).toEqual(['path:builders:expected:0']);
  });

  it('fields the slot’s line with random legal talents, the same for the same server and slot, never the written ones by chance alone', () => {
    const a = serverWeekend(BUILDERS, 5, 9, 'expected', 'builders:0');
    const b = serverWeekend(BUILDERS, 5, 9, 'expected', 'builders:0');
    const c = serverWeekend(BUILDERS, 5, 9, 'expected', 'builders:1');
    const d = serverWeekend(DEDICATED, 5, 9, 'expected', 'dedicated:0');
    expect(a.placements).toEqual(b.placements);
    // The forms and Knacks are the dedicated server's line; the talents are drawn.
    const shape = (w: typeof a) => w.placements.map((p) => `${p.formId}/${p.knack}/${p.level}`);
    expect(shape(a)).toEqual(shape(d));
    const talents = (w: typeof a) => w.placements.map((p) => (p.talents ?? []).join('+'));
    expect(talents(a)).not.toEqual(talents(d));
    expect(talents(a)).not.toEqual(talents(c));
  });
});

describe('Determination (on by default from the second lap, at most +25%)', () => {
  /** A fight that is won once the server has at least `need` stacks: the stacks the walk gave it are recorded. */
  const needing = (need: number) => {
    const seen: [number, number, number][] = [];
    const fight = (slot: number, week: number, stacks: number) => {
      seen.push([slot, week, stacks]);
      return stacks >= need;
    };
    return { seen, fight };
  };

  it('is a dial of the path, not of the bare walk: the walk gives no stacks unless asked, however often it loses', () => {
    const { seen, fight } = needing(99);
    walkPath(fight);
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.every(([, , stacks]) => stacks === 0)).toBe(true);
    // The default dial is Misa's (2026-10-30, panel 6): +5% a stack, at most 5 stacks (+25%), from slot 6, the second lap.
    expect(DETERMINATION).toEqual({ stackBp: 500, maxStacks: 5, fromSlot: 6 });
    expect(determinationOf({})).toBe(DETERMINATION);
    expect(determinationOf({ determination: 'off' })).toBeUndefined();
  });

  it('gives no stacks on slots 1 to 5 and counts them from slot 6', () => {
    // Loses every weekend at slot 1 until week 3, then wins everything up to slot 6, where it loses again.
    const seen: [number, number][] = [];
    const fight = (slot: number, _week: number, stacks: number) => {
      seen.push([slot, stacks]);
      return slot < 6 || stacks >= 3;
    };
    walkPath(fight, {
      determinationStacks: DETERMINATION.maxStacks,
      determinationFromSlot: DETERMINATION.fromSlot,
      festivalEvery: 0,
      weeks: 12,
    });
    expect(seen.filter(([slot]) => slot < 6).every(([, stacks]) => stacks === 0)).toBe(true);
    expect(seen.filter(([slot]) => slot === 6).map(([, stacks]) => stacks)).toEqual([0, 1, 2, 3]);
    // A slot-1 server stuck for ever never gets a stack.
    const stuck: number[] = [];
    walkPath((_slot, _week, stacks) => (stuck.push(stacks), false), {
      determinationStacks: 5,
      determinationFromSlot: 6,
    });
    expect(stuck.every((x) => x === 0)).toBe(true);
  });

  it('gives a stack for each failed weekend on the same boss, up to the cap', () => {
    const { seen, fight } = needing(99);
    walkPath(fight, { determinationStacks: 3, festivalEvery: 0, weeks: 8 });
    expect(seen.map(([, , stacks]) => stacks)).toEqual([0, 1, 2, 3, 3, 3, 3, 3]);
  });

  it('resets on a kill, and a Festival week neither adds nor takes a stack', () => {
    // Won with two stacks: slot 1 falls on its third try, then slot 2 starts again from none.
    const { seen, fight } = needing(2);
    const path = walkPath(fight, { determinationStacks: 10, weeks: 11 });
    expect(path.fought).toEqual([1, 1, 1, 2, 0, 2, 2, 3, 3, 0, 3]);
    const stacks = seen.map(([slot, week, s]) => `${slot}:${week}:${s}`);
    expect(stacks.slice(0, 3)).toEqual(['1:1:0', '1:2:1', '1:3:2']);
    // The kill reset it: slot 2 first fought with none, one failure later (week 4 failed, the Festival between) it has one.
    expect(stacks.slice(3, 6)).toEqual(['2:4:0', '2:6:1', '2:7:2']);
    expect(stacks.slice(6)).toEqual(['3:8:0', '3:9:1', '3:11:2']);
    expect(path.reached).toEqual([1, 4, 8]);
  });

  it('makes a stuck server get through: the same walk with the dial on reaches further', () => {
    const fight = (_slot: number, _week: number, stacks: number) => stacks >= 4;
    const off = walkPath(() => false);
    const on = walkPath(fight, { determinationStacks: 10 });
    expect(off.reached).toEqual([1]);
    expect(on.reached.length).toBeGreaterThan(2);
    expect(on.longestRun).toBe(5);
  });

  it('turns the stacks into damage and healing in the real weekend, and travels in the job arguments', () => {
    const run = { determination: DETERMINATION };
    const off = { determination: 'off' as const };
    const plan = planPath({ quick: true, servers: 1, kinds: ['dedicated'], ...run });
    expect(plan.jobs.every((j) => (j.args as { determination?: unknown }).determination)).toBe(
      true,
    );
    // A plan with no say in it plays the default dial (the job carries nothing and the path reads `DETERMINATION`); 'off' travels.
    expect(
      planPath({ quick: true, servers: 1, kinds: ['dedicated'] }).jobs.some(
        (j) => 'determination' in (j.args as object),
      ),
    ).toBe(false);
    expect(
      planPath({ quick: true, servers: 1, kinds: ['dedicated'], determination: 'off' }).jobs.every(
        (j) => (j.args as { determination?: unknown }).determination === 'off',
      ),
    ).toBe(true);
    // Stacks (+5% damage and healing each) beat a boss that the plain team loses to (slot 6 with 30_000 HP, week 12, Slippery on; the
    // plain team loses it, the five stacks of the cap, +25%, win it from 27_000 to 34_000 HP). On slot 5 the same stacks do nothing:
    // Determination starts at slot 6.
    const table = {
      6: { hp: 30_000, atk: 107, armour: 47 },
      5: { hp: 36_000, atk: 150, armour: 25 },
    };
    const kill = (slot: number, n: number, dial: object) =>
      weekendKill(DEDICATED, slot, 12, 'expected', 'det', undefined, { table, ...dial }, n);
    expect(kill(6, 0, off)).toBe(false);
    expect(kill(6, 0, run)).toBe(false);
    expect(kill(6, DETERMINATION.maxStacks, off)).toBe(false);
    expect(kill(6, DETERMINATION.maxStacks, run)).toBe(true);
    expect(kill(5, DETERMINATION.maxStacks, run)).toBe(kill(5, 0, off));
  }, 60_000);

  it('labels the report and a path with it on gets further than one without', async () => {
    const off = planPath({ quick: true, servers: 3, kinds: ['mixed'], determination: 'off' });
    const on = planPath({ quick: true, servers: 3, kinds: ['mixed'] });
    const run = async (p: typeof off) =>
      p.assemble((await runJobs(p.jobs, inProcessExecutor, 4)).results);
    const a = await run(off);
    const b = await run(on);
    expect(a.md.join('\n')).toContain('without Determination');
    expect(b.md.join('\n')).toContain(
      'with Determination (+5% a failed weekend from slot 6, at most 5 stacks)',
    );
    const reached = (r: typeof a) => r.data[0]?.slots.length ?? 0;
    expect(reached(b)).toBeGreaterThanOrEqual(reached(a));
  }, 120_000);
});

describe('--path and Determination', () => {
  it('plays with it by default, `--determination` adds the path without it as a comparison, `--no-determination` plays without it only', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const text = () => log.mock.calls.map((c) => String(c[0])).join('\n');
    const withDial = 'with Determination (+5% a failed weekend from slot 6, at most 5 stacks)';
    try {
      expect(await main(['--path', '--quick'], { exec: inProcessExecutor, slots: 4 })).toBe(0);
      expect(text()).toContain('### Boss track at the expected roster speed' + ' ' + withDial);
      expect(text()).not.toContain('without Determination');
      log.mockClear();
      expect(
        await main(['--path', '--quick', '--determination'], { exec: inProcessExecutor, slots: 4 }),
      ).toBe(0);
      const both = text();
      const on = both.indexOf(withDial);
      const off = both.indexOf('without Determination');
      expect(on).toBeGreaterThanOrEqual(0);
      expect(off).toBeGreaterThan(on);
      log.mockClear();
      expect(
        await main(['--path', '--quick', '--no-determination'], {
          exec: inProcessExecutor,
          slots: 4,
        }),
      ).toBe(0);
      expect(text()).toContain('without Determination');
      expect(text()).not.toContain(withDial);
    } finally {
      log.mockRestore();
    }
  }, 180_000);
});

describe('the summary', () => {
  it('takes the median and spread of the weeks, and the stuck share', () => {
    expect(spreadOf([5, 1, 3, 2, 4])).toEqual({ median: 3, p25: 2, p75: 4 });
    // Two servers breeze through, two lose to slot 2 until week 9.
    const free = walkPath(() => true);
    const late = walkPath((slot, week) => slot === 1 || week >= 9);
    expect(late.attempts[1]).toBeGreaterThan(STUCK_WEEKS);
    const s = summarisePath('dedicated', 'slow', [free, free, late, late]);
    expect(s.servers).toBe(4);
    expect(s.stuckShare).toBe(0.5);
    expect(s.slots[0]).toMatchObject({ slot: 1, bossId: TRACK_ORDER[0], reachedShare: 1 });
    expect(s.slots[1]?.week.median).toBeGreaterThanOrEqual(2);
    expect(s.longestRun.max).toBe(late.longestRun);
    // A slot only some servers reach shows its share.
    const deep = s.slots[s.slots.length - 1];
    expect(deep?.reachedShare).toBeLessThan(1);
    expect(s.slots.every((x) => x.weekends.median >= 0)).toBe(true);
  });
});

describe('the servers', () => {
  it('map the mixed server onto the roster kinds', () => {
    expect(DEDICATED.players).toHaveLength(4);
    expect(DEDICATED.players.every((p) => p.role === 'prepared' && p.roster === 'daily')).toBe(
      true,
    );
    expect(MIXED.players).toHaveLength(MIXED_ORDER.length);
    MIXED_ORDER.forEach((k, i) => {
      const p = MIXED.players[i];
      if (k === 'm') expect(p).toEqual({ role: 'prepared', roster: 'daily' });
      if (k === 'b') expect(p).toEqual({ role: 'builder', roster: 'daily' });
      if (k === 'c') expect(p).toEqual({ role: 'casual', roster: 'weekly' });
    });
    expect(MIXED.players.filter((p) => p.role === 'prepared')).toHaveLength(2);
    expect(MIXED.players.filter((p) => p.role === 'builder')).toHaveLength(3);
    expect(MIXED.players.filter((p) => p.role === 'casual')).toHaveLength(5);
  });

  it('put each player at the roster levels of the week', () => {
    for (const [server, players] of [
      [DEDICATED, 4],
      [MIXED, 10],
    ] as const) {
      const w = serverWeekend(server, 2, 8, 'expected', 'test');
      expect(w.boss.cols).toBe(players);
      expect(new Set(w.placements.map((p) => p.owner)).size).toBe(players);
      expect(w.bench).toHaveLength(players);
      server.players.forEach((p, c) => {
        const levels = rosterLevels(VALLEY_ROSTER, p.roster, 8, 'expected', 4);
        const mine = w.placements.filter((x) => x.col === c).sort((a, b) => a.row - b.row);
        expect(mine).toHaveLength(w.boss.rows);
        // At the roster's level (a form with a lower cap sits below it).
        mine.forEach((x, r) => expect(x.level).toBeLessThanOrEqual(levels[r] as number));
        expect(mine[0]?.level).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('are the same at every speed except for the levels', () => {
    const slow = serverWeekend(MIXED, 3, 6, 'slow', 'same');
    const fast = serverWeekend(MIXED, 3, 6, 'fast', 'same');
    expect(slow.placements.map((p) => p.formId)).toEqual(fast.placements.map((p) => p.formId));
    expect(slow.placements.some((p, i) => p.level !== fast.placements[i]?.level)).toBe(true);
  });

  it('fields the line as written when there is a player for every column', () => {
    const w = serverWeekend(DEDICATED, 3, 8, 'expected', 'columns');
    const { line } = preparedOf(w.boss.id);
    DEDICATED.players.forEach((_, c) => {
      const mine = w.placements.filter((x) => x.col === c).sort((a, b) => a.row - b.row);
      expect(mine.map((x) => x.formId)).toEqual(
        Array.from({ length: w.boss.rows }, (_, r) => line[r * w.boss.cols + c]?.formId),
      );
    });
  });

  it('has the mixed server’s min-maxers and builders field the written answer asked for, and the dedicated and builder servers keep the slot’s prepared line', () => {
    const slot = 6;
    const week = 8;
    const formsOf = (server: PathServer, players: readonly number[], mixedAnswer?: number) => {
      const w = serverWeekend(server, slot, week, 'expected', 'answer', VALLEY_ROSTER, {
        ...(mixedAnswer === undefined ? {} : { mixedAnswer }),
      });
      return players.map((c) =>
        w.placements
          .filter((x) => x.col === c)
          .sort((a, b) => a.row - b.row)
          .map((x) => `${x.formId}/${x.knack}`),
      );
    };
    // Players 0, 2, 4, 6 and 8 of the mixed server are min-maxers and builders (the casual ones are the odd columns).
    const prepared = [0, 2, 4, 6, 8];
    const first = formsOf(MIXED, prepared, 0);
    const second = formsOf(MIXED, prepared, 1);
    expect(second).not.toEqual(first);
    // Every column of either is a column of that written answer (a builder's has at most two copies of a form).
    for (const [mixedAnswer, columns] of [
      [0, first],
      [1, second],
    ] as const) {
      const { line } = slotMixedOf(slot, mixedAnswer);
      const cols = slotBoss(slot).cols;
      const whole = Array.from({ length: cols }, (_, c) =>
        Array.from(
          { length: line.length / cols },
          (_, r) => line[r * cols + c] as (typeof line)[0],
        ),
      );
      const wholeKnacks = whole.map((col) => col.map((p) => p.knack));
      for (const col of columns)
        expect(wholeKnacks.some((k) => k.join() === col.map((x) => x.split('/')[1]).join())).toBe(
          true,
        );
    }
    // The casual players do not read the boss: the answer changes none of their columns.
    expect(formsOf(MIXED, [1, 3, 5, 7, 9], 0)).toEqual(formsOf(MIXED, [1, 3, 5, 7, 9], 1));
    // The dedicated server and the builder server always field the slot's prepared line.
    expect(formsOf(DEDICATED, [0, 1, 2, 3], 1)).toEqual(formsOf(DEDICATED, [0, 1, 2, 3], 0));
    expect(formsOf(BUILDERS, [0, 1, 2, 3], 1)).toEqual(formsOf(BUILDERS, [0, 1, 2, 3], 0));
    const { line } = slotPreparedOf(slot);
    const cols = slotBoss(slot).cols;
    expect(formsOf(DEDICATED, [0], 1)[0]).toEqual(
      Array.from({ length: line.length / cols }, (_, r) => {
        const p = line[r * cols] as (typeof line)[0];
        return `${p.formId}/${p.knack}`;
      }),
    );
    expect(slotAnswersOf(slot).length).toBeGreaterThan(1);
  });

  it('fights the mixed answer’s line when no answer is asked for: the slot’s SLOT_MIXED_ANSWER entry', () => {
    const same = (a: ReturnType<typeof serverWeekend>, b: ReturnType<typeof serverWeekend>) =>
      expect(a.placements).toEqual(b.placements);
    for (const slot of [1, 3, 6]) {
      const entry = SLOT_MIXED_ANSWER[slot] ?? 0;
      same(
        serverWeekend(MIXED, slot, 9, 'expected', 'dflt'),
        serverWeekend(MIXED, slot, 9, 'expected', 'dflt', VALLEY_ROSTER, { mixedAnswer: entry }),
      );
    }
  });

  it('fight reproducibly: same server, same weekend, same result', () => {
    const a = pathOf(DEDICATED, 'expected', 3);
    expect(pathOf(DEDICATED, 'expected', 3)).toEqual(a);
    expect(weekendKill(MIXED, 1, 12, 'fast', 's1')).toBe(weekendKill(MIXED, 1, 12, 'fast', 's1'));
    expect(a.fought).toHaveLength(24);
    expect(a.reached[0]).toBe(1);
  });

  it('get further when the roster is faster', () => {
    const reach = (speed: 'slow' | 'fast') =>
      [0, 1].map((i) => pathOf(DEDICATED, speed, i).reached.length).reduce((a, b) => a + b, 0);
    expect(reach('fast')).toBeGreaterThanOrEqual(reach('slow'));
  });
});

describe('a table of slot numbers', () => {
  const table = { 2: { hp: 4_321, atk: 55, armour: 7 } };

  it('is the boss the path fights: serverWeekend takes it instead of SLOT_NUMBERS', () => {
    const w = serverWeekend(DEDICATED, 2, 6, 'expected', 'table', undefined, { table });
    expect(w.boss).toMatchObject({ hp: 4_321, atk: 55, armour: 7 });
    expect(serverWeekend(DEDICATED, 2, 6, 'expected', 'table').boss.hp).not.toBe(4_321);
  });

  it('travels in the job arguments, and a plan can ask for one kind of server', () => {
    const plan = planPath({ quick: true, servers: 2, kinds: ['dedicated'], table });
    expect(plan.jobs).toHaveLength(2);
    expect(plan.jobs.every((j) => (j.args as { server: string }).server === 'dedicated')).toBe(
      true,
    );
    expect(plan.jobs.every((j) => (j.args as { table?: unknown }).table === table)).toBe(true);
    const plain = planPath({ quick: true, servers: 1 });
    expect(plain.jobs).toHaveLength(2);
    expect(plain.jobs.some((j) => 'table' in (j.args as object))).toBe(false);
  });

  it('an easy slot 1 is beaten at once', () => {
    const easy = { 1: { hp: 1_000, atk: 1, armour: 1 } };
    const p = pathOf(DEDICATED, 'expected', 0, undefined, { table: easy });
    expect(p.attempts[0]).toBe(1);
    expect(p.reached[1]).toBe(2);
  });
});

describe('the plan', () => {
  it('gives the same report on one slot and on several, whatever order the jobs finish in', async () => {
    const plan = planPath({ quick: true, speeds: ['slow', 'fast'], servers: 2 });
    expect(plan.jobs).toHaveLength(2 * 2 * 2);
    // Later jobs finish first.
    const backwards: Executor = async (job, deps) => {
      const k = plan.jobs.findIndex((j) => j.id === job.id);
      for (let i = 0; i < (plan.jobs.length - k) * 5; i++) await Promise.resolve();
      return inProcessExecutor(job, deps);
    };
    const one = await runJobs(plan.jobs, inProcessExecutor, 1);
    const many = await runJobs(plan.jobs, backwards, 4);
    const a = plan.assemble(one.results);
    const b = plan.assemble(many.results);
    expect(b).toEqual(a);
    expect(a.data).toHaveLength(4);
    expect(a.md.join('\n')).toContain('at the slow roster speed');
    expect(a.md.join('\n')).toContain('at the fast roster speed');
    expect(a.md.join('\n')).toContain('target at most 10%');
  }, 60_000);
});
