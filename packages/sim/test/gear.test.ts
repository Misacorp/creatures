import { describe, expect, it } from 'vitest';
import {
  RULES,
  applyGear,
  content,
  createSeededRng,
  craftCost,
  craftHours,
  dismantleHours,
  dismantleRange,
  dismantleXp,
  craftItemLevel,
  dismantleYield,
  droppableBases,
  finaleItemLevel,
  itemOf,
  jobDuration,
  jobXp,
  skillLevel,
  supplyDef,
  wearBlock,
  type GearRarity,
  type ItemLine,
} from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { gearMetrics } from '../src/analysis';
import {
  creaturePower,
  creatureStats,
  speciesOf,
  wearerOfCreature,
  wornOf,
  type OwnedCreature,
  type SimItem,
} from '../src/data';
import { checkIn, runEconomy } from '../src/economy';
import {
  allItems,
  GEAR_POLICY,
  claimJobs,
  grantFinaleLoot,
  grantItem,
  grantPhaseScrap,
  grantWelcomeKit,
  learnBlueprint,
  manageGear,
  startJobs,
  type GearContext,
} from '../src/gear';
import { fightFor, openRaidWeek } from '../src/raid';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import type { TripContext } from '../src/trips';

function creature(player: string, line: string, level = 14): OwnedCreature {
  return { id: `${player}/${line}`, line, speciesId: line, level, fusionCount: 0 };
}

/**
 * A player with a payoff (Cindle), a guard (Sproutle) and a setter (Splashet), all level 14 (every
 * slot open: Hat 1, Scarf 7, Charm 13), with a full stock of supplies (so the workshop starts no supply
 * job unless a test empties the stock).
 */
function player(id = 'p01'): SimPlayer {
  const p = createPlayer(id, 'P', 'daily', 1);
  p.joined = true;
  p.creatures.push(creature(id, 'cindle'), creature(id, 'sproutle'), creature(id, 'splashet'));
  p.supplies['lure-basic'] = GEAR_POLICY.supplyStock;
  return p;
}

let nextUid = 1000;
/** An item of a base with the lines given (tier 0 is tier I). */
function item(
  baseId: string,
  rarity: GearRarity,
  itemLevel: number,
  lines: readonly ItemLine[] = [],
): SimItem {
  return { ...itemOf(baseId, rarity, itemLevel, lines), uid: nextUid++ };
}

/** A check-in's context at 09:00 on day 0, with or without the gear context (a sim without gear). */
const tripCtx = (withGear: boolean): TripContext => ({
  hour: 9,
  day: 0,
  weekIndex: 0,
  catches: createSeededRng('checkin:catches'),
  talents: createSeededRng('checkin:talents'),
  trip: createSeededRng('checkin:trip'),
  ...(withGear ? { gear: ctx(9) } : {}),
});

const ctx = (hour = 9, seed = 'gear'): GearContext => ({
  rng: createSeededRng(seed),
  hour,
  day: Math.floor(hour / 24),
});

const three = (p: SimPlayer): [OwnedCreature, OwnedCreature, OwnedCreature] =>
  p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];

describe('gear in the fight slots', () => {
  it('folds the worn items into the slot like the worker (applyGear), and leaves others alone', () => {
    const p = player();
    const [cindle, sproutle] = three(p);
    cindle.items = {
      hat: item('trail-cap', 'common', 2, [{ id: 'attack', tier: 1 }]),
      charm: item('tidepool-charm', 'rare', 12, [{ id: 'tide-hunter', tier: 1 }]),
    };
    const boss = content.bosses[0];
    if (boss === undefined) throw new Error('no boss');
    const { fight } = fightFor(openRaidWeek(boss, [p]), 'phase1');
    const slot = (c: OwnedCreature) => {
      const found = fight.row.find((s) => s.id === c.id);
      if (found === undefined) throw new Error(`no slot for ${c.id}`);
      return found;
    };
    const species = speciesOf(cindle.speciesId);
    const expected = applyGear(
      creatureStats(cindle),
      species.crit,
      wearerOfCreature(cindle),
      wornOf(cindle),
    );
    expect(slot(cindle).stats).toEqual(expected.stats);
    expect(slot(cindle).crit).toEqual(expected.crit);
    expect(slot(cindle).mods).toEqual(expected.mods);
    expect(expected.mods?.vsElementBp).toBeDefined();
    expect(slot(cindle).stats?.atk ?? 0).toBeGreaterThan(creatureStats(cindle).atk);
    expect(slot(sproutle).stats).toEqual(creatureStats(sproutle));
    expect(slot(sproutle).mods).toBeUndefined();
  });

  it('counts gear in the power that picks the team', () => {
    const p = player();
    const [cindle, sproutle, splashet] = three(p);
    const plain = creaturePower(splashet);
    splashet.items = { hat: item('trail-cap', 'epic', 10, [{ id: 'attack', tier: 2 }]) };
    expect(creaturePower(splashet)).toBeGreaterThan(plain);
    expect(creaturePower(cindle)).toBe(creaturePower({ ...cindle }));
    expect(creaturePower(sproutle)).toBe(creaturePower({ ...sproutle }));
  });
});

