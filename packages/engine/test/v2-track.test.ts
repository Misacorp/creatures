/**
 * Combat v2: the track's boss in the engine (`resolve/track.ts`, R14.1, R24): the slot's boss from `raid-track.json` through the pack, the
 * track after the data, and a party's width (HP x (players / 4)^0.7, Attack x (players / 4)^0.3; under four players the boss is the four-column
 * one). Proved on a small hand-built pack; the shipped track's numbers are held by the lab's parity digest and `track.test.ts`.
 */
import type { CombatV2Pack } from '@creatures/game/combat-v2';
import {
  RAID_ATK_EXPONENT,
  RAID_COLS,
  RAID_HP_EXPONENT,
  RAID_ROUNDS,
  slotSpec,
  trackBoss,
  wideBoss,
  type Pattern,
  type Shipped,
} from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';

const SINGLE: Pattern = { anchor: 'front', shape: 'single' };
const card = (id: string, value: number) => ({
  id,
  name: id,
  asks: '-',
  ops: [{ op: 'add', stat: 'armour', value }],
  answers: [],
});
const boss = (id: string, hp: number, atk: number, armour: number, cards: string[]) => ({
  id,
  rows: 2,
  armour,
  atk,
  hp,
  plain: { pattern: SINGLE, powerBp: 10_000 },
  moves: [],
  cards,
  asks: '-',
});
const row = (
  slot: number,
  bossId: string,
  over: Partial<{
    hp: number;
    atk: number;
    armour: number;
    strengthBp: number;
    cards: number;
    buildUp: boolean;
    extraCards: string[];
  }> = {},
) => ({
  slot,
  boss: bossId,
  hp: 1_000 * slot,
  atk: 10 * slot,
  armour: slot,
  strengthBp: 2_000 * slot,
  cards: 2,
  buildUp: true,
  extraCards: [],
  ...over,
});

const PACK = {
  cards: { hide: card('hide', 70), wave: card('wave', 5), wither: card('wither', 9) },
  raidBosses: {
    titan: boss('titan', 5_000, 90, 40, ['hide', 'wave']),
    ogre: boss('ogre', 6_000, 60, 20, ['hide', 'wave']),
  },
  raidTrack: {
    order: ['titan', 'ogre'],
    slots: [
      row(1, 'titan', { cards: 0, buildUp: false, strengthBp: 1_500 }),
      row(2, 'ogre', { cards: 1, buildUp: false }),
      row(3, 'titan', { strengthBp: 7_000, extraCards: ['wither'] }),
      row(4, 'ogre', { strengthBp: 10_000 }),
    ],
  },
} as unknown as Pick<CombatV2Pack, 'cards' | 'raidBosses' | 'raidTrack'>;

const SHIPPED: Pick<Shipped, 'bosses'> = {
  bosses: [
    { id: 'titan', name: 'Titan', element: 'ember', baseSpd: 30 },
    { id: 'ogre', name: 'Ogre', element: 'grove' },
  ],
};

describe('the track in the pack', () => {
  it('a slot of the data is read as written: the boss in order, its strength, ramp, numbers and extra cards', () => {
    expect(slotSpec(PACK, 3)).toEqual({
      slot: 3,
      bossId: 'titan',
      strengthBp: 7_000,
      cards: 2,
      buildUp: true,
      extraCards: ['wither'],
      numbers: { hp: 3_000, atk: 30, armour: 3 },
    });
    expect(slotSpec(PACK, 2)).toMatchObject({ bossId: 'ogre', cards: 1, buildUp: false });
  });

  it('after the data the track goes on at full strength with the full rules, the boss’s own numbers and its last lap’s extra cards', () => {
    // Slot 7 is a titan again (7 - 1 is even); its last lap in the data is slot 3.
    expect(slotSpec(PACK, 7)).toEqual({
      slot: 7,
      bossId: 'titan',
      strengthBp: 10_000,
      buildUp: true,
      extraCards: ['wither'],
      numbers: { hp: 5_000, atk: 90, armour: 40 },
    });
    // Slot 6 is an ogre (last lap: slot 4, which has no extra card), and slot 5 a titan whose last lap is slot 3.
    expect(slotSpec(PACK, 6)).toMatchObject({ bossId: 'ogre', extraCards: [] });
    expect(slotSpec(PACK, 5).extraCards).toEqual(['wither']);
    expect(slotSpec(PACK, 5).cards).toBeUndefined();
  });

  it('refuses a slot below 1 or one that is not a whole number', () => {
    expect(() => slotSpec(PACK, 0)).toThrow('a track slot is a whole number from 1');
    expect(() => slotSpec(PACK, 1.5)).toThrow('a track slot is a whole number from 1');
  });
});

