import { craftCost, jobDuration } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import collectionState from './fixtures/collection-state.json';
import expeditionLoot from './fixtures/expedition-claim-loot.json';
import gearNotice from './fixtures/gear-notice.json';
import gearState from './fixtures/gear-state.json';
import gearWelcome from './fixtures/gear-welcome.json';
import { parseGearState } from './gear-parse';
import {
  bagText,
  blueprintViews,
  busyReason,
  defaultPick,
  detailLines,
  durationFor,
  equipBestText,
  equipChoices,
  expeditionBlocked,
  gearName,
  gearShare,
  grantsForWeek,
  itemLabel,
  jobProgress,
  jobResultRarity,
  jobTitle,
  jobVerb,
  lineIdle,
  linePips,
  lootIsEmpty,
  lootItemName,
  missingParts,
  needsText,
  noticeLines,
  openJobs,
  originText,
  partsText,
  pickerOptions,
  pipsLabel,
  slotName,
  sortItems,
  startBlocker,
  supplyCraftViews,
  topCreatureIds,
  unequippedReason,
  wearReason,
  wornInOrder,
  wornItemOf,
} from './gear-view';
import type { GrantLoot } from './gear-types';

const gear = parseGearState(gearState);
const game = parseGameState(collectionState);
const [cindle, sproutle, zipmouse] = game.creatures as [Creature, Creature, Creature];

describe('names', () => {
  it('names items from the content and keeps an unknown id readable', () => {
    expect(gearName('kelp-cap')).toBe('Kelp Cap');
    expect(gearName('mystery')).toBe('mystery');
    expect(itemLabel('kelp-cap', 2)).toBe('Kelp Cap, item level 2');
    expect(slotName('scarf')).toBe('Scarf');
  });

  it('writes parts in words', () => {
    expect(partsText({ scrap: 6, 'ember-shard': 1 })).toBe('6 Scrap, 1 Ember Shard');
    expect(partsText({})).toBe('nothing');
  });

  it('finds what is short of a price', () => {
    expect(missingParts(gear.parts, { scrap: 100, glimmer: 9, 'grove-shard': 1 })).toEqual({
      scrap: 26,
      glimmer: 5,
      'grove-shard': 1,
    });
    expect(missingParts(gear.parts, { scrap: 74 })).toEqual({});
  });
});

describe('lines and their tiers', () => {
  it('draws a rolled line as pips, filled to its tier and open to what the item level could roll', () => {
    expect(linePips({ tier: 2, bestTier: 3 })).toEqual({ filled: 2, reach: 3, total: 5 });
    // A tier above the best the item level lists still shows in full.
    expect(linePips({ tier: 4, bestTier: 3 })).toEqual({ filled: 4, reach: 4, total: 5 });
    expect(linePips({ tier: 1, bestTier: null })).toEqual({ filled: 1, reach: 1, total: 5 });
    expect(pipsLabel({ filled: 3, reach: 4, total: 5 })).toBe('Tier 3 / 5');
  });

  it('draws no pips for a base line or a line without tiers', () => {
    expect(linePips({ tier: null, bestTier: null })).toBeNull();
  });

  it('knows a line that does nothing for the wearer, and one nobody wears yet', () => {
    expect(lineIdle({ active: false })).toBe(true);
    expect(lineIdle({ active: true })).toBe(false);
    expect(lineIdle({ active: null })).toBe(false);
    // The fixture's Tide Attunement is on a Cindle: an off-element piece, so it does nothing.
    const idle = gear.items.flatMap((i) => i.lines).filter(lineIdle);
    expect(idle.map((l) => l.id)).toContain('tide-attunement');
  });
});

