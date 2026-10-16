import { describe, expect, it } from 'vitest';
import {
  RULES,
  applyGear,
  content,
  createSeededRng,
  craftCost,
  droppableBases,
  finaleUpgradeLevel,
  jobDuration,
  jobXp,
  skillLevel,
  supplyDef,
  upgradeCost,
  type GearRarity,
} from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { gearMetrics } from '../src/analysis';
import {
  creaturePower,
  creatureStats,
  speciesOf,
  type OwnedCreature,
  type SimItem,
} from '../src/data';
import { checkIn, runEconomy } from '../src/economy';
import {
  allItems,
  GEAR_POLICY,
  claimJobs,
  grantFinaleLoot,
  grantPhaseScrap,
  grantWelcomeKit,
  itemScore,
  learnBlueprint,
  manageGear,
  scrapForNextUpgrade,
  startJobs,
  type GearContext,
} from '../src/gear';
import { fightFor, openRaidWeek } from '../src/raid';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';
import type { TripContext } from '../src/trips';

function creature(player: string, line: string, level = 10): OwnedCreature {
  return { id: `${player}/${line}`, line, speciesId: line, level, fusionCount: 0 };
}

/**
 * A player with a payoff (Cindle), a guard (Sproutle) and a setter (Splashet), all level 10, with a
 * full stock of supplies (so the workshop starts no supply job unless a test empties the stock).
 */
function player(id = 'p01'): SimPlayer {
  const p = createPlayer(id, 'P', 'daily', 1);
  p.joined = true;
  p.creatures.push(creature(id, 'cindle'), creature(id, 'sproutle'), creature(id, 'splashet'));
  p.supplies['lure-basic'] = GEAR_POLICY.supplyStock;
  return p;
}

let nextUid = 1000;
function item(
  baseId: string,
  rarity: GearRarity,
  primary: number,
  options: { level?: number; secondary?: SimItem['rolls']['secondary']; enchantId?: string } = {},
): SimItem {
  return {
    uid: nextUid++,
    baseId,
    rarity,
    level: options.level ?? 0,
    rolls: { primary, secondary: options.secondary ?? [] },
    enchantId: options.enchantId ?? null,
    improves: 0,
  };
}

/** A check-in's context at 09:00 on day 0, with or without the gear context (a sim without gear). */
const tripCtx = (withGear: boolean): TripContext => ({
  hour: 9,
  day: 0,
  weekIndex: 0,
  catches: createSeededRng('checkin:catches'),
  trip: createSeededRng('checkin:trip'),
  ...(withGear ? { gear: ctx(9) } : {}),
});

const ctx = (hour = 9, seed = 'gear'): GearContext => ({
  rng: createSeededRng(seed),
  hour,
  day: Math.floor(hour / 24),
});

describe('gear in the fight slots', () => {
  it('folds the worn item into the slot like the worker (applyGear), and leaves others alone', () => {
    const p = player();
    const [cindle, sproutle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    cindle.item = item('trail-charm', 'common', 800, { level: 2 });
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
      species.role,
      species.element,
      cindle.item,
    );
    expect(slot(cindle).stats).toEqual(expected.stats);
    expect(slot(cindle).crit).toEqual(expected.crit);
    expect(slot(cindle).stats?.atk ?? 0).toBeGreaterThan(creatureStats(cindle).atk);
    expect(slot(sproutle).stats).toEqual(creatureStats(sproutle));
  });

  it('counts gear in the power that picks the team', () => {
    const p = player();
    const [cindle, sproutle, splashet] = p.creatures as [
      OwnedCreature,
      OwnedCreature,
      OwnedCreature,
    ];
    const plain = creaturePower(splashet);
    splashet.item = item('trail-charm', 'epic', 1_100, { level: 4 });
    expect(creaturePower(splashet)).toBeGreaterThan(plain);
    expect(creaturePower(cindle)).toBe(creaturePower({ ...cindle, item: null }));
    expect(creaturePower(sproutle)).toBe(creaturePower({ ...sproutle }));
  });
});

