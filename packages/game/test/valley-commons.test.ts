import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  VALLEY_RULES,
  ValleyCommonsViewSchema,
  activeWeightOf,
  communalValue,
  fireLevelOf,
  fireStartMilli,
  hearthBp,
  maskDays,
  mayOpenProject,
  nextThreshold,
  partNeeds,
  partRoom,
  projectDone,
  projectProgress,
  projectSize,
  settle,
  shardUnits,
  shiftMask,
  socketFor,
  valueToUnits,
  warmthMilli,
  type SettleState,
  wearBlock,
} from '../src';

const R = VALLEY_RULES;
const H = 3_600_000;

describe('the active weight (V-COM-5)', () => {
  it('counts a new player fully and a weekly player about 0.4', () => {
    expect(activeWeightOf(R, 0, 0)).toBe(1);
    expect(activeWeightOf(R, 1, 7)).toBeCloseTo(R.commons.weight.oneDay, 12);
    expect(activeWeightOf(R, 4, 7)).toBe(1);
    expect(activeWeightOf(R, 7, 7)).toBe(1);
    expect(activeWeightOf(R, 0, 7)).toBe(0);
    // Between one and four visits a week it rises in a straight line.
    expect(activeWeightOf(R, 2, 7)).toBeGreaterThan(activeWeightOf(R, 1, 7));
    expect(activeWeightOf(R, 3, 7)).toBeLessThan(1);
    // Days observed count at most a week.
    expect(activeWeightOf(R, 1, 70)).toBe(activeWeightOf(R, 1, 7));
  });

  it('keeps the last seven days in a mask that shifts with the days', () => {
    expect(maskDays(0b1010101)).toBe(4);
    expect(shiftMask(0b1, 10, 10)).toBe(0b1);
    expect(shiftMask(0b1, 10, 12)).toBe(0b100);
    expect(shiftMask(0b1000000, 10, 11)).toBe(0);
    expect(shiftMask(0b1111111, 10, 17)).toBe(0);
    // A clock that went back drops nothing.
    expect(shiftMask(0b101, 10, 8)).toBe(0b101);
  });
});

describe('projects (V-COM-5, 11, 15)', () => {
  it('scale with the weight more slowly than the player count, and each level is bigger, then cosmetic', () => {
    expect(projectSize(R, 2, 16) / projectSize(R, 2, 8)).toBeCloseTo(
      2 ** R.commons.sizeExponent,
      9,
    );
    expect(projectSize(R, 2, 16) / projectSize(R, 2, 8)).toBeLessThan(2);
    // A lone player counts as one (the weight never sizes a project below one player's).
    expect(projectSize(R, 2, 0.2)).toBe(projectSize(R, 2, 1));
    for (let level = 2; level < R.commons.maxLevel - 1; level++) {
      expect(projectSize(R, level + 1, 8)).toBeGreaterThan(projectSize(R, level, 8));
    }
    expect(projectSize(R, R.commons.maxLevel, 8)).toBeCloseTo(
      R.commons.baseSize * R.commons.cosmeticFactor,
      6,
    );
  });

  it('start small enough to finish early (V-COM-15): the first level is a fraction of the second', () => {
    expect(projectSize(R, 1, 8)).toBeLessThan(projectSize(R, 2, 8) / 5);
  });

  it('are made of three parts that add up to the size and all need to be full', () => {
    const size = projectSize(R, 2, 8);
    const need = partNeeds(R, size);
    expect(
      need.acorns * R.commons.giftValue.acorns +
        need.scrap * R.commons.giftValue.scrap +
        need.shards * R.commons.giftValue.shards,
    ).toBeCloseTo(size, 6);
    const have = { acorns: need.acorns, scrap: need.scrap, shards: 0 };
    expect(projectDone(R, size, have)).toBe(false);
    expect(partRoom(R, size, have, 'acorns')).toBe(0);
    expect(partRoom(R, size, have, 'shards')).toBeCloseTo(need.shards, 9);
    expect(projectProgress(R, size, { ...have, shards: need.shards * 5 })).toBeCloseTo(size, 6);
    expect(projectDone(R, size, { ...have, shards: need.shards })).toBe(true);
    // A part never counts past what it needs.
    expect(projectProgress(R, size, { acorns: need.acorns * 9, scrap: 0, shards: 0 })).toBeCloseTo(
      need.acorns * R.commons.giftValue.acorns,
      9,
    );
  });

  it("count a place's own shards in full and any other at the exchange rate", () => {
    expect(shardUnits(7, true, 3)).toBe(7);
    expect(shardUnits(7, false, 3)).toBe(2);
    expect(shardUnits(2, false, 3)).toBe(0);
  });

  it('open in the guided order: the hearth, then the Forge, then the rest', () => {
    const level: Record<string, number> = {};
    const of = (id: string): number => level[id] ?? 1;
    expect(R.commons.places.filter((id) => mayOpenProject(R, id, of))).toEqual(['bonfire']);
    level['bonfire'] = 2;
    expect(R.commons.places.filter((id) => mayOpenProject(R, id, of))).toEqual([
      'bonfire',
      'forge',
    ]);
    level['forge'] = 2;
    expect(R.commons.places.filter((id) => mayOpenProject(R, id, of))).toEqual(R.commons.places);
    expect(mayOpenProject(R, 'market', of)).toBe(false);
  });

  it("turn a value into the parts in the project's own proportions", () => {
    const units = valueToUnits(R, 100);
    expect(
      units.acorns * R.commons.giftValue.acorns +
        units.scrap * R.commons.giftValue.scrap +
        units.shards * R.commons.giftValue.shards,
    ).toBeCloseTo(100, 9);
    expect(communalValue(R, 10)).toBeCloseTo(10 * R.commons.communalPerHour, 12);
  });
});