describe('creatures, busy states and the picker', () => {
  it('reads busy and away from the collection', () => {
    expect(busyReason(cindle)).toBe('On a job in the Workshop');
    expect(busyReason(sproutle)).toBeNull();
    expect(busyReason({ busy: { kind: 'expedition', id: 'e' }, away: true })).toBe(
      'Away on an expedition',
    );
    expect(busyReason({ busy: null, away: true })).toBe('Away on an expedition');
  });

  it('lists free creatures first, best crafter first, and marks the busy one', () => {
    const options = pickerOptions(game.creatures, gear.skills, durationFor);
    expect(options.map((o) => o.creature.id)).toEqual([sproutle.id, zipmouse.id, cindle.id]);
    expect(options[0]?.durationMs).toBe(jobDuration(1));
    expect(options[2]?.busy).toBe('On a job in the Workshop');
    expect(defaultPick(options)).toBe(sproutle.id);
    // A higher Crafting level makes the job shorter.
    expect(durationFor(3)).toBeLessThan(durationFor(1));
  });

  it('has no default when everyone is busy', () => {
    const busyAll = game.creatures.map((c) => ({ ...c, busy: { kind: 'job', id: 'j' } as const }));
    expect(defaultPick(pickerOptions(busyAll, gear.skills, () => 1))).toBeNull();
  });

  it('shows the gear share of each stat and nothing when there is none', () => {
    expect(gearShare(zipmouse)).toEqual(
      gearShare({ stats: zipmouse.stats, statsWithGear: zipmouse.statsWithGear }),
    );
    expect(
      gearShare({
        stats: { hp: 100, atk: 50, spd: 30 },
        statsWithGear: { hp: 100, atk: 62, spd: 31 },
      }),
    ).toEqual([
      { stat: 'atk', amount: 12 },
      { stat: 'spd', amount: 1 },
    ]);
    expect(
      gearShare({
        stats: { hp: 100, atk: 50, spd: 30 },
        statsWithGear: { hp: 100, atk: 50, spd: 30 },
      }),
    ).toEqual([]);
  });

  it('blocks an expedition for a creature on a job, with the reason', () => {
    const blocked = expeditionBlocked(game.creatures);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.creature.id).toBe(cindle.id);
    expect(blocked[0]?.reason).toContain('on a job');
  });

  it('picks the three strongest creatures for Equip best from the Workshop', () => {
    const ids = topCreatureIds(game.creatures);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set(game.creatures.map((c) => c.id)));
    expect(topCreatureIds(game.creatures.slice(0, 1))).toEqual([cindle.id]);
  });
});

describe('the wear rule', () => {
  const item = (slot: 'hat' | 'scarf' | 'charm', itemLevel: number, tag = 'neutral') =>
    ({ slot, itemLevel, tag }) as Parameters<typeof wearReason>[0];

  it('lets a creature wear what its level allows', () => {
    expect(wearReason(item('hat', 9), zipmouse)).toBeNull();
    expect(wearReason(item('scarf', 7), zipmouse)).toBeNull();
  });

  it('says why not, in words: the item level, the slot level and the role', () => {
    expect(wearReason(item('hat', 12), zipmouse)).toBe('Needs creature level 12.');
    expect(wearReason(item('charm', 5), zipmouse)).toBe('Charms open at level 13.');
    // A Guard's Bell on a Payoff (Cindle).
    expect(wearReason(item('charm', 6, 'guard'), cindle)).toBe('Only a Guard can wear this.');
  });

  it('says what an item asks of its wearer', () => {
    expect(needsText({ needs: { level: 12, role: null } })).toBe('Level 12');
    expect(needsText({ needs: { level: 13, role: 'guard' } })).toBe('Level 13, Guards only');
  });
});

describe('items', () => {
  it('sorts the rarest and highest item level first', () => {
    const sorted = sortItems(gear.items);
    expect(sorted[0]?.rarity).toBe('epic');
    expect(sorted.map((i) => i.rarity)).toEqual([
      'epic',
      'rare',
      'rare',
      'rare',
      'rare',
      'common',
      'common',
      'common',
    ]);
    const rares = sorted.filter((i) => i.rarity === 'rare');
    expect(rares.map((i) => i.itemLevel)).toEqual([16, 13, 12, 10]);
  });

  it('offers a creature the items of one slot but its own, the ones it can wear first, saying who has each', () => {
    const hats = equipChoices(gear.items, zipmouse, game.creatures, 'hat');
    expect(hats.every((c) => c.item.slot === 'hat')).toBe(true);
    // Its own hat is not offered; the epic hat on Cindle is, and it is too high a level.
    expect(hats.some((c) => c.item.baseId === 'trail-cap')).toBe(false);
    const epic = hats.find((c) => c.item.baseId === 'coal-warm-cap');
    expect(epic?.wornBy).toBe('Cindle');
    expect(epic?.blocked).toBe('Needs creature level 14.');
    // Items it can wear come first.
    const firstBlocked = hats.findIndex((c) => c.blocked !== null);
    expect(hats.slice(firstBlocked).every((c) => c.blocked !== null)).toBe(true);
    const free = hats.find((c) => c.item.baseId === 'kelp-cap');
    expect(free?.blocked).toBeNull();
    expect(free?.wornBy).toBeNull();
  });

  it('writes the bag as used of cap with held places', () => {
    expect(bagText({ cap: 60, used: 5, reserved: 0 })).toBe('5 / 60');
    expect(bagText(gear.inventory)).toBe('8 / 60 (1 held for a craft)');
  });

  it('says what Equip best did', () => {
    expect(equipBestText({ changes: [] })).toBe('Your gear is already the best it can be.');
    expect(equipBestText({ changes: [{ creatureId: 'c', slot: 'hat', itemId: 'i' }] })).toBe(
      'Changed 1 slot.',
    );
    expect(
      equipBestText({
        changes: [
          { creatureId: 'c', slot: 'hat', itemId: 'i' },
          { creatureId: 'c', slot: 'scarf', itemId: 'j' },
        ],
      }),
    ).toBe('Changed 2 slots.');
  });
});

