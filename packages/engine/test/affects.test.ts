import { describe, expect, it } from 'vitest';
import { ELEMENTS, createSeededRng, type Role, type TurnOrder } from '@creatures/game';
import {
  affects,
  slotReactions,
  type AffectMode,
  type AffectRow,
  type AffectSlot,
  type FightRules,
  type GuardReach,
} from '../src/index';
import { eventsOf, input, run, slot } from './helpers';

/** `affects` answers from the engine's own rules: these tests run the fight and compare. */

const ROLES: readonly Role[] = ['setter', 'payoff', 'support', 'guard'];

/** A deterministic row of `length` creatures (some roles, elements and speeds), or with holes. */
function rowOf(seed: string, length: number): AffectSlot[] {
  const r = createSeededRng(seed);
  return Array.from({ length }, () => ({
    role: ROLES[r.nextU32() % ROLES.length] as Role,
    element: ELEMENTS[r.nextU32() % ELEMENTS.length] as AffectSlot['element'],
    speed: 5 + (r.nextU32() % 40),
  }));
}

/** The engine's fight row for it: slot ids are their indexes, owned by one player. */
function fightRow(row: readonly AffectSlot[]) {
  return row
    .map((s, i) =>
      slot(String(i), {
        role: s.role,
        element: s.element,
        spd: s.speed ?? 10,
        atk: 100,
      }),
    )
    .map((f, i) => {
      // A Guard's reach is the base of one each side plus the sheet's change.
      const reach = (row[i] as AffectSlot).reach;
      return reach === undefined
        ? f
        : { ...f, mods: { reachLeft: reach.left - 1, reachRight: reach.right - 1 } };
    });
}

/** The reach rule: a Guard protects the creatures within its reach (the boards shade the same slots). */
const REACH_RULES: FightRules = {
  coverBp: 4_000,
  maxHitBp: 0,
  guardHpBp: 0,
  guardArmorBp: 0,
  supportFx: {},
  guardRule: 'reach',
};

function fightOptions(mode: AffectMode) {
  return mode.row === 'dungeon'
    ? ({ guardReach: 'adjacent', turnOrderOverride: 'left_to_right' } as const)
    : ({ guardReach: 'zone', turnOrderOverride: mode.turnOrder } as const);
}

const RAID_ORDERS: readonly TurnOrder[] = ['left_to_right', 'right_to_left', 'speed'];
const MODES: readonly AffectMode[] = [
  { row: 'dungeon' },
  ...RAID_ORDERS.map((turnOrder) => ({ row: 'raid', turnOrder }) as const),
];

describe('affects: a Support buffs exactly the slots the fight buffs', () => {
  for (const [name, length, mode] of [
    ['dungeon row of three', 3, { row: 'dungeon' }],
    ['raid row of nine', 9, { row: 'raid', turnOrder: 'left_to_right' }],
    ['raid row of twelve', 12, { row: 'raid', turnOrder: 'left_to_right' }],
    ['raid row of thirty-three', 33, { row: 'raid', turnOrder: 'left_to_right' }],
  ] as const) {
    it(name, () => {
      let supports = 0;
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const row = rowOf(`buff-${seed}`, length);
        const result = run(fightRow(row), fightOptions(mode));
        const buffed = new Map<string, Set<number>>();
        for (const e of eventsOf(result, 'support_buff').filter((x) => x.round === 1)) {
          const set = buffed.get(e.supporter) ?? new Set<number>();
          set.add(Number(e.target));
          buffed.set(e.supporter, set);
        }
        row.forEach((s, i) => {
          const computed = affects(row, i, mode)
            .filter((a) => a.kind === 'buff')
            .map((a) => a.slot)
            .sort((x, y) => x - y);
          const real = [...(buffed.get(String(i)) ?? [])].sort((x, y) => x - y);
          expect(computed, `slot ${String(i)} of ${seed}`).toEqual(real);
          if (s.role !== 'support') expect(computed).toEqual([]);
          else supports += 1;
        });
      }
      expect(supports).toBeGreaterThan(0);
    });
  }

  it('the raid buff stops at a zone edge, the dungeon line does not', () => {
    const row: AffectSlot[] = rowOf('edge', 6).map((s) => ({ ...s, role: 'support' }));
    // Zones of two: slots 0-1, 2-3, 4-5. Slot 1 is beside slot 2 only in a plain line.
    const raid = affects(row, 1, { row: 'raid', turnOrder: 'left_to_right' }).filter(
      (a) => a.kind === 'buff',
    );
    expect(raid.map((a) => a.slot)).toEqual([0]);
    const line = affects(row, 1, { row: 'dungeon' }).filter((a) => a.kind === 'buff');
    expect(line.map((a) => a.slot)).toEqual([0, 2]);
  });
});