describe('drops', () => {
  it('gives the welcome kit once: a common item, a common blueprint and scrap', () => {
    const p = player();
    grantWelcomeKit(p, createSeededRng('kit'), 3);
    expect(p.gear.bag).toHaveLength(1);
    expect(p.gear.bag[0]?.rarity).toBe('common');
    expect(p.gear.blueprints).toHaveLength(1);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(RULES.gear.drops.welcomeScrap);
    expect(p.gear.joinDay).toBe(3);
    // The scrap pays for any common craft.
    const blueprint = p.gear.blueprints[0] as string;
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(craftCost(blueprint).scrap ?? 0);
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
    grantFinaleLoot([a, b], 3, null, createSeededRng('finale'));
    expect(slot(a) - (slotsBefore[0] ?? 0)).toBe(1);
    expect(slot(b) - (slotsBefore[1] ?? 0)).toBe(1);
    // A Festival week adds the Festival piece.
    const festivalBefore = allItems(a).filter((i) => i.rarity === 'festival').length;
    const before = slot(a);
    grantFinaleLoot([a], 3, 'tide', createSeededRng('festival'));
    expect(slot(a) - before).toBe(2);
    expect(allItems(a).filter((i) => i.rarity === 'festival').length - festivalBefore).toBe(1);
  });

  it('gives finale gear its upgrade level by rank and finale blueprints the player does not know', () => {
    const drops = RULES.gear.drops.finale;
    const level = (rank: number): number => finaleUpgradeLevel(rank);
    expect(level(1)).toBe(0);
    expect(level(1 + 2 * drops.ranksPerUpgrade)).toBe(2);
    // Over many seeds at a high rank: gear arrives upgraded, a blueprint is never one already known.
    let gear = 0;
    let blueprints = 0;
    for (let k = 0; k < 200; k++) {
      const p = player(`f${String(k)}`);
      const known = new Set(p.gear.blueprints);
      const bagBefore = p.gear.bag.length;
      grantFinaleLoot([p], 9, null, createSeededRng(`reward:${String(k)}`));
      if (p.gear.bag.length > bagBefore) {
        gear++;
        expect(p.gear.bag[p.gear.bag.length - 1]?.level).toBe(level(9));
      } else {
        blueprints++;
        const added = p.gear.blueprints.filter((id) => !known.has(id));
        expect(added).toHaveLength(1);
        expect(p.gear.blueprints.length).toBe(known.size + 1);
      }
    }
    // About blueprintBp of 10000 draw a blueprint (a quarter): well away from none and from all.
    expect(blueprints).toBeGreaterThan(20);
    expect(gear).toBeGreaterThan(100);
  });

  it('turns a drop into its dismantle yield when the inventory is full, and a known blueprint into scrap', () => {
    const p = player();
    for (let i = 0; i < RULES.gear.inventoryCap; i++)
      p.gear.bag.push(item('trail-charm', 'common', 500));
    const scrap = p.gear.parts.scrap;
    grantFinaleLoot([p], 1, null, createSeededRng('full'));
    expect(p.gear.bag).toHaveLength(RULES.gear.inventoryCap);
    expect(p.gear.parts.scrap).toBeGreaterThan(scrap);
    // Every droppable blueprint is known: a blueprint that drops is a duplicate and pays scrap.
    p.gear.blueprints = droppableBases()
      .filter((b) => b.blueprint !== 'festival')
      .map((b) => b.id);
    const known = p.gear.blueprints.length;
    const before = p.gear.parts.scrap;
    for (const id of [...p.gear.blueprints]) learnBlueprint(p, id);
    expect(p.gear.blueprints).toHaveLength(known);
    // A blueprint the player already knows turns into scrap (5 each).
    expect(p.gear.parts.scrap - before).toBe(known * RULES.gear.drops.duplicateBlueprintScrap);
  });
});