describe('the details row', () => {
  it('says where an item came from, by origin and by source', () => {
    expect(originText({ kind: 'raid', boss: 'tidal-colossus', rank: 3 }, 'raid_finale')).toBe(
      'Raid finale: Tidal Colossus, rank 3',
    );
    expect(originText({ kind: 'dungeon', depth: 7 }, 'dungeon')).toBe('Daily dungeon, depth 7');
    expect(originText({ kind: 'trip', place: 'ember-caves', rank: 4 }, 'expedition')).toBe(
      'Expedition to Ember Caves, explorer rank 4',
    );
    expect(originText({ kind: 'craft' }, 'craft')).toBe('Crafted in the Workshop');
    expect(originText({ kind: 'welcome' }, 'welcome')).toBe('Welcome gift');
    expect(originText({ kind: 'converted' }, 'converted')).toBe('Made from your old gear');
    // An item from before origins were stored falls back to its source.
    expect(originText(null, 'raid_finale')).toBe('Raid finale');
    expect(originText(null, 'something-new')).toBe('');
  });

  it('adds who made it and when, or the day it arrived', () => {
    const made = gear.items.find((i) => i.madeBy !== null);
    expect(made).toBeDefined();
    if (made === undefined) return;
    const lines = detailLines(made);
    expect(lines).toContain('Crafted in the Workshop');
    expect(lines.at(-1)).toBe('Made by Zipmouse on 2027-01-12');
    const plain = gear.items.find((i) => i.madeBy === null);
    expect(plain && detailLines(plain).at(-1)).toMatch(/^Got it on 20\d\d-\d\d-\d\d$/);
  });
});

describe('the conversion card', () => {
  const notice = parseGearState(gearNotice).notice;

  it('says what changed in short lines, and nothing that did not happen', () => {
    expect(notice).not.toBeNull();
    if (notice === null) return;
    const lines = noticeLines(notice);
    expect(lines[0]).toBe('Your 3 worn items became new items.');
    expect(lines.some((l) => l.includes('742'))).toBe(true);
    expect(lines.some((l) => l.includes('Scrap'))).toBe(true);
    expect(lines.some((l) => l.includes('blueprints'))).toBe(true);
    expect(lines.some((l) => l.includes('job'))).toBe(false);
    expect(
      noticeLines({
        converted: 0,
        unequipped: [],
        refundedItems: 0,
        parts: {},
        essence: 0,
        blueprints: 0,
        retiredJobs: 2,
      }),
    ).toHaveLength(1);
  });

  it('says why a worn item came off', () => {
    expect(
      unequippedReason({
        id: 'i',
        baseId: 'static-charm',
        slot: 'charm',
        itemLevel: 4,
        reason: 'slot_locked',
        needs: 13,
      }),
    ).toBe('Charms open at creature level 13');
    expect(
      unequippedReason({
        id: 'i',
        baseId: 'static-charm',
        slot: 'charm',
        itemLevel: 9,
        reason: 'item_level',
        needs: 9,
      }),
    ).toBe('its creature needs level 9 to wear it');
    expect(
      unequippedReason({
        id: 'i',
        baseId: 'wardens-bell',
        slot: 'charm',
        itemLevel: 9,
        reason: 'role',
        needs: null,
      }),
    ).toBe('its creature has the wrong role for it');
  });
});