describe('affects: a Guard covers exactly the slots whose hits it takes', () => {
  const rod = {
    id: 'rod',
    name: 'Rod',
    trigger: { eachRound: true },
    op: 'strike_highest_atk',
    power: 10_000,
  } as const;

  /** Slots whose gimmick hit a Guard took in their place, by aiming the strike at each in turn. */
  function intercepted(row: readonly AffectSlot[], guard: number, mode: AffectMode): number[] {
    const out: number[] = [];
    row.forEach((s, target) => {
      if (target === guard || s.role === 'guard') return;
      const slots = fightRow(row).map((f, i) =>
        i === target ? { ...f, stats: { ...f.stats!, atk: 500 } } : f,
      );
      const base = input(slots, { ...fightOptions(mode), rules: REACH_RULES, bossAtk: 100 });
      const result = run(slots, {
        ...fightOptions(mode),
        rules: REACH_RULES,
        bossAtk: 100,
        boss: { ...base.boss, gimmicks: [rod] },
      });
      const strike = eventsOf(result, 'boss_hit').find((e) => e.source === 'gimmick')!;
      expect(strike.from === undefined ? strike.target : strike.from).toBe(String(target));
      if (strike.from !== undefined) {
        expect(strike.target).toBe(String(guard));
        out.push(target);
      }
    });
    return out;
  }

  const raid = { row: 'raid', turnOrder: 'left_to_right' } as const;
  const cases: [string, AffectMode, number, number[], Record<number, GuardReach>?][] = [
    ['dungeon, guard in the middle', { row: 'dungeon' }, 3, [1]],
    ['dungeon, guard at the end', { row: 'dungeon' }, 3, [2]],
    [
      'dungeon, guard at the end, two to its left',
      { row: 'dungeon' },
      3,
      [2],
      { 2: { left: 2, right: 0 } },
    ],
    ['raid of nine, guard at a zone edge', raid, 9, [2]],
    ['raid of nine, guard in the middle zone', raid, 9, [4]],
    [
      'raid of nine, guard in the middle zone, no reach to the right',
      raid,
      9,
      [4],
      { 4: { left: 1, right: 0 } },
    ],
    [
      'raid of nine, guard with a long reach stops at the zone edge',
      raid,
      9,
      [4],
      { 4: { left: 3, right: 3 } },
    ],
    ['raid of twelve, guard in the back', raid, 12, [9]],
    [
      'raid of twelve, guard in the front with two to its right',
      raid,
      12,
      [0],
      { 0: { left: 1, right: 2 } },
    ],
  ];
  for (const [name, mode, length, guards, reaches] of cases) {
    it(name, () => {
      const row: AffectSlot[] = rowOf('cover', length).map((s, i) => ({
        ...s,
        role: guards.includes(i) ? 'guard' : s.role === 'guard' ? 'setter' : s.role,
        ...(reaches?.[i] === undefined ? {} : { reach: reaches[i] }),
      }));
      for (const guard of guards) {
        const computed = affects(row, guard, mode)
          .filter((a) => a.kind === 'cover')
          .map((a) => a.slot)
          .sort((x, y) => x - y);
        expect(intercepted(row, guard, mode).sort((x, y) => x - y)).toEqual(computed);
        expect(computed.length).toBeGreaterThan(0);
      }
    });
  }

  it('an empty slot is shaded but ends the reach, and a Guard is never covered', () => {
    const row: (AffectSlot | null)[] = [
      { role: 'guard', element: 'tide', reach: { left: 1, right: 3 } },
      null,
      { role: 'guard', element: 'ember' },
    ];
    const cover = (mode: AffectMode, at: number) =>
      affects(row, at, mode)
        .filter((a) => a.kind === 'cover')
        .map((a) => a.slot);
    // A row of three has a zone to each slot, so the raid's Guard here has nobody in its zone.
    expect(cover({ row: 'raid', turnOrder: 'left_to_right' }, 0)).toEqual([]);
    const nine: (AffectSlot | null)[] = [
      { role: 'guard', element: 'tide', reach: { left: 1, right: 3 } },
      null,
      { role: 'setter', element: 'ember' },
      ...Array.from({ length: 6 }, () => null),
    ];
    expect(
      affects(nine, 0, { row: 'raid', turnOrder: 'left_to_right' })
        .filter((a) => a.kind === 'cover')
        .map((a) => a.slot),
    ).toEqual([1]);
    expect(cover({ row: 'dungeon' }, 0)).toEqual([1]);
    // The Guard at slot 2 reaches slot 1 (empty) and then slot 0 is behind a gap.
    expect(cover({ row: 'dungeon' }, 2)).toEqual([1]);
    const touching: AffectSlot[] = [
      { role: 'guard', element: 'tide' },
      { role: 'guard', element: 'ember' },
    ];
    expect(affects(touching, 0, { row: 'dungeon' }).filter((a) => a.kind === 'cover')).toEqual([]);
  });
});

