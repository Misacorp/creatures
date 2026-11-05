/** The phase 5 gate (`gate.ts`): the item logic on made-up inputs, the known-misses list, the plan, and the gates the numbers already pass on small samples. */
import { describe, expect, it } from 'vitest';
import { BOSS_ANSWERS, answerLine } from '../src/bossAnswers';
import { RAID_BOSS_IDS, raidBossOf } from '../src/bosses';
import { widthOf } from '../src/raidMeasure';
import {
  GATE_SEARCHES,
  KILL_SERVERS,
  KNOWN_MISSES,
  RAID_CELLS,
  casualBeyond,
  classicBehind,
  classicBehindAt,
  deadKnacks,
  diversityOf,
  gateItemIds,
  gateItems,
  gateJourneyOptions,
  gateMarkdown,
  listCheck,
  planGate,
  winningTeams,
  type GateInputs,
  type GateSearch,
} from '../src/gate';
import { HABITS } from '../src/habits';
import { validateJobs } from '../src/jobs';
import {
  JOURNEY_SERVERS,
  MIXED_KILL_SLOTS,
  journeyOf,
  planJourney,
  type JourneyCellData,
} from '../src/journey';
import { KNACKS } from '../src/knacks';
import { STUCK_SHARE_MAX, summarisePath } from '../src/path';
import type { Pick } from '../src/search';
import { MIXED_KILL_MIN } from '../src/targets';

const pick = (formId: string, knack = 'none'): Pick => ({ formId, knack });

/** One Knack of each of the first families, so that the teams below hold several Knack families. */
const familyKnacks: string[] = [];
{
  const families = new Set<string>();
  for (const [id, k] of Object.entries(KNACKS))
    if (!families.has(k.family)) {
      families.add(k.family);
      familyKnacks.push(id);
    }
}

/** Teams of forms of different lines and elements, each creature with a Knack of another family. */
const teams: readonly (readonly Pick[])[] = [
  ['tidewing', 'tempestray', 'thornbuck', 'pyrelynx'],
  ['bloomback', 'voltaro', 'sunfawn', 'wickat'],
  ['ancientshell', 'lanternfin', 'bogwarden', 'geyserpup'],
  ['drizzlewt', 'fogwyrm', 'coralynx', 'solmane'],
].map((forms, t) =>
  forms.map((f, i) => pick(f, familyKnacks[(t * 4 + i) % familyKnacks.length] as string)),
);

describe('diversity, dead Knacks and the classic line', () => {
  it('counts lines, element sets, families and the top line', () => {
    const d = diversityOf(teams);
    expect(d.teams).toBe(4);
    expect(d.lines).toBeGreaterThanOrEqual(4);
    expect(d.topLineShare).toBeGreaterThan(0);
    expect(d.topLineShare).toBeLessThanOrEqual(1);
    expect(diversityOf([])).toMatchObject({
      teams: 0,
      lines: 0,
      elementSets: 0,
      families: 0,
      topLineShare: 0,
    });
  });

  it('one team of one line is all of the top line', () => {
    const d = diversityOf([[pick('tidewing'), pick('tidewing'), pick('tidewing')]]);
    expect(d.lines).toBe(1);
    expect(d.topLineShare).toBe(1);
    expect(d.elementSets).toBe(1);
  });

  it('winning teams need a potential of at least 1, and are listed once', () => {
    const a = [pick('tidewing')];
    const b = [pick('voltaro')];
    const s: GateSearch = {
      lines: [
        { line: a, potential: 1.2 },
        { line: b, potential: 0.99 },
      ],
      classic: undefined,
    };
    expect(winningTeams([s, s])).toEqual([a]);
  });

  it('a Knack no team picks is dead, and every Knack picked is not', () => {
    const all = Object.keys(KNACKS);
    expect(deadKnacks([])).toEqual(all);
    expect(deadKnacks([all.map((k) => pick('tidewing', k))])).toEqual([]);
    expect(deadKnacks([[pick('tidewing', 'none')]])).toEqual(all);
    const [first, ...rest] = all;
    expect(deadKnacks([[pick('tidewing', first)]])).toEqual(rest);
  });

  it('the classic line is behind by more than ten percent, not by exactly ten', () => {
    expect(classicBehind(89, 100)).toBe(true);
    expect(classicBehind(90, 100)).toBe(false);
    const w = {
      width: 5,
      classicWin: 1,
      bestWin: 1,
      classicShare: 1,
      bestShare: 1,
      classicKnockouts: 0,
      bestKnockouts: 0,
    };
    expect(classicBehindAt(w)).toBe(false);
    expect(classicBehindAt({ ...w, classicShare: 0.85 })).toBe(true);
    expect(classicBehindAt({ ...w, classicWin: 0.8 })).toBe(true);
  });

  it('the casual metric counts creatures outside the top three, and skips a roster with no line', () => {
    const top3 = ['a', 'b', 'c'];
    expect(casualBeyond([{ top3, line: [pick('a'), pick('x'), pick('y')] }])).toBe(2);
    expect(casualBeyond([{ top3, line: undefined }])).toBe(0);
    expect(
      casualBeyond([
        { top3, line: [pick('a'), pick('b'), pick('c')] },
        { top3, line: [pick('x'), pick('y'), pick('z')] },
      ]),
    ).toBe(1.5);
  });
});