describe('jobs', () => {
  const running = gear.jobs[0];
  if (running === undefined) throw new Error('fixture has no job');

  it('moves from 0 to 100 and is ready at the end', () => {
    expect(jobProgress(running, running.startedAt)).toEqual({
      pct: 0,
      remainingMs: running.endsAt - running.startedAt,
      ready: false,
    });
    const half = running.startedAt + (running.endsAt - running.startedAt) / 2;
    expect(jobProgress(running, half).pct).toBe(50);
    expect(jobProgress(running, half).ready).toBe(false);
    expect(jobProgress(running, running.endsAt)).toEqual({ pct: 100, remainingMs: 0, ready: true });
    expect(jobProgress(running, running.endsAt + 5000).remainingMs).toBe(0);
  });

  it('moves in steps of a tenth so a bar can be smooth', () => {
    const total = running.endsAt - running.startedAt;
    expect(jobProgress(running, running.startedAt + total / 3).pct).toBe(33.3);
    expect(jobProgress(running, running.startedAt - 1000).pct).toBe(0);
  });

  it('counts a job the server calls ready, whatever the clock says', () => {
    expect(jobProgress({ ...running, status: 'ready' }, running.startedAt).ready).toBe(true);
  });

  it('lists open jobs, soonest end first, and drops claimed ones', () => {
    const open = openJobs(gear.jobs);
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe('running');
    const two = openJobs([
      { ...running, id: 'late', endsAt: 20 },
      { ...running, id: 'soon', endsAt: 10 },
      { ...running, id: 'done', status: 'claimed' },
    ]);
    expect(two.map((j) => j.id)).toEqual(['soon', 'late']);
  });

  it('titles each kind of job, and a job from before gear v2 plainly', () => {
    expect(jobTitle({ kind: 'craft', input: { baseId: 'kelp-cap' } })).toBe('Craft Kelp Cap');
    expect(jobTitle({ kind: 'supply', input: { supplyId: 'lure-basic' } })).toMatch(/^Craft /);
    expect(jobTitle({ kind: 'improve', input: {} })).toBe('Old job (its parts come back)');
    expect(jobVerb('craft')).toBe('Craft');
    expect(jobVerb('enchant')).toBe('Old job');
  });

  it('frames a finished job with the craft rarity, the supply tier or Common', () => {
    const common = { xp: 1, skillXp: 1, skillLevel: 1, leveledUp: false };
    expect(
      jobResultRarity({
        kind: 'craft',
        gearId: 'x',
        baseId: 'kelp-cap',
        rarity: 'rare',
        itemLevel: 4,
        upgraded: true,
        ...common,
      }),
    ).toBe('rare');
    expect(
      jobResultRarity({ kind: 'retired', was: 'improve', refund: { scrap: 6 }, ...common }),
    ).toBe('common');
    expect(jobResultRarity({ kind: 'supply', supplyId: 'lure-basic', amount: 1, ...common })).toBe(
      'common',
    );
  });
});

describe('starting a job', () => {
  const free = game.creatures.filter((c) => c.busy === null);

  it('can start when a slot, a creature and the parts are there', () => {
    expect(startBlocker(gear, free, { kind: 'craft', cost: craftCost('kelp-cap') })).toBeNull();
  });

  it('says why not, in words, in this order', () => {
    const full = { ...gear, slots: { total: 2, used: 2 } };
    expect(startBlocker(full, free, { kind: 'craft', cost: {} })).toContain('All 2 workshop slots');
    expect(startBlocker(gear, [cindle], { kind: 'craft', cost: {} })).toContain(
      'No creature is free',
    );
    expect(
      startBlocker({ ...gear, inventory: { cap: 60, used: 59, reserved: 1 } }, free, {
        kind: 'craft',
        cost: {},
      }),
    ).toContain('bag is full');
    expect(
      startBlocker(gear, free, { kind: 'craft', cost: { 'grove-shard': 1, scrap: 100 } }),
    ).toBe('Needs 26 more Scrap and 1 more Grove Shard.');
  });

  it('stops a lure for want of Bait, and says how much more', () => {
    const poor = { ...gear, balances: { ...gear.balances, bait: 5 } };
    expect(startBlocker(poor, free, { kind: 'supply', cost: { scrap: 2 }, bait: 12 })).toBe(
      'Needs 7 more Bait.',
    );
    const rich = { ...gear, balances: { ...gear.balances, bait: 12 } };
    expect(startBlocker(rich, free, { kind: 'supply', cost: { scrap: 2 }, bait: 12 })).toBeNull();
    // The parts come first in the order of reasons.
    expect(startBlocker(poor, free, { kind: 'supply', cost: { scrap: 999 }, bait: 12 })).toContain(
      'more Scrap',
    );
  });

  it('shows the Bait of a lure craft, and none for the other supplies', () => {
    const views = supplyCraftViews({});
    for (const v of views) {
      expect(v.bait > 0, v.id).toBe(v.kind === 'lure');
    }
  });

  it('does not stop a supply for a full bag (no new item)', () => {
    const fullBag = { ...gear, inventory: { cap: 60, used: 60, reserved: 0 } };
    expect(startBlocker(fullBag, free, { kind: 'supply', cost: { scrap: 3 } })).toBeNull();
  });
});

