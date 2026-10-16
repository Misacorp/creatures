import { craftCost, enchantCost, jobDuration } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import { parseGameState, type Creature } from './api';
import collectionState from './fixtures/collection-state.json';
import expeditionLoot from './fixtures/expedition-claim-loot.json';
import gearState from './fixtures/gear-state.json';
import gearWelcome from './fixtures/gear-welcome.json';
import { parseGearState } from './gear-parse';
import {
  bagText,
  blueprintViews,
  busyReason,
  defaultPick,
  durationFor,
  enchantChoices,
  enchantStatus,
  enchantWhen,
  equipChoices,
  expeditionBlocked,
  formatBonus,
  gearName,
  gearShare,
  grantsForWeek,
  improveMessage,
  itemLabel,
  jobProgress,
  jobResultRarity,
  jobTitle,
  lootIsEmpty,
  lootItemName,
  missingParts,
  openJobs,
  partsText,
  pickerOptions,
  sortItems,
  startBlocker,
  statText,
  upgradeStatus,
  wornItemOf,
} from './gear-view';
import type { GrantLoot } from './gear-types';

const gear = parseGearState(gearState);
const game = parseGameState(collectionState);
const [cindle, sproutle, zipmouse] = game.creatures as [Creature, Creature, Creature];

describe('names and numbers', () => {
  it('shows percentages for Attack, HP and speed and points for the crit stats', () => {
    expect(formatBonus('atk', 502)).toBe('+5%');
    expect(formatBonus('hp', 298)).toBe('+3%');
    expect(formatBonus('spd', 120)).toBe('+1.2%');
    expect(formatBonus('critChance', 241)).toBe('+2.4 points');
    expect(formatBonus('critDamage', 882)).toBe('+8.8 points');
    expect(statText('atk', 520)).toBe('+5.2% ATK');
  });

  it('names items from the content and keeps an unknown id readable', () => {
    expect(gearName('wave-band')).toBe('Wave Band');
    expect(gearName('mystery')).toBe('mystery');
    expect(itemLabel('wave-band', 2)).toBe('Wave Band +2');
  });

  it('writes parts in words', () => {
    expect(partsText({ scrap: 6, 'ember-shard': 1 })).toBe('6 Scrap, 1 Ember Shard');
    expect(partsText({})).toBe('nothing');
  });

  it('finds what is short of a price', () => {
    expect(missingParts(gear.parts, { scrap: 100, glimmer: 3, 'grove-shard': 1 })).toEqual({
      scrap: 24,
      'grove-shard': 1,
    });
    expect(missingParts(gear.parts, { scrap: 76 })).toEqual({});
  });

  it('says who an enchant works for', () => {
    expect(enchantWhen(undefined)).toBe('Works for every creature.');
    expect(enchantWhen({ role: 'payoff' })).toBe('Only works for a Payoff.');
    expect(enchantWhen({ element: 'ember' })).toBe('Only works for Ember creatures.');
    expect(enchantStatus({ enchantId: null, enchantActive: null })).toBeNull();
    expect(enchantStatus({ enchantId: 'ember-fury', enchantActive: true })).toContain('Active');
    expect(enchantStatus({ enchantId: 'ember-fury', enchantActive: false })).toContain(
      'Not active',
    );
    expect(enchantStatus({ enchantId: 'ember-fury', enchantActive: null })).toContain('fitting');
  });

  it('offers every enchant of the content with its shared-rules price', () => {
    const choices = enchantChoices();
    expect(choices.length).toBeGreaterThanOrEqual(8);
    for (const c of choices) {
      expect(c.cost).toEqual(enchantCost(c.id));
      expect(c.effect.length).toBeGreaterThan(3);
    }
  });
});

