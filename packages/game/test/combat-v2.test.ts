import { describe, expect, it } from 'vitest';
import { content } from '../src';
import { ADDITIVE_FIELDS, combatV2, loadCombatV2 } from '../src/combat-v2';
import forms from '../src/combat-v2/data/forms.json';
import knacks from '../src/combat-v2/data/knacks.json';
import rules from '../src/combat-v2/data/rules.json';
import talents from '../src/combat-v2/data/talents.json';

type Fx = Record<string, unknown>;
/** The raw files, loosely typed so a test can break them. */
interface Files {
  rules: Record<string, unknown>;
  knacks: {
    families: { name: string; text: string }[];
    knacks: { id: string; name: string; family: string; text: string; intent: string; fx: Fx }[];
  };
  forms: { id: string; armour: number; ownKnacks: string[] }[];
  talents: {
    talents: { id: string; name: string; text: string; roles: string[]; intent: string; fx: Fx }[];
    pools: Record<string, string[]>;
  };
}

/** A deep copy of plain data. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** The first entry of a list (the data always has one). */
function first<T>(list: readonly T[]): T {
  const x = list[0];
  if (x === undefined) throw new Error('empty list');
  return x;
}
const pool = (r: Files, line: string): string[] => {
  const p = r.talents.pools[line];
  if (p === undefined) throw new Error(`no pool for ${line}`);
  return p;
};

/** Loads a pack the test has broken (it edits a clone of the raw JSON). */
function broken(edit: (r: Files) => void): () => unknown {
  return () => {
    const r = clone({ rules, knacks, forms, talents }) as unknown as Files;
    edit(r);
    return loadCombatV2(r, content.creatures);
  };
}

describe('combat v2 content', () => {
  it('the shipped pack loads and is complete', () => {
    expect(Object.keys(combatV2.knacks)).toHaveLength(knacks.knacks.length);
    expect(Object.keys(combatV2.talents)).toHaveLength(talents.talents.length);
    expect(Object.keys(combatV2.forms)).toHaveLength(content.creatures.length);
    expect(Object.keys(combatV2.families)).toHaveLength(knacks.families.length);
    expect(combatV2.rules.maxStacks).toBe(3);
    for (const p of Object.values(combatV2.pools)) expect(p).toHaveLength(7);
  });

  it('keeps the order of the files', () => {
    expect(Object.keys(combatV2.knacks)).toEqual(knacks.knacks.map((k) => k.id));
    expect(Object.keys(combatV2.talents)).toEqual(talents.talents.map((t) => t.id));
    expect(Object.keys(combatV2.forms)).toEqual(forms.map((f) => f.id));
    expect(Object.keys(combatV2.families)).toEqual(knacks.families.map((f) => f.name));
    expect(Object.keys(combatV2.pools)).toEqual(Object.keys(talents.pools));
  });

  it('is not part of the shipped game entry', async () => {
    const shipped = await import('../src');
    expect('combatV2' in shipped).toBe(false);
  });

  it('rejects a rules file with a missing or unknown field', () => {
    expect(broken((r) => delete r.rules['maxStacks'])).toThrow(
      /Invalid combat v2 content: rules.json/,
    );
    expect(broken((r) => (r.rules['extra'] = 1))).toThrow(/Invalid combat v2 content: rules.json/);
  });

  it('rejects an effect with an unknown field', () => {
    expect(broken((r) => (first(r.knacks.knacks).fx['notAnEffect'] = 1))).toThrow(
      /Invalid combat v2 content: knacks.json/,
    );
  });

  it('rejects a Knack whose family does not exist', () => {
    expect(broken((r) => (first(r.knacks.knacks).family = 'No Such Family'))).toThrow(
      /Knack "steady-mark" has the unknown family "No Such Family"/,
    );
  });

  it('rejects a duplicate Knack id', () => {
    expect(broken((r) => r.knacks.knacks.push(clone(first(r.knacks.knacks))))).toThrow(
      /duplicate Knack id "steady-mark"/,
    );
  });

  it('rejects a form that is not shipped', () => {
    expect(
      broken((r) => r.forms.push({ id: 'not-a-form', armour: 5, ownKnacks: ['steady-mark'] })),
    ).toThrow(/form "not-a-form" is not a shipped form/);
  });

  it('rejects a shipped form with no entry', () => {
    expect(broken((r) => r.forms.splice(0, 1))).toThrow(/shipped form "splashet" has no entry/);
  });

  it('rejects a form with no own Knack', () => {
    expect(broken((r) => (first(r.forms).ownKnacks = []))).toThrow(
      /Invalid combat v2 content: forms.json/,
    );
  });

  it('rejects a form that names a Knack that does not exist', () => {
    expect(broken((r) => first(r.forms).ownKnacks.push('no-such-knack'))).toThrow(
      /form "splashet" names the unknown Knack "no-such-knack"/,
    );
  });

  it('rejects a Knack that is on no form', () => {
    expect(
      broken((r) =>
        r.knacks.knacks.push({
          ...clone(first(r.knacks.knacks)),
          id: 'orphan',
          name: 'Orphan',
        }),
      ),
    ).toThrow(/Knack "orphan" is on no form/);
  });

  it('rejects a duplicate talent id', () => {
    expect(broken((r) => r.talents.talents.push(clone(first(r.talents.talents))))).toThrow(
      /duplicate talent id "sharp-claws"/,
    );
  });

  it('rejects a pool that names a talent that does not exist', () => {
    expect(broken((r) => (pool(r, 'splashet')[0] = 'no-such-talent'))).toThrow(
      /the pool of "splashet" names the unknown talent "no-such-talent"/,
    );
  });

  it('rejects a pool that does not hold seven talents', () => {
    expect(broken((r) => pool(r, 'splashet').pop())).toThrow(
      /the pool of "splashet" has 6 talents, expected 7/,
    );
    expect(broken((r) => pool(r, 'splashet').push('sharp-claws'))).toThrow(
      /the pool of "splashet" has 8 talents, expected 7/,
    );
  });

  it('rejects a pool that repeats a talent', () => {
    expect(broken((r) => (pool(r, 'splashet')[1] = first(pool(r, 'splashet'))))).toThrow(
      /the pool of "splashet" repeats a talent/,
    );
  });

  it('rejects a pool for a line that is not shipped', () => {
    expect(broken((r) => (r.talents.pools['no-such-line'] = clone(pool(r, 'splashet'))))).toThrow(
      /a talent pool is for "no-such-line", which is not a shipped line/,
    );
  });

  it('rejects a talent that uses a field that does not add up', () => {
    expect(broken((r) => (first(r.talents.talents).fx = { twinStrikeBp: 5_000 }))).toThrow(
      /talent "sharp-claws" uses "twinStrikeBp", which is not an additive effect field/,
    );
  });

  it('rejects a talent that uses seal', () => {
    expect(broken((r) => (first(r.talents.talents).fx = { seal: true }))).toThrow(
      /talent "sharp-claws" uses seal/,
    );
  });

  it('every talent in the shipped pack uses additive fields only', () => {
    const allowed = new Set<string>(ADDITIVE_FIELDS);
    for (const t of Object.values(combatV2.talents)) {
      for (const f of Object.keys(t.fx)) expect(allowed.has(f), `${t.id} ${f}`).toBe(true);
    }
  });
});