// ---------- the items on made-up inputs ----------

const cellData = (
  server: string,
  speed: string,
  stuckShare: number,
  weekends: number,
): JourneyCellData => ({
  rules: 'game',
  determination: 'on',
  habits: HABITS.id,
  server,
  speed: speed as JourneyCellData['speed'],
  servers: 8,
  stuckShare,
  longestRun: { median: 1, max: 2 },
  reachedShare: [1, 1, 1],
  weekendsMedian: [1, weekends, 1],
});

const search = (potential: number, classic?: number): GateSearch => ({
  lines: teams.map((line) => ({ line, potential })),
  classic,
});

/** Inputs that pass every gate (then one thing is changed to see the item miss). */
function passing(): GateInputs {
  const best = new Map<string, never>();
  for (const mode of ['gauntlet', 'raid'])
    for (let i = 0; i < 4; i++)
      best.set(`${mode}:c${i}`, {
        bestLine: teams[0] as Pick[],
        bestScore: 100,
        classicScore: 50,
        top: [Object.keys(KNACKS).map((k) => pick('tidewing', k))],
        classicSpeciesScore: undefined,
      } as never);
  return {
    journey: {
      cells: RAID_CELLS.map((c) => cellData(c.server, c.speed, 0, 2)),
      mixedKill: KILL_SERVERS.flatMap((server) =>
        MIXED_KILL_SLOTS.map((slot) => ({
          rules: 'game' as const,
          server,
          habits: HABITS.id,
          slot,
          week: 8,
          kill: 0.9,
        })),
      ),
    },
    best,
    casual: [{ top3: ['a', 'b', 'c'], line: [pick('x'), pick('y'), pick('z')] }],
    searches: new Map(RAID_BOSS_IDS.map((b) => [b, [search(1.2, 0.5), search(1.1)]])),
    widths: new Map(
      RAID_BOSS_IDS.map((b) => [
        b,
        {
          best: teams[0] as Pick[],
          widths: [5, 10, 15].map((width) => ({
            width,
            classicWin: 0,
            bestWin: 1,
            classicShare: 0.5,
            bestShare: 1,
            classicKnockouts: 5,
            bestKnockouts: 0,
          })),
        },
      ]),
    ),
    cpu: undefined,
  };
}

describe('gateItems', () => {
  const idsOf = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

  it('prints exactly the item ids the known-misses check knows', () => {
    const ids = gateItemIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsOf(gateItems(passing()))).toEqual(ids);
  });

  it('passes when every number is inside its target', () => {
    const missed = gateItems(passing()).filter((i) => !i.pass);
    expect(idsOf(missed)).toEqual([]);
  });

  it('misses the stuck share above the shared 10% and passes it at exactly 10%', () => {
    const withStuck = (share: number) => {
      const p = passing();
      return {
        ...p,
        journey: {
          ...p.journey,
          cells: p.journey.cells.map((c) =>
            c.server === 'dedicated' && c.speed === 'slow' ? { ...c, stuckShare: share } : c,
          ),
        },
      };
    };
    const at = (share: number) =>
      gateItems(withStuck(share)).find((i) => i.id === 'raid-stuck:dedicated:slow')?.pass;
    expect(at(STUCK_SHARE_MAX)).toBe(true);
    expect(at(STUCK_SHARE_MAX + 0.01)).toBe(false);
  });

  it('misses a slot that takes more than three weekends, and reads only slots most servers reach', () => {
    const p = passing();
    const slow = (weekends: number, reached: number) => ({
      ...p,
      journey: {
        ...p.journey,
        cells: p.journey.cells.map((c) =>
          c.server === 'mixed' && c.speed === 'fast'
            ? { ...c, weekendsMedian: [1, weekends, 1], reachedShare: [1, reached, 1] }
            : c,
        ),
      },
    });
    const get = (i: GateInputs) =>
      gateItems(i).find((x) => x.id === 'raid-weekends:mixed:fast')?.pass;
    expect(get(slow(3, 1))).toBe(true);
    expect(get(slow(4, 1))).toBe(false);
    expect(get(slow(9, 0.4))).toBe(true);
  });

  it('misses a one-weekend kill under the mixed server target, and a cell that was not measured', () => {
    const p = passing();
    const low = {
      ...p,
      journey: {
        ...p.journey,
        mixedKill: p.journey.mixedKill.map((k) =>
          k.server === 'mixed' && k.slot === 8 ? { ...k, kill: MIXED_KILL_MIN - 0.01 } : k,
        ),
        cells: p.journey.cells.filter((c) => c.server !== 'builders'),
      },
    };
    const items = gateItems(low);
    expect(items.find((i) => i.id === 'raid-kill-weekend:mixed:8')?.pass).toBe(false);
    expect(items.find((i) => i.id === 'raid-stuck:builders:slow')?.measured).toBe('not measured');
    expect(items.find((i) => i.id === 'raid-stuck:builders:slow')?.pass).toBe(false);
  });

  it('misses a boss with one line of winning teams, a dead Knack and a casual line inside the top three', () => {
    const p = passing();
    const one: GateSearch = {
      lines: [{ line: [pick('tidewing'), pick('tidewing'), pick('tidewing')], potential: 1.5 }],
      classic: 1,
    };
    const casual = [{ top3: ['x', 'y', 'z'], line: [pick('x'), pick('y'), pick('z')] }];
    const items = gateItems({
      ...p,
      casual,
      best: new Map(),
      searches: new Map(RAID_BOSS_IDS.map((b) => [b, [one]])),
    });
    for (const b of RAID_BOSS_IDS)
      expect(items.find((i) => i.id === `diversity:${b}`)?.pass).toBe(false);
    expect(items.find((i) => i.id === 'dead-knack')?.pass).toBe(false);
    expect(items.find((i) => i.id === 'casual')?.pass).toBe(false);
  });

  it('the classic line must lose on more than half of the cases, not half', () => {
    const p = passing();
    const classicAt = (behindCards: number) => {
      const best = new Map(p.best);
      [...best.keys()]
        .filter((k) => k.startsWith('gauntlet:'))
        .forEach((k, i) => {
          const r = best.get(k);
          if (r) best.set(k, { ...r, classicScore: i < behindCards ? 50 : 100 });
        });
      return gateItems({ ...p, best }).find((i) => i.id === 'classic-cards:gauntlet')?.pass;
    };
    expect(classicAt(2)).toBe(false);
    expect(classicAt(3)).toBe(true);
  });

  it('prints a table with a MISS row, and the list check names an unlisted miss', () => {
    const p = passing();
    const items = gateItems({ ...p, casual: [] });
    const md = gateMarkdown(items, p, true).join('\n');
    expect(md).toContain('| MISS |');
    expect(md).toContain('| pass |');
    expect(listCheck(items, []).unlisted.map((i) => i.id)).toContain('casual');
    const listed = [{ id: 'casual', measured: 'm', target: 't', why: 'w' }];
    expect(listCheck(items, listed).unlisted.map((i) => i.id)).not.toContain('casual');
    expect(listCheck(gateItems(p), listed).stale.map((k) => k.id)).toEqual(['casual']);
  });
});