describe('drops', () => {
  it('gives the welcome kit once: a common Hat at item level 1, a blueprint and scrap', () => {
    const p = player();
    grantWelcomeKit(p, createSeededRng('kit'), 3);
    expect(p.gear.bag).toHaveLength(1);
    expect(p.gear.bag[0]).toMatchObject({ rarity: 'common', slot: 'hat', itemLevel: 1 });
    expect(p.gear.blueprints).toHaveLength(1);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(RULES.gear.drops.welcomeScrap);
    expect(p.gear.joinDay).toBe(3);
    // The scrap pays for any craft.
    const blueprint = p.gear.blueprints[0] as string;
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(craftCost(blueprint, 2).scrap ?? 0);
  });

  it('pays phase scrap to participants of a cleared phase, and one roll per finale participant', () => {
    const a = player('p01');
    const b = player('p02');
    grantPhaseScrap([a, b], 'phase1');
    grantPhaseScrap([a], 'phase2');
    grantPhaseScrap([a, b], 'finale');
    expect(a.gear.parts.scrap).toBe(
      RULES.gear.drops.phaseScrap.phase1 + RULES.gear.drops.phaseScrap.phase2,
    );
    expect(b.gear.parts.scrap).toBe(RULES.gear.drops.phaseScrap.phase1);
    // The reward slot: exactly one gear piece or one new blueprint for each participant.
    const slot = (x: SimPlayer): number => allItems(x).length + x.gear.blueprints.length;
    const slotsBefore = [slot(a), slot(b)];
    grantFinaleLoot([a, b], 3, 'ember', null, createSeededRng('finale'));
    expect(slot(a) - (slotsBefore[0] ?? 0)).toBe(1);
    expect(slot(b) - (slotsBefore[1] ?? 0)).toBe(1);
    // A Festival week adds the Festival piece.
    const festivalBefore = allItems(a).filter((i) => i.rarity === 'festival').length;
    const before = slot(a);
    grantFinaleLoot([a], 3, 'ember', 'tide', createSeededRng('festival'));
    expect(slot(a) - before).toBe(2);
    expect(allItems(a).filter((i) => i.rarity === 'festival').length - festivalBefore).toBe(1);
  });

  it('gives finale gear its item level by rank and blueprints the player does not know', () => {
    expect(finaleItemLevel(1)).toBe(RULES.gear.itemLevel.finale.base + 1);
    // Over many seeds at a high rank: gear arrives at the rank's item level, a blueprint is never one already known.
    let gear = 0;
    let blueprints = 0;
    for (let k = 0; k < 200; k++) {
      const p = player(`f${String(k)}`);
      const known = new Set(p.gear.blueprints);
      const bagBefore = p.gear.bag.length;
      grantFinaleLoot([p], 9, 'grove', null, createSeededRng(`reward:${String(k)}`));
      if (p.gear.bag.length > bagBefore) {
        gear++;
        const dropped = p.gear.bag[p.gear.bag.length - 1];
        expect(dropped?.itemLevel).toBe(finaleItemLevel(9));
      } else {
        blueprints++;
        const added = p.gear.blueprints.filter((id) => !known.has(id));
        expect(added).toHaveLength(1);
        expect(p.gear.blueprints.length).toBe(known.size + 1);
      }
    }
    expect(blueprints).toBeGreaterThan(5);
    expect(gear).toBeGreaterThan(100);
  });

  it('turns a drop into its dismantle yield when the inventory is full, and a known blueprint into scrap', () => {
    const p = player();
    for (let i = 0; i < RULES.gear.inventoryCap; i++)
      p.gear.bag.push(item('trail-cap', 'common', 1));
    const scrap = p.gear.parts.scrap;
    const extra = item('trail-cap', 'rare', 5);
    grantItem(p, extra);
    expect(p.gear.bag).toHaveLength(RULES.gear.inventoryCap);
    expect(p.gear.parts.scrap - scrap).toBe(dismantleYield(extra).scrap ?? 0);
    // Every craftable blueprint is known: one that drops is a duplicate and adds a well-thumbed mark.
    p.gear.blueprints = droppableBases().map((b) => b.id);
    const known = p.gear.blueprints.length;
    const before = p.gear.parts.scrap;
    for (const id of [...p.gear.blueprints]) learnBlueprint(p, id);
    expect(p.gear.blueprints).toHaveLength(known);
    expect(p.gear.parts.scrap).toBe(before);
    expect(new Set(Object.values(p.gear.marks))).toEqual(new Set([1]));
    // At the most marks it turns into scrap.
    for (let i = 0; i < RULES.gear.craft.marks.max; i++) {
      for (const id of [...p.gear.blueprints]) learnBlueprint(p, id);
    }
    expect(new Set(Object.values(p.gear.marks))).toEqual(new Set([RULES.gear.craft.marks.max]));
    expect(p.gear.parts.scrap - before).toBe(known * RULES.gear.drops.duplicateBlueprintScrap);
  });
});

