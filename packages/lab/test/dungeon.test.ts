/**
 * The dungeon foes and the dungeon runs on the shipped map.
 */
import { createSeededRng, dungeonContent, isLandmark } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  ALL_ROUND_BENCH,
  ALL_ROUND_TEAM,
  FOE_CURVE,
  DUNGEON_DEPTHS,
  FOE_IDS,
  FOE_SPECS,
  MECHANICS,
  FOE_QUESTIONS,
  FOE_QUESTION_GAP,
  FOE_QUESTION_WIN,
  questionResult,
  answerLine,
  answerProblems,
  fight,
  foeAt,
  foeFold,
  foeStats,
  gauntletStats,
  runMap,
  runStats,
  toPlacements,
  CLASSIC_LINE,
  GAUNTLET,
} from '../src';
import { cardIds } from './helpers/bossHelpers';

describe('the dungeon foes', () => {
  it('every content foe has a spec and the other way round', () => {
    expect([...FOE_IDS].sort()).toEqual(dungeonContent.foes.map((f) => f.id).sort());
    expect(FOE_SPECS).toHaveLength(15);
  });

  it.each(FOE_IDS)(
    '%s: name, kind, element and rounds from the content; a line of three; stats per depth',
    (id) => {
      const def = dungeonContent.foes.find((f) => f.id === id);
      const foe = foeAt(id, 1);
      expect(foe.name).toBe(def?.name);
      expect(foe.element).toBe(def?.element);
      expect(foe.rounds).toBe(def?.rounds);
      expect(foe.rows).toBe(1);
      expect(foe.cols).toBe(3);
      expect(foe.armour).toBeGreaterThan(0);
      expect(foe.plain.powerBp).toBeGreaterThan(0);
      for (const c of foe.cards) expect(cardIds.has(c)).toBe(true);
      // Stats grow with depth, and the content's HP and Attack set the order between foes.
      let prev = foeStats(id, 1);
      expect(prev.hp).toBeGreaterThan(0);
      expect(prev.atk).toBeGreaterThan(0);
      for (const d of [...DUNGEON_DEPTHS, 12]) {
        const s = foeStats(id, d);
        expect(foeAt(id, d).hp).toBe(s.hp);
        // A card may raise Attack (Wither does), never lower it.
        expect(foeAt(id, d).atk).toBeGreaterThanOrEqual(s.atk);
        expect(s.hp).toBeGreaterThanOrEqual(prev.hp);
        expect(s.atk).toBeGreaterThanOrEqual(prev.atk);
        prev = s;
      }
      expect(foeStats(id, 8).hp).toBeGreaterThan(foeStats(id, 1).hp);
    },
  );

  it('one stat grows with depth: a foe’s HP, not its Attack, and the curve is the one the all-round team can climb', () => {
    expect(FOE_CURVE.atkStepBp).toBe(0);
    expect(FOE_CURVE.atkCurveBp).toBe(0);
    for (const id of FOE_IDS) {
      expect(foeStats(id, 8).atk, id).toBe(foeStats(id, 1).atk);
      const growth = foeStats(id, 8).hp / foeStats(id, 1).hp;
      expect(growth, id).toBeGreaterThan(2);
      expect(growth, id).toBeLessThan(3);
    }
  });

  it('a floor boss gains its wind-up signature only at a landmark depth (or as a keeper); a foe has none', () => {
    expect(isLandmark(7)).toBe(true);
    expect(isLandmark(6)).toBe(false);
    for (const spec of FOE_SPECS) {
      const plain = foeAt(spec.id, 6).moves.length;
      const landmark = foeAt(spec.id, 7).moves;
      if (spec.signature) {
        expect(landmark.length).toBe(plain + 1);
        expect(landmark.at(-1)?.charged).toBe(true);
        // An Undercroft keeper has it at every depth.
        expect(foeAt(spec.id, 3, { signature: true }).moves.length).toBe(plain + 1);
      } else expect(landmark.length).toBe(plain);
    }
    const kinds = dungeonContent.foes.filter((f) => f.kind === 'boss').map((f) => f.id);
    for (const id of kinds) expect(FOE_SPECS.find((s) => s.id === id)?.signature).toBeDefined();
  });

  it('a deeper foe is harder: the classic line wins less often', () => {
    const rate = (id: string, depth: number) => {
      let w = 0;
      for (let i = 0; i < 20; i++)
        if (
          fight(foeAt(id, depth), toPlacements(CLASSIC_LINE, GAUNTLET), {
            rng: createSeededRng(`d:${id}:${i}`),
          }).won
        )
          w++;
      return w / 20;
    };
    expect(rate('moss-lurker', 8)).toBeLessThanOrEqual(rate('moss-lurker', 1));
    expect(rate('coil-baron', 8)).toBeLessThan(rate('coil-baron', 1));
  });

  it('three foes ask a question the classic line fails: no Guard, no silence ward, nothing for armour', () => {
    const needs = FOE_SPECS.flatMap((s) => (s.needs ? [s.needs] : [])).sort();
    expect(needs).toEqual(['guard', 'pierce', 'ward']);
  });

  it('every foe has one question, on a mechanic of the lab and a tool that is a Knack of the team', () => {
    expect(Object.keys(FOE_QUESTIONS).sort()).toEqual([...FOE_IDS].sort());
    const ids = new Set(MECHANICS.map((m) => m.id));
    for (const q of Object.values(FOE_QUESTIONS)) {
      expect(ids.has(q.mechanic), `${q.foe}: ${q.mechanic}`).toBe(true);
      const team = answerLine(q.team);
      expect(team, q.foe).toHaveLength(3);
      expect(answerProblems(team), q.foe).toEqual([]);
      expect(
        team.some((p) => q.tool.includes(p.knack)),
        `${q.foe} carries its tool`,
      ).toBe(true);
      expect(q.hpBp).toBeGreaterThan(0);
      expect(q.atkBp).toBeGreaterThan(0);
    }
    // The three questions about a Guard, a ward and armour are the foes' `needs`.
    expect(FOE_QUESTIONS['moss-lurker']?.mechanic).toBe('family:Reach');
    expect(FOE_QUESTIONS['drift-wisp']?.mechanic).toBe('family:Ward');
    expect(FOE_QUESTIONS['bramble-hound']?.mechanic).toBe('family:Pierce');
  });

  it.each(Object.values(FOE_QUESTIONS).map((q) => [q.foe, q] as const))(
    '%s calls for its mechanic: the team with the tool wins clearly more often than the team without it',
    (_foe, q) => {
      const r = questionResult(q, 200, 'fqa');
      expect(
        r.gap,
        `${q.foe}: ${String(r.withTool)} with, ${String(r.without)} without`,
      ).toBeGreaterThanOrEqual(FOE_QUESTION_GAP);
      expect(r.withTool, q.foe).toBeGreaterThanOrEqual(FOE_QUESTION_WIN);
    },
  );

  it('the classic line fails the foes that ask for a tool it does not bring (a silence ward, something for armour)', () => {
    for (const [foe, depth] of [
      ['drift-wisp', 4],
      ['bramble-hound', 4],
    ] as const) {
      const g = gauntletStats(foeAt(foe, depth), [...CLASSIC_LINE], 100, `classic:${foe}`);
      expect(g.winRate, foe).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('dungeon runs on the shipped map', () => {
  const rate = (
    team: readonly (typeof ALL_ROUND_TEAM)[number][],
    depth: number,
    policy: 'first' | 'smart',
    runs = 100,
    over: { bench?: readonly (typeof ALL_ROUND_TEAM)[number][]; levels?: number } = {},
  ) => runStats(team, depth, true, runs, 'map', { policy, ...over });

  it('the all-round team and its bench are legal rosters', () => {
    expect(answerProblems([...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH])).toEqual([]);
    expect(ALL_ROUND_TEAM).toHaveLength(3);
    expect(new Set([...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH].map((p) => p.formId)).size).toBe(5);
  });

  it('a run is deterministic for a seed, and a clear is beating the floor boss, never heading home', () => {
    const run = (seed: string, depth: number) =>
      runMap(ALL_ROUND_TEAM, depth, createSeededRng(seed), {
        policy: 'smart',
        bench: ALL_ROUND_BENCH,
      });
    expect(run('x', 3)).toEqual(run('x', 3));
    const hopeless = runMap([...CLASSIC_LINE], 60, createSeededRng('x'), { policy: 'smart' });
    expect(hopeless.cleared).toBe(false);
    expect(hopeless.fights).toBeLessThan(5);
    // A cleared run won at least the entrance floor's fight and the floor boss's.
    for (let i = 0; i < 20; i++) {
      const r = run(`c${i}`, 1);
      if (r.cleared) expect(r.fights).toBeGreaterThanOrEqual(2);
    }
  });

  it('the policy picks all three camp choices over many runs, and a swap only with a bench', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = runMap(ALL_ROUND_TEAM, 8, createSeededRng(`camp${i}`), {
        policy: 'smart',
        bench: ALL_ROUND_BENCH,
      });
      if (r.camp) seen.add(r.camp);
      const plain = runMap(ALL_ROUND_TEAM, 8, createSeededRng(`camp${i}`), { policy: 'smart' });
      expect(plain.camp).not.toBe('swap');
    }
    expect([...seen].sort()).toEqual(['keepsake', 'rest', 'swap']);
  });

  it('the camp helps: a run with its Rest clears more than one without', () => {
    const withCamp = runStats([...CLASSIC_LINE], 2, true, 150, 'camp');
    const without = runStats([...CLASSIC_LINE], 2, false, 150, 'camp');
    expect(withCamp.cleared).toBeGreaterThan(without.cleared);
    expect(withCamp.winRate).toBeGreaterThan(without.winRate);
  });

  it('a good all-round team with a plan clears over half of its runs at every depth from 1 to 8', () => {
    for (let depth = 1; depth <= 8; depth++)
      expect(
        rate(ALL_ROUND_TEAM, depth, 'smart', 100, { bench: ALL_ROUND_BENCH }).winRate,
        `depth ${depth}`,
      ).toBeGreaterThan(0.5);
  });

  it('the plan and the bench matter, and the classic line falls away within a few depths', () => {
    const planned = rate(ALL_ROUND_TEAM, 7, 'smart', 100, { bench: ALL_ROUND_BENCH }).winRate;
    const fixed = rate(ALL_ROUND_TEAM, 7, 'first', 100).winRate;
    const classic = rate([...CLASSIC_LINE], 7, 'first', 100).winRate;
    expect(planned).toBeGreaterThan(fixed + 0.1);
    expect(fixed).toBeGreaterThan(classic);
    expect(rate([...CLASSIC_LINE], 5, 'first', 100).winRate).toBeLessThan(0.1);
  });

  it('the Undercroft beyond depth 8 is harder: its levels clear less often, each less than the one before', () => {
    const r = rate(ALL_ROUND_TEAM, 8, 'smart', 150, { bench: ALL_ROUND_BENCH, levels: 2 });
    expect(r.undercroft[0] ?? 1).toBeLessThan(r.winRate);
    expect(r.undercroft[1] ?? 1).toBeLessThanOrEqual(r.undercroft[0] ?? 0);
    // Not out of reach: some runs clear the first level.
    expect(r.undercroft[0] ?? 0).toBeGreaterThan(0.03);
  });

  it('keepsakes and curses fold into a foe: a charm softens it, a curse hardens it', () => {
    const none = foeFold([], [], ALL_ROUND_TEAM);
    expect(none).toEqual({ hpBp: 10_000, atkBp: 10_000 });
    const charm = foeFold(['wayfarer-charm'], [], ALL_ROUND_TEAM);
    expect(charm.hpBp).toBeLessThan(10_000);
    expect(charm.atkBp).toBeLessThan(10_000);
    const curse = foeFold([], [{ stat: 'atk', bp: 2_000 }], ALL_ROUND_TEAM);
    expect(curse.atkBp).toBe(12_000);
    // An element's keepsake counts the share of the team of that element (one of three here).
    const ember = foeFold(['warm-ember'], [], ALL_ROUND_TEAM);
    expect(ember.hpBp).toBeGreaterThan(charm.hpBp);
    expect(ember.hpBp).toBeLessThan(10_000);
  });
});