describe('equipping, dismantling and upgrading', () => {
  it('puts Attack items on the payoff and HP items on the guard', () => {
    const p = player();
    const atkItem = item('trail-charm', 'common', 800);
    const hpItem = item('patch-band', 'common', 1_000);
    p.gear.bag.push(hpItem, atkItem);
    manageGear(p);
    const [cindle, sproutle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    expect(cindle.item).toBe(atkItem);
    expect(sproutle.item).toBe(hpItem);
    expect(p.gear.bag).toHaveLength(0);
    // Scoring: the Attack item is worth more to the payoff than to the guard.
    expect(itemScore(atkItem, cindle)).toBeGreaterThan(itemScore(atkItem, sproutle));
    expect(itemScore(hpItem, sproutle)).toBeGreaterThan(itemScore(hpItem, cindle));
  });

  it('keeps the 2 best spares and dismantles the rest into parts', () => {
    const p = player();
    for (let i = 0; i < 4; i++) p.gear.bag.push(item('trail-charm', 'common', 500 + i * 10));
    for (let i = 0; i < 4; i++)
      p.gear.bag.push(
        item('cinder-charm', 'rare', 600 + i * 10, { secondary: [{ stat: 'hp', bp: 300 }] }),
      );
    const total = allItems(p).length;
    manageGear(p);
    expect(p.week.gearDismantled).toBe(total - 3 - 2);
    expect(p.gear.bag).toHaveLength(2);
    expect(allItems(p)).toHaveLength(5);
    expect(p.gear.parts.scrap).toBeGreaterThan(0);
  });

  it('spends Essence and scrap on upgrades, by the game cost, up to the top level', () => {
    const p = player();
    const [cindle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    cindle.item = item('trail-charm', 'common', 800);
    p.essence = 10_000;
    p.gear.parts.scrap = 10_000;
    let essence = 0;
    for (let level = 0; level < RULES.gear.maxLevel; level++) {
      essence += upgradeCost({ rarity: 'common', level })?.essence ?? 0;
    }
    manageGear(p);
    // Only the gear pool gets items, but the Essence of a full +0 to +5 is what the game charges.
    expect(cindle.item.level).toBeLessThanOrEqual(RULES.gear.maxLevel);
    expect(p.week.essenceSpentGear).toBe(10_000 - p.essence);
    expect(p.week.essenceSpentGear).toBeLessThanOrEqual(essence);
    expect(p.gear.parts.scrap).toBeLessThan(10_000);
  });

  it('holds back Essence for an evolution that is close, and never goes negative', () => {
    const p = player();
    const [cindle, sproutle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    cindle.item = item('trail-charm', 'common', 800);
    sproutle.level = 14; // 1 level from its evolution at 15
    const evo = speciesOf(sproutle.speciesId).evolvesTo;
    expect(evo).toBeDefined();
    const price = upgradeCost({ rarity: 'common', level: 0 })?.essence ?? 0;
    p.gear.parts.scrap = 100;
    p.essence = (evo?.essence ?? 0) + price - 1;
    manageGear(p);
    expect(cindle.item?.level).toBe(0);
    expect(p.essence).toBe((evo?.essence ?? 0) + price - 1);
    p.essence = (evo?.essence ?? 0) + price;
    manageGear(p);
    expect(cindle.item?.level).toBeGreaterThanOrEqual(1);
    expect(p.essence).toBeGreaterThanOrEqual(evo?.essence ?? 0);
  });
});

describe('workshop jobs', () => {
  it('starts a craft on a creature that is not exploring, pays the parts and takes the skill-adjusted time', () => {
    const p = player();
    p.gear.blueprints.push('trail-charm');
    p.gear.parts.scrap = 100;
    startJobs(p, ctx(9), new Set([`p01/cindle`]));
    // Two creatures are free, so two slots are used; the exploring one is not.
    expect(p.gear.jobs).toHaveLength(2);
    const job = p.gear.jobs[0];
    expect(p.gear.jobs.map((j) => j.creatureId)).not.toContain('p01/cindle');
    expect(job?.kind).toBe('craft');
    expect(p.gear.parts.scrap).toBe(100 - 2 * (craftCost('trail-charm').scrap ?? 0));
    expect(job?.endsAtHour).toBeCloseTo(9 + jobDuration('craft', 'common', 1) / 3_600_000, 6);
  });

  it('never runs more jobs than the workshop has slots, or two jobs on one creature', () => {
    const p = player();
    p.gear.blueprints.push('trail-charm');
    p.gear.parts.scrap = 1_000;
    startJobs(p, ctx(9), new Set());
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs).toHaveLength(RULES.gear.workshopSlots);
    expect(new Set(p.gear.jobs.map((j) => j.creatureId)).size).toBe(p.gear.jobs.length);
  });

  it('claims a finished craft: a new item, Crafting XP at the nominal hours, and the first-craft day', () => {
    const p = player();
    grantWelcomeKit(p, createSeededRng('kit'), 0);
    startJobs(p, ctx(9), new Set());
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
    expect(p.gear.crafted).toBe(1);
    expect(p.gear.skillXp[job?.creatureId ?? '']).toBe(jobXp('craft', 'common'));
    expect(p.gear.firstCraftAfterDays).toBeCloseTo(done / 24, 6);
  });

  it('enchants a worn item with a matching enchant when glimmer and shards are there, and improves a weak secondary', () => {
    const p = player();
    const [cindle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    cindle.item = item('trail-charm', 'rare', 700, { secondary: [{ stat: 'spd', bp: 200 }] });
    p.gear.parts.glimmer = 1;
    p.gear.parts['ember-shard'] = 3;
    p.gear.parts['grove-shard'] = 3;
    p.gear.parts['tide-shard'] = 3;
    p.gear.parts['spark-shard'] = 3;
    p.gear.parts.scrap = 50;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs[0]?.kind).toBe('enchant');
    claimJobs(p, ctx(9 + 24));
    expect(cindle.item.enchantId).not.toBeNull();
    // No glimmer left: the next job is an improve of the speed secondary.
    startJobs(p, ctx(9 + 24), new Set());
    expect(p.gear.jobs[0]?.kind).toBe('improve');
    claimJobs(p, ctx(9 + 48));
    expect(cindle.item.improves).toBe(1);
    expect(p.gear.skillXp[p.creatures[0]?.id ?? '']).toBeGreaterThan(0);
  });

  it('holds a creature on a job out of the expedition plan in a check-in', () => {
    const p = player();
    p.bait = 500;
    p.gear.blueprints.push('trail-charm');
    p.gear.parts.scrap = 100;
    checkIn(p, 10, tripCtx(true));
    const exploring = new Set(p.expeditions.map((e) => e.explorerId));
    for (const job of p.gear.jobs) expect(exploring.has(job.creatureId)).toBe(false);
    // With gear off, the same check-in starts no job.
    const q = player();
    q.bait = 500;
    q.gear.blueprints.push('trail-charm');
    q.gear.parts.scrap = 100;
    checkIn(q, 10, tripCtx(false));
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
  const wear = (p: SimPlayer, level = 0): void => {
    const [cindle] = p.creatures as [OwnedCreature, OwnedCreature, OwnedCreature];
    cindle.item = item('trail-charm', 'common', 500, { level });
  };

  it('makes a supply when the stock is low, and none once it is full', () => {
    const p = empty();
    p.gear.parts.scrap = 50;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.length).toBeGreaterThan(0);
    expect(p.gear.jobs.every((j) => j.kind === 'supply')).toBe(true);
    // The two jobs together bring the stock to its target at most; scrap was paid.
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
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs[0]?.supplyId).toBe('lure-basic');
    // With Crafting level 3 on a creature the good tier is the better pick (and shards pay for it).
    const q = empty();
    q.gear.parts.scrap = 100;
    q.gear.parts['grove-shard'] = 1;
    q.gear.skillXp['p01/cindle'] = 10_000;
    startJobs(q, ctx(9), new Set(['p01/sproutle', 'p01/splashet']));
    const made = q.gear.jobs[0]?.supplyId;
    expect(made).toBeDefined();
    expect(made?.endsWith('-good') || made?.endsWith('-great')).toBe(true);
  });

  it('leaves the scrap of the next upgrades of the worn items alone, and uses the rest', () => {
    const p = empty();
    wear(p);
    const first = upgradeCost({ rarity: 'common', level: 0 });
    const second = upgradeCost({ rarity: 'common', level: 1 });
    if (first === null || second === null) throw new Error('no upgrade cost');
    // The next `keepUpgrades` levels of the one worn item (the Essence held does not matter).
    expect(GEAR_POLICY.keepUpgrades).toBe(2);
    const keep = scrapForNextUpgrade(p);
    expect(keep).toBe(first.scrap + second.scrap);
    const price = supplyDef('lure-basic')?.blueprint.parts.scrap ?? 0;
    p.gear.parts.scrap = keep + price - 1;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs).toHaveLength(0);
    p.gear.parts.scrap = keep + price;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.length).toBeGreaterThan(0);
    expect(p.gear.parts.scrap).toBeGreaterThanOrEqual(keep);
    // Nothing worn, or an item at the top level: nothing to keep.
    expect(scrapForNextUpgrade(empty())).toBe(0);
    const top = empty();
    wear(top, RULES.gear.maxLevel);
    expect(scrapForNextUpgrade(top)).toBe(0);
    top.gear.parts.scrap = price;
    startJobs(top, ctx(9), new Set());
    expect(top.gear.jobs.length).toBeGreaterThan(0);
  });

  it("makes a new player's first piece of gear before any supply, and supplies first from then on", () => {
    const p = empty();
    wear(p);
    p.essence = 10_000;
    p.gear.blueprints.push('trail-charm');
    // Only what one gear craft costs: no scrap is left over for the reserve of the upgrades.
    p.gear.parts.scrap = craftCost('trail-charm').scrap ?? 0;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.map((j) => j.kind)).toEqual(['craft']);
    // Once a craft has been made, a low stock comes first.
    const q = empty();
    q.gear.blueprints.push('trail-charm');
    q.gear.crafted = 1;
    q.gear.parts.scrap = 100;
    startJobs(q, ctx(9), new Set());
    expect(q.gear.jobs[0]?.kind).toBe('supply');
  });

  it('never lets a gear craft eat the scrap of an upgrade the Essence pays for', () => {
    const p = player();
    wear(p);
    p.gear.crafted = 1; // not the first one: that is made before anything else
    p.essence = 10_000;
    p.gear.blueprints.push('trail-charm');
    const keep = scrapForNextUpgrade(p);
    const price = craftCost('trail-charm').scrap ?? 0;
    p.gear.parts.scrap = keep + price - 1;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs).toHaveLength(0);
    p.gear.parts.scrap = keep + price;
    startJobs(p, ctx(9), new Set());
    expect(p.gear.jobs.some((j) => j.kind === 'craft')).toBe(true);
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

  it('gives gear only when it is on', () => {
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
      // Every item is worn by at most one creature and no item is shared with the bag.
      const worn = p.creatures.flatMap((c) => (c.item ? [c.item.uid] : []));
      expect(new Set(worn).size).toBe(worn.length);
      for (const bagged of p.gear.bag) expect(worn).not.toContain(bagged.uid);
    }
  });

  it('the newcomer gets the welcome kit when it joins in week 4', () => {
    const snap = runEconomy({ seed: 'late', weeks: 4, mix: DEFAULT_MIX, snapshotWeeks: [4] });
    const newcomer = snap.snapshots[0]?.players.find((p) => p.archetype === 'newcomer');
    expect(newcomer?.gear.joinDay).toBe(21);
    expect(allItems(newcomer as SimPlayer).length).toBeGreaterThanOrEqual(1);
    expect(newcomer?.gear.blueprints.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the gear share of team power under the 25% ceiling at every week for every archetype', () => {
    for (const h of on.players) {
      for (const w of h.weeks) {
        expect(w.gearPower / w.top3Power).toBeLessThan(0.25);
        expect(w.essence).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('copies a player with its items so that snapshots do not change when the player plays on', () => {
    const p = (on.snapshots[0]?.players ?? [])[0] as SimPlayer;
    const copy = clonePlayer(p);
    const worn = copy.creatures.find((c) => c.item);
    if (worn?.item) worn.item.level = 99;
    copy.gear.parts.scrap += 5;
    expect(p.creatures.some((c) => c.item?.level === 99)).toBe(false);
    expect(p.gear.parts.scrap).not.toBe(copy.gear.parts.scrap);
  });

  it('measures the gear targets against the same sims without gear', () => {
    const { metrics, comparison } = gearMetrics([on], [off], 12);
    expect(metrics['gear.dailyShareWeek8']).toBeGreaterThan(0.02);
    expect(metrics['gear.dailyShareWeek8']).toBeLessThan(0.25);
    expect(metrics['gear.dailyFirstCraftDaysP90']).toBeLessThanOrEqual(7);
    expect(comparison).toHaveLength(12);
    expect(metrics['gear.dailyEssenceWeek12VsToday']).toBeLessThanOrEqual(0);
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