describe('affects: reaction partners are the pairs the fight sets off', () => {
  for (const mode of MODES) {
    const label = mode.row === 'dungeon' ? 'dungeon' : `raid, ${mode.turnOrder}`;
    it(label, () => {
      const length = mode.row === 'dungeon' ? 3 : 9;
      let pairs = 0;
      for (let n = 0; n < 12; n++) {
        const row = rowOf(`react-${label}-${String(n)}`, length);
        const result = run(fightRow(row), fightOptions(mode));
        const real = new Set(
          eventsOf(result, 'reaction')
            .filter((e) => e.round <= 6)
            .map((e) => `${e.setupCreature ?? '-'}:${e.payoff}:${e.reaction}`),
        );
        const computed = new Set(
          slotReactions(row, mode).map(
            (r) => `${String(r.marker)}:${String(r.payoff)}:${r.reaction}`,
          ),
        );
        expect(computed).toEqual(real);
        pairs += real.size;
        // Each slot's partners are the other end of every pair it is in.
        row.forEach((_, i) => {
          const partners = affects(row, i, mode)
            .filter((a) => a.kind === 'reaction')
            .map((a) => `${String(a.slot)}`);
          const expected = slotReactions(row, mode).flatMap((r) =>
            r.marker === i ? [String(r.payoff)] : r.payoff === i ? [String(r.marker)] : [],
          );
          expect(partners.sort()).toEqual(expected.sort());
        });
      }
      expect(pairs).toBeGreaterThan(0);
    });
  }

  it('serpentine previews round 1: the Middle row runs right to left', () => {
    // Slots 3 to 5 are the Middle row of nine. Round 1 acts 5, 4, 3, so the Ember setter in slot 5
    // marks and the Tide payoff in slot 4 cashes in.
    const row: AffectRow = [
      null,
      null,
      null,
      null,
      { role: 'payoff', element: 'tide' },
      { role: 'setter', element: 'ember' },
      null,
      null,
      null,
    ];
    expect(slotReactions(row, { row: 'raid', turnOrder: 'serpentine' })).toEqual([
      { marker: 5, payoff: 4, reaction: 'steam' },
    ]);
  });

  it('says whether the partner leaves the mark or sets it off', () => {
    // Ember marks, Tide cashes in: Steam.
    const row: AffectRow = [
      { role: 'setter', element: 'ember' },
      { role: 'payoff', element: 'tide' },
    ];
    const mode: AffectMode = { row: 'dungeon' };
    expect(affects(row, 0, mode)).toEqual([
      { slot: 1, kind: 'reaction', reaction: 'steam', partner: 'payoff' },
    ]);
    expect(affects(row, 1, mode)).toEqual([
      { slot: 0, kind: 'reaction', reaction: 'steam', partner: 'marker' },
    ]);
  });

  it('skips empty slots and follows the acting order', () => {
    const row: AffectRow = [
      { role: 'payoff', element: 'tide' },
      null,
      { role: 'setter', element: 'ember' },
    ];
    // Left to right the Tide hit marks first, the Setter swaps the mark to Ember, and round 2 cashes it in.
    expect(slotReactions(row, { row: 'dungeon' }).map((r) => [r.marker, r.payoff])).toEqual([
      [2, 0],
    ]);
    // Right to left the Setter marks first and the Tide hit cashes it in at once.
    expect(
      slotReactions(row, { row: 'raid', turnOrder: 'right_to_left' }).map((r) => [
        r.marker,
        r.payoff,
      ]),
    ).toEqual([[2, 0]]);
    expect(affects(row, 1, { row: 'dungeon' })).toEqual([]);
    expect(affects(row, 7, { row: 'dungeon' })).toEqual([]);
  });

  it('speed order uses the speeds given', () => {
    const speed: AffectMode = { row: 'raid', turnOrder: 'speed' };
    // Ember first marks Scorched and Tide pays it off (Steam); Tide first marks Soaked and nobody has Spark.
    const emberFirst: AffectRow = [
      { role: 'payoff', element: 'ember', speed: 50 },
      { role: 'payoff', element: 'tide', speed: 1 },
    ];
    const tideFirst: AffectRow = [
      { role: 'payoff', element: 'ember', speed: 1 },
      { role: 'payoff', element: 'tide', speed: 50 },
    ];
    expect(slotReactions(emberFirst, speed)).toEqual([{ marker: 0, payoff: 1, reaction: 'steam' }]);
    expect(slotReactions(tideFirst, speed)).toEqual([]);
  });
});
