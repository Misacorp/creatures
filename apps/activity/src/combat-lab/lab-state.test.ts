import { FORM_KNACKS, SCENARIOS, type FightEvent } from '@creatures/lab';
import { describe, expect, it } from 'vitest';
import {
  CARD_CHOICES,
  DAMAGE_TEST_HP,
  FORM_IDS,
  MANY,
  MAX_ATK,
  MAX_COLS,
  MAX_ROWS,
  NO_KNACK,
  PRESET_NAMES,
  RAID_PRESET,
  applyPreset,
  bossOf,
  cellIndex,
  decodeSetup,
  defaultSetup,
  encodeSetup,
  formName,
  groupSteps,
  levelCapOf,
  placementsOf,
  runFight,
  runMany,
  type Setup,
} from './lab-state';

/** An address whose JSON is the given value (what a hand-edited link would hold). */
function addressOf(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const text = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#s=${text}`;
}

describe('the combat lab setup', () => {
  it('starts as the classic line on a one-row arena with the damage test on', () => {
    const setup = defaultSetup();
    expect(setup).toMatchObject({ rows: 1, cols: 3, damageTest: true, cards: [] });
    expect(placementsOf(setup).map((p) => `${p.formId}/${p.knack ?? ''}`)).toEqual([
      'tidewing/soak-through',
      'tempestray/detonate',
      'thornbuck/wide-reach',
    ]);
  });

  it('round-trips through the address', () => {
    let setup = applyPreset(defaultSetup(), RAID_PRESET);
    setup = {
      ...setup,
      rounds: 7,
      atk: 222,
      damageTest: false,
      hp: 5_000,
      cards: ['thick-hide', 'swarm'],
    };
    const cell = setup.cells[cellIndex(2, 3)];
    if (cell === undefined) throw new Error('no cell');
    setup.cells[cellIndex(2, 3)] = { formId: 'zipmouse', knack: 'zoom', level: 12 };
    const back = decodeSetup(encodeSetup(setup));
    expect(encodeSetup(back)).toBe(encodeSetup(setup));
    expect(back).toMatchObject({
      rows: 3,
      cols: 4,
      rounds: 7,
      atk: 222,
      damageTest: false,
      hp: 5_000,
    });
    expect(back.cards).toEqual(['thick-hide', 'swarm']);
    expect(back.cells[cellIndex(2, 3)]).toEqual({ formId: 'zipmouse', knack: 'zoom', level: 12 });
  });

  it('gives the default for an empty, broken or oversized address', () => {
    const base = encodeSetup(defaultSetup());
    for (const hash of [
      '',
      '#',
      '#s=',
      '#s=!!!',
      '#s=bm90IGpzb24',
      '#x=1',
      `#s=${'A'.repeat(5000)}`,
    ]) {
      expect(encodeSetup(decodeSetup(hash))).toBe(base);
    }
    // JSON that is not an object.
    expect(encodeSetup(decodeSetup(addressOf([1, 2])))).toBe(base);
    expect(encodeSetup(decodeSetup(addressOf('x')))).toBe(base);
  });

  it('drops a Knack the form cannot equip, and an unknown form', () => {
    const setup = decodeSetup(
      addressOf({
        r: 1,
        c: 3,
        g: [
          ['tidewing', 'detonate', 25],
          ['not-a-creature', 'soak-through', 25],
          ['thornbuck', 'wide-reach', 25],
        ],
      }),
    );
    expect(setup.cells[cellIndex(0, 0)]).toEqual({
      formId: 'tidewing',
      knack: NO_KNACK,
      level: 25,
    });
    expect(setup.cells[cellIndex(0, 1)]?.formId).toBeNull();
    expect(setup.cells[cellIndex(0, 2)]?.knack).toBe('wide-reach');
    expect(placementsOf(setup)).toHaveLength(2);
  });

  it('drops cards that do not exist, Adapts and the baseline, and keeps the card order', () => {
    const setup = decodeSetup(
      addressOf({ r: 1, c: 3, k: ['swarm', 'nope', 'adapts', 'plain', 'thick-hide', 7] }),
    );
    expect(setup.cards).toEqual(['thick-hide', 'swarm']);
    expect(CARD_CHOICES.some((c) => c.id === 'adapts' || c.id === 'plain')).toBe(false);
  });

  it('clamps out-of-range numbers and survives wrong types', () => {
    const big = decodeSetup(
      addressOf({ r: 99, c: 99, n: 999, a: 99_999, h: 9e9, g: [['tidewing', 'none', 500]] }),
    );
    expect(big.rows).toBe(MAX_ROWS);
    expect(big.cols).toBe(MAX_COLS);
    expect(big.rounds).toBe(20);
    expect(big.atk).toBe(MAX_ATK);
    expect(big.hp).toBe(1_000_000);
    expect(big.damageTest).toBe(false);
    expect(big.cells[0]?.level).toBe(30);
    const small = decodeSetup(
      addressOf({ r: -4, c: 0, n: 0, a: 1, h: 0, g: [['tidewing', 'none', -3]] }),
    );
    expect(small).toMatchObject({ rows: 1, cols: 1, rounds: 1, atk: 50, damageTest: true });
    expect(small.cells[0]?.level).toBe(1);
    const wrong = decodeSetup(
      addressOf({ r: 'a', c: null, n: {}, a: [], h: 'x', k: 'swarm', g: 'tidewing' }),
    );
    expect(wrong.rows).toBe(1);
    expect(wrong.cols).toBe(3);
    expect(wrong.cards).toEqual([]);
    expect(placementsOf(wrong)).toEqual([]);
  });

  it('every preset places only forms and Knacks the lab knows', () => {
    expect(PRESET_NAMES).toEqual([...Object.keys(SCENARIOS), RAID_PRESET]);
    for (const name of PRESET_NAMES) {
      const setup = applyPreset(defaultSetup(), name);
      const placed = placementsOf(setup);
      expect(placed.length, name).toBeGreaterThan(0);
      for (const p of placed) {
        expect(FORM_IDS).toContain(p.formId);
        expect(p.knack === NO_KNACK || FORM_KNACKS[p.formId]?.includes(p.knack ?? '')).toBe(true);
        expect(p.level).toBe(25);
      }
    }
    expect(applyPreset(defaultSetup(), 'No such preset')).toEqual(defaultSetup());
  });

  it('the raid preset is three rows of four classic trios, one player to a column', () => {
    const setup = applyPreset(defaultSetup(), RAID_PRESET);
    expect(setup).toMatchObject({ rows: 3, cols: 4 });
    const placed = placementsOf(setup);
    expect(placed).toHaveLength(12);
    expect(placed.map((p) => p.formId).slice(0, 4)).toEqual([
      'tidewing',
      'tempestray',
      'thornbuck',
      'tidewing',
    ]);
    expect(placed.filter((p) => p.row === 0).map((p) => p.owner)).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('every form can be named and capped, so the board never throws', () => {
    for (const id of FORM_IDS) {
      expect(formName(id)).not.toBe('');
      expect(levelCapOf(id)).toBeGreaterThanOrEqual(1);
    }
  });

  it('builds the boss from the setup', () => {
    const setup: Setup = { ...defaultSetup(), rounds: 4, atk: 200, cards: ['swarm'] };
    const boss = bossOf(setup);
    expect(boss).toMatchObject({ rounds: 4, atk: 200, rows: 1, cols: 3, hp: DAMAGE_TEST_HP });
    expect(boss.plain.hits).toBe(4);
    expect(bossOf({ ...setup, damageTest: false, hp: 900 }).hp).toBe(900);
  });
});

describe('running the lab', () => {
  it('plays the same fight for the same seed, and a different one for another seed', () => {
    const setup = defaultSetup();
    const a = runFight(setup, 'lab');
    expect(runFight(setup, 'lab').damage).toBe(a.damage);
    expect(a.damage).toBeGreaterThan(0);
    expect(a.events.length).toBeGreaterThan(0);
    const damages = new Set(['a', 'b', 'c', 'd', 'e'].map((s) => runFight(setup, s).damage));
    expect(damages.size).toBeGreaterThan(1);
  });

  it('runs a hundred seeds and reports the spread', () => {
    const setup = defaultSetup();
    const stats = runMany(setup, 'lab');
    expect(stats.fights).toBe(MANY);
    expect(stats.lowestDamage).toBeLessThanOrEqual(stats.meanDamage);
    expect(stats.meanDamage).toBeLessThanOrEqual(stats.highestDamage);
    expect(stats.winShare).toBe(0);
    expect(runMany(setup, 'lab')).toEqual(stats);
    const winnable = runMany({ ...setup, damageTest: false, hp: 1 }, 'lab');
    expect(winnable.winShare).toBe(1);
  });

  it('lists every logged event once, by round, then by row, in the order of play', () => {
    const result = runFight(
      applyPreset({ ...defaultSetup(), cards: ['swarm'] }, RAID_PRESET),
      'lab',
    );
    const rounds = groupSteps(result.events);
    expect(rounds.flatMap((r) => r.groups.flatMap((g) => g.events))).toEqual(result.events);
    expect(rounds.map((r) => r.round)).toEqual(
      [...new Set(rounds.map((r) => r.round))].sort((a, b) => a - b),
    );
    for (const round of rounds) {
      const rows = round.groups.map((g) => g.row);
      expect(rows).toEqual([...rows].sort((a, b) => a - b));
    }
  });

  it('puts a creature event after boss turn N under row N + 1, not under the boss turn it carries', () => {
    const e = (turn: number, kind: string, text: string): FightEvent => ({
      round: 1,
      turn,
      kind,
      text,
    });
    const rounds = groupSteps([
      e(0, 'mark', 'tide x1'), // row 1 acts
      e(0, 'hit', 'A takes 5'), // boss turn 1
      e(0, 'reaction', 'B cashes'), // row 2 acts (the engine still says turn 0)
      e(1, 'dodge', 'B dodges'), // boss turn 2
      e(1, 'blocked', "C's hit is Blocked"), // row 3 acts
      { round: 2, turn: 0, kind: 'mark', text: 'next round' },
    ]);
    expect(rounds.map((r) => r.groups.map((g) => [g.row, g.events.length]))).toEqual([
      [
        [0, 2],
        [1, 2],
        [2, 1],
      ],
      [[0, 1]],
    ]);
  });
});
