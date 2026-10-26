import { describe, expect, it } from 'vitest';
import { SUMMARY_CASES } from './workbench/raid-summary-data';
import {
  grouped,
  heroHeadline,
  heroLine,
  highlights,
  pickHighlights,
  scoreboard,
  summaryBoss,
  summaryTitle,
  yourPlace,
} from './raid-summary-view';

const [clear11, fail11, clear3, wiped3, phase2] = SUMMARY_CASES.map((c) => c.input);
if (!clear11 || !fail11 || !clear3 || !wiped3 || !phase2) throw new Error('missing samples');

describe('the scoreboard', () => {
  it('ranks players by damage, with shares that add up to about 100 and the caller marked', () => {
    const rows = scoreboard(clear11.stats);
    expect(rows).toHaveLength(11);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]?.damage ?? 0).toBeGreaterThanOrEqual(rows[i]?.damage ?? 0);
    }
    expect(rows.filter((r) => r.you).map((r) => [r.name, r.rank])).toEqual([['You', 4]]);
    const total = rows.reduce((sum, r) => sum + r.share, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(3);
  });

  it('finds the caller place, and the place changes with the night', () => {
    expect(yourPlace(clear11.stats)?.row.rank).toBe(4);
    expect(yourPlace(clear11.stats)?.of).toBe(11);
    expect(yourPlace(fail11.stats)?.row.rank).toBe(7);
    expect(yourPlace(wiped3.stats)?.row.rank).toBe(3);
    expect(yourPlace({ players: [] })).toBeNull();
  });

  it('breaks a tie by score, then by the order the server listed them', () => {
    const rows = scoreboard({
      players: [
        { displayName: 'A', you: false, damage: 10, score: 10, assist: 0 },
        { displayName: 'B', you: false, damage: 10, score: 30, assist: 0 },
        { displayName: 'C', you: false, damage: 10, score: 10, assist: 0 },
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(['B', 'A', 'C']);
  });

  it('has no shares of an empty raid', () => {
    expect(
      scoreboard({ players: [{ displayName: 'A', you: true, damage: 0, score: 0, assist: 0 }] })[0]
        ?.share,
    ).toBe(0);
  });
});

describe('number words', () => {
  it('groups thousands with commas', () => {
    expect([0, 999, 1000, 31000, 1234567].map(grouped)).toEqual([
      '0',
      '999',
      '1,000',
      '31,000',
      '1,234,567',
    ]);
  });

  it('titles the card by the stage', () => {
    expect(summaryTitle(clear11.stats)).toBe('Finale result');
    expect(summaryTitle(phase2.stats)).toBe('Phase 2 result');
  });
});

describe('highlights', () => {
  it('only exist when the stats hold what they say', () => {
    const ids = (input: typeof clear11) => highlights(input.stats).map((h) => h.id);
    // A cleared finale with a purge, hand-fired abilities and a final-round ability.
    expect(ids(clear11)).toEqual(
      expect.arrayContaining([
        'hardest-hitter',
        'star-creature',
        'backbone',
        'favourite-reaction',
        'quick-hands',
        'final-push',
        'counter-move',
      ]),
    );
    // Nobody fell is only said when no knockout is listed.
    expect(ids(clear11)).not.toContain('nobody-fell');
    expect(ids(phase2)).toContain('nobody-fell');
    // A failed stage has no final push; an unpurged counter-move is not "broken".
    expect(ids(fail11)).not.toContain('final-push');
    expect(ids(fail11)).not.toContain('counter-move');
  });

  it('name the right player and say "You" for the caller', () => {
    const list = highlights(clear11.stats);
    expect(list.find((h) => h.id === 'hardest-hitter')?.who).toBe('Dee');
    const backbone = list.find((h) => h.id === 'backbone');
    expect(backbone?.who).toBe('You');
    expect(backbone?.you).toBe(true);
    expect(list.find((h) => h.id === 'counter-move')?.who).toBe('You');
  });

  it('say the facts in numbers taken from the stats', () => {
    const hitter = highlights(clear11.stats).find((h) => h.id === 'hardest-hitter');
    const top = scoreboard(clear11.stats)[0];
    expect(hitter?.line).toBe(
      `${grouped(top?.damage ?? 0)} damage, ${String(top?.share)}% of the raid`,
    );
    expect(highlights(clear3.stats).find((h) => h.id === 'favourite-reaction')?.line).toBe(
      'Triggered 6 times',
    );
  });

  it('are picked in the order asked for, then the rest, up to the count', () => {
    const picked = pickHighlights(clear11.stats, 2, ['backbone', 'star-creature']);
    expect(picked.map((h) => h.id)).toEqual(['backbone', 'star-creature']);
    expect(pickHighlights(clear11.stats, 100)).toHaveLength(highlights(clear11.stats).length);
    expect(pickHighlights(clear11.stats, 0)).toEqual([]);
  });
});

describe('the hero lines', () => {
  it('say how each stage ended', () => {
    expect(heroHeadline(clear11)).toBe('Tidal Colossus falls!');
    expect(heroLine(clear11.stats)).toBe('Down after 9 / 12 rounds.');
    expect(heroHeadline(fail11)).toBe('Cinder Wyrm enrages.');
    expect(heroLine(fail11.stats)).toBe('Out of time, it enraged. 4,300 HP left.');
    expect(heroHeadline(wiped3)).toBe('Storm Sovereign holds.');
    expect(heroLine(wiped3.stats)).toBe(
      'Every creature was knocked out by round 7. 5,100 HP left.',
    );
    expect(heroHeadline(phase2)).toBe('Tidal Colossus retreats!');
    expect(heroLine(phase2.stats)).toBe('It retreated after 8 / 10 rounds.');
  });
});

describe('the hero line without a known boss', () => {
  it('says "The boss" instead of a name', () => {
    expect(heroHeadline({ boss: null, stats: clear11.stats })).toBe('The boss falls!');
    expect(heroHeadline({ boss: null, stats: fail11.stats })).toBe('The boss enrages.');
    expect(heroHeadline({ boss: null, stats: phase2.stats })).toBe('The boss retreats!');
    expect(heroHeadline({ boss: null, stats: wiped3.stats })).toBe('The boss holds.');
  });
});

describe('the summary boss', () => {
  const view = {
    weekId: '2026-W43',
    boss: {
      id: 'tidal-colossus',
      name: 'Tidal Colossus',
      element: 'water',
      turnOrder: 'left_to_right',
      gimmicks: [{ id: 'undertow', name: 'Undertow' }],
      finaleRounds: 12,
    },
    effectiveRank: 4,
  };

  it('is the raid view boss, with its turn order and moves, when the view is of that week', () => {
    expect(summaryBoss(view, '2026-W43')).toEqual({
      id: 'tidal-colossus',
      name: 'Tidal Colossus',
      turnOrder: 'left_to_right',
      gimmicks: [{ id: 'undertow', name: 'Undertow' }],
      effectiveRank: 4,
    });
  });

  it('never borrows another week boss moves: the fallback has no turn order and no moves', () => {
    const other = { id: 'cinder-wyrm', name: 'Cinder Wyrm' };
    expect(summaryBoss(view, '2026-W42', other)).toEqual({
      ...other,
      turnOrder: null,
      gimmicks: [],
      effectiveRank: null,
    });
    expect(summaryBoss(null, '2026-W43', other)?.turnOrder).toBeNull();
  });

  it('is null when nothing is known', () => {
    expect(summaryBoss(view, '2026-W42')).toBeNull();
    expect(summaryBoss(null, '2026-W43')).toBeNull();
  });
});

describe('the samples', () => {
  it('are shaped like what the server sends: damage adds up to what came off the boss', () => {
    for (const { stats } of SUMMARY_CASES.map((c) => c.input)) {
      const dealt = stats.players.reduce((sum, p) => sum + p.damage, 0);
      expect(dealt).toBe(stats.boss.hpStart - stats.boss.hpEnd);
      expect(stats.players.filter((p) => p.you)).toHaveLength(1);
      expect(stats.creatures.filter((c) => c.you).length).toBeGreaterThan(0);
    }
    // The bosses and their moves come from the content as it is.
    for (const { boss } of SUMMARY_CASES.map((c) => c.input)) {
      expect(boss?.turnOrder).not.toBeNull();
      expect(boss?.gimmicks.length).toBeGreaterThan(0);
    }
    expect(clear11.stats.players).toHaveLength(11);
    expect(clear3.stats.players).toHaveLength(3);
  });
});
