import { content, itemOf } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { SlotMods } from '@creatures/engine';
import { speciesOf, type OwnedCreature } from '../src/data';
import { DEFAULT_SEEDS, fightPower, referenceRow } from '../src/fight-power';

const owned = (
  speciesId: string,
  level: number,
  mods?: SlotMods,
  fusionCount = 0,
): OwnedCreature => ({
  id: `p/${speciesOf(speciesId).line}`,
  line: speciesOf(speciesId).line,
  speciesId,
  level,
  fusionCount,
  ...(mods === undefined ? {} : { mods }),
});

/** A Guard, a Payoff and a Setter at level 20. */
const team = (mods: Record<string, SlotMods> = {}): OwnedCreature[] => [
  owned('thornbuck', 20, mods['thornbuck']),
  owned('pyrelynx', 20, mods['pyrelynx']),
  owned('tidewing', 20, mods['tidewing']),
];

describe('fight-scored power', () => {
  it('plays every boss at each seed and gives whole numbers', () => {
    const p = fightPower(team(), 4);
    expect(p.fights).toBe(content.bosses.length * DEFAULT_SEEDS);
    expect(Number.isInteger(p.power)).toBe(true);
    expect(p.power).toBeGreaterThan(0);
    expect(p.survivalBp).toBeGreaterThanOrEqual(0);
    expect(p.survivalBp).toBeLessThanOrEqual(10_000);
  });

  it('is deterministic: the same team, rank and seed give the same score, in any order', () => {
    const a = fightPower(team(), 5);
    expect(fightPower(team().reverse(), 5)).toEqual(a);
    // A different seed text is a different set of fights, and repeats too.
    const c = fightPower(team(), 5, { seed: 'other' });
    expect(fightPower(team(), 5, { seed: 'other' })).toEqual(c);
    expect(fightPower(team(), 5, { seeds: 1 }).fights).toBe(content.bosses.length);
  });

  it('rises with levels and moves with the boss rank', () => {
    const strong = fightPower(team(), 4).power;
    const weak = fightPower(
      [owned('thornbuck', 6), owned('pyrelynx', 6), owned('tidewing', 6)],
      4,
    ).power;
    expect(strong).toBeGreaterThan(weak);
    expect(fightPower(team(), 10)).not.toEqual(fightPower(team(), 4));
  });

  it('counts a sheet modifier that the old score cannot see', () => {
    const base = fightPower(team(), 4);
    const sheet = fightPower(
      team({ pyrelynx: { pounceBp: 3_000, markedFoeBp: 3_000, firstHitBp: 3_000 } }),
      4,
    );
    expect(sheet.power).toBeGreaterThan(base.power);
    // The sheet reaches the fight slot, and the stats are the same: only the fight shows it.
    expect(referenceRow(team({ pyrelynx: { pounceBp: 3_000 } })).map((s) => s.mods)).toContainEqual(
      {
        pounceBp: 3_000,
      },
    );
    expect(referenceRow(team()).map((s) => s.stats)).toEqual(
      referenceRow(team({ pyrelynx: { pounceBp: 3_000 } })).map((s) => s.stats),
    );
  });

  it('plays position lines in the row the raid would give the team: one line, each beside the next', () => {
    // Guards stand left, Payoffs right, the Setter between them (`autoPlace`). A hat with a tier V position line.
    const hat = (line: string) => ({
      hat: {
        uid: 1,
        ...itemOf('trail-cap', 'common', 20, [{ id: line, tier: 4 }]),
      },
    });
    const wearing = (speciesId: string, line: string): OwnedCreature => ({
      ...owned(speciesId, 20),
      items: hat(line),
    });
    const stats = (c: readonly OwnedCreature[]) =>
      Object.fromEntries(referenceRow(c).map((s) => [s.speciesId, s.stats]));
    const plain = stats(team());
    // Edge-walker: Attack at the ends. The Payoff (right end) gains, the Setter in the middle does not.
    const edgeAtEnd = stats([
      owned('thornbuck', 20),
      wearing('pyrelynx', 'edge-walker'),
      owned('tidewing', 20),
    ]);
    expect(edgeAtEnd['pyrelynx']?.atk).toBeGreaterThan((plain['pyrelynx']?.atk ?? 0) + 2);
    const edgeInside = stats([
      owned('thornbuck', 20),
      owned('pyrelynx', 20),
      wearing('tidewing', 'edge-walker'),
    ]);
    // 2 is the Trail Cap's own Attack: the middle creature gets nothing from the line.
    expect(edgeInside['tidewing']?.atk).toBe((plain['tidewing']?.atk ?? 0) + 2);
    // Heart of the row: HP for the one in the middle only.
    const heart = stats([
      wearing('thornbuck', 'heart-of-the-row'),
      owned('pyrelynx', 20),
      wearing('tidewing', 'heart-of-the-row'),
    ]);
    expect(heart['tidewing']?.hp).toBeGreaterThan((plain['tidewing']?.hp ?? 0) + 4);
    expect(heart['thornbuck']?.hp).toBe((plain['thornbuck']?.hp ?? 0) + 4);
    // Lantern bearer: HP for the creature beside it.
    const lantern = stats([
      owned('thornbuck', 20),
      owned('pyrelynx', 20),
      wearing('tidewing', 'lantern-bearer'),
    ]);
    expect(lantern['pyrelynx']?.hp).toBeGreaterThan(plain['pyrelynx']?.hp ?? 0);
    // And the fight sees it: a line that adds to a creature's own numbers changes the score.
    expect(
      fightPower(
        [owned('thornbuck', 20), wearing('pyrelynx', 'edge-walker'), owned('tidewing', 20)],
        4,
      ).power,
    ).toBeGreaterThan(fightPower(team(), 4).power);
  });

  it('counts survival: a team that takes less damage lives longer and so hits for longer', () => {
    const base = fightPower(team(), 12);
    const warded = fightPower(
      team({
        thornbuck: { takenBp: 4_000 },
        pyrelynx: { takenBp: 4_000 },
        tidewing: { takenBp: 4_000 },
      }),
      12,
    );
    expect(warded.survivalBp).toBeGreaterThan(base.survivalBp);
    expect(warded.power).toBeGreaterThanOrEqual(base.power);
  });

  it("sees the position line: Guard's shadow pays with a Guard beside the wearer, not without", () => {
    const shadow: SlotMods = { besideRoleBp: { guard: 3_000 } };
    // The line stands Guard, Setter, Payoff: the Setter is the one beside the Guard.
    expect(fightPower(team({ tidewing: shadow }), 4).power).toBeGreaterThan(
      fightPower(team(), 4).power,
    );
    // The Payoff at the end is not beside the Guard: nothing.
    expect(fightPower(team({ pyrelynx: shadow }), 4)).toEqual(fightPower(team(), 4));
    // Three creatures and no Guard among them: nobody to stand beside.
    const noGuard = (mods?: SlotMods): OwnedCreature[] => [
      owned('tidewing', 20, mods),
      owned('pyrelynx', 20),
      owned('voltaro', 20),
    ];
    expect(fightPower(noGuard(shadow), 4)).toEqual(fightPower(noGuard(), 4));
  });

  it('takes only the three strongest creatures, as the raid team does', () => {
    const bench = [...team(), owned('splashet', 1), owned('cindle', 1)];
    expect(fightPower(bench, 4)).toEqual(fightPower(team(), 4));
  });

  it('copes with a team of one or two', () => {
    expect(fightPower([owned('pyrelynx', 12)], 3).power).toBeGreaterThan(0);
    expect(fightPower([owned('pyrelynx', 12), owned('thornbuck', 12)], 3).power).toBeGreaterThan(0);
  });

  it('shares the boss with a group: a smaller group means harder hits and fewer survivors', () => {
    const small = fightPower(team(), 8, { group: 2 });
    const typical = fightPower(team(), 8);
    expect(small.survivalBp).toBeLessThan(typical.survivalBp);
  });

  it('refuses a seed count or group below 1', () => {
    expect(() => fightPower(team(), 4, { seeds: 0 })).toThrow(RangeError);
    expect(() => fightPower(team(), 4, { group: 0 })).toThrow(RangeError);
  });
});
