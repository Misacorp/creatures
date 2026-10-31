/** The boss track: the order and its repeat, the strength ladder, and the boss of a slot against `raidBossOf`. */
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { RAID_BOSS_IDS, RAID_RANKS, RAID_SPECS, raidBossOf } from '../src/bosses';
import { CARDS } from '../src/cards';
import {
  SLOT_CARDS,
  SLOT_EXTRA_CARDS,
  SLOT_LINE,
  SLOT_MIXED_ANSWER,
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
  slotAnswersOf,
  slotBoss,
  slotExtraCards,
  slotMixedOf,
  slotPreparedOf,
  slotRules,
  trackSlot,
} from '../src/track';
import { BOSS_ANSWERS, answerLine } from '../src/bossAnswers';

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
        extraCards: s.extraCards,
      });
      expect(boss, `slot ${slot}`).toEqual(full);
      expect(boss.cards).toEqual([...spec(s.bossId).cards, ...s.extraCards]);
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

describe('the luck cards, a later lap’s new card (Misa, 2026-10-31)', () => {
  const n = TRACK_ORDER.length;
  const first = (card: string): number =>
    Number(Object.entries(SLOT_EXTRA_CARDS).find(([, cards]) => cards.includes(card))?.[0]);

  it('puts Lucky Strike on the Storm Sovereign and Slippery on the Tidal Colossus, each from its second lap', () => {
    expect(SLOT_EXTRA_CARDS).toEqual({ 6: ['slippery'], 8: ['lucky-strike'] });
    expect(trackSlot(first('lucky-strike')).bossId).toBe('storm-sovereign');
    expect(trackSlot(first('slippery')).bossId).toBe('tidal-colossus');
    for (const card of ['lucky-strike', 'slippery']) {
      // The lap after the first: slots 6 to 10, so the boss's first meeting is as it was.
      expect(first(card)).toBeGreaterThan(n);
      expect(first(card)).toBeLessThanOrEqual(2 * n);
      expect(CARDS.map((c) => c.id)).toContain(card);
    }
  });

  it('adds a card to its boss from that slot on and never earlier', () => {
    const from = { slippery: 6, 'lucky-strike': 8 } as const;
    for (let s = 1; s <= 4 * n; s++) {
      const expected = (Object.keys(from) as (keyof typeof from)[]).filter(
        (card) => s >= from[card] && (s - from[card]) % n === 0,
      );
      expect(slotExtraCards(s), `slot ${s}`).toEqual(expected);
      expect(trackSlot(s).extraCards, `slot ${s}`).toEqual(expected);
      for (const card of Object.keys(from))
        expect(slotBoss(s).cards.includes(card), `${card} at slot ${s}`).toBe(
          expected.includes(card as keyof typeof from),
        );
    }
    // The first lap has none, and no boss has more than one.
    for (let s = 1; s <= n; s++) expect(trackSlot(s).extraCards).toEqual([]);
    expect(TRACK.filter((s) => s.extraCards.length).map((s) => s.slot)).toEqual([
      6, 8, 11, 13, 16, 18, 21, 23, 26, 28,
    ]);
    for (const s of TRACK) expect(s.extraCards.length).toBeLessThanOrEqual(1);
  });

  it('builds the card on the boss at the slot’s strength: a crit chance for Lucky Strike, a flat dodge for Slippery', () => {
    const storm = slotBoss(8);
    expect(storm.cards.slice(-1)).toEqual(['lucky-strike']);
    expect(storm.critChanceBp).toBe(Math.floor((2_000 * trackSlot(8).strengthBp) / 10_000));
    expect(storm.dodgeBp ?? 0).toBe(0);
    const colossus = slotBoss(6);
    expect(colossus.cards.slice(-1)).toEqual(['slippery']);
    expect(colossus.dodgeBp).toBe(Math.floor((2_500 * trackSlot(6).strengthBp) / 10_000));
    expect(colossus.critChanceBp ?? 0).toBe(0);
    // Stronger on the lap after.
    expect(slotBoss(13).critChanceBp as number).toBeGreaterThan(storm.critChanceBp as number);
    expect(slotBoss(11).dodgeBp as number).toBeGreaterThan(colossus.dodgeBp as number);
    // A boss without the card is as before.
    expect(slotBoss(7).critChanceBp ?? 0).toBe(0);
    expect(slotBoss(7).dodgeBp ?? 0).toBe(0);
    expect(slotBoss(3).cards).toEqual(RAID_SPECS.find((x) => x.id === 'storm-sovereign')?.cards);
  });

  it('is what raidBossOf builds with the card, at every slot that has one', () => {
    for (const slot of [6, 8, 11, 13]) {
      const s = trackSlot(slot);
      expect(slotBoss(slot, { table: {} })).toEqual(
        raidBossOf(s.bossId, {
          ...rankNumbers(s.bossId, slot),
          strengthBp: s.strengthBp,
          level: rankLevel(slot),
          extraCards: s.extraCards,
        }),
      );
    }
    expect(raidBossOf('storm-sovereign', { extraCards: ['lucky-strike'] }).critChanceBp).toBe(
      2_000,
    );
    expect(raidBossOf('storm-sovereign').critChanceBp ?? 0).toBe(0);
  });

  it('takes another table and order, and a card repeats on the boss’s later laps only', () => {
    expect(slotExtraCards(3, ['a', 'b'], { 2: ['x'] })).toEqual([]);
    expect(slotExtraCards(4, ['a', 'b'], { 2: ['x'] })).toEqual(['x']);
    expect(slotExtraCards(6, ['a', 'b'], { 2: ['x'], 4: ['y'] })).toEqual(['x', 'y']);
    expect(slotExtraCards(1, TRACK_ORDER, {})).toEqual([]);
  });
});

