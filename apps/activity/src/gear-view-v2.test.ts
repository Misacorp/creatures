import { gearContent } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { isEffectLine, wornItemOf } from './gear-view';
import { pageScene } from './creature-page/sample';

/** Under combat v2 only gear's stat lines count; its fight effect lines are noted "not in the new rules yet". */
describe('gear lines under combat v2', () => {
  it('counts Attack, HP, Speed, crit and Attunement lines, and not the fight effects', () => {
    expect(isEffectLine('attack')).toBe(false);
    expect(isEffectLine('hp')).toBe(false);
    expect(isEffectLine('crit-chance')).toBe(false);
    expect(isEffectLine('crit-damage')).toBe(false);
    expect(isEffectLine('ember-hunter')).toBe(true);
    expect(isEffectLine('first-pounce')).toBe(true);
    expect(isEffectLine('no-such-line')).toBe(false);
  });

  it('is decided by the kind of the line in the content: stat, item and trip lines are not marked', () => {
    const marked = new Set([
      'hunter',
      'ward',
      'reaction',
      'reach',
      'besideRole',
      'position',
      'sheet',
    ]);
    const kinds = new Set<string>();
    for (const line of gearContent.lines) {
      kinds.add(line.effect.kind);
      expect(isEffectLine(line.id), line.id).toBe(marked.has(line.effect.kind));
    }
    // Both sides exist in the content, so the test proves something.
    expect([...kinds].some((k) => marked.has(k))).toBe(true);
    expect([...kinds].some((k) => !marked.has(k))).toBe(true);
  });

  it('splits a worn item’s lines into counted lines and effect lines, only for v2', () => {
    const scene = pageScene('v2: Knack saved');
    const worn = scene.creature.gear[0];
    if (worn === undefined) throw new Error('the scene wears an item');
    const plain = wornItemOf(worn, scene.gear.items);
    const v2 = wornItemOf(worn, scene.gear.items, true);
    // Without v2 the item is exactly as before: every line, no effect list.
    expect(plain).not.toHaveProperty('effectLines');
    const all = scene.gear.items.find((i) => i.id === worn.id)?.lines ?? [];
    expect(plain.lines).toEqual(all.map((l) => l.text));
    expect(v2.lines).toEqual(all.filter((l) => !isEffectLine(l.id)).map((l) => l.text));
    expect(v2.effectLines).toEqual(all.filter((l) => isEffectLine(l.id)).map((l) => l.text));
    expect([...(v2.lines ?? []), ...(v2.effectLines ?? [])].sort()).toEqual(
      all.map((l) => l.text).sort(),
    );
  });

  it('has no effect list while the gear view has not loaded', () => {
    const scene = pageScene('v2: Knack saved');
    const worn = scene.creature.gear[0];
    if (worn === undefined) throw new Error('the scene wears an item');
    const item = wornItemOf(worn, undefined, true);
    expect(item).not.toHaveProperty('lines');
    expect(item).not.toHaveProperty('effectLines');
  });
});