describe('equipping and dismantling', () => {
  it('wears what it can under the wear rule, one item per slot, and keeps the rest in the bag', () => {
    const p = player();
    const [cindle, sproutle, splashet] = three(p);
    sproutle.level = 5; // a Scarf opens at level 7, a Charm at 13
    splashet.level = 8; // a Charm still closed
    p.gear.bag.push(
      item('trail-cap', 'common', 2, [{ id: 'attack', tier: 0 }]),
      item('trail-cap', 'common', 20), // above every creature's level
      item('patch-scarf', 'common', 3),
      item('trail-charm', 'common', 3),
    );
    manageGear(p);
    for (const c of p.creatures) {
      for (const worn of wornOf(c)) {
        expect(wearBlock(worn, { level: c.level, role: wearerOfCreature(c).role })).toBeNull();
      }
    }
    expect(sproutle.items?.scarf).toBeUndefined();
    expect(sproutle.items?.charm).toBeUndefined();
    expect(splashet.items?.charm).toBeUndefined();
    // The level 20 hat waits in the bag (the player has nothing to wear it with).
    expect(p.gear.bag.some((i) => i.itemLevel === 20)).toBe(true);
    expect(allItems(p)).toHaveLength(4);
    // Nothing is worn twice and nothing in the bag is also worn.
    const worn = p.creatures.flatMap((c) => wornOf(c));
    expect(new Set(worn).size).toBe(worn.length);
    for (const bagged of p.gear.bag) expect(worn).not.toContain(bagged);
    // Everything that could be worn is worn: 3 hats could not all go (the one at 20 cannot).
    expect(worn.length).toBe(3);
    expect(cindle.items).toBeDefined();
  });

  it('puts a role-locked Charm only on its own role', () => {
    const p = player();
    const [cindle, sproutle, splashet] = three(p);
    p.gear.bag.push(item('wardens-bell', 'rare', 5), item('pounce-charm', 'rare', 5));
    manageGear(p);
    expect(sproutle.items?.charm?.baseId).toBe('wardens-bell');
    expect(cindle.items?.charm?.baseId).toBe('pounce-charm');
    expect(splashet.items?.charm).toBeUndefined();
  });

  it('moves a better item in from another creature and keeps hats on distinct creatures', () => {
    const p = player();
    const [cindle] = three(p);
    cindle.items = { hat: item('trail-cap', 'common', 1) };
    p.gear.bag.push(item('trail-cap', 'epic', 8, [{ id: 'attack', tier: 2 }]));
    manageGear(p);
    const hats = p.creatures.flatMap((c) => (c.items?.hat === undefined ? [] : [c.items.hat]));
    expect(hats).toHaveLength(2);
    expect(new Set(hats).size).toBe(2);
    expect(p.gear.bag).toHaveLength(0);
  });

  it('keeps the best spares in the bag and takes the rest apart in a dismantle job, Commons in a bundle of 5', () => {
    const p = player();
    for (let i = 0; i < 12; i++) {
      p.gear.bag.push(item('trail-cap', 'common', 2, [{ id: 'attack', tier: i % 2 }]));
    }
    manageGear(p);
    // Three hats are worn (one creature each); the 9 left wait for a job.
    expect(p.creatures.flatMap((c) => wornOf(c))).toHaveLength(3);
    expect(p.gear.bag).toHaveLength(9);
    expect(p.week.gearDismantled).toBe(0);
    startJobs(p, ctx(9), new Set());
    // The first job of a check-in crafts (nothing to craft with): the dismantle takes the slot.
    const job = p.gear.jobs[0];
    expect(job?.kind).toBe('dismantle');
    expect(job?.items).toHaveLength(RULES.gear.dismantle.bundleMax);
    // The items left the bag now, and the best spares are not among them.
    expect(p.gear.bag).toHaveLength(9 - RULES.gear.dismantle.bundleMax);
    expect(p.gear.parts.scrap).toBe(0);
    expect(job?.endsAtHour).toBeCloseTo(
      9 + jobDuration(1, 0, dismantleHours('common')) / 3_600_000,
      6,
    );
    // The claim rolls the refund inside the range and pays XP (at least 6).
    claimJobs(p, ctx(10));
    const range = dismantleRange(job?.items ?? []);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(range.scrap.min);
    expect(p.gear.parts.scrap).toBeLessThanOrEqual(range.scrap.max);
    expect(p.week.gearDismantled).toBe(RULES.gear.dismantle.bundleMax);
    expect(p.gear.skillXp[job?.creatureId ?? '']).toBe(dismantleXp('common'));
  });

  it('waits for 3 Commons, but takes a Rare apart at once and gets its Essence, parts and maybe a blueprint', () => {
    const p = player();
    p.gear.bag.push(
      item('trail-cap', 'common', 2, [{ id: 'attack', tier: 1 }]),
      item('trail-cap', 'common', 2, [{ id: 'attack', tier: 1 }]),
    );
    // Spares: the best 3 stay, so there is nothing extra yet.
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs).toHaveLength(0);
    for (let i = 0; i < 4; i++)
      p.gear.bag.push(
        item('kelp-cap', 'rare', 8, [
          { id: 'attack', tier: 0 },
          { id: 'hp', tier: 0 },
        ]),
      );
    // The weakest items are the extras; a Rare among them is taken alone.
    p.gear.bag.push(item('kelp-cap', 'rare', 3));
    startJobs(p, ctx(9), new Set());
    const job = p.gear.jobs.find((j) => j.kind === 'dismantle');
    expect(job?.items).toHaveLength(1);
    expect(job?.items?.[0]?.rarity).toBe('rare');
    const essence = p.essence;
    claimJobs(p, ctx(11));
    expect(p.essence - essence).toBeGreaterThanOrEqual(3);
    expect(p.essence - essence).toBeLessThanOrEqual(8);
    expect(p.week.dismantleEssence).toBe(p.essence - essence);
    expect(p.gear.parts['tide-shard']).toBe(1);
  });
});

