import { bossAtRank, content, dungeonContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { BossStrike } from './stage';
import { MAX_FORECAST_CLAUSES, forecastNextRound, strikeLabel } from './telegraph';

const names = {
  creatures: { a: 'Cindle', b: 'Dew', c: 'Zip', d: 'Ray', e: 'Fern', f: 'Moss' } as Record<
    string,
    string
  >,
};
const strike = (over: Partial<BossStrike>): BossStrike => ({
  action: 'attack',
  gimmick: null,
  targets: [],
  zone: null,
  blocked: [],
  guarded: null,
  ...over,
});

const row = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('the labels of the attack patterns', () => {
  it('names a sweep by its rows, in the raid and in the dungeon', () => {
    const sweep = strike({
      action: 'sweep',
      gimmick: 'great-wave',
      rows: ['middle'],
      zone: 'middle',
    });
    expect(strikeLabel(sweep, names).text).toBe('Sweep · whole MIDDLE row');
    expect(strikeLabel(sweep, { ...names, gimmicks: { 'great-wave': 'Great Wave' } }).title).toBe(
      'Great Wave',
    );
    expect(strikeLabel(sweep, names, 'row').area).toBe('the middle creature');
    const all = strike({ action: 'sweep', rows: ['front', 'middle', 'back'], zone: 'front' });
    expect(strikeLabel(all, names).area).toBe('every row');
    expect(strikeLabel(all, names, 'row').area).toBe('the whole row');
    expect(strikeLabel(strike({ action: 'sweep' }), names).area).toBe('a whole row');
  });

  it('counts the creatures of a barrage and names the target of a slam, with its splash', () => {
    expect(
      strikeLabel(
        strike({ action: 'barrage', gimmick: 'cinder-fall', targets: ['a', 'c', 'e'] }),
        names,
      ).text,
    ).toBe('Barrage · 3 random creatures');
    expect(strikeLabel(strike({ action: 'barrage', targets: ['a'] }), names).area).toBe(
      '1 random creature',
    );
    const slam = strike({
      action: 'slam',
      gimmick: 'coil-crush',
      targets: ['a'],
      splash: ['b', 'c'],
    });
    expect(strikeLabel(slam, names).area).toBe('Cindle, splash on 2');
    expect(strikeLabel({ ...slam, guarded: 'b', targets: ['a'] }, names).area).toBe(
      'Cindle, guarding Dew, splash on 2',
    );
  });

  it('names the lane of a lance (from 1, like the board) or the creature in the dungeon', () => {
    const lance = strike({ action: 'lance', targets: ['a', 'c', 'e'], lane: 0 });
    expect(strikeLabel(lance, names).area).toBe('lane 1');
    expect(strikeLabel({ ...lance, lane: 3 }, names).area).toBe('lane 4');
    expect(strikeLabel(strike({ action: 'lance', targets: ['b'] }), names).area).toBe('one lane');
    expect(strikeLabel(lance, names, 'row').area).toBe('Cindle');
  });

  it('says what a pincer, a chain, a charge and the enrage round do', () => {
    expect(strikeLabel(strike({ action: 'pincer', targets: ['a', 'b'] }), names).area).toBe(
      'the ends of every row',
    );
    expect(strikeLabel(strike({ action: 'pincer', targets: ['a', 'c'] }), names, 'row').area).toBe(
      'both ends',
    );
    const chain = strike({ action: 'strike_highest_atk', targets: ['a', 'b', 'c'] });
    expect(strikeLabel(chain, names).area).toBe('Cindle, then 2 more');
    expect(strikeLabel({ ...chain, targets: ['a'] }, names).area).toBe('Cindle');
    const charge = strike({ action: 'charge', gimmick: 'seed-burst', targets: ['a', 'b', 'c'] });
    expect(strikeLabel(charge, names).area).toBe('marks 3 creatures');
    expect(strikeLabel({ ...charge, targets: [] }, names).area).toBe('gathering');
    expect(
      strikeLabel({ ...charge, rows: ['middle'], zone: 'middle', targets: [] }, names).area,
    ).toBe('marks the MIDDLE row');
    expect(strikeLabel({ ...charge, rows: ['front', 'middle', 'back'] }, names).area).toBe(
      'marks every row',
    );
    expect(strikeLabel(strike({ action: 'enrage', targets: ['a', 'b'] }), names)).toEqual({
      title: 'Enraged',
      area: 'hits every creature',
      text: 'Enraged · hits every creature',
    });
  });

  it('is only ever text: a name with markup stays as it is', () => {
    const evil = { creatures: { a: '<b onclick=x>' } };
    expect(strikeLabel(strike({ action: 'slam', targets: ['a'], splash: ['b'] }), evil).text).toBe(
      'Slam · <b onclick=x>, splash on 1',
    );
  });
});

describe('the forecast of the attack patterns in the raid', () => {
  it('says a charge is gathering, then where it lands, and puts the charge first', () => {
    // Round 4 gathers (the charge is announced at its start), round 5 lands. Riptide is due in 4.
    expect(forecastNextRound('tidal-colossus', 3, 12, row, [], {})).toEqual({
      text: 'Next round: Great Wave is gathering; Riptide cuts a lane through every row',
      lines: ['Next round: Great Wave is gathering', 'Riptide cuts a lane through every row'],
      zones: [],
      ends: [],
    });
    // The Great Wave lands on the Middle row first, then Back, then Front.
    const lands = forecastNextRound('tidal-colossus', 4, 12, row, [], {});
    expect(lands).toEqual({
      text: 'Next round: Great Wave lands on the marked row',
      lines: ['Next round: Great Wave lands on the marked row'],
      zones: ['middle'],
      ends: [],
    });
    expect(forecastNextRound('tidal-colossus', 9, 12, row, [], {})?.zones).toEqual(['back']);
  });

  it('draws the charged row from who is still up, like a zone hit', () => {
    // Middle is c and d: with both down the wave falls to the nearest row with someone in it.
    expect(forecastNextRound('tidal-colossus', 4, 12, row, ['c', 'd'], {})?.zones).toEqual([
      'front',
    ]);
  });

  it('says a barrage drops on a range of random creatures, never more than are standing', () => {
    // Cinder Fall: 2 to 6 shells every 2 rounds. Round 1 looks at round 2.
    expect(forecastNextRound('cinder-wyrm', 1, 12, row, [], {})?.lines[0]).toBe(
      'Next round: Cinder Fall drops shells on 2 to 6 random creatures',
    );
    expect(forecastNextRound('cinder-wyrm', 1, 12, row, ['a', 'b', 'c'], {})?.lines[0]).toBe(
      'Next round: Cinder Fall drops shells on 2 to 3 random creatures',
    );
    expect(
      forecastNextRound('cinder-wyrm', 1, 12, row, ['a', 'b', 'c', 'd', 'e'], {})?.lines[0],
    ).toBe('Next round: Cinder Fall hits one random creature');
  });

  it('says a slam splashes, and a chain jumps', () => {
    // Round 3 looks at round 4: Cinder Fall (barrage) and Coil Crush (slam on the front-most).
    expect(forecastNextRound('cinder-wyrm', 3, 12, row, [], {})?.lines).toEqual([
      'Next round: Cinder Fall drops shells on 2 to 6 random creatures',
      'Coil Crush slams the front-most creature, and splashes its neighbours',
    ]);
    expect(forecastNextRound('storm-sovereign', 3, 12, row, [], {})?.lines).toEqual([
      'Next round: Thunderclap slams your strongest, and splashes its neighbours',
      'Lightning Rod strikes your strongest, then jumps twice',
    ]);
  });

  it('says a slam on the Payoff and a sweep of the Payoff row, in their rounds', () => {
    // Round 4 looks at round 5: Magma Spit (rank 4) is the Wyrm's slam on the strongest Payoff.
    const played = { 'magma-spit': 'Magma Spit' };
    expect(forecastNextRound('cinder-wyrm', 4, 12, row, [], { gimmicks: played })?.lines).toEqual([
      'Next round: Magma Spit slams your strongest Payoff, and splashes its neighbours',
      'Backdraft reflects the first reaction',
    ]);
    // Static Field (the Sovereign's rank-4 sweep) comes with Lightning Rod in round 5.
    expect(
      forecastNextRound('storm-sovereign', 4, 12, row, [], {
        gimmicks: { 'static-field': 'Static Field' },
      })?.lines,
    ).toEqual([
      'Next round: Static Field sweeps the row with the most Payoffs',
      'Lightning Rod strikes your strongest, then jumps twice',
    ]);
    // Spring Tide (rank 7) gathers in round 8 and lands in round 9 on the marked row.
    const spring = { gimmicks: { 'spring-tide': 'Spring Tide' } };
    expect(forecastNextRound('tidal-colossus', 7, 12, row, [], spring)?.lines).toContain(
      'Next round: Spring Tide is gathering',
    );
    expect(forecastNextRound('tidal-colossus', 8, 12, row, [], spring)?.lines).toContain(
      'Spring Tide lands on the marked row',
    );
    // Nobody left to hit: no sweep and no slam is announced.
    const down = forecastNextRound('storm-sovereign', 4, 12, row, row, {
      gimmicks: { 'static-field': 'Static Field' },
    });
    expect(down?.lines.join(' ')).not.toMatch(/Static Field/);
    const wyrm = forecastNextRound('cinder-wyrm', 4, 12, row, row, { gimmicks: played });
    expect(wyrm?.lines.join(' ')).not.toMatch(/Magma Spit/);
  });

  it('forecasts only the moves the fight was played with: a rank-gated move it did not have is left out', () => {
    // The server names the moves of the stored boss; a week at rank 1 has none of the gated ones.
    const boss = content.bosses.find((b) => b.id === 'cinder-wyrm');
    if (boss === undefined) throw new Error('missing boss');
    const played = Object.fromEntries(bossAtRank(boss, 1).gimmicks.map((g) => [g.id, g.name]));
    const lines = (names: Record<string, string> | undefined, round: number) =>
      forecastNextRound(
        'cinder-wyrm',
        round,
        12,
        row,
        [],
        names === undefined ? {} : { gimmicks: names },
      )?.lines ?? [];
    // Round 4 looks at round 5 (Magma Spit), round 6 at round 7 (Eruption lands, gathering in 6).
    expect(lines(played, 4)).toEqual(['Next round: Backdraft reflects the first reaction']);
    expect(lines(played, 6).join(' ')).not.toMatch(/Eruption/);
    // Told about the gated moves, the same rounds warn of them.
    const rank4 = Object.fromEntries(bossAtRank(boss, 4).gimmicks.map((g) => [g.id, g.name]));
    const rank7 = Object.fromEntries(bossAtRank(boss, 7).gimmicks.map((g) => [g.id, g.name]));
    expect(lines(rank4, 4).join(' ')).toMatch(/magma-spit|Magma Spit/);
    expect(lines(rank7, 6).join(' ')).toMatch(/Eruption/);
    // A fight with no names to go by shows every move the content has.
    expect(lines(undefined, 4).join(' ')).toMatch(/Magma Spit/);
  });

  it('says a pincer closes on the ends of every row, and marks the ends that are standing', () => {
    // Round 5 looks at round 6: the Briar Pincer (every 3) and Bramble Bind (every 2).
    const f = forecastNextRound('thornmother', 5, 12, row, [], {});
    expect(f?.lines).toEqual([
      'Next round: Briar Pincer closes on the ends of every row',
      'Bramble Bind silences both ends of each row',
    ]);
    expect(f?.ends).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    // With the first of each row down, the next one standing is the end.
    const hurt = forecastNextRound('thornmother', 5, 12, row, ['a', 'c', 'e'], {});
    expect(hurt?.ends).toEqual(['b', 'd', 'f']);
  });

  it("reads the rows from the fight's board positions, and says the silence is the whole line", () => {
    // Six creatures on a board of 9 (rows of 3), at slots 2, 3, 4, 5, 6, 8: a stands alone in Front, b to d
    // in the Middle, e and f in the Back, so the pincer's row ends are a, b, d, e, f.
    const f = forecastNextRound('thornmother', 5, 12, row, [], {}, 'zones', [], {
      length: 9,
      slots: [2, 3, 4, 5, 6, 8],
    });
    expect(f?.ends).toEqual(['a', 'b', 'd', 'e', 'f']);
    // Bramble Bind marks the two ends of the whole line, and the words say so.
    expect(f?.lines[1]).toBe('Bramble Bind silences both ends of each row');
    const byFormula = forecastNextRound('thornmother', 5, 12, row, [], {});
    expect(byFormula?.ends).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('says a charged barrage lands on the marked creatures', () => {
    // Seed Burst lands on round 5 and is gathering in round 4.
    expect(forecastNextRound('thornmother', 4, 12, row, [], {})?.lines).toEqual([
      'Next round: Seed Burst lands on the marked creatures',
    ]);
    expect(forecastNextRound('thornmother', 3, 12, row, [], {})?.lines).toEqual([
      'Next round: Seed Burst is gathering',
      'Bramble Bind silences both ends of each row',
    ]);
  });

  it('never says more than two clauses, and the charge always makes it', () => {
    expect(MAX_FORECAST_CLAUSES).toBe(2);
    // Round 11 looks at round 12: Undertow and Riptide are due (the charge is not).
    const f = forecastNextRound('tidal-colossus', 11, 12, row, [], {});
    expect(f?.lines).toEqual([
      'Next round: Riptide cuts a lane through every row',
      'Undertow hits FRONT',
    ]);
  });

  it('is nothing when nobody is left to aim at', () => {
    expect(forecastNextRound('cinder-wyrm', 1, 12, row, row, {})?.lines).toEqual([
      'Next round: Backdraft reflects the first reaction',
    ]);
    expect(forecastNextRound('tidal-colossus', 2, 12, row, row, {})).toBeNull();
  });
});

describe('the forecast of the attack patterns in the dungeon (one row of three)', () => {
  const three = ['a', 'b', 'c'];
  const foe = (id: string) => {
    const found = dungeonContent.foes.find((f) => f.id === id);
    if (found === undefined) throw new Error(`no foe ${id}`);
    return found;
  };

  it('says who a slam to the left hits and who it splashes', () => {
    // Anvil Fall (every 3) and Molten Shell (every round): the slam comes first.
    const f = forecastNextRound('slag-tyrant', 2, 8, three, [], {}, 'row');
    expect(f?.lines).toEqual([
      'Next round: Anvil Fall hits the left creature and splashes the middle',
      'Molten Shell reflects the first reaction',
    ]);
    expect(f?.ends).toEqual(['a']);
    // With the left creature down it is the next one standing that is hit.
    const later = forecastNextRound('slag-tyrant', 2, 8, three, ['a'], {}, 'row');
    expect(later?.lines[0]).toBe(
      'Next round: Anvil Fall hits the middle creature and splashes the right',
    );
    expect(later?.ends).toEqual(['b']);
    // A middle creature is splashed on both sides.
    const mid = forecastNextRound('slag-tyrant', 2, 8, three, [], {}, 'row');
    expect(mid?.lines[0]).toContain('splashes the middle');
  });

  it('says a whole-row sweep hits the whole row, and warns every place', () => {
    const f = forecastNextRound('drowned-warden', 2, 8, three, [], {}, 'row');
    expect(f?.lines).toEqual(['Next round: Flood Gate hits the whole row']);
    expect(f?.zones).toEqual(['front', 'middle', 'back']);
  });

  it('says a single shell hits one random creature, and a chain jumps', () => {
    expect(forecastNextRound('ember-mite', 1, 6, three, [], {}, 'row')?.lines).toEqual([
      'Next round: Flare Up hits one random creature',
    ]);
    expect(forecastNextRound('static-bat', 2, 6, three, [], {}, 'row')?.lines).toEqual([
      'Next round: Zap Dive strikes your strongest, then jumps once',
    ]);
  });

  it('adds the landmark signature as a charge: gathering, then landing', () => {
    const signature = foe('slag-tyrant').signature;
    if (signature === undefined) throw new Error('the Slag Tyrant has a signature');
    // Slag Spill lands every 4 rounds: gathering in round 3 (seen from round 2), landing in round 4.
    const gathering = forecastNextRound('slag-tyrant', 2, 8, three, [], {}, 'row', [signature]);
    expect(gathering?.lines).toEqual([
      'Next round: Slag Spill is gathering',
      'Anvil Fall hits the left creature and splashes the middle',
    ]);
    const lands = forecastNextRound('slag-tyrant', 3, 8, three, [], {}, 'row', [signature]);
    expect(lands?.lines).toEqual([
      'Next round: Slag Spill lands on the marked creatures',
      'Molten Shell reflects the first reaction',
    ]);
  });
});
