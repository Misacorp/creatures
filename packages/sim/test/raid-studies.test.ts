import { describe, expect, it } from 'vitest';
import { content, createSeededRng, type BossDef } from '@creatures/game';
import type { FightEvent } from '@creatures/engine';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import {
  openRaidWeek,
  pickRoleTeam,
  playWholeWeek,
  spreadGuards,
  summarizeRaid,
  volleyRepeats,
} from '../src/raid';
import { pickTeam } from '../src/data';
import { ROLE_ARMS, runRoleStudy } from '../src/roles';
import { clonePlayer } from '../src/state';

const economy = runEconomy({ seed: 'raid', weeks: 5, mix: DEFAULT_MIX, snapshotWeeks: [4] });
const roster = (economy.snapshots[0]?.players ?? []).map(clonePlayer);
const boss: BossDef = (() => {
  const b = content.bosses[0];
  if (b === undefined) throw new Error('no boss');
  return b;
})();

describe('what a stage records for the targets', () => {
  it('counts knock-outs, creatures, enrage and phase retreats of every stage', () => {
    const w = openRaidWeek(boss, roster.slice(0, 8).map(clonePlayer));
    playWholeWeek(w, createSeededRng('stages'), createSeededRng('loot'));
    const s = summarizeRaid(w);
    for (const stage of ['phase1', 'phase2', 'finale'] as const) {
      const st = w.stages[stage];
      expect(st?.creatures).toBe(w.row.length);
      expect(st?.knockedOut).toBeGreaterThanOrEqual(0);
      expect(st?.knockedOut).toBeLessThanOrEqual(w.row.length);
      // A phase has no enrage, and the finale has no floor to retreat at.
      if (stage === 'finale') expect(st?.retreated).toBe(false);
      else expect(st?.enraged).toBe(false);
    }
    expect(s.finale.creatures).toBe(w.row.length);
    expect(s.finale.startShare).toBeGreaterThan(0);
    expect(s.finale.startShare).toBeLessThanOrEqual(1);
    // The finale starts where the phases left the pool.
    expect(s.finale.startShare).toBeCloseTo((w.stages.finale?.hpStart ?? 0) / w.pool.max, 10);
    expect(s.finale.rounds).toBe(w.stages.finale?.rounds);
  });

  it('counts a barrage volley that hits a creature the previous volley of the same gimmick hit', () => {
    const volley = (gimmick: string, targets: string[]): FightEvent => ({
      t: 'gimmick',
      round: 2,
      gimmick,
      op: 'barrage',
      targets,
    });
    const charge = (gimmick: string, marks: string[]): FightEvent => ({
      t: 'charge',
      round: 3,
      landing: 4,
      gimmick,
      op: 'barrage',
      marks,
    });
    const down = (creature: string): FightEvent => ({ t: 'knockout', round: 2, creature });
    expect(volleyRepeats([], 10)).toEqual({ volleys: 0, repeats: 0, forced: 0 });
    // Distinct victims every time: no repeat. Another gimmick's volley is not "the previous volley".
    expect(
      volleyRepeats(
        [volley('a', ['x', 'y']), volley('b', ['x']), volley('a', ['z']), charge('a', ['x'])],
        10,
      ),
    ).toEqual({ volleys: 4, repeats: 0, forced: 0 });
    // The same victim twice running breaks the rule when enough others stood; a charged volley is
    // read at its announcement.
    expect(
      volleyRepeats([volley('a', ['x', 'y']), charge('a', ['y', 'q']), volley('a', ['q'])], 10),
    ).toEqual({ volleys: 3, repeats: 2, forced: 0 });
    // Too few others stood: three creatures left, the previous volley hit two of them, the next
    // volley hits two, so one repeat could not be avoided. Knock-outs are read from the log.
    expect(
      volleyRepeats([volley('a', ['x', 'y']), down('p'), down('q'), volley('a', ['y', 'z'])], 5),
    ).toEqual({ volleys: 2, repeats: 0, forced: 1 });
    // The same picture with one more creature standing: the repeat was avoidable.
    expect(volleyRepeats([volley('a', ['x', 'y']), down('p'), volley('a', ['y', 'z'])], 5)).toEqual(
      { volleys: 2, repeats: 1, forced: 0 },
    );
    // Other ops are not volleys.
    const sweep: FightEvent = { t: 'gimmick', round: 2, gimmick: 's', op: 'sweep', targets: ['x'] };
    expect(volleyRepeats([sweep, sweep], 10)).toEqual({ volleys: 0, repeats: 0, forced: 0 });
  });

  it('never breaks the no-repeat rule in the volleys of real fights', () => {
    let volleys = 0;
    let repeats = 0;
    for (const b of content.bosses) {
      const w = openRaidWeek(b, roster.slice(0, 8).map(clonePlayer));
      playWholeWeek(w, createSeededRng(`fair:${b.id}`), createSeededRng('loot'));
      const s = summarizeRaid(w);
      volleys += s.finale.volleys;
      repeats += s.finale.repeatVolleys;
    }
    expect(volleys).toBeGreaterThan(0);
    expect(repeats).toBe(0);
  });
});

