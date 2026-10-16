import { describe, expect, it } from 'vitest';
import { content, createSeededRng } from '@creatures/game';
import { makeSlot, type FightSlot } from '@creatures/engine';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import { arrangeRow, protection, reactionsPerRound } from '../src/formations';
import { openRaidWeek, playWholeWeek, summarizeRaid } from '../src/raid';
import {
  RANK_CHECK_RANKS,
  SETUPS,
  SETUP_RANK_OFFSETS,
  runRankCheck,
  runSetupStudy,
} from '../src/setup-study';
import { buildReportJson, buildReportMarkdown } from '../src/report';
import { clonePlayer } from '../src/state';
import { tinyRun } from './helpers';

function slot(speciesId: string, id: string): FightSlot {
  const species = content.creatures.find((c) => c.id === speciesId);
  if (species === undefined) throw new Error(`no species ${speciesId}`);
  return makeSlot(species, { id, ownerId: 'p', level: 5, fusionCount: 0 });
}

// Tide marks and Spark cashes it in (Overload); Cindle is an Ember payoff, Sproutle a Grove Guard.
const setter = (id: string): FightSlot => slot('splashet', id);
const payoff = (id: string): FightSlot => slot('stormray', id);
const guard = (id: string): FightSlot => slot('sproutle', id);

describe('formation scores', () => {
  it('counts the reactions of a round by the engine rules', () => {
    expect(reactionsPerRound([payoff('a')], 'left_to_right')).toBe(0);
    expect(reactionsPerRound([setter('a'), payoff('b')], 'left_to_right')).toBe(1);
    expect(
      reactionsPerRound([setter('a'), payoff('b'), setter('c'), payoff('d')], 'left_to_right'),
    ).toBe(2);
    // Two Spark payoffs in a row: the first marks, the second cannot cash a Spark mark.
    expect(reactionsPerRound([payoff('a'), payoff('b')], 'left_to_right')).toBe(0);
  });

  it('counts payoffs beside a Guard inside their own zone only', () => {
    // A row of 5 has zones of 1, 3 and 1: the three middle creatures share a zone.
    const row = [setter('s1'), payoff('p1'), guard('g'), payoff('p2'), setter('s2')];
    expect(protection(row).guardedPayoffs).toBe(2);
    // A row of 6 has zones of 2: [P G | P x | x x], only the first payoff shares a zone with the Guard.
    const six = [payoff('a'), guard('g'), payoff('b'), setter('c'), setter('d'), setter('e')];
    expect(protection(six).guardedPayoffs).toBe(1);
  });
});

describe('arranged rows', () => {
  const mixed = [
    payoff('a'),
    payoff('b'),
    payoff('c'),
    setter('d'),
    setter('e'),
    setter('f'),
    guard('g'),
    guard('h'),
    setter('i'),
  ];

  it('keeps the same creatures and is deterministic', () => {
    for (const setup of ['greedy', 'protected'] as const) {
      const a = arrangeRow(mixed, setup, 'left_to_right');
      const b = arrangeRow(mixed, setup, 'left_to_right');
      expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
      expect(a.map((s) => s.id).sort()).toEqual(mixed.map((s) => s.id).sort());
    }
  });

  it('greedy finds a row with the most reactions it can', () => {
    const arranged = arrangeRow(mixed, 'greedy', 'left_to_right');
    expect(reactionsPerRound(arranged, 'left_to_right')).toBeGreaterThanOrEqual(
      reactionsPerRound(mixed, 'left_to_right'),
    );
    // Three Tide setters and three Spark payoffs can make three pairs.
    expect(reactionsPerRound(arranged, 'left_to_right')).toBe(3);
    // The two Guards stand at the edges, out of the way.
    const guards = arranged.map((s, i) => [s, i] as const).filter(([s]) => s.role === 'guard');
    for (const [, i] of guards) expect(Math.min(i, arranged.length - 1 - i)).toBeLessThanOrEqual(1);
  });

  it('protected puts every payoff beside a Guard when the zones allow it', () => {
    // Three zones of 3: two Guards can stand beside up to four payoffs, so all three are guarded.
    const arranged = arrangeRow(mixed, 'protected', 'left_to_right');
    expect(protection(arranged).guardedPayoffs).toBe(3);
    expect(protection(arranged).guardedPayoffs).toBeGreaterThanOrEqual(
      protection(mixed).guardedPayoffs,
    );
  });

  it('plays inside a raid week as an option of openRaidWeek', () => {
    const economy = runEconomy({ seed: 'setups', weeks: 5, mix: DEFAULT_MIX, snapshotWeeks: [4] });
    const roster = (economy.snapshots[0]?.players ?? []).map(clonePlayer).slice(0, 8);
    const boss = content.bosses[0];
    if (boss === undefined) throw new Error('no boss');
    const base = openRaidWeek(boss, roster.map(clonePlayer));
    for (const formation of ['greedy', 'protected'] as const) {
      const w = openRaidWeek(boss, roster.map(clonePlayer), { formation });
      expect(w.row.map((s) => s.id).sort()).toEqual(base.row.map((s) => s.id).sort());
      playWholeWeek(w, createSeededRng('f'), createSeededRng('l'));
      const stage = w.stages.finale;
      expect(stage?.knockedOutIds).toHaveLength(stage?.knockedOut ?? -1);
      expect(summarizeRaid(w).finale.creatures).toBe(w.row.length);
    }
  });
});