describe('upgrade', () => {
  const rich = { balances: { bait: 0, essence: 500 }, parts: gear.parts };

  it('can be paid when Essence and scrap are enough', () => {
    const item = gear.items[0];
    expect(item).toBeDefined();
    if (item === undefined) return;
    expect(upgradeStatus(item, rich)).toEqual({ enabled: true, reason: null });
  });

  it('says what is missing, in words', () => {
    const cost = { essence: 30, scrap: 3 };
    const item = { upgradeCost: cost, maxLevel: 5 };
    expect(
      upgradeStatus(item, { balances: { bait: 0, essence: 10 }, parts: gear.parts }).reason,
    ).toBe('Needs 20 more Essence.');
    expect(
      upgradeStatus(item, {
        balances: { bait: 0, essence: 500 },
        parts: { ...gear.parts, scrap: 1 },
      }).reason,
    ).toBe('Needs 2 more scrap.');
    expect(
      upgradeStatus(item, { balances: { bait: 0, essence: 0 }, parts: { ...gear.parts, scrap: 0 } })
        .reason,
    ).toBe('Needs 30 more Essence and 3 more scrap.');
  });

  it('is disabled at the top level with a reason', () => {
    const status = upgradeStatus({ upgradeCost: null, maxLevel: 5 }, rich);
    expect(status.enabled).toBe(false);
    expect(status.reason).toContain('+5');
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
    const options = pickerOptions(game.creatures, gear.skills, (level) =>
      durationFor('craft', 'rare', level),
    );
    expect(options.map((o) => o.creature.id)).toEqual([zipmouse.id, sproutle.id, cindle.id]);
    expect(options[0]?.level).toBe(2);
    expect(options[0]?.durationMs).toBe(jobDuration('craft', 'rare', 2));
    expect(options[0]?.durationMs).toBeLessThan(options[1]?.durationMs ?? 0);
    expect(options[2]?.busy).toBe('On a job in the Workshop');
    expect(defaultPick(options)).toBe(zipmouse.id);
  });

  it('has no default when everyone is busy', () => {
    const busyAll = game.creatures.map((c) => ({ ...c, busy: { kind: 'job', id: 'j' } as const }));
    expect(defaultPick(pickerOptions(busyAll, gear.skills, () => 1))).toBeNull();
  });

  it('shows the gear share of each stat and nothing when there is none', () => {
    expect(gearShare(cindle)).toEqual([]);
    expect(
      gearShare({
        stats: { hp: 100, atk: 50, spd: 30 },
        statsWithGear: { hp: 100, atk: 62, spd: 31 },
      }),
    ).toEqual([
      { stat: 'atk', amount: 12 },
      { stat: 'spd', amount: 1 },
    ]);
  });

  it('blocks an expedition for a creature on a job, with the reason', () => {
    const blocked = expeditionBlocked(game.creatures);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.creature.id).toBe(cindle.id);
    expect(blocked[0]?.reason).toContain('on a job');
  });
});