describe('the written answers of a slot and the one the mixed server fields (design panel 6)', () => {
  it('lists every written answer of the boss, the first being the slot’s prepared line', () => {
    for (const slot of [1, 2, 3, 6, 11]) {
      const written = BOSS_ANSWERS[trackSlot(slot).bossId] ?? [];
      const answers = slotAnswersOf(slot);
      expect(answers).toHaveLength(written.length);
      expect(answers.length).toBeGreaterThanOrEqual(2);
      // The first is what the dedicated server fields (`SLOT_LINE` where the slot names one); the others are as written.
      expect(answers[0]?.line).toEqual(slotPreparedOf(slot).line);
      expect(answers[0]?.core).toEqual(slotPreparedOf(slot).core);
      answers.slice(1).forEach((a, i) => {
        expect(a.line).toEqual(answerLine((written[i + 1] as { line: string }).line));
        expect(a.core).toEqual(written[i + 1]?.core);
        expect(a.label).toBe(written[i + 1]?.label);
      });
    }
    expect(slotAnswersOf(1)[0]?.line).toEqual(answerLine(SLOT_LINE[1] as string));
  });

  it('gives the mixed server the first answer unless the slot says otherwise, and takes an index', () => {
    expect(slotMixedOf(3)).toEqual(slotAnswersOf(3)[SLOT_MIXED_ANSWER[3] ?? 0]);
    expect(slotMixedOf(3, 0)).toEqual(slotAnswersOf(3)[0]);
    expect(slotMixedOf(3, 1)).toEqual(slotAnswersOf(3)[1]);
    expect(slotMixedOf(3, 1).line).not.toEqual(slotMixedOf(3, 0).line);
    expect(() => slotMixedOf(3, 9)).toThrow(/no written answer number 9/);
  });

  it('only names answers a boss has, on slots of the track', () => {
    for (const [slot, index] of Object.entries(SLOT_MIXED_ANSWER)) {
      expect(Number(slot)).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(slotAnswersOf(Number(slot)).length);
    }
  });
});
