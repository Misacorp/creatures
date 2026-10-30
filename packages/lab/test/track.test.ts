/** The boss track: the order and its repeat, the strength ladder, and the boss of a slot against `raidBossOf`. */
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS, RAID_RANKS, RAID_SPECS, raidBossOf } from '../src/bosses';
import {
  SLOT_CARDS,
  SLOT_NUMBERS,
  SLOT_STRENGTH,
  SLOT_WALL,
  TRACK,
  TRACK_ORDER,
  buildTrack,
  isWallSlot,
  rankLevel,
  rankNumbers,
  rankStrengthBp,
  slotBoss,
  slotRules,
  trackSlot,
} from '../src/track';

describe('the track order', () => {
  it('lists every shipped boss once, in the order Misa chose, all of them lab bosses', () => {
    expect([...TRACK_ORDER].sort()).toEqual(content.bosses.map((b) => b.id).sort());
    for (const id of TRACK_ORDER) expect(RAID_BOSS_IDS).toContain(id);
  });

  it('puts Thornmother at the end of the first lap: slots 5, 10 and 15 (2026-10-30)', () => {
    expect(TRACK_ORDER).toEqual([
      'tidal-colossus',
      'cinder-wyrm',
      'storm-sovereign',
      'old-bogback',
      'thornmother',
    ]);
    for (const slot of [5, 10, 15]) expect(trackSlot(slot).bossId).toBe('thornmother');
    for (const slot of [3, 8, 13]) expect(trackSlot(slot).bossId).toBe('storm-sovereign');
  });

  it('starts at slot 1 and repeats after the last boss', () => {
    const n = TRACK_ORDER.length;
    expect(trackSlot(1).bossId).toBe(TRACK_ORDER[0]);
    expect(trackSlot(n).bossId).toBe(TRACK_ORDER[n - 1]);
    expect(trackSlot(n + 1).bossId).toBe(TRACK_ORDER[0]);
    expect(trackSlot(2 * n + 2).bossId).toBe(TRACK_ORDER[1]);
    expect(TRACK.map((s) => s.slot)).toEqual(Array.from({ length: TRACK.length }, (_, i) => i + 1));
    expect(buildTrack(7).map((s) => s.bossId)).toEqual(
      Array.from({ length: 7 }, (_, i) => TRACK_ORDER[i % n]),
    );
  });

  it('takes another order in one line, and refuses a slot below 1', () => {
    expect(trackSlot(3, ['a', 'b']).bossId).toBe('a');
    expect(() => trackSlot(0)).toThrow(/from 1/);
  });
});

describe('the wall slot (Misa, 2026-10-30)', () => {
  it('is slot 5 only, Thornmother’s first appearance; her later laps are normal slots', () => {
    expect(SLOT_WALL).toEqual({ 5: true });
    expect(TRACK.filter((s) => s.wall).map((s) => s.slot)).toEqual([5]);
    expect(trackSlot(5).wall).toBe(true);
    expect(trackSlot(5).bossId).toBe('thornmother');
    for (const slot of [1, 4, 6, 10, 15, 30]) expect(trackSlot(slot).wall).toBe(false);
    expect(isWallSlot(5)).toBe(true);
    expect(isWallSlot(10)).toBe(false);
  });

  it('every wall slot has a boss, and the flag does not depend on the order', () => {
    expect(trackSlot(5, ['a', 'b']).wall).toBe(true);
    expect(trackSlot(5).rules).toEqual({ buildUp: true });
  });
});

describe('the strength ladder', () => {
  it('is the ranks 2, 5 and 10 settings, straight between, capped at 100%', () => {
    for (const r of RAID_RANKS) expect(rankStrengthBp(r.rank)).toBe(r.strengthBp);
    expect(rankStrengthBp(3)).toBeGreaterThan(3_000);
    expect(rankStrengthBp(3)).toBeLessThan(6_500);
    expect(rankStrengthBp(10)).toBe(10_000);
    expect(rankStrengthBp(25)).toBe(10_000);
    expect(rankStrengthBp(1)).toBeGreaterThan(0);
    expect(rankStrengthBp(1)).toBeLessThan(3_000);
  });

  it('never falls along the track, and a repeated boss has stronger cards than its first time', () => {
    for (let s = 2; s <= 30; s++)
      expect(trackSlot(s).strengthBp).toBeGreaterThanOrEqual(trackSlot(s - 1).strengthBp);
    const n = TRACK_ORDER.length;
    expect(trackSlot(n + 1).strengthBp).toBeGreaterThan(trackSlot(1).strengthBp);
  });

  it('pairs the ranks with the lab rosters (12, 18, 25)', () => {
    expect(RAID_RANKS.map((r) => rankLevel(r.rank))).toEqual([12, 18, 25]);
    expect(rankLevel(1)).toBe(12);
    expect(rankLevel(40)).toBe(25);
  });
});

