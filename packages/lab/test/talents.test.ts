/**
 * The talent library as content (docs/design/combat/modifiers.md): what the talents are, which line pools and roles they fit, and what
 * the resolver does with them. What each talent's effect does in a fight (the hooks for neighbours and position, fight state, marks,
 * Guard shapes, Support, debuffs, silence, Cull and counters) is proved in the engine tests (`packages/engine/test/v2-*.test.ts`) on
 * hand-built creatures that carry the effect directly.
 */
import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import {
  ADDITIVE_FIELDS,
  KEYWORDS,
  KNACKS,
  LINE_POOLS,
  TALENTS,
  keywordsIn,
  lineRoles,
  mergeFx,
  placeFighters,
  talentIdleUnder,
  talentPool,
  type Placement,
} from '../src';

const at = (
  formId: string,
  row: number,
  col: number,
  knack?: string,
  talents?: readonly string[],
): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
  ...(talents ? { talents } : {}),
});
/** A talent's number (basis points) as the library has it: a retune of a talent changes the library, not these tests. */
const bp = (id: string, key: string): number =>
  (TALENTS[id]?.fx as Record<string, number | undefined> | undefined)?.[key] ?? 0;

describe('which Support Knacks leave Triage idle', () => {
  it('Triage is idle under a Support shape Knack: its own base verb is replaced, so nothing is aimed', () => {
    expect(talentIdleUnder('triage', 'curl-up')).toBe(true);
    expect(talentIdleUnder('triage', 'drizzle')).toBe(true);
    expect(talentIdleUnder('triage', 'gather-calm')).toBe(false);
    expect(talentIdleUnder('triage', undefined)).toBe(false);
    expect(talentIdleUnder('hardy', 'curl-up')).toBe(false);
  });
});

describe('the talent library as content', () => {
  const roles = (line: string) => lineRoles(line);

  it('every talent has the keys it says, fits a role, and is in a line pool (Cull waits for a killing-blow talent)', () => {
    const pooled = new Set(Object.values(LINE_POOLS).flat());
    for (const [id, t] of Object.entries(TALENTS)) {
      expect(t.id, id).toBe(id);
      expect(t.roles.length, id).toBeGreaterThan(0);
      expect(pooled.has(id), `${id} pool membership`).toBe(id !== 'cull');
      for (const w of keywordsIn(t.text)) expect(KEYWORDS, `${id} {${w}}`).toHaveProperty(w);
    }
    expect(Object.keys(TALENTS).length).toBeGreaterThanOrEqual(28);
    // Retired in panel 3.
    for (const gone of ['lone-wolf', 'share-the-load', 'thick-skull', 'light-sleeper'])
      expect(TALENTS, gone).not.toHaveProperty(gone);
    expect(Object.keys(TALENTS).filter((id) => id.startsWith('flank-guard'))).toEqual([
      'flank-guard',
    ]);
  });

  it('talent fields all add up: numbers and flags only, so mergeFx stays sound', () => {
    const all = mergeFx([
      ...Object.values(TALENTS).map((t) => t.fx),
      ...Object.values(KNACKS).map((k) => k.fx),
    ]);
    for (const [key, v] of Object.entries(all))
      if (ADDITIVE_FIELDS.has(key as never)) expect(['number', 'boolean'], key).toContain(typeof v);
    // Flank Guard is a flag: two of them are still one.
    expect(mergeFx([{ flankGuard: true }, { flankGuard: true }])).toEqual({ flankGuard: true });
  });

  it('every pool is 7 talents, every role in a line has 3 that fit, and lines of one role differ', () => {
    const byRole = new Map<string, string[]>();
    for (const line of Object.keys(LINE_POOLS)) {
      const entries = talentPool(line);
      expect(entries).toHaveLength(7);
      for (const role of roles(line)) {
        expect(
          entries.filter((e) => e.roles.includes(role)).length,
          `${line} ${role}`,
        ).toBeGreaterThanOrEqual(3);
        byRole.set(role, [...(byRole.get(role) ?? []), line]);
      }
    }
    // No two lines share the same pool.
    const keys = Object.values(LINE_POOLS).map((p) => [...p].sort().join());
    expect(new Set(keys).size).toBe(keys.length);
    // Healing talents only where a Support has a heal; debuff talents only on Mire lines.
    for (const line of Object.keys(LINE_POOLS)) {
      const els = content.creatures.filter((c) => c.line === line).map((c) => c.element);
      const pool = LINE_POOLS[line] ?? [];
      if (pool.includes('triage') || pool.includes('overheal-spill'))
        expect(
          els.some((e) => e === 'tide' || e === 'grove'),
          line,
        ).toBe(true);
      if (pool.includes('heavy-hand') || pool.includes('clinging'))
        expect(
          els.every((e) => e === 'mire'),
          line,
        ).toBe(true);
    }
  });
});

describe('reworked weak talents (2026-10-28)', () => {
  it('Unbothered is the silence ward with a little Attack and HP, less than the plain stat talents', () => {
    expect(TALENTS['unbothered']?.fx.ignoreSilence).toBe(true);
    expect(bp('unbothered', 'atkBp')).toBeGreaterThan(0);
    expect(bp('unbothered', 'atkBp')).toBeLessThan(bp('sharp-claws', 'atkBp'));
    expect(bp('unbothered', 'hpBp')).toBeGreaterThan(0);
    expect(bp('unbothered', 'hpBp')).toBeLessThan(bp('hardy', 'hpBp'));
    const [plain, calmed] = placeFighters([
      at('tidewing', 0, 0),
      at('tidewing', 0, 1, undefined, ['unbothered']),
    ]);
    expect(calmed?.maxHp).toBeGreaterThan(plain?.maxHp ?? 0);
  });
});