describe('workshop jobs', () => {
  it('starts a craft on a creature that is not exploring, pays the parts and takes the skill-adjusted time', () => {
    const p = player();
    p.gear.blueprints.push('trail-cap');
    p.gear.parts.scrap = 100;
    startJobs(p, ctx(9), new Set([`p01/cindle`]));
    // Two creatures are free, so two slots are used; the exploring one is not.
    expect(p.gear.jobs).toHaveLength(2);
    const job = p.gear.jobs[0];
    expect(p.gear.jobs.map((j) => j.creatureId)).not.toContain('p01/cindle');
    expect(job?.kind).toBe('craft');
    expect(p.gear.parts.scrap).toBe(100 - 2 * (craftCost('trail-cap', 2).scrap ?? 0));
    expect(job?.endsAtHour).toBeCloseTo(9 + jobDuration(1) / 3_600_000, 6);
  });

  it('never runs more jobs than the workshop has slots, or two jobs on one creature', () => {
    const p = player();
    p.gear.blueprints.push('trail-cap');
    p.gear.parts.scrap = 1_000;
    startJobs(p, ctx(9), new Set());
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs).toHaveLength(RULES.gear.workshopSlots);
    expect(new Set(p.gear.jobs.map((j) => j.creatureId)).size).toBe(p.gear.jobs.length);
  });

  it('crafts the blueprint whose plain item adds the most to the team, among those the parts pay for', () => {
    const p = player();
    p.gear.blueprints.push('trail-charm', 'trail-cap', 'patch-scarf');
    p.gear.parts.scrap = 8;
    startJobs(p, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(p.gear.jobs).toHaveLength(1);
    expect(['trail-charm', 'trail-cap', 'patch-scarf']).toContain(p.gear.jobs[0]?.baseId);
    // A blueprint the parts cannot pay for is never started.
    const q = player();
    q.gear.blueprints.push('cinder-charm');
    q.gear.parts.scrap = 100; // an element base also needs its shard
    startJobs(q, ctx(9), new Set());
    expect(q.gear.jobs).toHaveLength(0);
  });

  it('claims a finished craft: a new item at 2 x the Crafting level, Crafting XP at the nominal hours, and the first-craft day', () => {
    const p = player();
    grantWelcomeKit(p, createSeededRng('kit'), 0);
    // The kit's blueprint may be an element base that needs a shard; this one needs scrap only.
    p.gear.blueprints = ['trail-cap'];
    startJobs(p, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(p.gear.jobs).toHaveLength(1);
    const job = p.gear.jobs[0];
    const before = allItems(p).length;
    // Not ready yet.
    claimJobs(p, ctx(9));
    expect(p.gear.jobs).toHaveLength(1);
    const done = Math.ceil(job?.endsAtHour ?? 0) + 1;
    claimJobs(p, ctx(done));
    expect(p.gear.jobs).toHaveLength(0);
    expect(allItems(p)).toHaveLength(before + 1);
    expect(p.gear.bag.at(-1)?.baseId).toBe(job?.baseId);
    expect(p.gear.bag.at(-1)?.itemLevel).toBe(craftItemLevel(1));
    expect(p.gear.crafted).toBe(1);
    expect(p.gear.skillXp[job?.creatureId ?? '']).toBe(jobXp());
    expect(p.gear.firstCraftAfterDays).toBeCloseTo(done / 24, 6);
  });

  it('counts the crafter’s Busy paws and Apprentice lines, as the worker does', () => {
    const plain = player();
    plain.gear.blueprints.push('trail-cap');
    plain.gear.parts.scrap = 100;
    startJobs(plain, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    const coached = player();
    coached.gear.blueprints.push('trail-cap');
    coached.gear.parts.scrap = 100;
    const [cindle] = three(coached);
    cindle.items = {
      charm: item('trail-charm', 'epic', 13, [
        { id: 'busy-paws', tier: 2 },
        { id: 'apprentice', tier: 2 },
      ]),
    };
    startJobs(coached, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    const fast = coached.gear.jobs[0];
    const slow = plain.gear.jobs[0];
    expect(fast?.endsAtHour).toBeLessThan(slow?.endsAtHour ?? 0);
    claimJobs(coached, ctx(9 + 24));
    claimJobs(plain, ctx(9 + 24));
    expect(coached.gear.skillXp['p01/cindle'] ?? 0).toBeGreaterThan(
      plain.gear.skillXp['p01/cindle'] ?? 0,
    );
  });

  it('holds a creature on a job out of the expedition plan in a check-in', () => {
    const p = player();
    p.bait = 500;
    p.gear.blueprints.push('trail-cap');
    p.gear.parts.scrap = 100;
    checkIn(p, tripCtx(true));
    const exploring = new Set(p.expeditions.map((e) => e.explorerId));
    for (const job of p.gear.jobs) expect(exploring.has(job.creatureId)).toBe(false);
    // With gear off, the same check-in starts no job.
    const q = player();
    q.bait = 500;
    q.gear.blueprints.push('trail-cap');
    q.gear.parts.scrap = 100;
    checkIn(q, tripCtx(false));
    expect(q.gear.jobs).toHaveLength(0);
  });
});

describe('supplies from the workshop', () => {
  const stockOf = (p: SimPlayer): number => Object.values(p.supplies).reduce((n, x) => n + x, 0);
  const empty = (): SimPlayer => {
    const p = player();
    p.supplies = {};
    return p;
  };

  it('makes a supply when the stock is low, and none once it is full', () => {
    const p = empty();
    p.gear.parts.scrap = 50;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.length).toBeGreaterThan(0);
    expect(p.gear.jobs.every((j) => j.kind === 'supply')).toBe(true);
    expect(p.gear.parts.scrap).toBeLessThan(50);
    const full = player();
    full.gear.parts.scrap = 50;
    startJobs(full, ctx(9), new Set());
    expect(full.gear.jobs.every((j) => j.kind !== 'supply')).toBe(true);
  });

  it('counts the supplies of open jobs towards the stock, so the slots do not overshoot the target', () => {
    const p = empty();
    p.supplies['lure-basic'] = GEAR_POLICY.supplyStock - 1;
    p.gear.parts.scrap = 100;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.filter((j) => j.kind === 'supply')).toHaveLength(1);
    expect(stockOf(p)).toBe(GEAR_POLICY.supplyStock - 1);
  });

  it('claims a supply job into the stock, counted as crafted by tier, with the Crafting XP of its hours', () => {
    const p = empty();
    p.gear.parts.scrap = 3;
    startJobs(p, ctx(9), new Set());
    const job = p.gear.jobs[0];
    expect(job?.kind).toBe('supply');
    claimJobs(p, ctx(9 + 24));
    expect(p.gear.jobs).toHaveLength(0);
    expect(stockOf(p)).toBe(1);
    expect(p.stats.supplies_crafted).toBe(1);
    expect(p.stats.supplies_crafted_good).toBe(0);
    expect(p.gear.skillXp[job?.creatureId ?? '']).toBeGreaterThan(0);
  });

  it('picks the best tier the Crafting level, scrap and shards allow, then the kind it has the fewest of', () => {
    const p = empty();
    p.gear.parts.scrap = 100;
    p.gear.parts['grove-shard'] = 1;
    p.gear.parts['tide-shard'] = 1;
    p.gear.parts['spark-shard'] = 1;
    p.gear.parts['ember-shard'] = 1;
    // Level 1 only allows the basic tier (a creature needs Crafting level 3 for the good ones).
    p.supplies['map-scrap-basic'] = 1;
    p.supplies['lantern-basic'] = 1;
    p.supplies['satchel-basic'] = 1;
    // A lure also costs Bait (held, and within the share of this week's Bait that lures may take).
    p.bait = 100;
    p.week.baitEarned = 100;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs[0]?.supplyId).toBe('lure-basic');
    // With Crafting level 3 on a creature the good tier is the better pick (and shards pay for it).
    const q = empty();
    q.gear.parts.scrap = 100;
    q.gear.parts['grove-shard'] = 1;
    q.gear.skillXp['p01/cindle'] = 10_000;
    q.bait = 100;
    q.week.baitEarned = 1_000;
    startJobs(q, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    const made = q.gear.jobs[0]?.supplyId;
    expect(made).toBeDefined();
    expect(made?.endsWith('-good') || made?.endsWith('-great')).toBe(true);
  });

  it('pays a lure in Bait as well as parts, keeps it within the weekly share, and never without the Bait', () => {
    const basic = supplyDef('lure-basic');
    const cost = basic?.blueprint.bait ?? 0;
    expect(cost).toBeGreaterThan(0);
    const setup = (bait: number, earned: number) => {
      const p = empty();
      p.gear.parts.scrap = 100;
      // Only the lure is missing from the stock, so it is the pick when it can be paid.
      p.supplies['map-scrap-basic'] = 1;
      p.supplies['lantern-basic'] = 1;
      p.supplies['satchel-basic'] = 1;
      p.bait = bait;
      p.week.baitEarned = earned;
      return p;
    };
    // Paid: the Bait leaves the purse, and the week and the totals count it.
    const rich = setup(cost + 5, 1_000);
    startJobs(rich, ctx(9), new Set());
    expect(rich.gear.jobs[0]?.supplyId).toBe('lure-basic');
    expect(rich.bait).toBe(5);
    expect(rich.week.baitLures).toBe(cost);
    expect(rich.stats.lure_bait).toBe(cost);
    // No Bait in the purse: no lure.
    const poor = setup(cost - 1, 1_000);
    startJobs(poor, ctx(9), new Set());
    expect(poor.gear.jobs[0]?.supplyId).not.toBe('lure-basic');
    expect(poor.bait).toBe(cost - 1);
    expect(poor.week.baitLures).toBe(0);
    // The Bait is there, but the lures have used their share of what was earned this week.
    const spent = setup(1_000, 100);
    spent.week.baitLures = Math.floor((100 * GEAR_POLICY.lureBaitShareBp) / 10_000);
    startJobs(spent, ctx(9), new Set());
    expect(spent.gear.jobs[0]?.supplyId).not.toBe('lure-basic');
    expect(spent.bait).toBe(1_000);
  });

  it("makes a new player's first piece of gear before any supply, and supplies first from then on", () => {
    const p = empty();
    p.gear.blueprints.push('trail-cap');
    // Only what one craft costs.
    p.gear.parts.scrap = craftCost('trail-cap', 2).scrap ?? 0;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.map((j) => j.kind)).toEqual(['craft']);
    // Once a craft has been made, a low stock comes first.
    const q = empty();
    q.gear.blueprints.push('trail-cap');
    q.gear.crafted = 1;
    q.gear.parts.scrap = 100;
    startJobs(q, ctx(9), new Set());
    expect(q.gear.jobs[0]?.kind).toBe('supply');
  });
});