describe('trackBoss', () => {
  it('is the slot’s boss at four columns by default: its numbers, only the ramp’s cards, its strength', () => {
    const b = trackBoss(PACK, SHIPPED, 1);
    expect(b).toMatchObject({
      id: 'titan',
      name: 'Titan',
      hp: 1_000,
      atk: 10,
      armour: 1,
      cols: RAID_COLS,
      rounds: RAID_ROUNDS,
      strengthBp: 1_500,
      cards: [],
    });
    expect(b.escalation).toBeUndefined();
    expect(trackBoss(PACK, SHIPPED, 2).cards).toEqual(['hide']);
    expect(trackBoss(PACK, SHIPPED, 3).cards).toEqual(['hide', 'wave', 'wither']);
  });

  it('a party under four fights at four columns: the same boss as four players', () => {
    const four = trackBoss(PACK, SHIPPED, 3, { players: 4 });
    for (const players of [1, 2, 3]) expect(trackBoss(PACK, SHIPPED, 3, { players })).toEqual(four);
  });

  it('a boss that follows a small party has one column per player and the same curves below four (Misa, 2026-11-04)', () => {
    const four = trackBoss(PACK, SHIPPED, 3, { players: 4 });
    for (const players of [1, 2, 3]) {
      const small = trackBoss(PACK, SHIPPED, 3, { players, followSmallParty: true });
      expect(small.cols).toBe(players);
      expect(small.rows).toBe(four.rows);
      expect(small.hp).toBe(Math.round(four.hp * (players / 4) ** RAID_HP_EXPONENT));
      expect(small.atk).toBe(Math.round(four.atk * (players / 4) ** RAID_ATK_EXPONENT));
      expect(small.hp).toBeLessThan(four.hp);
    }
    // At four and above the option changes nothing.
    for (const players of [4, 5, 10]) {
      expect(trackBoss(PACK, SHIPPED, 3, { players, followSmallParty: true })).toEqual(
        trackBoss(PACK, SHIPPED, 3, { players }),
      );
    }
  });

  it('a bigger party fights a wider arena with HP x (players / 4)^0.7 and Attack x (players / 4)^0.3', () => {
    const four = trackBoss(PACK, SHIPPED, 3);
    for (const players of [5, 10, 15]) {
      const wide = trackBoss(PACK, SHIPPED, 3, { players });
      expect(wide.cols).toBe(players);
      expect(wide.hp).toBe(Math.round(four.hp * (players / 4) ** RAID_HP_EXPONENT));
      expect(wide.atk).toBe(Math.round(four.atk * (players / 4) ** RAID_ATK_EXPONENT));
      expect(wide).toEqual(wideBoss(four, players));
    }
    expect(RAID_HP_EXPONENT).toBe(0.7);
    expect(RAID_ATK_EXPONENT).toBe(0.3);
  });

  it('the roster level is passed on when given, and a party is a whole number of players', () => {
    expect(trackBoss(PACK, SHIPPED, 1).rosterLevel).toBeUndefined();
    expect(trackBoss(PACK, SHIPPED, 1, { level: 12 }).rosterLevel).toBe(12);
    expect(() => trackBoss(PACK, SHIPPED, 1, { players: 0 })).toThrow('from 1');
    expect(() => trackBoss(PACK, SHIPPED, 1, { players: 2.5 })).toThrow('from 1');
  });
});
