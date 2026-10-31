/** The team share measure: its pure helpers, and the shape of what the report feeds them. */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { CARDS } from '../src/cards';
import { GAUNTLET, type Pick } from '../src/search';
import { LINE_POOLS, TALENTS } from '../src/talents';
import {
  TEAM_SHARE,
  bestFitShare,
  casualOk,
  chooseTalents,
  drawTalents,
  eachOwn,
  fitTalents,
  gauntletScorer,
  groupsByForm,
  inBand,
  lineOf,
  meanShare,
  poolTalents,
  pooledShare,
  randomShare,
  shareOf,
  teamBossHp,
  withTalents,
  type ShareSettings,
  type TeamScorer,
} from '../src/teamShare';
import {
  CASUAL_CARDS,
  CASUAL_ROSTERS,
  CASUAL_ROSTERS_LISTED,
  TEAM_SHARE_ROSTERS,
  casualRosters,
} from '../src/teams';

const team: Pick[] = [
  { formId: 'tidewing', knack: 'steady-mark' },
  { formId: 'tempestray', knack: 'detonate' },
  { formId: 'thornbuck', knack: 'wide-reach' },
];

describe('share arithmetic', () => {
  it('is 1 - without / with, in percent, and 0 for a team that scores nothing', () => {
    expect(shareOf(100, 80)).toBeCloseTo(20);
    expect(shareOf(50, 50)).toBe(0);
    expect(shareOf(60, 66)).toBeLessThan(0);
    expect(shareOf(0, 0)).toBe(0);
  });

  it('pools teams by their sums (a weak team with a big share does not outweigh a strong one) and averages cards plainly', () => {
    expect(
      pooledShare([
        { with: 20, without: 10 },
        { with: 80, without: 80 },
      ]),
    ).toBeCloseTo((1 - 90 / 100) * 100);
    expect(meanShare([10, 20, 30])).toBe(20);
    expect(meanShare([])).toBe(0);
  });

  it('reads the band to the whole percent, and keeps random rolls below the best fit', () => {
    expect(TEAM_SHARE.min).toBeLessThan(TEAM_SHARE.target);
    expect(TEAM_SHARE.target).toBeLessThan(TEAM_SHARE.max);
    expect(inBand(17)).toBe(true);
    expect(inBand(16.6)).toBe(true);
    expect(inBand(16.4)).toBe(false);
    expect(inBand(23.4)).toBe(true);
    expect(inBand(23.6)).toBe(false);
    // Random rolls gain something but stay well below the best fit (situational, not flat).
    expect(casualOk(7, 20)).toBe(true);
    expect(casualOk(12, 20)).toBe(true);
    expect(casualOk(13, 20)).toBe(false);
    expect(casualOk(0, 20)).toBe(false);
  });
});

describe('pools', () => {
  it('takes the talents of the form’s line pool, and those that fit its role when asked', () => {
    expect(lineOf('tempestray')).toBe('stormray');
    expect(poolTalents('tempestray')).toEqual(LINE_POOLS['stormray']);
    const fit = fitTalents('tempestray');
    expect(fit.length).toBeGreaterThan(0);
    expect(fit.length).toBeLessThanOrEqual(poolTalents('tempestray').length);
    for (const t of fit) expect(TALENTS[t]?.roles).toContain('payoff');
    // Quick Draw is a Payoff talent in Stormray's pool; Owner's Mark is not in it and would be idle.
    expect(fit).toContain('quick-draw');
    expect(fitTalents('tidewing')).not.toContain('quick-draw');
  });

  it('groups positions by form (a raid) or one each (the gauntlet)', () => {
    const row = [...team, team[0] as Pick, team[1] as Pick];
    expect(groupsByForm(row)).toEqual([[0, 3], [1, 4], [2]]);
    expect(eachOwn(team)).toEqual([[0], [1], [2]]);
  });

  it('puts a talent on every position of a group and leaves the rest, without touching the original team', () => {
    const row = [...team, team[0] as Pick];
    const out = withTalents(row, groupsByForm(row), ['hardy', undefined, 'brace']);
    expect(out.map((p) => p.talents)).toEqual([['hardy'], undefined, ['brace'], ['hardy']]);
    expect(row.every((p) => p.talents === undefined)).toBe(true);
    // A choice of none clears talents the pick already carried.
    const carried = withTalents([{ ...team[0], talents: ['hardy'] } as Pick], [[0]], [undefined]);
    expect(carried[0]?.talents).toBeUndefined();
  });
});

