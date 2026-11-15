import { describe, expect, it } from 'vitest';
import { DM_FIELD_LIMIT, SAMPLE_SETTLER, creatureValue, dmFields } from './reset-dm';

describe('the goodbye DM embed', () => {
  it("has the plan's feats as short-named fields and ends with the creature field", () => {
    const fields = dmFields(SAMPLE_SETTLER);
    expect(fields.map((f) => f.name)).toEqual([
      'First on the server',
      'Deepest dungeon',
      'Collection',
      'Highest level',
      'Best crafter',
      'Best explorer',
      'Your creatures',
    ]);
    expect(fields[0]?.value).toBe('Mossling and Lanternfin');
    expect(fields[2]?.value).toBe('42 creatures · 612 levels · 31 blueprints');
    expect(fields[3]?.value).toBe('Pebbles the Mossling, level 31');
    expect(fields.at(-1)?.inline).toBe(false);
    expect(fields.at(-1)?.value).toMatch(/^Pebbles, Ember, Fizz, /);
  });

  it('stays within the field limit, also with a very long roster', () => {
    const long = {
      ...SAMPLE_SETTLER,
      names: Array.from({ length: 500 }, (_, i) => `Creature number ${String(i)}`),
    };
    for (const s of [SAMPLE_SETTLER, long]) {
      for (const f of dmFields(s)) expect(f.value.length).toBeLessThanOrEqual(DM_FIELD_LIMIT);
    }
    expect(dmFields(long).at(-1)?.value).toMatch(/and \d+ more$/);
  });

  it('cuts the creature list to the room it has', () => {
    expect(creatureValue(SAMPLE_SETTLER, 40).length).toBeLessThanOrEqual(40);
    expect(creatureValue(SAMPLE_SETTLER, 1)).toBe('42 in all');
  });
});