describe('KNOWN_MISSES', () => {
  it('names only real gate items, once each, with the numbers and a reason', () => {
    const ids = new Set(gateItemIds());
    const seen = new Set<string>();
    for (const k of KNOWN_MISSES) {
      expect(ids.has(k.id), `${k.id} is not a gate item`).toBe(true);
      expect(seen.has(k.id), `${k.id} is listed twice`).toBe(false);
      seen.add(k.id);
      expect(k.measured.length).toBeGreaterThan(0);
      expect(k.target.length).toBeGreaterThan(0);
      expect(k.why.length).toBeGreaterThan(10);
    }
  });
});

describe('the gate plan', () => {
  it("has unique jobs that all resolve, with the gate's own jobs ahead of what they need", () => {
    for (const quick of [true, false]) {
      const alone = planGate({ quick });
      validateJobs(alone.jobs);
      const inReport = planGate({ quick, inReport: true });
      const aloneIds = new Set(alone.jobs.map((j) => j.id));
      for (const j of inReport.jobs) expect(aloneIds.has(j.id)).toBe(true);
      expect(inReport.jobs.length).toBeLessThan(alone.jobs.length);
      expect(inReport.jobs.filter((j) => j.id.startsWith('gate:search:'))).toHaveLength(
        RAID_BOSS_IDS.length * GATE_SEARCHES,
      );
    }
  });

  it("reads the report's own journey jobs: every game cell of the gate is a job of the full journey", () => {
    const full = new Set(planJourney({ quick: false }).jobs.map((j) => j.id));
    for (const j of planJourney(gateJourneyOptions(false)).jobs) expect(full.has(j.id)).toBe(true);
  });
});

describe('the gates the numbers pass today, on a small sample', () => {
  it('the dedicated server at the expected speed is not stuck', () => {
    // The dedicated server at the expected speed, the game's rules, the habits, Determination on: no server stuck.
    const server = JOURNEY_SERVERS.find((x) => x.id === 'dedicated');
    if (!server) throw new Error('no dedicated journey server');
    const paths = Array.from({ length: 6 }, (_, index) =>
      journeyOf(server, 'expected', index, undefined, {}, HABITS),
    );
    expect(summarisePath('dedicated', 'expected', paths).stuckShare).toBeLessThanOrEqual(
      STUCK_SHARE_MAX,
    );
  });

  it('the classic line is behind a boss\u2019s written answer at five players', () => {
    const boss = raidBossOf('thornmother');
    const answer = BOSS_ANSWERS['thornmother']?.[0];
    if (!answer) throw new Error('no written answer');
    expect(classicBehindAt(widthOf(boss, answerLine(answer.line), 5, 4, 'gate-test'))).toBe(true);
  });
});