describe('the boss of a slot', () => {
  it('without table entries is raidBossOf at the three ranks the lab sets up', () => {
    // Slots 5 and 10 are Boss Ranks mid and high (slots 1 and 2 are the young-server ramp, below).
    expect(slotBoss(5, { table: {} })).toEqual(raidBossOf(trackSlot(5).bossId, { rank: 'mid' }));
    expect(slotBoss(10, { table: {} })).toEqual(raidBossOf(trackSlot(10).bossId, { rank: 'high' }));
  });

  it('interpolates the numbers between the ranks and is flat outside them', () => {
    for (const id of TRACK_ORDER) {
      const low = rankNumbers(id, 2);
      const mid = rankNumbers(id, 5);
      const high = rankNumbers(id, 10);
      for (const k of ['hp', 'atk', 'armour'] as const) {
        const between = rankNumbers(id, 3)[k];
        expect(between).toBeGreaterThanOrEqual(Math.min(low[k], mid[k]));
        expect(between).toBeLessThanOrEqual(Math.max(low[k], mid[k]));
        const upper = rankNumbers(id, 7)[k];
        expect(upper).toBeGreaterThanOrEqual(Math.min(mid[k], high[k]));
        expect(upper).toBeLessThanOrEqual(Math.max(mid[k], high[k]));
      }
      expect(rankNumbers(id, 1)).toEqual(low);
      expect(rankNumbers(id, 30)).toEqual(high);
    }
  });

  it('builds the cards at the slot strength', () => {
    expect(slotBoss(1).strengthBp).toBe(rankStrengthBp(1));
    expect(slotBoss(4).strengthBp).toBe(rankStrengthBp(4));
    expect(slotBoss(6).rosterLevel).toBe(rankLevel(6));
    expect(slotBoss(6, { level: 9 }).rosterLevel).toBe(9);
  });

  it('takes per-slot numbers and strength from the tables', () => {
    const numbers = SLOT_NUMBERS as Record<number, unknown>;
    const kept = numbers[3];
    const strength = SLOT_STRENGTH as Record<number, number>;
    try {
      numbers[3] = { hp: 12_345, atk: 67 };
      strength[3] = 4_321;
      const boss = slotBoss(3);
      expect(boss.hp).toBe(12_345);
      expect(boss.atk).toBe(67);
      expect(boss.strengthBp).toBe(4_321);
      expect(trackSlot(3).strengthBp).toBe(4_321);
      // Another slot is untouched.
      expect(slotBoss(4).hp).not.toBe(12_345);
    } finally {
      numbers[3] = kept;
      delete strength[3];
    }
  });
});

describe('the young-server ramp (Misa, 2026-10-30)', () => {
  const spec = (id: string) => RAID_SPECS.find((x) => x.id === id) as (typeof RAID_SPECS)[number];

  it('is a column of the track: slot 1 no rules, slot 2 one card, slot 3 on the full set', () => {
    expect(SLOT_CARDS[1]).toEqual({ cards: 0, buildUp: false });
    expect(SLOT_CARDS[2]).toEqual({ cards: 1, buildUp: false });
    expect(slotRules(1)).toEqual(SLOT_CARDS[1]);
    for (const slot of [3, 4, 10, 25]) expect(slotRules(slot)).toEqual({ buildUp: true });
    expect(trackSlot(1).rules).toEqual(SLOT_CARDS[1]);
    expect(trackSlot(3).rules).toEqual({ buildUp: true });
  });

  it('slot 1 is a tutorial: no rule cards and no Build-up, but its plain attack and its moves stay', () => {
    const boss = slotBoss(1);
    const full = raidBossOf(trackSlot(1).bossId, { strengthBp: trackSlot(1).strengthBp });
    expect(boss.cards).toEqual([]);
    expect(boss.mods).toEqual({});
    expect(boss.escalation).toBeUndefined();
    expect(spec(boss.id).cards.length).toBeGreaterThan(0);
    expect(full.cards.length).toBeGreaterThan(0);
    expect(boss.plain).toEqual(full.plain);
    expect(boss.moves).toEqual(full.moves);
  });

  it('slot 2 has one rule card, the boss’s first, at the slot’s low strength, and no Build-up', () => {
    const boss = slotBoss(2);
    expect(boss.cards).toEqual([spec(boss.id).cards[0]]);
    expect(boss.strengthBp).toBe(rankStrengthBp(2));
    expect(boss.strengthBp).toBeLessThanOrEqual(3_000);
    expect(boss.escalation).toBeUndefined();
    expect(boss.moves).toEqual(raidBossOf(boss.id, { rank: 'low' }).moves);
  });

  it('slot 3 onward is the full set at the slot’s strength, as raidBossOf builds it', () => {
    for (const slot of [3, 4, 5, 10, 11]) {
      const s = trackSlot(slot);
      const boss = slotBoss(slot, { table: {} });
      const full = raidBossOf(s.bossId, {
        ...rankNumbers(s.bossId, slot),
        strengthBp: s.strengthBp,
        level: rankLevel(slot),
      });
      expect(boss, `slot ${slot}`).toEqual(full);
      expect(boss.cards).toEqual(spec(s.bossId).cards);
    }
    expect(slotBoss(5, { table: {} })).toEqual(raidBossOf(trackSlot(5).bossId, { rank: 'mid' }));
    expect(slotBoss(10, { table: {} })).toEqual(raidBossOf(trackSlot(10).bossId, { rank: 'high' }));
  });

  it('raidBossOf gives the first cards asked for, and Build-up on request; by default everything', () => {
    const id = 'cinder-wyrm';
    expect(raidBossOf(id).cards).toEqual(spec(id).cards);
    expect(raidBossOf(id).escalation).toBeDefined();
    expect(raidBossOf(id, { cards: 1 }).cards).toEqual([spec(id).cards[0]]);
    expect(raidBossOf(id, { cards: 1 }).escalation).toBeDefined();
    expect(raidBossOf(id, { cards: 0, buildUp: false }).escalation).toBeUndefined();
    expect(raidBossOf(id, { cards: 0 }).mods).toEqual({});
  });
});
