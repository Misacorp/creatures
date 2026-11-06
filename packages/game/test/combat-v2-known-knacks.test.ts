/**
 * The Knacks a creature knows (R11) and the v2 talent roll (R20): pure rules over the shipped combat v2 content.
 */
import { describe, expect, it } from 'vitest';
import { content, createSeededRng } from '../src';
import {
  combatV2,
  formPath,
  knackForms,
  knownKnacks,
  knownKnacksOf,
  rollShippedV2Talent,
  rollV2Talent,
  v2Pool,
  v2TalentWorksFor,
  type PathSpecies,
} from '../src/combat-v2';

describe('knownKnacks', () => {
  it('a base form knows its own Knacks, from the moment it is caught', () => {
    expect(knownKnacks('splashet')).toEqual(['steady-mark', 'lead-the-way', 'pin-down']);
    expect(knownKnacks('mossback')).toEqual(['steady-mark', 'feed-the-marks']);
  });

  it('an evolution that keeps the role adds the new form’s Knacks to the ones it knew', () => {
    // Splashet and Tidewing are both Setters.
    expect(knownKnacks('tidewing')).toEqual([
      'steady-mark',
      'lead-the-way',
      'pin-down',
      'double-mark',
      'circle-round',
    ]);
    // Mossback and Ancientshell are both Setters.
    expect(knownKnacks('ancientshell')).toEqual([
      'steady-mark',
      'feed-the-marks',
      'living-shelter',
    ]);
  });

  it('a role change keeps only the new form’s Knacks', () => {
    // Mossback is a Setter, Bloomback a Payoff: the Setter Knacks would do nothing.
    expect(knownKnacks('bloomback')).toEqual([
      'all-at-once',
      'detonate',
      'leave-a-trail',
      'aftershock',
    ]);
    expect(knownKnacks('geyserpup')).toEqual(['leave-a-trail', 'puddle-maker', 'all-at-once']);
  });

  it('the forms kept are the path from the base form, cut at the last role change', () => {
    const species = content.creatures;
    expect(formPath(species, 'bloomback').map((s) => s.id)).toEqual(['mossback', 'bloomback']);
    expect(knackForms(species, 'tidewing')).toEqual(['splashet', 'tidewing']);
    expect(knackForms(species, 'bloomback')).toEqual(['bloomback']);
  });

  it('cuts at the last role change on a longer path, and counts a Knack once', () => {
    const chain: PathSpecies[] = [
      { id: 'a', line: 'x', role: 'setter', evolvesTo: { species: 'b' } },
      { id: 'b', line: 'x', role: 'setter', evolvesTo: { species: 'c' } },
      { id: 'c', line: 'x', role: 'payoff', evolvesTo: { species: 'd' } },
      { id: 'd', line: 'x', role: 'payoff' },
    ];
    const forms = Object.fromEntries(
      [
        ['a', ['one']],
        ['b', ['two']],
        ['c', ['three', 'four']],
        ['d', ['four', 'five']],
      ].map(([id, own]) => [id as string, { id, armour: 1, ownKnacks: own }]),
    ) as never;
    expect(knownKnacksOf(forms, chain, 'b')).toEqual(['one', 'two']);
    expect(knownKnacksOf(forms, chain, 'd')).toEqual(['three', 'four', 'five']);
  });

  it('every shipped form knows at least one Knack, and every one is a Knack of the pack', () => {
    for (const species of content.creatures) {
      const known = knownKnacks(species.id);
      expect(known.length, species.id).toBeGreaterThan(0);
      for (const id of known) expect(combatV2.knacks[id], `${species.id} ${id}`).toBeDefined();
      // Never more than the own Knacks of the forms on its path.
      expect(new Set(known).size).toBe(known.length);
    }
  });

  it('throws for a form the content does not hold', () => {
    expect(() => knownKnacks('nobody')).toThrow(RangeError);
  });
});

describe('rollV2Talent', () => {
  it('rolls from the line’s own pool', () => {
    const pool = new Set(v2Pool('mossback'));
    expect(pool.size).toBe(7);
    const rng = createSeededRng('v2-roll');
    for (let i = 0; i < 200; i++) {
      const roll = rollShippedV2Talent(rng, 'mossback');
      expect(roll).not.toBeNull();
      expect(pool.has((roll as { talentId: string }).talentId)).toBe(true);
    }
  });

  it('rolls golden at today’s chance, about one in twenty', () => {
    const rng = createSeededRng('v2-golden');
    let golden = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (rollShippedV2Talent(rng, 'cindle')?.golden === true) golden++;
    expect(golden).toBeGreaterThan(n / 20 / 2);
    expect(golden).toBeLessThan((n / 20) * 2);
  });

  it('with a role, rolls only talents that work for it and are not excluded', () => {
    const rng = createSeededRng('v2-role');
    const exclude = new Set(['owners-mark']);
    for (let i = 0; i < 200; i++) {
      const roll = rollV2Talent(combatV2, rng, 'mossback', { role: 'payoff', exclude });
      const id = (roll as { talentId: string }).talentId;
      expect(v2TalentWorksFor(id, 'payoff')).toBe(true);
      expect(exclude.has(id)).toBe(false);
    }
  });

  it('returns null, drawing nothing, when no talent is left', () => {
    const draws: number[] = [];
    const rng = { nextU32: () => (draws.push(1), 0) };
    const all = new Set(v2Pool('mossback'));
    expect(rollV2Talent(combatV2, rng, 'mossback', { exclude: all })).toBeNull();
    expect(draws).toEqual([]);
  });

  it('throws for a line with no pool', () => {
    expect(() => rollShippedV2Talent(createSeededRng('x'), 'nobody')).toThrow(RangeError);
  });

  it('a pool has at least three talents for each role its line has', () => {
    for (const line of new Set(content.creatures.map((c) => c.line))) {
      const roles = new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role));
      for (const role of roles) {
        const works = v2Pool(line).filter((id) => v2TalentWorksFor(id, role));
        expect(works.length, `${line} ${role}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
