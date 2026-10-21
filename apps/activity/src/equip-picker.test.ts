import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { Creature } from './api';
import { sampleCreature } from './creature-card-sample';
import { sampleItem } from './creature-page/bag-sample';
import { TAKE_OFF_ID, equipOptions, equipReason } from './equip-picker';
import type { GearItem } from './gear-types';

const guard = content.creatures.find((c) => c.role === 'guard');
const payoff = content.creatures.find((c) => c.role === 'payoff');
if (guard === undefined || payoff === undefined)
  throw new Error('the content has no guard or payoff');

/** A creature of the sample, changed one thing at a time. */
function creature(id: string, over: Partial<Creature> = {}): Creature {
  return { ...sampleCreature('growing'), id, nickname: id, species: payoff?.id ?? '', ...over };
}

/** A Hat of item level 5 for anyone; `equippedOn` says who wears it. */
function hat(equippedOn: string | null = null, itemLevel = 5): GearItem {
  return { ...sampleItem('hat-1', 'trail-cap', 'common', itemLevel, []), equippedOn };
}

/** A Charm for Guards only (the Warden's Bell is a Guard piece). */
function guardCharm(): GearItem {
  return sampleItem('charm-1', 'wardens-bell', 'rare', 5, []);
}

const ids = (options: readonly { id: string }[]): string[] => options.map((o) => o.id);

describe('why a creature cannot take an item', () => {
  it('says nothing when it can', () => {
    expect(equipReason(hat(), creature('a', { level: 6 }))).toBeNull();
  });

  it('asks for the level of the item, or of the slot, whichever blocks', () => {
    expect(equipReason(hat(null, 9), creature('a', { level: 6 }))).toBe('Needs level 9');
    // A Charm slot opens at level 13 whatever the item's level.
    expect(equipReason(guardCharm(), creature('a', { level: 6, species: guard?.id ?? '' }))).toBe(
      'Needs level 13',
    );
  });

  it('names the role of a role-locked piece', () => {
    expect(equipReason(guardCharm(), creature('a', { level: 20 }))).toBe('Guards only');
  });

  it('puts away and on a job before the wear rule, as the server does', () => {
    const away = creature('a', { level: 1, away: true, busy: { kind: 'expedition', id: 'x' } });
    const job = creature('b', { level: 1, busy: { kind: 'job', id: 'y' } });
    expect(equipReason(hat(null, 9), away)).toBe('Away on a trip');
    expect(equipReason(hat(null, 9), job)).toBe('On a job');
    // `away` alone (an older view) counts too.
    expect(equipReason(hat(), creature('c', { level: 6, away: true }))).toBe('Away on a trip');
  });
});

describe('the options of the Equip on picker', () => {
  const low = creature('low', { level: 3 });
  const mid = creature('mid', { level: 8 });
  const high = creature('high', { level: 12 });
  const away = creature('away', { level: 20, away: true, busy: { kind: 'expedition', id: 'x' } });
  const job = creature('job', { level: 20, busy: { kind: 'job', id: 'y' } });
  const all = [low, away, mid, job, high];

  it('lists who can wear it first (highest level first), then who cannot, each with a reason', () => {
    const options = equipOptions(hat(), all);
    expect(ids(options)).toEqual(['high', 'mid', 'away', 'job', 'low']);
    expect(options.map((o) => o.disabled)).toEqual([
      null,
      null,
      'Away on a trip',
      'On a job',
      'Needs level 5',
    ]);
  });

  it('has no Take off for an item nobody wears, and no creature is marked as the wearer', () => {
    const options = equipOptions(hat(), all);
    expect(ids(options)).not.toContain(TAKE_OFF_ID);
    expect(options.some((o) => o.onBoard)).toBe(false);
  });

  it('offers Take off first for a worn item, then the wearer, and the rest as before', () => {
    const options = equipOptions(hat('mid'), all);
    expect(ids(options)).toEqual([TAKE_OFF_ID, 'mid', 'high', 'away', 'job', 'low']);
    const [takeOff, wearer] = options;
    expect(takeOff).toMatchObject({ name: 'Take off', action: true, disabled: null });
    expect(wearer).toMatchObject({ id: 'mid', onBoard: true, disabled: null });
  });

  it('freezes everything when the wearer is away or on a job (the server refuses to move the item)', () => {
    const options = equipOptions(hat('away'), all);
    expect(options[0]).toMatchObject({ id: TAKE_OFF_ID, disabled: 'away is away on a trip' });
    const rest = options.filter((o) => o.id !== TAKE_OFF_ID && o.id !== 'away');
    expect(rest.every((o) => o.disabled === 'away is away on a trip')).toBe(true);
    expect(equipOptions(hat('job'), all)[0]?.disabled).toBe('job is on a job');
  });

  it('carries the item each creature wears in the same slot, and nothing for an empty slot or another slot', () => {
    const wears = (slot: 'hat' | 'scarf') => [
      { id: `w-${slot}`, baseId: 'trail-cap', slot, rarity: 'epic' as const, itemLevel: 14 },
    ];
    const options = equipOptions(hat(), [
      { ...high, gear: wears('hat') },
      { ...mid, gear: wears('scarf') },
      { ...low, gear: [] },
    ]);
    const by = (id: string) => options.find((o) => o.id === id);
    expect(by('high')?.worn).toEqual({ baseId: 'trail-cap', rarity: 'epic', itemLevel: 14 });
    expect(by('mid')?.worn).toBeUndefined();
    expect(by('low')?.worn).toBeUndefined();
  });

  it('says every creature cannot wear a Guards-only piece when none is a Guard', () => {
    const options = equipOptions(guardCharm(), [high, mid]);
    expect(options.map((o) => o.disabled)).toEqual(['Guards only', 'Guards only']);
  });
});
