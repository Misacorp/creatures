/**
 * The talent library in the lab (docs/design/combat/modifiers.md): what the resolver does with the talents. (What the talents are, the line pools
 * and the roles they fit are the content gate, `packages/game/test/combat-v2-content.test.ts`.) What each talent's effect does in a fight (the hooks for neighbours and position, fight state, marks,
 * Guard shapes, Support, debuffs, silence, Culling Strike and counters) is proved in the engine tests (`packages/engine/test/v2-*.test.ts`) on
 * hand-built creatures that carry the effect directly.
 */
import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_FIELDS,
  KNACKS,
  TALENTS,
  mergeFx,
  placeFighters,
  talentIdleUnder,
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
  // Which talents exist, the pool sizes and the roles they fit are the content gate (`packages/game/test/combat-v2-content.test.ts`).
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
