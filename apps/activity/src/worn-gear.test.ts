import { content, gearContent } from '@creatures/game';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemLookId } from './gear-sprites';
import { creatureSprite } from './sprites/creature-sprites';
import { LOOK_CLASS, classSlot } from './sprites/data/worn-sprites';
import { CACHE_LIMIT, clearWornCache, wornLook, wornSprite } from './worn-gear';

function baseSlot(id: string): string | undefined {
  const cls = LOOK_CLASS[itemLookId(id)];
  return cls === undefined ? undefined : classSlot(cls);
}

/** The first base of a slot, by the worn class of its look. */
function baseOf(slot: 'hat' | 'scarf' | 'charm', skip = 0): string {
  const found = gearContent.bases.filter((b) => {
    const cls = LOOK_CLASS[itemLookId(b.id)];
    return cls !== undefined && classSlot(cls) === slot;
  })[skip];
  if (found === undefined) throw new Error(`no ${slot} base`);
  return found.id;
}

beforeEach(clearWornCache);

describe('wornSprite', () => {
  it('returns the same object for the same outfit, and the bare sprite for none', () => {
    const first = gearContent.bases[0];
    if (first === undefined) throw new Error('no gear');
    const gear = [{ baseId: first.id }];
    expect(wornSprite('splashet', gear)).toBe(wornSprite('splashet', gear));
    expect(wornSprite('splashet', [])).toBe(creatureSprite('splashet'));
    expect(wornSprite('no-such-species', gear)).toBeUndefined();
    expect(wornSprite('splashet', [{ baseId: 'nope' }])).toBe(creatureSprite('splashet'));
  });

  it('gives one object whatever order the pieces come in, and ignores unknown bases', () => {
    const hat = { baseId: baseOf('hat') };
    const scarf = { baseId: baseOf('scarf') };
    const charm = { baseId: baseOf('charm') };
    const a = wornSprite('splashet', [hat, scarf, charm]);
    expect(a).toBeDefined();
    expect(wornSprite('splashet', [charm, hat, scarf])).toBe(a);
    expect(wornSprite('splashet', [scarf, { baseId: 'nope' }, charm, hat])).toBe(a);
  });

  it('keeps the last piece of a slot, so a different last piece is a different outfit', () => {
    const h1 = { baseId: baseOf('hat', 0) };
    const h2 = { baseId: baseOf('hat', 1) };
    expect(wornLook(h1.baseId)).not.toEqual(wornLook(h2.baseId));
    expect(wornSprite('splashet', [h1, h2])).toBe(wornSprite('splashet', [h2]));
    expect(wornSprite('splashet', [h1, h2])).not.toBe(wornSprite('splashet', [h1]));
  });

  it('keeps no more than the cap, evicting the oldest', () => {
    const base = gearContent.bases[0];
    if (base === undefined) throw new Error('no gear');
    const first = wornSprite('splashet', [{ baseId: base.id }]);
    // Fill the cache with more than the cap of other outfits (every species with every hat and scarf).
    const hats = gearContent.bases.map((b) => b.id).filter((id) => baseSlot(id) === 'hat');
    const scarves = gearContent.bases.map((b) => b.id).filter((id) => baseSlot(id) === 'scarf');
    let n = 0;
    for (const { id: species } of content.creatures) {
      for (const h of hats) {
        for (const sc of scarves) {
          if (creatureSprite(species) === undefined) continue;
          wornSprite(species, [{ baseId: h }, { baseId: sc }]);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(CACHE_LIMIT + 5);
    expect(wornSprite('splashet', [{ baseId: base.id }])).not.toBe(first);
  });
});