describe('items', () => {
  it('sorts the rarest and highest level first', () => {
    const sorted = sortItems(gear.items);
    expect(sorted[0]?.rarity).toBe('epic');
    expect(sorted.map((i) => i.rarity)).toEqual(['epic', 'rare', 'rare', 'common', 'common']);
    const commons = sorted.filter((i) => i.rarity === 'common');
    expect(commons[0]?.level).toBeGreaterThanOrEqual(commons[1]?.level ?? 0);
  });

  it('offers a creature every item but its own, saying who has each', () => {
    const choices = equipChoices(gear.items, sproutle, game.creatures);
    expect(choices).toHaveLength(gear.items.length);
    expect(choices.find((c) => c.item.baseId === 'phoenix-trinket')?.wornBy).toBe('Cindle');
    expect(choices.find((c) => c.item.baseId === 'wave-band')?.wornBy).toBeNull();
    const own = equipChoices(gear.items, cindle, game.creatures);
    expect(own.some((c) => c.item.baseId === 'phoenix-trinket')).toBe(false);
  });

  it('writes the bag as used of cap with held places', () => {
    expect(bagText({ cap: 60, used: 5, reserved: 0 })).toBe('5 / 60');
    expect(bagText(gear.inventory)).toBe('5 / 60 (1 held for a craft)');
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

  it('titles each kind of job', () => {
    expect(jobTitle({ kind: 'craft', input: { baseId: 'wave-band' } }, gear.items)).toBe(
      'Craft Wave Band',
    );
    expect(
      jobTitle(
        { kind: 'improve', input: { gearId: 'd370f1f6-5940-44bc-9113-ced5efbe8d3e' } },
        gear.items,
      ),
    ).toBe('Improve Volt Band');
    expect(
      jobTitle(
        {
          kind: 'enchant',
          input: { gearId: '2e486da1-d4b1-477e-a3b3-c47a33da5703', enchantId: 'ember-fury' },
        },
        gear.items,
      ),
    ).toBe('Enchant Phoenix Trinket: Ember Fury');
    expect(jobTitle({ kind: 'improve', input: { gearId: 'gone' } }, gear.items)).toBe(
      'Improve an item',
    );
  });

  it('says what an improve changed', () => {
    const base = { stat: 'critDamage', bp: 240 } as const;
    const result = (to: { stat: 'critDamage' | 'atk'; bp: number }) =>
      ({
        kind: 'improve',
        gearId: 'g',
        baseId: 'volt-band',
        secondaryIndex: 0,
        from: base,
        to,
        xp: 20,
        skillXp: 20,
        skillLevel: 1,
        leveledUp: false,
      }) as const;
    expect(improveMessage(result({ stat: 'critDamage', bp: 300 }))).toContain('Better!');
    expect(improveMessage(result({ stat: 'critDamage', bp: 239 }))).toContain('A little lower');
    expect(improveMessage(result({ stat: 'critDamage', bp: 240 }))).toContain('same roll');
    expect(improveMessage(result({ stat: 'atk', bp: 400 }))).toContain('different stat');
  });

  it('frames a finished job with the craft rarity or the item rarity', () => {
    expect(
      jobResultRarity(
        {
          kind: 'craft',
          gearId: 'x',
          baseId: 'wave-band',
          rarity: 'epic',
          upgraded: true,
          xp: 1,
          skillXp: 1,
          skillLevel: 1,
          leveledUp: false,
        },
        gear.items,
      ),
    ).toBe('epic');
    expect(
      jobResultRarity(
        {
          kind: 'enchant',
          gearId: '2e486da1-d4b1-477e-a3b3-c47a33da5703',
          baseId: 'phoenix-trinket',
          enchantId: 'ember-fury',
          xp: 1,
          skillXp: 1,
          skillLevel: 1,
          leveledUp: false,
        },
        gear.items,
      ),
    ).toBe('epic');
  });
});

describe('starting a job', () => {
  const free = game.creatures.filter((c) => c.busy === null);

  it('can start when a slot, a creature and the parts are there', () => {
    expect(startBlocker(gear, free, { kind: 'craft', cost: craftCost('wave-band') })).toBeNull();
  });

  it('says why not, in words, in this order', () => {
    const full = { ...gear, slots: { total: 2, used: 2 } };
    expect(startBlocker(full, free, { kind: 'craft', cost: {} })).toContain('All 2 workshop slots');
    expect(startBlocker(gear, [cindle], { kind: 'craft', cost: {} })).toContain(
      'No creature is free',
    );
    expect(startBlocker(gear, free, { kind: 'improve', cost: {}, item: { jobId: 'j' } })).toBe(
      'This item is already in a job.',
    );
    expect(
      startBlocker({ ...gear, inventory: { cap: 60, used: 59, reserved: 1 } }, free, {
        kind: 'craft',
        cost: {},
      }),
    ).toContain('bag is full');
    expect(
      startBlocker(gear, free, { kind: 'craft', cost: { 'grove-shard': 1, scrap: 100 } }),
    ).toBe('Needs 24 more Scrap and 1 more Grove Shard.');
  });

  it('does not stop an improve for a full bag (no new item)', () => {
    const fullBag = { ...gear, inventory: { cap: 60, used: 60, reserved: 0 } };
    expect(startBlocker(fullBag, free, { kind: 'improve', cost: { scrap: 6 } })).toBeNull();
  });

  it('takes durations and prices from the shared rules', () => {
    expect(durationFor('enchant', 'epic', 1)).toBe(jobDuration('enchant', 'epic', 1));
  });
});

describe('blueprints', () => {
  it('lists the known blueprints, plainest first, with the shared-rules craft price', () => {
    const views = blueprintViews(gear.blueprints);
    expect(views.map((v) => v.baseId)).toEqual(['static-charm', 'wave-band']);
    expect(views[1]?.cost).toEqual(craftCost('wave-band'));
    expect(views[1]?.tint).toBe('tide');
  });

  it('skips a blueprint whose base the content does not have', () => {
    expect(
      blueprintViews([{ baseId: 'nope', rarity: 'common', learnedAt: 1 }, ...gear.blueprints]),
    ).toHaveLength(2);
  });
});

describe('grants and loot', () => {
  it('finds the finale and Festival grants of one week, and only that week', () => {
    const w1 = grantsForWeek(gear.grants, '2027-W01');
    expect(w1.finale?.key).toBe('raid:2027-W01:finale');
    expect(w1.festival?.key).toBe('festival:2027-W01');
    expect(w1.festival?.gear[0]?.baseId).toBe('hearth-band');
    const w2 = grantsForWeek(gear.grants, '2027-W02');
    expect(w2).toEqual({ finale: null, festival: null });
    expect(grantsForWeek(parseGearState(gearWelcome).grants, '2027-W01')).toEqual({
      finale: null,
      festival: null,
    });
  });

  it('names a dropped item with "+N" when it arrived upgraded, and plainly otherwise', () => {
    expect(lootItemName({ baseId: 'trail-charm', level: 3 })).toBe(itemLabel('trail-charm', 3));
    expect(lootItemName({ baseId: 'trail-charm', level: 3 })).toMatch(/ \+3$/);
    // A grant stored before the reward slot has no level, and +0 is not shown.
    expect(lootItemName({ baseId: 'trail-charm' })).toBe(gearName('trail-charm'));
    expect(lootItemName({ baseId: 'trail-charm', level: 0 })).toBe(gearName('trail-charm'));
  });

  it('reads the level a finale item arrived with, and still reads grants without one', () => {
    const w1 = grantsForWeek(gear.grants, '2027-W01');
    expect(w1.finale?.source).toBe('raid_finale');
    expect(w1.finale?.gear[0]?.level).toBe(1);
    expect(w1.festival?.gear[0]?.level).toBeUndefined();
    const bad = JSON.parse(JSON.stringify(gearState)) as typeof gearState;
    const record = bad.grants.find((g) => g.source === 'raid_finale');
    (record?.gear[0] as { level: unknown }).level = -2;
    expect(() => parseGearState(bad)).toThrow();
    (record?.gear[0] as { level: unknown }).level = 'two';
    expect(() => parseGearState(bad)).toThrow();
  });

  it('knows an empty grant', () => {
    expect(lootIsEmpty({ gear: [], converted: [], parts: {}, blueprints: [] })).toBe(true);
    expect(lootIsEmpty(expeditionLoot.result.loot as GrantLoot)).toBe(false);
  });
});

describe('wornItemOf', () => {
  it('takes the main stat from the gear view item with the same id, as the creature card does', () => {
    const item = gear.items[0];
    if (item === undefined) throw new Error('fixture has no items');
    const worn = {
      id: item.id,
      baseId: item.baseId,
      rarity: item.rarity,
      level: item.level,
      enchantId: null,
    };
    expect(wornItemOf(worn, gear.items)).toEqual({
      baseId: item.baseId,
      rarity: item.rarity,
      level: item.level,
      enchantId: null,
      primary: item.primary,
    });
  });

  it('has no main stat while the gear view has not loaded, or for an item it does not list', () => {
    const worn = {
      id: 'nope',
      baseId: 'bark-band',
      rarity: 'rare' as const,
      level: 2,
      enchantId: 'x',
    };
    expect(wornItemOf(worn, undefined)).toEqual({
      baseId: 'bark-band',
      rarity: 'rare',
      level: 2,
      enchantId: 'x',
    });
    expect(wornItemOf(worn, gear.items)).not.toHaveProperty('primary');
  });
});