describe('gear in the economy', () => {
  const on = runEconomy({ seed: 'gear-econ', weeks: 12, mix: DEFAULT_MIX, snapshotWeeks: [8, 12] });
  const off = runEconomy({
    seed: 'gear-econ',
    weeks: 12,
    mix: DEFAULT_MIX,
    snapshotWeeks: [12],
    gear: false,
  });

  it('is deterministic for a seed', () => {
    const again = runEconomy({
      seed: 'gear-econ',
      weeks: 12,
      mix: DEFAULT_MIX,
      snapshotWeeks: [8, 12],
    });
    expect(JSON.stringify(again.players)).toBe(JSON.stringify(on.players));
  });

  it('gives gear only when it is on, and every item follows the wear rule', () => {
    const offPlayers = off.snapshots[0]?.players ?? [];
    for (const p of offPlayers) {
      expect(allItems(p)).toHaveLength(0);
      expect(p.gear.crafted).toBe(0);
      expect(p.gear.joinDay).toBeNull();
    }
    const onPlayers = on.snapshots[1]?.players ?? [];
    expect(onPlayers.length).toBe(offPlayers.length);
    for (const p of onPlayers) {
      expect(allItems(p).length).toBeGreaterThan(0);
      expect(p.gear.joinDay).toBe((p.joinWeek - 1) * 7);
      expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(0);
      for (const kind of Object.values(p.gear.parts)) expect(kind).toBeGreaterThanOrEqual(0);
      expect(allItems(p).length + p.gear.jobs.length).toBeLessThanOrEqual(RULES.gear.inventoryCap);
      // Every item is worn by at most one creature, no item is shared with the bag, and what is worn
      // obeys the wear rule (Equip best never breaks it; training only raises levels).
      const worn = p.creatures.flatMap((c) => wornOf(c));
      expect(new Set(worn).size).toBe(worn.length);
      for (const bagged of p.gear.bag) expect(worn).not.toContain(bagged);
      for (const c of p.creatures) {
        for (const w of wornOf(c)) {
          expect(wearBlock(w, { level: c.level, role: wearerOfCreature(c).role })).toBeNull();
        }
      }
    }
  });

  it('the newcomer gets the welcome kit when it joins in week 4', () => {
    const snap = runEconomy({ seed: 'late', weeks: 4, mix: DEFAULT_MIX, snapshotWeeks: [4] });
    const newcomer = snap.snapshots[0]?.players.find((p) => p.archetype === 'newcomer');
    expect(newcomer?.gear.joinDay).toBe(21);
    expect(allItems(newcomer as SimPlayer).length).toBeGreaterThanOrEqual(1);
    expect(newcomer?.gear.blueprints.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the gear share of team power below a half at every week for every archetype', () => {
    for (const h of on.players) {
      for (const w of h.weeks) {
        expect(w.gearPower / w.top3Power).toBeLessThan(0.5);
        expect(w.essence).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('copies a player with its items so that snapshots do not change when the player plays on', () => {
    const p = (on.snapshots[0]?.players ?? [])[0] as SimPlayer;
    const copy = clonePlayer(p);
    const worn = copy.creatures.flatMap((c) => wornOf(c))[0];
    if (worn !== undefined) worn.itemLevel = 99;
    copy.gear.parts.scrap += 5;
    expect(p.creatures.flatMap((c) => wornOf(c)).some((i) => i.itemLevel === 99)).toBe(false);
    expect(p.gear.parts.scrap).not.toBe(copy.gear.parts.scrap);
  });

  it('measures the gear targets against the same sims without gear', () => {
    const { metrics, comparison } = gearMetrics([on], [off], 12);
    expect(metrics['gear.dailyShareWeek8']).toBeGreaterThan(0.01);
    expect(metrics['gear.dailyShareWeek8']).toBeLessThan(0.5);
    expect(metrics['gear.dailyFirstCraftDaysP90']).toBeLessThanOrEqual(14);
    expect(comparison).toHaveLength(12);
    expect(Object.keys(metrics).sort()).toEqual([
      'gear.dailyBestSkillDay30',
      'gear.dailyEssenceGrowthVsToday',
      'gear.dailyEssenceWeek12',
      'gear.dailyEssenceWeek12VsToday',
      'gear.dailyFirstCraftDaysP90',
      'gear.dailyShareWeek8',
      'gear.newcomerCatchUpWeek8',
    ]);
  });

  it('skill levels follow the game XP table', () => {
    for (const h of on.players) {
      for (const w of h.weeks) {
        expect(w.skillLevel).toBeGreaterThanOrEqual(1);
        expect(w.skillLevel).toBeLessThanOrEqual(skillLevel(1e12));
      }
    }
  });
});

describe('Reach in the simulator', () => {
  it('aims a craft at the biggest Reach the level, the parts and the Essence above the kept 40 allow', () => {
    const base = (): SimPlayer => {
      const p = player();
      p.gear.blueprints.push('trail-cap');
      p.gear.marks['trail-cap'] = 3;
      p.gear.parts.scrap = 100;
      p.gear.parts['tide-shard'] = 6;
      p.gear.parts.glimmer = 3;
      p.essence = 200;
      const c = three(p)[0];
      if (c !== undefined) p.gear.skillXp[c.id] = 1_000; // level 6
      return p;
    };
    const epic = base();
    startJobs(epic, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(epic.gear.jobs[0]).toMatchObject({ kind: 'craft', reach: 'epic', marks: 3 });
    expect(epic.essence).toBe(200 - 70);
    expect(epic.gear.parts.glimmer).toBe(2);
    expect(epic.gear.jobs[0]?.endsAtHour).toBeCloseTo(
      9 + jobDuration(6, 0, craftHours('epic')) / 3_600_000,
      6,
    );
    // Essence of 100 leaves 30 over the kept 40... not enough for an Epic (70), enough for a Rare (25 + 40 = 65 <= 100).
    const rare = base();
    rare.essence = 100;
    startJobs(rare, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(rare.gear.jobs[0]).toMatchObject({ reach: 'rare' });
    expect(rare.essence).toBe(75);
    // Too little Essence above the kept 40, or too low a level: a plain craft.
    const poor = base();
    poor.essence = 60;
    startJobs(poor, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(poor.gear.jobs[0]).toMatchObject({ reach: 'none' });
    expect(poor.essence).toBe(60);
    const novice = base();
    novice.gear.skillXp = {};
    startJobs(novice, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    expect(novice.gear.jobs[0]).toMatchObject({ reach: 'none' });
  });

  it('claims a Reach craft with the marks it started with, and counts it', () => {
    const p = player();
    p.gear.blueprints.push('trail-cap');
    p.gear.marks['trail-cap'] = 10;
    p.gear.parts.scrap = 100;
    p.gear.parts['spark-shard'] = 6;
    p.essence = 500;
    const [cindle] = three(p);
    if (cindle !== undefined) p.gear.skillXp[cindle.id] = 250; // level 3
    startJobs(p, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    const job = p.gear.jobs[0];
    expect(job).toMatchObject({ reach: 'rare', marks: 10 });
    claimJobs(p, ctx(30));
    expect(p.week.gearReaches).toBe(1);
    expect(p.gear.bag.at(-1)?.rarity).not.toBe('common');
    expect(p.gear.skillXp[job?.creatureId ?? '']).toBe(250 + jobXp(0, craftHours('rare')));
  });
});