describe('blueprints', () => {
  it('lists the known blueprints by slot and name, with the shared-rules craft price', () => {
    const views = blueprintViews(gear.blueprints);
    expect(views.map((v) => v.baseId)).toEqual(['kelp-cap', 'trail-charm']);
    expect(views[0]?.cost).toEqual(craftCost('kelp-cap'));
    expect(views[0]).toMatchObject({ slot: 'hat', element: 'tide' });
    expect(views[1]?.element).toBeNull();
  });

  it('skips a blueprint whose base the content does not have', () => {
    expect(
      blueprintViews([{ baseId: 'nope', learnedAt: 1, marks: 0 }, ...gear.blueprints]),
    ).toHaveLength(2);
  });
});

describe('grants and loot', () => {
  it('finds the finale and Festival grants of one week, and only that week', () => {
    const w1 = grantsForWeek(gear.grants, '2027-W01');
    expect(w1.finale?.key).toBe('raid:2027-W01:finale');
    expect(w1.festival?.key).toBe('festival:2027-W01');
    expect(w1.festival?.gear[0]?.baseId).toBe('festival-hearth-scarf');
    const w2 = grantsForWeek(gear.grants, '2027-W02');
    expect(w2).toEqual({ finale: null, festival: null });
    expect(grantsForWeek(parseGearState(gearWelcome).grants, '2027-W01')).toEqual({
      finale: null,
      festival: null,
    });
  });

  it('names a dropped item with its item level when it has one, and plainly otherwise', () => {
    expect(lootItemName({ baseId: 'trail-cap', itemLevel: 3 })).toBe(itemLabel('trail-cap', 3));
    // A grant stored before gear v2 has no item level.
    expect(lootItemName({ baseId: 'trail-cap' })).toBe(gearName('trail-cap'));
  });

  it('reads the item level a finale item arrived with, and still reads grants without one', () => {
    const w1 = grantsForWeek(gear.grants, '2027-W01');
    expect(w1.finale?.source).toBe('raid_finale');
    expect(w1.finale?.gear[0]?.itemLevel).toBe(6);
    const bad = JSON.parse(JSON.stringify(gearState)) as typeof gearState;
    const record = bad.grants.find((g) => g.source === 'raid_finale');
    (record?.gear[0] as { itemLevel: unknown }).itemLevel = -2;
    expect(() => parseGearState(bad)).toThrow();
    (record?.gear[0] as { itemLevel: unknown }).itemLevel = 'two';
    expect(() => parseGearState(bad)).toThrow();
    delete (record?.gear[0] as { itemLevel?: unknown }).itemLevel;
    expect(() => parseGearState(bad)).not.toThrow();
  });

  it('knows an empty grant', () => {
    expect(lootIsEmpty({ gear: [], converted: [], parts: {}, blueprints: [] })).toBe(true);
    expect(lootIsEmpty(expeditionLoot.result.loot as GrantLoot)).toBe(false);
  });
});

describe('wornItemOf', () => {
  it('takes the text of the lines from the gear view item with the same id, as the creature card does', () => {
    const item = gear.items[0];
    if (item === undefined) throw new Error('fixture has no items');
    const worn = {
      id: item.id,
      baseId: item.baseId,
      slot: item.slot,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
    };
    expect(wornItemOf(worn, gear.items)).toEqual({
      baseId: item.baseId,
      slot: item.slot,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
      lines: item.lines.map((l) => l.text),
    });
  });

  it('has no lines while the gear view has not loaded, or for an item it does not list', () => {
    const worn = {
      id: 'nope',
      baseId: 'kelp-cap',
      slot: 'hat' as const,
      rarity: 'rare' as const,
      itemLevel: 2,
    };
    expect(wornItemOf(worn, undefined)).toEqual({
      baseId: 'kelp-cap',
      slot: 'hat',
      rarity: 'rare',
      itemLevel: 2,
    });
    expect(wornItemOf(worn, gear.items)).not.toHaveProperty('lines');
  });

  it('lists what a creature wears in slot order', () => {
    const worn = [{ slot: 'charm' as const }, { slot: 'hat' as const }, { slot: 'scarf' as const }];
    expect(wornInOrder(worn).map((w) => w.slot)).toEqual(['hat', 'scarf', 'charm']);
  });
});
