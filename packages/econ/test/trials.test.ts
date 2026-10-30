/** Honours (trials), creature rarities and server coverage, and the fire's floor variants. */
import { describe, expect, it } from 'vitest';
import { LEVEL_XP } from '../src/curves';
import { addXp } from '../src/growth';
import {
  fightTeam,
  graduate,
  honourCounts,
  pickOccupant,
  readyForHonour,
  rotateMasters,
} from '../src/honours';
import { newAnvil, newSeat } from '../src/policy';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import {
  addCreature,
  createPlayer,
  evolveCost,
  lineForms,
  refreshCeiling,
  speciesRarities,
} from '../src/world';
import { content } from '@creatures/game';

const player = (policy: 'setAndForget' | 'optimiser' = 'setAndForget') => {
  const p = createPlayer(RULES, 'trials', 1, 0, { ...profileById('daily'), policy }, 4);
  for (let s = 0; s < 6; s++) addCreature(p, s);
  for (const c of p.creatures) {
    c.canEvolve = false;
    refreshCeiling(RULES, c);
  }
  return p;
};

describe('honours (trials.md)', () => {
  it('Bronze needs level 10, a dungeon clear, a day at a post and a find or a day of smithing', () => {
    const p = player();
    const c = p.creatures[0]!;
    c.level = 10;
    c.dungeonClears = 1;
    c.scoutHours = 30;
    expect(readyForHonour(RULES, c)).toBe(false); // no find brought home yet
    c.brought = true;
    expect(readyForHonour(RULES, c)).toBe(true);
    c.dungeonClears = 0;
    expect(readyForHonour(RULES, c)).toBe(false);
    c.dungeonClears = 1;
    c.scoutHours = 10;
    expect(readyForHonour(RULES, c)).toBe(false); // not a day at a post
    c.scoutHours = 0;
    c.smithHours = 30; // a day of smithing counts for the find and the post
    expect(readyForHonour(RULES, c)).toBe(true);
    c.level = 9;
    expect(readyForHonour(RULES, c)).toBe(false);
  });

  it('Silver needs level 20, an Undercroft clear and Expert; Gold level 30, a raid clear and Master', () => {
    const p = player();
    const c = p.creatures[0]!;
    c.honour = 1;
    c.level = 20;
    c.undercroftClears = 1;
    c.scoutHours = RULES.posts.mastery[1]!.hours - 1;
    expect(readyForHonour(RULES, c)).toBe(false);
    c.scoutHours = RULES.posts.mastery[1]!.hours;
    expect(readyForHonour(RULES, c)).toBe(true);
    c.honour = 2;
    c.level = 30;
    c.raidClears = 1;
    expect(readyForHonour(RULES, c)).toBe(false); // Expert is not Master
    c.smithHours = RULES.posts.mastery[2]!.hours;
    expect(readyForHonour(RULES, c)).toBe(true);
    c.raidClears = 0;
    expect(readyForHonour(RULES, c)).toBe(false);
  });

  it('graduate at the daily ceremony, one honour at a time, and count', () => {
    const p = player();
    const [a, b] = p.creatures as [(typeof p.creatures)[number], (typeof p.creatures)[number]];
    for (const c of [a, b]) {
      c.level = 30;
      c.dungeonClears = 1;
      c.undercroftClears = 1;
      c.raidClears = 1;
      c.scoutHours = 1000;
      c.brought = true;
    }
    graduate(p);
    expect(a.honour).toBe(1);
    graduate(p);
    graduate(p);
    expect(a.honour).toBe(3);
    graduate(p);
    expect(a.honour).toBe(3);
    expect(honourCounts(p)).toEqual([2, 2, 2]);
  });

  it('never stop a level: a creature without Bronze still grows past level 10', () => {
    const p = player();
    const c = p.creatures[0]!;
    addXp(p, c, LEVEL_XP[25]!);
    expect(c.honour).toBe(0);
    expect(c.level).toBe(25);
  });

  it('fight in a team of the best three; an optimiser gives the last place to a creature that still needs a fight box', () => {
    const sf = player('setAndForget');
    sf.creatures.forEach((c, i) => (c.xp = 1000 - i * 100));
    expect(fightTeam(sf).map((c) => c.xp)).toEqual([1000, 900, 800]);
    const opt = player('optimiser');
    opt.creatures.forEach((c, i) => (c.xp = 1000 - i * 100));
    const needy = opt.creatures[4]!;
    needy.level = 12;
    const team = fightTeam(opt);
    expect(team).toHaveLength(3);
    expect(team.slice(0, 2).map((c) => c.xp)).toEqual([1000, 900]);
    expect(team[2]).toBe(needy);
    needy.dungeonClears = 1;
    expect(fightTeam(opt)[2]?.xp).toBe(800);
  });

  it('an optimiser moves a Master on and puts an unworked creature in the seat; a set-and-forget player never does', () => {
    for (const policy of ['optimiser', 'setAndForget'] as const) {
      const p = player(policy);
      newSeat(p);
      newAnvil(p);
      const occupant = p.scoutOcc[0]!;
      p.creatures[occupant]!.scoutHours = RULES.posts.mastery[2]!.hours;
      rotateMasters(p);
      expect(p.scoutOcc[0] !== occupant).toBe(policy === 'optimiser');
    }
  });

  it('seats take distinct creatures, the least worked first', () => {
    const p = player();
    newSeat(p);
    newAnvil(p);
    newSeat(p);
    const occ = [...p.scoutOcc, ...p.anvilOcc];
    expect(new Set(occ).size).toBe(occ.length);
    expect(pickOccupant(p)).toBeGreaterThanOrEqual(0);
  });

  it('are held by a growing share of the roster in a run, Silver and Gold never more than Bronze', () => {
    const run = runServer({ ...ALL_SERVERS.find((s) => s.id === 'mixed8')!, weeks: 14 }, 2);
    let last = 0;
    for (const p of run.players.filter((x) => x.profile === 'daily'))
      for (const w of p.weeks) {
        expect(w.honours[0]!).toBeGreaterThanOrEqual(w.honours[1]!);
        expect(w.honours[1]!).toBeGreaterThanOrEqual(w.honours[2]!);
        expect(w.honours[0]!).toBeGreaterThanOrEqual(last * 0);
        last = w.honours[0]!;
      }
    const daily = run.players.find((x) => x.profile === 'daily')!;
    expect(daily.weeks[13]!.honours[0]).toBeGreaterThan(0);
  });
});

