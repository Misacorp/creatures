import { RULES, craftCost, craftItemLevel, dismantleRange, jobDuration } from '@creatures/game';
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
  bulkPick,
  busyReason,
  defaultPick,
  detailLines,
  dismantleDurationFor,
  dismantleLines,
  durationFor,
  equipBestText,
  equipChoices,
  expeditionBlocked,
  gearName,
  gearShare,
  grantsForWeek,
  isFestivalBase,
  itemLabel,
  RARITY_ORDER,
  jobProgress,
  jobResultRarity,
  jobTitle,
  jobVerb,
  lineIdle,
  linePips,
  lootIsEmpty,
  lootItemName,
  marksText,
  missingParts,
  needsText,
  noticeLines,
  oddsPercent,
  oddsText,
  openJobs,
  originText,
  partsText,
  pickerOptions,
  rangeText,
  reachName,
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
import type { GearItem, GrantLoot } from './gear-types';

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
      scrap: 100 - gear.parts.scrap,
      glimmer: 9 - gear.parts.glimmer,
      'grove-shard': 1,
    });
    expect(missingParts(gear.parts, { scrap: gear.parts.scrap })).toEqual({});
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
    // Every line of the worn fixture items is at work; one marked as not is idle (an off-element Attunement).
    const lines = gear.items.flatMap((i) => i.lines);
    expect(lines.filter(lineIdle)).toEqual([]);
    const off = { ...(lines[0] as (typeof lines)[number]), id: 'tide-attunement', active: false };
    expect([...lines, off].filter(lineIdle).map((l) => l.id)).toEqual(['tide-attunement']);
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
    // The Hat Sproutle wears is offered with its wearer; the epic Hat on Cindle is too high a level.
    expect(hats.find((c) => c.item.baseId === 'trail-cap')?.wornBy).toBe('Sproutle');
    const epic = hats.find((c) => c.item.baseId === 'emberkeepers-crown');
    expect(epic?.wornBy).toBe('Cindle');
    expect(epic?.blocked).toBe('Needs creature level 15.');
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
    expect(equipBestText({ changes: [], skipped: [] })).toBe(
      'Your gear is already the best it can be.',
    );
    expect(
      equipBestText({
        changes: [{ creatureId: 'c', slot: 'hat', itemId: 'i' }],
        skipped: [],
      }),
    ).toBe('Changed 1 slot.');
    expect(
      equipBestText({
        changes: [
          { creatureId: 'c', slot: 'hat', itemId: 'i' },
          { creatureId: 'c', slot: 'scarf', itemId: 'j' },
        ],
        skipped: [],
      }),
    ).toBe('Changed 2 slots.');
    // Busy creatures keep their gear, and the text says so.
    expect(equipBestText({ changes: [], skipped: [{ creatureId: 'a', reason: 'away' }] })).toBe(
      'Your gear is already the best it can be. 1 creature is busy, so its gear stayed.',
    );
    expect(
      equipBestText({
        changes: [{ creatureId: 'c', slot: 'hat', itemId: 'i' }],
        skipped: [
          { creatureId: 'a', reason: 'away' },
          { creatureId: 'b', reason: 'job' },
        ],
      }),
    ).toBe('Changed 1 slot. 2 creatures are busy, so their gear stayed.');
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
    expect(jobVerb('dismantle')).toBe('Dismantle');
    expect(jobTitle({ kind: 'craft', input: { baseId: 'kelp-cap', reach: 'epic' } })).toBe(
      'Craft Kelp Cap (Reach for Epic)',
    );
    expect(jobTitle({ kind: 'craft', input: { baseId: 'kelp-cap', reach: 'none' } })).toBe(
      'Craft Kelp Cap',
    );
    const item = { baseId: 'kelp-cap', rarity: 'common', itemLevel: 3 } as const;
    expect(jobTitle({ kind: 'dismantle', input: { items: [item] } })).toBe('Dismantle Kelp Cap');
    expect(jobTitle({ kind: 'dismantle', input: { items: [item, item, item] } })).toBe(
      'Dismantle 3 items',
    );
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
        reach: 'rare',
        upgraded: true,
        ...common,
      }),
    ).toBe('rare');
    expect(
      jobResultRarity({
        kind: 'dismantle',
        items: [{ baseId: 'kelp-cap', rarity: 'epic', itemLevel: 8 }],
        parts: { scrap: 9 },
        essence: 12,
        learned: [],
        marked: [],
        ...common,
      }),
    ).toBe('epic');
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
    expect(startBlocker(gear, free, { kind: 'craft', cost: craftCost('kelp-cap', 2) })).toBeNull();
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
    ).toBe(`Needs ${String(100 - gear.parts.scrap)} more Scrap and 1 more Grove Shard.`);
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
    const views = blueprintViews(gear.blueprints, gear.skills);
    // The price follows the item level of the best crafter (twice the Crafting level).
    const best = craftItemLevel(Math.max(1, ...gear.skills.map((s) => s.level)));
    expect(views.map((v) => v.baseId)).toEqual(['brine-hood', 'kelp-cap', 'trail-charm']);
    expect(views[1]?.cost).toEqual(craftCost('kelp-cap', best));
    // A better base asks for a Crafting level (a Brine Hood is item level 5: Crafting level 3).
    expect(views.map((v) => v.needsCraftingLevel)).toEqual([3, 1, 1]);
    const expert = blueprintViews(gear.blueprints, [
      { ...(gear.skills[0] as (typeof gear.skills)[number]), level: 10 },
    ]);
    expect(expert[1]?.cost).toEqual(craftCost('kelp-cap', 20));
    expect(views[1]).toMatchObject({ slot: 'hat', element: 'tide' });
    expect(views[2]?.element).toBeNull();
  });

  it('skips a blueprint whose base the content does not have', () => {
    expect(
      blueprintViews(
        [{ baseId: 'nope', learnedAt: 1, marks: 0, needsCraftingLevel: 1 }, ...gear.blueprints],
        gear.skills,
      ),
    ).toHaveLength(3);
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

  it('reads the stats, the local lines and the Festival flag the server sends, and refuses them gone', () => {
    const crown = gear.items.find((i) => i.baseId === 'emberkeepers-crown');
    // A Hat: Attack first, then HP, then its crit stat; the server's text is what the card shows.
    expect(crown?.stats.map((s) => s.stat)).toEqual(['atk', 'hp', 'critDamage']);
    expect(crown?.stats[0]?.text).toMatch(/^Attack \d+$/);
    expect(crown?.festival).toBe(false);
    // Local lines say so, in the server's words, and are flagged.
    const local = crown?.lines.filter((l) => l.local) ?? [];
    expect(local.length).toBeGreaterThan(0);
    for (const line of local) expect(line.text).toContain('(this item)');
    // A Charm has no stats.
    expect(gear.items.find((i) => i.slot === 'charm')?.stats).toEqual([]);
    for (const key of ['stats', 'festival']) {
      const bad = JSON.parse(JSON.stringify(gearState)) as typeof gearState;
      delete (bad.items[0] as unknown as Record<string, unknown>)[key];
      expect(() => parseGearState(bad), key).toThrow();
    }
    const noLocal = JSON.parse(JSON.stringify(gearState)) as typeof gearState;
    delete (noLocal.items[0]?.lines[0] as unknown as Record<string, unknown>)['local'];
    expect(() => parseGearState(noLocal)).toThrow();
    const oddStat = JSON.parse(JSON.stringify(gearState)) as typeof gearState;
    (oddStat.items[0]?.stats[0] as unknown as { stat: string }).stat = 'armor';
    expect(() => parseGearState(oddStat)).toThrow();
  });

  it('knows a Festival piece by its base, not by a rarity', () => {
    expect(isFestivalBase('festival-hearth-scarf')).toBe(true);
    expect(isFestivalBase('festival-lantern-charm')).toBe(true);
    expect(isFestivalBase('ember-muffler')).toBe(false);
    expect(isFestivalBase('nope')).toBe(false);
    expect(RARITY_ORDER).toEqual(['common', 'rare', 'epic']);
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

describe("writing the odds, the marks and the refund ranges (the numbers are the server's)", () => {
  it('writes basis points as exact percentages', () => {
    expect(oddsPercent(10_000)).toBe('100%');
    expect(oddsPercent(6_000)).toBe('60%');
    expect(oddsPercent(3_640)).toBe('36.4%');
    expect(oddsPercent(405)).toBe('4.05%');
    expect(oddsPercent(5)).toBe('0.05%');
    expect(oddsPercent(0)).toBe('0%');
  });

  it('lists only the rarities that can come out', () => {
    expect(oddsText({ common: 10_000, rare: 0, epic: 0 })).toBe('Common 100%');
    expect(oddsText({ common: 4_000, rare: 6_000, epic: 0 })).toBe('Common 40% · Rare 60%');
    expect(oddsText({ common: 1_365, rare: 5_140, epic: 3_495 })).toBe(
      'Common 13.65% · Rare 51.4% · Epic 34.95%',
    );
  });

  it('names the ways to craft and writes the marks as a count of the most', () => {
    expect([reachName('none'), reachName('rare'), reachName('epic')]).toEqual([
      'Plain craft',
      'Reach for Rare',
      'Reach for Epic',
    ]);
    expect(marksText(4)).toBe(`4 / ${String(RULES.gear.craft.marks.max)}`);
    expect(marksText(0)).toBe('0 / 10');
  });

  it('writes a range as one number when both ends are the same', () => {
    expect(rangeText({ min: 4, max: 8 })).toBe('4 to 8');
    expect(rangeText({ min: 1, max: 1 })).toBe('1');
  });

  it('writes what a dismantle can give, leaving out what it never gives', () => {
    expect(
      dismantleLines(dismantleRange([{ baseId: 'trail-cap', rarity: 'common', itemLevel: 1 }])),
    ).toEqual(['2 to 3 scrap']);
    expect(
      dismantleLines(dismantleRange([{ baseId: 'kelp-cap', rarity: 'rare', itemLevel: 10 }])),
    ).toEqual(['2 to 3 scrap', '1 Tide shard', '3 to 8 Essence']);
    expect(
      dismantleLines(dismantleRange([{ baseId: 'wardens-bell', rarity: 'epic', itemLevel: 20 }])),
    ).toEqual(['5 to 6 scrap', '1 to 2 shards (any kind)', '0 to 1 glimmer', '10 to 25 Essence']);
  });

  it('shows the time of a dismantle for the rarity and the worker', () => {
    expect(dismantleDurationFor('common', 1)).toBe(15 * 60_000);
    expect(dismantleDurationFor('rare', 1)).toBe(60 * 60_000);
    expect(dismantleDurationFor('epic', 1)).toBe(2 * 60 * 60_000);
    expect(dismantleDurationFor('epic', 5)).toBeLessThan(dismantleDurationFor('epic', 1));
  });
});

describe('dismantle several: picking by rarity and item level', () => {
  const make = (
    id: string,
    rarity: GearItem['rarity'],
    itemLevel: number,
    on: string | null = null,
  ) =>
    ({
      ...gear.items[0],
      id,
      rarity,
      itemLevel,
      equippedOn: on,
      createdAt: 0,
    }) as GearItem;
  const bag = [
    make('c9', 'common', 9),
    make('c2', 'common', 2),
    make('c3', 'common', 3),
    make('c4', 'common', 4),
    make('c5', 'common', 5),
    make('c6', 'common', 6),
    make('c1', 'common', 1, 'worn-by-someone'),
    make('r3', 'rare', 3),
    make('r1', 'rare', 1),
  ];

  it('takes the lowest levels first, at most one bundle of 5 Commons, and counts the rest', () => {
    const picked = bulkPick(bag, 'common', 20);
    expect(picked.ids).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
    expect(picked.matching).toBe(6);
    expect(bulkPick(bag, 'common', 4)).toEqual({ ids: ['c2', 'c3', 'c4'], matching: 3 });
  });

  it('never picks a worn item, and takes anything above Common one at a time', () => {
    expect(bulkPick(bag, 'common', 1)).toEqual({ ids: [], matching: 0 });
    expect(bulkPick(bag, 'rare', 20)).toEqual({ ids: ['r1'], matching: 2 });
    expect(bulkPick(bag, 'epic', 20)).toEqual({ ids: [], matching: 0 });
  });
});

describe('what a start needs besides parts', () => {
  const free = game.creatures.filter((c) => c.busy === null);

  it('says how much Essence is missing, with the parts that are', () => {
    const poor = { ...gear, balances: { bait: 0, essence: 10 } };
    expect(startBlocker(poor, free, { kind: 'craft', cost: {}, essence: 25 })).toBe(
      'Needs 15 more Essence.',
    );
    expect(startBlocker(poor, free, { kind: 'craft', cost: { scrap: 999 }, essence: 25 })).toMatch(
      /^Needs \d+ more Scrap and 15 more Essence\.$/,
    );
    expect(startBlocker(poor, free, { kind: 'craft', cost: {}, essence: 10 })).toBeNull();
  });

  it('does not ask a dismantle job for room in the bag', () => {
    const full = { ...gear, inventory: { cap: 60, used: 60, reserved: 0 } };
    expect(startBlocker(full, free, { kind: 'dismantle', cost: {} })).toBeNull();
    expect(startBlocker(full, free, { kind: 'craft', cost: {} })).toMatch(/bag is full/);
  });
});