describe('role study switches', () => {
  const guardsOf = (row: readonly { role: string }[]): number[] =>
    row.flatMap((s, i) => (s.role === 'guard' ? [i] : []));

  it('spreads the Guards evenly through a row and keeps everybody else in order', () => {
    type Slot = Parameters<typeof spreadGuards>[0][number];
    const slot = (id: string, role: string): Slot => ({ id, role }) as unknown as Slot;
    const row = [
      slot('g1', 'guard'),
      slot('g2', 'guard'),
      slot('a', 'payoff'),
      slot('b', 'payoff'),
      slot('c', 'setter'),
      slot('d', 'payoff'),
      slot('e', 'support'),
      slot('f', 'payoff'),
    ];
    const spread = spreadGuards(row);
    expect(spread).toHaveLength(row.length);
    expect(guardsOf(spread)).toEqual([2, 6]);
    expect(spread.filter((s) => s.role !== 'guard').map((s) => s.id)).toEqual(
      row.filter((s) => s.role !== 'guard').map((s) => s.id),
    );
    // No Guards, or only Guards: unchanged.
    expect(spreadGuards(row.slice(2)).map((s) => s.id)).toEqual(row.slice(2).map((s) => s.id));
    expect(spreadGuards(row.slice(0, 2)).map((s) => s.id)).toEqual(['g1', 'g2']);
  });

  it('opens a week with spread Guards, and with a Guard and a Support brought when owned', () => {
    const players = roster.slice(0, 8);
    const clumped = openRaidWeek(boss, players.map(clonePlayer));
    const spread = openRaidWeek(boss, players.map(clonePlayer), { formation: 'spread' });
    expect(spread.row.map((s) => s.id).sort()).toEqual(clumped.row.map((s) => s.id).sort());
    expect(guardsOf(spread.row)).toHaveLength(guardsOf(clumped.row).length);
    if (guardsOf(clumped.row).length > 1) {
      expect(guardsOf(spread.row)).not.toEqual(guardsOf(clumped.row));
    }
    const both = openRaidWeek(boss, players.map(clonePlayer), { bringRoles: true });
    for (const p of players) {
      expect(both.picks.filter((x) => x.playerId === p.id)).toHaveLength(3);
    }
    const count = (w: ReturnType<typeof openRaidWeek>, role: string): number =>
      w.row.filter((s) => s.role === role).length;
    expect(count(both, 'guard')).toBeGreaterThanOrEqual(count(clumped, 'guard'));
    expect(count(both, 'support')).toBeGreaterThanOrEqual(count(clumped, 'support'));
  });

  it('brings a Guard and a Support in place of the weakest creatures that are neither', () => {
    const owned = (line: string, level: number) => {
      const species = content.creatures.find((c) => c.line === line && c.stage === 1);
      if (species === undefined) throw new Error(`no line ${line}`);
      return { id: `p/${line}`, line, speciesId: species.id, level, fusionCount: 0 };
    };
    const stage1 = content.creatures.filter((c) => c.stage === 1);
    const guard = stage1.find((c) => c.role === 'guard');
    const support = stage1.find((c) => c.role === 'support');
    const payoffs = stage1.filter((c) => c.role === 'payoff').slice(0, 3);
    if (guard === undefined || support === undefined || payoffs.length < 3) {
      throw new Error('content has no Guard, Support or three payoffs');
    }
    const payoffsOwned = payoffs.map((c, i) => owned(c.line, 15 - i));
    const creatures = [...payoffsOwned, owned(guard.line, 2), owned(support.line, 2)];
    const team = pickRoleTeam(creatures);
    // The plain top three are three payoffs; the Guard and the Support replace the two weakest.
    expect(pickTeam(creatures).map((c) => c.line)).toEqual(
      pickTeam(payoffsOwned).map((c) => c.line),
    );
    expect(team).toHaveLength(3);
    expect(team.map((c) => c.line)).toContain(guard.line);
    expect(team.map((c) => c.line)).toContain(support.line);
    expect(team.map((c) => c.line)).toContain(pickTeam(payoffsOwned)[0]?.line);
    // With a Guard and a Support already in the team nothing changes.
    const same = pickRoleTeam([
      owned(guard.line, 15),
      owned(support.line, 14),
      owned(payoffs[0]?.line ?? '', 13),
    ]);
    expect(same.map((c) => c.line).sort()).toEqual(
      [guard.line, support.line, payoffs[0]?.line].sort(),
    );
  });
});

describe('the roles ablation', () => {
  const snapshots = new Map([
    [5, economy.snapshots],
    [10, economy.snapshots],
  ]);

  it('plays every arm on the same weeks, deterministically, and reports points against the reference', () => {
    const options = { seed: 'roles', runs: 3, counts: [5, 10], snapshots };
    const a = runRoleStudy(options);
    expect(a).toEqual(runRoleStudy(options));
    expect(a.arms.map((x) => x.id)).toEqual(ROLE_ARMS.map((x) => x.id));
    for (const arm of a.arms) {
      expect(arm.runs).toBe(a.arms[0]?.runs);
      if (arm.id.endsWith('-ref')) expect(arm.deltaPoints).toBe(0);
      expect(arm.koShare === null || (arm.koShare >= 0 && arm.koShare <= 1)).toBe(true);
    }
    const guard = a.arms.find((x) => x.id === 'normal-no-guard');
    expect(a.guardValue).toBe(guard?.deltaPoints === null ? null : -(guard?.deltaPoints ?? 0));
  });

  it('only plays typical groups, and nothing for a server size that cannot be typical', () => {
    const none = runRoleStudy({
      seed: 'roles',
      runs: 2,
      counts: [1, 15],
      snapshots: new Map([
        [1, economy.snapshots],
        [15, economy.snapshots],
      ]),
    });
    expect(none.arms.every((x) => x.runs === 0 && x.winRate === null)).toBe(true);
    expect(none.guardValue).toBeNull();
  });

  it('runs a chosen arm only', () => {
    const only = ROLE_ARMS.filter((x) => x.population === 'normal');
    const r = runRoleStudy({ seed: 'roles', runs: 2, counts: [10], snapshots, arms: only });
    expect(r.arms.map((x) => x.id)).toEqual(only.map((x) => x.id));
  });
});