describe('the fire (V-COM-13) and the hearth (V-BON-7)', () => {
  it('starts at the rules, warms in whole thousandths, and its level is the whole levels', () => {
    expect(fireLevelOf(fireStartMilli(R))).toBe(R.fire.start);
    expect(warmthMilli(R, 'place')).toBe(Math.round(R.fire.warmth.placeLevel * 1000));
    expect(warmthMilli(R, 'forge')).toBe(Math.round(R.fire.warmth.forgeLevel * 1000));
    expect(warmthMilli(R, 'collection')).toBe(Math.round(R.fire.warmth.collection * 1000));
    expect(warmthMilli(R, 'cosmetic')).toBe(Math.round(R.fire.warmth.cosmetic * 1000));
    expect(warmthMilli(R, 'boss')).toBe(Math.round(R.fire.warmth.bossKill * 1000));
    expect(fireLevelOf(fireStartMilli(R) + 1499)).toBe(R.fire.start + 1);
    expect(fireLevelOf(fireStartMilli(R) + 1500)).toBe(R.fire.start + 1);
    expect(fireLevelOf(fireStartMilli(R) + 2000)).toBe(R.fire.start + 2);
  });

  it('names the next modifier threshold above the level', () => {
    expect(nextThreshold(R, 10)).toBe(25);
    expect(nextThreshold(R, 25)).toBe(50);
    expect(nextThreshold(R, 80)).toBeNull();
  });

  it("raises the hearth's growth a little with the bonfire's level", () => {
    expect(hearthBp(R, 1)).toBe(10_000);
    expect(hearthBp(R, 3)).toBe(10_800);
  });
});

describe('collections (V-COM-12)', () => {
  it('set a find into the first open socket of its kind on any board, in the valley order, then run out', () => {
    const filled = new Set<string>();
    const set = (source: string): string | null => {
      const at = socketFor(R, R.commons.places, filled, source);
      if (at === null) return null;
      filled.add(`${at.place}:${String(at.socket)}`);
      return at.place;
    };
    expect(set('keystone:tidepools')).toBe('forge');
    expect(set('keystone:tidepools')).toBe('signpost');
    expect(set('keystone:tidepools')).toBeNull();
    // A find no board asks for sets nothing.
    expect(set('keystone:nowhere')).toBeNull();
    // Everyday finds go to the first board that wants one (the bonfire's).
    expect(set('everyday')).toBe('bonfire');
  });
});

describe('communal seats in the lazy pass (V-POST-13, V-COM-14)', () => {
  const state = (): SettleState => ({
    settledAt: 0,
    lastVisitAt: 0,
    hearth: 1,
    creatures: [{ xp: 0, carry: 0, capXp: Infinity }],
    communal: [{ id: 'c', creature: 0, storeHours: 0 }],
  });
  const hours = (s: SettleState): number => s.communal?.[0]?.storeHours ?? 0;

  it('gather effective hours into the store, up to its size', () => {
    expect(hours(settle(state(), 0, 10 * H, [{ at: 10 * H, kind: 'visit' }]))).toBeCloseTo(10, 9);
    expect(hours(settle(state(), 0, 500 * H, []))).toBe(R.posts.storeHours);
  });

  it('give the same store for any split of the time, and nothing for a second pass at the same moment', () => {
    const once = settle(state(), 0, 30 * H, []);
    const a = settle(state(), 0, 7 * H, []);
    const b = settle(a, 7 * H, 19 * H + 17, []);
    const c = settle(b, 19 * H + 17, 30 * H, []);
    expect(hours(c)).toBeCloseTo(hours(once), 6);
    expect(settle(once, 30 * H, 30 * H, []).communal).toEqual(once.communal);
  });

  it('follow the away steps, and pause while their creature is away (a raid) or before it has joined', () => {
    // A week away: the share steps down, so the store holds less than the hours.
    const week = settle(state(), 0, 100 * H, []);
    expect(hours(week)).toBe(R.posts.storeHours);
    const away = settle(state(), 0, 10 * H, [], {
      away: [{ creature: 0, from: 2 * H, to: 6 * H }],
    });
    expect(hours(away)).toBeCloseTo(6, 9);
    const later: SettleState = {
      ...state(),
      creatures: [{ xp: 0, carry: 0, capXp: Infinity, joinedAt: 4 * H }],
    };
    expect(hours(settle(later, 0, 10 * H, []))).toBeCloseTo(6, 9);
    // An empty seat gathers nothing.
    const empty: SettleState = { ...state(), communal: [{ id: 'c', creature: -1, storeHours: 0 }] };
    expect(hours(settle(empty, 0, 10 * H, []))).toBe(0);
  });
});

describe('the commons view', () => {
  it('is a strict object', () => {
    const view = {
      places: [],
      collections: [],
      fire: { level: 10, milli: 10_000, next: 25, recent: [] },
      hearthBp: 10_000,
      keystones: { found: 0, meanDays: 21 },
      communal: [],
    };
    expect(v.safeParse(ValleyCommonsViewSchema, view).success).toBe(true);
    expect(v.safeParse(ValleyCommonsViewSchema, { ...view, extra: 1 }).success).toBe(false);
    expect(
      v.safeParse(ValleyCommonsViewSchema, { ...view, fire: { ...view.fire, level: -1 } }).success,
    ).toBe(false);
  });
});

describe('the wear rule (V-GEAR-3)', () => {
  const charm = { slot: 'charm' as const, tag: 'ember' as const, itemLevel: 10 };
  const rookie = { level: 1, role: 'payoff' as const };
  it('refuses a level-10 Charm on a level-1 creature unless relaxed', () => {
    expect(wearBlock(charm, rookie)).not.toBeNull();
    expect(wearBlock(charm, rookie, true)).toBeNull();
  });
});