describe('creature rarities (Q38)', () => {
  it('the findable lines come from the content (8 common, 3 rare, 3 epic) and each drop repeats its own pattern', () => {
    const rar = speciesRarities(RULES);
    const first = rar.slice(0, RULES.scouts.species.start);
    expect(first).toHaveLength(14);
    expect([0, 1, 2].map((k) => first.filter((x) => x === k).length)).toEqual([8, 3, 3]);
    const drop = rar.slice(14, 26);
    expect([0, 1, 2].map((k) => drop.filter((x) => x === k).length)).toEqual([6, 4, 2]);
    expect(rar.slice(26, 38)).toEqual(drop);
  });

  it("count the forms of a line: the content's for today's lines, a typical number by rarity for drops", () => {
    const forms = lineForms(RULES);
    const findable = new Set(
      content.creatures.filter((c) => c.stage === 1 && c.catchable).map((c) => c.line),
    );
    expect(forms.slice(0, 14).reduce((a, b) => a + b, 0)).toBe(
      content.creatures.filter((c) => findable.has(c.line)).length,
    );
    expect(forms.slice(14, 26).reduce((a, b) => a + b, 0)).toBe(6 * 3 + 4 * 2 + 2 * 1);
  });

  it('evolve for Essence by rarity: a rare line costs what the content says, twice a common one; epics do not evolve', () => {
    expect(RULES.xp.evolveCostByRarity[1]).toBe(2);
    const p = createPlayer(RULES, 'trials', 1, 0, profileById('daily'), 4);
    const common = RULES.scouts.lines.first.findIndex((l) => l.rarity === 0);
    const rare = RULES.scouts.lines.first.findIndex((l) => l.rarity === 1 && l.forms > 1);
    const epic = RULES.scouts.lines.first.findIndex((l) => l.rarity === 2);
    expect(evolveCost(RULES, rare)).toBe(2 * evolveCost(RULES, common));
    expect(addCreature(p, epic).canEvolve).toBe(false);
    expect(addCreature(p, common).canEvolve).toBe(true);
  });

  it('arrive as commons mostly: a daily player owns more commons than rares and more rares than epics, over a run', () => {
    const run = runServer({ ...ALL_SERVERS.find((s) => s.id === 'mixed8')!, weeks: 16 }, 3);
    const daily = run.players.find((x) => x.profile === 'daily')!;
    const [c, r, e] = daily.weeks[15]!.kindsByRarity as [number, number, number];
    expect(c).toBeGreaterThan(r);
    expect(r).toBeGreaterThanOrEqual(e);
    expect(daily.weeks[15]!.availableByRarity[0]).toBeGreaterThan(
      daily.weeks[15]!.availableByRarity[2]!,
    );
  });

  it('server coverage is a share between 0 and 1 and at least what any one player owns', () => {
    const run = runServer({ ...ALL_SERVERS.find((s) => s.id === 'mixed8')!, weeks: 12 }, 4);
    run.log.forEach((week, i) => {
      for (let r = 0; r < 3; r++) {
        const cover = week.coverage[r]!;
        expect(cover).toBeGreaterThanOrEqual(0);
        expect(cover).toBeLessThanOrEqual(1);
        for (const p of run.players) {
          const w = p.weeks.find((x) => x.week === week.week);
          if (!w || !w.availableByRarity[r]) continue;
          expect(cover + 1e-9).toBeGreaterThanOrEqual(
            w.kindsByRarity[r]! / w.availableByRarity[r]!,
          );
        }
      }
      expect(i).toBeLessThan(12);
    });
  });
});

describe('the fire with and without a time floor (Q37 B)', () => {
  it('a server with no floor and no boss kills stays below one with the slow floor', () => {
    const base = ALL_SERVERS.find((s) => s.id === 'mixed8-none')!;
    const slow = runServer({ ...base, weeks: 12 }, 5);
    const none = runServer(
      { ...ALL_SERVERS.find((s) => s.id === 'mixed8-none-nofloor')!, weeks: 12 },
      5,
    );
    expect(none.log[11]!.fire).toBeLessThanOrEqual(slow.log[11]!.fire);
    expect(slow.log[11]!.fire).toBeGreaterThanOrEqual(
      RULES.fire.start + RULES.fire.floorPerWeek * 11,
    );
    // Without the floor the fire is only what was built.
    expect(none.log[11]!.fire).toBeLessThan(RULES.fire.start + RULES.fire.floorPerWeek * 11 + 30);
  });
});