describe('choosing talents', () => {
  /** A score with no fights: each talent is worth a fixed number, summed over the groups. */
  const worth: Record<string, number> = { a: 3, b: 5, c: 1, d: -2 };
  const score = (choice: readonly (string | undefined)[]) =>
    choice.reduce((sum, t) => sum + (t === undefined ? 0 : (worth[t] ?? 0)), 0);

  it('takes the best candidate of each group, and none when every candidate scores below none', () => {
    expect(
      chooseTalents(
        [
          ['a', 'b'],
          ['c', 'a'],
        ],
        score,
      ),
    ).toEqual(['b', 'a']);
    expect(chooseTalents([['d'], ['c']], score)).toEqual([undefined, 'c']);
    expect(chooseTalents([[], ['b']], score)).toEqual([undefined, 'b']);
  });

  it('lets a second pass take a talent that only pays once a later group has its own', () => {
    // 'x' is worth 3 only alongside 'w'; 'w' is worth 2 alone.
    const pair = (choice: readonly (string | undefined)[]) =>
      (choice[1] === 'w' ? 2 : 0) + (choice[0] === 'x' && choice[1] === 'w' ? 3 : 0);
    expect(chooseTalents([['x'], ['w']], pair, 1)).toEqual([undefined, 'w']);
    expect(chooseTalents([['x'], ['w']], pair, 2)).toEqual(['x', 'w']);
  });

  it('draws one talent per group from its own candidates, the same every time for a seed', () => {
    const cands = [['a', 'b', 'c'], [], ['d']];
    const draw = (seed: string) => drawTalents(cands, createSeededRng(seed));
    expect(draw('s')).toEqual(draw('s'));
    const out = draw('s');
    expect(cands[0]).toContain(out[0]);
    expect(out[1]).toBeUndefined();
    expect(out[2]).toBe('d');
    const seen = new Set(Array.from({ length: 40 }, (_, i) => draw(`s${i}`)[0]));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('share of a team', () => {
  const settings: ShareSettings = { selectSeeds: 2, finalSeeds: 3, draws: 4, passes: 2 };
  /** Every talent adds its own points; Hardy adds none. Without talents the team scores 50. */
  const points: Record<string, number> = { 'quick-draw': 20, 'first-pounce': 10, 'odd-one-out': 6 };
  const fake: TeamScorer = (t) =>
    50 +
    t.reduce((sum, p) => sum + (p.talents ?? []).reduce((a, id) => a + (points[id] ?? 0), 0), 0);

  it('measures the best-fitting talent per creature against none on fresh seeds', () => {
    const groups = eachOwn(team);
    const r = bestFitShare(fake, team, 'plain', groups, settings);
    expect(r.without).toBe(50);
    expect(r.with).toBeGreaterThan(r.without);
    expect(r.share).toBeCloseTo(shareOf(r.with, r.without));
    expect(r.chosen).toHaveLength(3);
    // Tempestray is the Payoff of Stormray's pool, where Quick Draw is the best talent in this score.
    expect(r.chosen[1]?.talent).toBe('quick-draw');
    expect(r.chosen.map((c) => c.forms[0])).toEqual(['tidewing', 'tempestray', 'thornbuck']);
  });

  it('a random draw is never better than the best fit and is the same for the same salt', () => {
    const groups = eachOwn(team);
    const best = bestFitShare(fake, team, 'plain', groups, settings);
    const a = randomShare(fake, team, 'plain', groups, settings, 'x');
    const b = randomShare(fake, team, 'plain', groups, settings, 'x');
    expect(a).toEqual(b);
    expect(a.share).toBeLessThanOrEqual(best.share + 1e-9);
    expect(a.without).toBe(50);
    // Fitting talents only can only help when every talent is worth something or nothing.
    const fit = randomShare(fake, team, 'plain', groups, settings, 'x', true);
    expect(fit.without).toBe(50);
  });
});

describe('the team boss and its scorer', () => {
  it('tunes the boss to the team: the more HP the fewer wins, and a calibrated boss lands near the win rate', () => {
    const hp = teamBossHp('plain', team, 0.5, 20);
    expect(hp).toBeGreaterThan(1_000);
    expect(hp).toBeLessThan(1_000_000);
    expect(teamBossHp('plain', team, 0.5, 20)).toBe(hp);
    // A boss that is easier to win leaves less HP to remove.
    expect(teamBossHp('plain', team, 0.9, 20)).toBeLessThan(hp);
    expect(teamBossHp('plain', team, 0.2, 20)).toBeGreaterThan(hp);
  });

  it('scores a gauntlet team on 0 to 100 on its card’s boss, the same for the same seeds, more with a talent that helps', () => {
    const cards = CARDS.filter((c) => c.id === 'plain');
    const hp = new Map([['plain', teamBossHp('plain', team, 0.5, 20)]]);
    const score = gauntletScorer(hp, cards);
    const a = score(team, 'plain', 4, 's');
    expect(a).toBe(score(team, 'plain', 4, 's'));
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(100);
    expect(() => score(team, 'nope', 1, 's')).toThrow('unknown card');
    // Three Sharp Claws never score less than none on the same seeds.
    const claws = withTalents(team, eachOwn(team), ['sharp-claws', 'sharp-claws', 'sharp-claws']);
    expect(score(claws, 'plain', 4, 's')).toBeGreaterThanOrEqual(a);
    expect(GAUNTLET.cols).toBe(team.length);
  });
});

describe('casual rosters', () => {
  it('are the same every time, twelve forms each, with the three highest levels as the top three', () => {
    const a = casualRosters(false);
    const b = casualRosters(false);
    expect(a.map((r) => r.top3)).toEqual(b.map((r) => r.top3));
    // Enough rosters that the North Star average reads within about 0.15 of its mean (see `CASUAL_ROSTERS`).
    expect(a).toHaveLength(CASUAL_ROSTERS);
    expect(CASUAL_ROSTERS).toBeGreaterThanOrEqual(12);
    expect(CASUAL_ROSTERS_LISTED).toBeLessThanOrEqual(TEAM_SHARE_ROSTERS);
    expect(TEAM_SHARE_ROSTERS).toBeLessThanOrEqual(CASUAL_ROSTERS);
    // The rosters differ from each other.
    expect(new Set(a.map((r) => [...r.top3].sort().join('/'))).size).toBeGreaterThan(
      CASUAL_ROSTERS / 2,
    );
    expect(casualRosters(true)).toHaveLength(1);
    for (const r of a) {
      expect(new Set(r.pool.map((p) => p.formId)).size).toBe(12);
      expect(r.top3).toHaveLength(3);
      const levels = (f: string) => r.level(f);
      const rest = [...new Set(r.pool.map((p) => p.formId))].filter((f) => !r.top3.includes(f));
      for (const f of rest) expect(levels(f)).toBeLessThanOrEqual(Math.min(...r.top3.map(levels)));
      expect(r.top3Line.every((p) => p.knack === 'none')).toBe(true);
    }
    expect(CASUAL_CARDS.length).toBeGreaterThan(0);
  });
});