describe('the setup study and the high-rank check', () => {
  const settings = { seed: 'setup-study', runs: 3, counts: [5, 10] };
  const economy = (count: number) =>
    runEconomy({
      seed: `setup-study:econ:${String(count)}`,
      weeks: 8,
      mix: DEFAULT_MIX,
      snapshotWeeks: [4, 8],
    }).snapshots;
  const snapshots = new Map([
    [5, economy(5)],
    [10, economy(10)],
  ]);

  it('plays every setup at every rank offset, paired with the default row', () => {
    const study = runSetupStudy({ ...settings, snapshots });
    expect(study.setups).toHaveLength(SETUPS.length * SETUP_RANK_OFFSETS.length);
    for (const offset of SETUP_RANK_OFFSETS) {
      const rows = study.setups.filter((r) => r.rankOffset === offset);
      expect(rows.map((r) => r.id)).toEqual(SETUPS.map((s) => s.id));
      const runs = rows[0]?.runs ?? 0;
      expect(runs).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.runs).toBe(runs);
        expect(r.winRate).toBeGreaterThanOrEqual(0);
        expect(r.winRate).toBeLessThanOrEqual(1);
        expect(r.koShare).toBeGreaterThanOrEqual(0);
        expect(r.koShare).toBeLessThanOrEqual(1);
      }
      expect(rows.find((r) => r.id === 'auto')?.deltaPoints).toBe(0);
      // The protected row aims at it, the default row does not.
      const guarded = (id: string): number =>
        rows.find((r) => r.id === id)?.guardedPayoffShare ?? 0;
      expect(guarded('protected')).toBeGreaterThanOrEqual(guarded('greedy'));
    }
    // A harder boss is not easier to beat: the default row's win rate falls with the rank.
    const auto = study.setups.filter((r) => r.id === 'auto').map((r) => r.winRate ?? 0);
    expect(auto[0]).toBeGreaterThanOrEqual(auto[auto.length - 1] ?? 0);
  });

  it('is deterministic', () => {
    const a = runSetupStudy({ ...settings, snapshots });
    const b = runSetupStudy({ ...settings, snapshots });
    expect(a).toEqual(b);
  });

  it('plays the high-rank check at the listed ranks on every roster week', () => {
    const check = runRankCheck({ ...settings, snapshots });
    const weeks = [...new Set(check.rows.map((r) => r.rosterWeek))].sort();
    expect(weeks).toEqual([4, 8]);
    for (const week of weeks) {
      const rows = check.rows.filter((r) => r.rosterWeek === week);
      expect(rows.map((r) => r.rank)).toEqual([...RANK_CHECK_RANKS]);
      // Rank 1 is the easiest boss, rank 11 the hardest.
      expect(rows[0]?.winRate ?? 0).toBeGreaterThanOrEqual(rows[rows.length - 1]?.winRate ?? 1);
    }
  });

  it('lands in the report, as markdown sections and JSON keys', () => {
    const out = tinyRun();
    const md = buildReportMarkdown(out);
    expect(md).toContain('## Setups (greedy and protected rows)');
    expect(md).toContain('## High Boss Ranks');
    const json = JSON.parse(buildReportJson(out)) as { setups: unknown[]; ranks: unknown[] };
    expect(json.setups.length).toBe(SETUPS.length * SETUP_RANK_OFFSETS.length);
    expect(json.ranks.length).toBeGreaterThan(0);
  });
});

describe('economy options for studies', () => {
  it('signUpPercent 100 sends every joined player and onRaidOpen sees each raid week', () => {
    const opened: { week: number; signed: number; joined: number }[] = [];
    const result = runEconomy({
      seed: 'signups',
      weeks: 3,
      mix: { casual: 4, daily: 1, top: 1, newcomer: 0 },
      snapshotWeeks: [],
      behaviour: { signUpPercent: 100 },
      onRaidOpen: (info) => {
        opened.push({ week: info.week, signed: info.signed.length, joined: 6 });
      },
    });
    expect(opened.map((o) => o.week)).toEqual([1, 2, 3]);
    for (const o of opened) expect(o.signed).toBe(o.joined);
    expect(result.raids.map((r) => r.summary.signedUp)).toEqual([6, 6, 6]);
  });
});
