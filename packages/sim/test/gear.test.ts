import { describe, expect, it } from 'vitest';
import {
  RULES,
  applyGear,
  content,
  createSeededRng,
  craftCost,
  droppableBases,
  jobDuration,
  jobXp,
  skillLevel,
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
  claimJobs,
  grantExpeditionLoot,
  grantFinaleLoot,
  grantPhaseScrap,
  grantWelcomeKit,
  itemScore,
  manageGear,
  startJobs,
  type GearContext,
} from '../src/gear';
import { fightFor, openRaidWeek } from '../src/raid';
import { clonePlayer, createPlayer, type SimPlayer } from '../src/state';

function creature(player: string, line: string, level = 10): OwnedCreature {
  return { id: `${player}/${line}`, line, speciesId: line, level, fusionCount: 0 };
}

/** A player with a payoff (Cindle), a guard (Sproutle) and a setter (Splashet), all level 10. */
function player(id = 'p01'): SimPlayer {
  const p = createPlayer(id, 'P', 'daily', 1);
  p.joined = true;
  p.creatures.push(creature(id, 'cindle'), creature(id, 'sproutle'), creature(id, 'splashet'));
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
    grantFinaleLoot([a, b], 3, null, createSeededRng('finale'));
    expect(allItems(a)).toHaveLength(1);
    expect(allItems(b)).toHaveLength(1);
    // A Festival week adds the Festival piece.
    grantFinaleLoot([a], 3, 'tide', createSeededRng('festival'));
    expect(allItems(a)).toHaveLength(3);
    expect(allItems(a).filter((i) => i.rarity === 'festival')).toHaveLength(1);
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
    for (let i = 0; i < 300; i++) {
      grantExpeditionLoot(p, 'long', 'tide', createSeededRng(`long-${String(i)}`));
    }
    expect(p.gear.blueprints).toHaveLength(known);
    // 300 long trips: their scrap, plus 5 for every duplicate blueprint (about 15% of the trips).
    const trips = 300 * RULES.gear.drops.expedition.scrap.long;
    const blueprints =
      (p.gear.parts.scrap - before - trips) / RULES.gear.drops.duplicateBlueprintScrap;
    expect(Number.isInteger(blueprints)).toBe(true);
    expect(blueprints).toBeGreaterThan(0);
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
    const context = ctx(9);
    checkIn(p, 10, createSeededRng('checkin'), context);
    const exploring = new Set(p.expeditions.map((e) => e.explorerId));
    for (const job of p.gear.jobs) expect(exploring.has(job.creatureId)).toBe(false);
    // With gear off, the same check-in starts no job.
    const q = player();
    q.bait = 500;
    q.gear.blueprints.push('trail-charm');
    q.gear.parts.scrap = 100;
    checkIn(q, 10, createSeededRng('checkin'));
    expect(q.gear.jobs).toHaveLength(0);
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
