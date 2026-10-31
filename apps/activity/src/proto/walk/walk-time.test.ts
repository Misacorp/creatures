import { describe, expect, it } from 'vitest';
import { DAILY, WEEKLY } from './journey';
import {
  MS,
  START_PLACE,
  TUMBLE_STEPS,
  dwellOf,
  frameAt,
  frozenAt,
  totalMs,
  walkerAt,
} from './walk-time';
import { planOf, type CastMember } from './walk-plan';

const CAST: CastMember[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((name) => ({
  name,
  species: 'splashet',
  shiny: false,
}));

describe('the length of a walk', () => {
  it('is about ten seconds for every visit, and never over twelve (a longer absence groups, it does not drag)', () => {
    for (const journey of [DAILY, WEEKLY]) {
      journey.visits.forEach((_, i) => {
        const total = totalMs(planOf(journey, i, CAST));
        expect(total).toBeGreaterThan(5000);
        expect(total).toBeLessThanOrEqual(12_000);
      });
    }
  });

  it('is longest for a Monday with a surprise and a welcome, which still fits', () => {
    const longest = Math.max(
      ...[DAILY, WEEKLY].flatMap((j) => j.visits.map((_, i) => totalMs(planOf(j, i, CAST)))),
    );
    expect(longest).toBeLessThanOrEqual(12_000);
  });
});

describe('the frames of a walk', () => {
  const plan = planOf(DAILY, 0, CAST); // day 1: a Monday with a new line and a decision
  const total = totalMs(plan);

  it('starts at the Paddock gate, with the welcome only when the plan has one', () => {
    const start = frameAt(plan, 0);
    expect(start).toMatchObject({ done: false, welcome: false, stop: -1, from: START_PLACE });
    expect(frameAt(planOf(WEEKLY, 0, CAST), 0).welcome).toBe(true);
    expect(frameAt(planOf(WEEKLY, 0, CAST), MS.introWelcome).welcome).toBe(false);
  });

  it('walks to each stop, stands there while its lines are told, then goes on', () => {
    let at = MS.intro;
    plan.stops.forEach((stop, i) => {
      const walking = frameAt(plan, at + MS.travel / 2);
      expect(walking).toMatchObject({ stop: i, line: null, camera: stop.place });
      expect(walking.progress).toBeCloseTo(0.5);
      at += MS.travel;
      stop.lines.forEach((line, n) => {
        expect(frameAt(plan, at + n * MS.line + 10).line).toBe(line);
      });
      expect(frameAt(plan, at + 1).progress).toBe(1);
      at += dwellOf(plan, i);
    });
  });

  it('keeps the decision’s bubble up once the walk stands at its place, and after', () => {
    const last = plan.stops.length - 1;
    const lastStart = plan.stops
      .slice(0, last)
      .reduce<number>((sum, _, i) => sum + MS.travel + dwellOf(plan, i), MS.intro);
    expect(frameAt(plan, lastStart + MS.travel + 10).decision).toBe(true);
    expect(frameAt(plan, total + 1000).decision).toBe(true);
    expect(frameAt(plan, 100).decision).toBe(false);
    expect(frameAt(planOf(DAILY, 1, CAST), total + 1000).decision).toBe(false);
  });

  it('tumbles the badges in steps once the stops are done, then it is over', () => {
    const tumbleAt = total - MS.tumble;
    expect(frameAt(plan, tumbleAt + 1).tumble).toBe(0);
    expect(frameAt(plan, total - 1).tumble).toBe(TUMBLE_STEPS - 1);
    const seen = new Set<number>();
    for (let t = tumbleAt; t < total; t += 50) seen.add(frameAt(plan, t).tumble);
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(frameAt(plan, total)).toMatchObject({ done: true, tumble: -1 });
    expect(frameAt(plan, total + 99_999).done).toBe(true);
  });

  it('never tells a line during the walking or the tumble', () => {
    for (let t = 0; t < total; t += 25) {
      const f = frameAt(plan, t);
      if (f.progress < 1 || f.tumble >= 0) expect(f.line).toBeNull();
    }
  });
});

describe('the line that is held', () => {
  const plan = planOf(DAILY, 4, CAST); // a quiet Friday: three lines, three places
  const total = totalMs(plan);

  it('is none before the first line, then the line told last, through the walking and the tumble', () => {
    expect(frameAt(plan, 0).held).toBeNull();
    let seen = null;
    for (let t = 0; t < total; t += 25) {
      const f = frameAt(plan, t);
      if (f.line !== null) seen = f.line;
      expect(f.held).toBe(seen);
    }
    expect(seen).not.toBeNull();
    expect(frameAt(plan, total + 5000).held).toBe(seen);
  });
});

describe('the walker', () => {
  it('goes from one place’s door to the next, a whole pixel at a time', () => {
    const a = walkerAt('paddock', 'signpost', 0);
    const b = walkerAt('paddock', 'signpost', 1);
    const mid = walkerAt('paddock', 'signpost', 0.5);
    expect(mid.x).toBeGreaterThan(a.x);
    expect(mid.x).toBeLessThan(b.x);
    expect(Number.isInteger(mid.x) && Number.isInteger(mid.y)).toBe(true);
    expect(walkerAt('forge', 'forge', 0.3)).toEqual(walkerAt('forge', 'forge', 1));
  });

  it('faces the way it goes', () => {
    expect(walkerAt('paddock', 'signpost', 0.5).flip).toBe(false);
    expect(walkerAt('signpost', 'paddock', 0.5).flip).toBe(true);
  });

  it('stays between its two doors however far the progress is pushed', () => {
    expect(walkerAt('paddock', 'forge', 7)).toEqual(walkerAt('paddock', 'forge', 1));
    expect(walkerAt('paddock', 'forge', -3)).toEqual(walkerAt('paddock', 'forge', 0));
  });
});

describe('the held frame of a screenshot', () => {
  it('reads t from the address', () => {
    expect(frozenAt('#walk?step=1&bare=1&t=3500')).toBe(3500);
    expect(frozenAt('#walk?t=0')).toBe(0);
    expect(frozenAt('#walk?step=1')).toBeNull();
    expect(frozenAt('#walk?t=abc')).toBeNull();
    expect(frozenAt('#walk?t=1234567')).toBeNull();
  });
});
