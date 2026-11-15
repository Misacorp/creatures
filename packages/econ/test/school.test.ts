/** The School (V-SCH-10 to V-SCH-13) and the broker (V-FORGE-11). */
import { describe, expect, it } from 'vitest';
import { brokerHour, brokerTerms } from '../src/forge';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { activeCounts } from '../src/scouts';
import { drawTalent, learningPrice, openSlots, startLearning, stepSchool } from '../src/school';
import { ALL_SERVERS } from '../src/servers';
import { runServer } from '../src/sim';
import { combatV2 } from '@creatures/game/combat-v2';
import { TALENT_IDS, poolOf } from '../src/talents';
import { R } from '../src/types';
import { addCreature, createPlayer, createServer, creditShard } from '../src/world';

const MONDAY = 0;

const setup = (creatures = 4) => {
  const p = createPlayer(RULES, 'school', 1, 0, { ...profileById('daily'), fights: false }, 4);
  for (let s = 0; s < creatures; s++) addCreature(p, s);
  p.stock[R.acorns] = 10_000;
  return p;
};

describe('talent slots', () => {
  it('open at level 1, 20 and 25, the third only on rare and epic lines', () => {
    const p = setup(1);
    const common = p.creatures[0]!;
    // Species 0 is a common line of the content; a rare one is found by the rarity table.
    expect(openSlots(RULES, common)).toBe(1);
    common.level = 20;
    expect(openSlots(RULES, common)).toBe(2);
    common.level = 30;
    expect(openSlots(RULES, common)).toBe(2);
    const rare = addCreature(
      p,
      RULES.scouts.lines.first.findIndex((l) => l.rarity >= 1),
    );
    rare.level = 25;
    expect(openSlots(RULES, rare)).toBe(3);
  });

  it('cost the slot number times the price, the born talent (slot 1) nothing', () => {
    expect(learningPrice(RULES, 1)).toBe(0);
    expect(learningPrice(RULES, 2)).toBe(2 * RULES.school.price);
    expect(learningPrice(RULES, 3)).toBe(3 * RULES.school.price);
  });
});

describe('first learning, on the card (V-SCH-10)', () => {
  it('a creature is born with its first talent, free', () => {
    const p = setup(1);
    const before = p.stock[R.acorns]!;
    startLearning(p, MONDAY);
    expect(p.creatures[0]!.learned).toBe(1);
    expect(p.stock[R.acorns]).toBe(before);
    expect(p.wk.learnings).toBe(0);
  });

  it('is instant at the visit, pays the Acorns once and takes no School seat', () => {
    const p = setup(1);
    p.creatures[0]!.level = 20;
    const before = p.stock[R.acorns]!;
    startLearning(p, MONDAY);
    expect(p.school).toHaveLength(0);
    expect(p.creatures[0]!.learned).toBe(2);
    expect(before - p.stock[R.acorns]!).toBe(2 * RULES.school.price);
    expect(p.wk.learnAcorns).toBe(2 * RULES.school.price);
    expect(p.wk.learnings).toBe(1);
    const acorns = p.stock[R.acorns]!;
    startLearning(p, MONDAY + 24);
    expect(p.stock[R.acorns]).toBe(acorns);
  });

  it('waits for Acorns it does not have', () => {
    const poor = setup(2);
    for (const c of poor.creatures) c.level = 20;
    poor.stock[R.acorns] = 2 * RULES.school.price - 1;
    startLearning(poor, MONDAY);
    expect(poor.creatures.every((c) => c.learned === 1)).toBe(true);
    expect(poor.stock[R.acorns]).toBe(2 * RULES.school.price - 1);
  });
});

const options = { bossKills: 'half', communalSeats: true, shardExchange: true } as const;

/** A server and `n` players that each own the lines `lines`. */
const serverOf = (n: number, lines: number[]) => {
  const server = createServer('teacher', 1, options, RULES);
  const players = Array.from({ length: n }, (_, i) => {
    const p = createPlayer(RULES, 'teacher', 1, i, { ...profileById('daily'), fights: false }, 8);
    for (const l of lines) addCreature(p, l);
    p.stock[R.acorns] = 10_000;
    return p;
  });
  return { server, players };
};
const talentOutside = (line: number) => TALENT_IDS.findIndex((_, t) => !poolOf(line).includes(t));

describe('the visiting teacher (V-SCH-11 to V-SCH-13)', () => {
  it('has the real pools of 7, cull included where talents.json puts it', () => {
    expect(TALENT_IDS).toHaveLength(34);
    for (let l = 0; l < RULES.scouts.species.start; l++) expect(poolOf(l)).toHaveLength(7);
    const cull = TALENT_IDS.indexOf('cull');
    expect(cull).toBeGreaterThanOrEqual(0);
    // Every launch line's pool is one of the real pools of talents.json, and cull is in some of them (the owner's trial).
    const real = Object.values(combatV2.pools).map((ids) =>
      ids.map((id) => TALENT_IDS.indexOf(id)),
    );
    const lines = Array.from({ length: RULES.scouts.species.start }, (_, l) => poolOf(l));
    for (const pool of lines) expect(real).toContainEqual(pool);
    expect(lines.some((pool) => pool.includes(cull))).toBe(true);
  });

  it('draws a talent that benefits someone, never everyone, preferring several; deterministically', () => {
    const { server, players } = serverOf(4, [0]);
    const pool = [...poolOf(0)];
    const books = (sizes: number[]) =>
      sizes.forEach((n, i) => (players[i]!.book[0] = new Set(pool.slice(0, n))));
    // Alike books: whatever is missing is missing for all of them, so there is nothing to draw.
    books([7, 7, 7, 7]);
    expect(drawTalent(server, players)).toBeNull();
    // Alike books that all lack a talent: every talent benefits everyone, so the fewest there are (all of them) is taught.
    books([4, 4, 4, 4]);
    expect(pool.slice(4)).toContain(drawTalent(server, players));
    // Two players lack the last two talents of the pool, two hold all: two beneficiaries each.
    books([7, 7, 5, 5]);
    const talent = drawTalent(server, players);
    expect(talent === pool[5] || talent === pool[6]).toBe(true);
    const again = serverOf(4, [0]);
    again.players.forEach((p, i) => (p.book[0] = new Set(pool.slice(0, i < 2 ? 7 : 5))));
    expect(drawTalent(again.server, again.players)).toBe(talent);
    // With one player lacking pool[6] and another lacking pool[5] and pool[6]: pool[5] and pool[6] benefit several or one, several wins.
    books([7, 7, 6, 5]);
    expect(drawTalent(server, players)).toBe(pool[6]);
    // Only one beneficiary exists: that talent is drawn.
    books([7, 7, 7, 6]);
    expect(drawTalent(server, players)).toBe(pool[6]);
  });

  it('prefers a few beneficiaries (2 to a quarter of the server, at least 2) over many', () => {
    const { server, players } = serverOf(8, [0]);
    const pool = [...poolOf(0)];
    const sizes = [7, 7, 7, 6, 5, 5, 4, 4];
    sizes.forEach((n, i) => (players[i]!.book[0] = new Set(pool.slice(0, n))));
    // pool[6] is lacked by 5 players, pool[5] by 4, pool[4] by 2: the band is 2 players, so only pool[4] is taught.
    for (let i = 0; i < 20; i++) {
      expect(drawTalent(createServer('teacher', i, options, RULES), players)).toBe(pool[4]);
    }
    // The first draft takes any of several.
    const old = createServer('teacher', 1, { ...options, teacherRule: 'several' }, RULES);
    const seen = new Set(Array.from({ length: 60 }, () => drawTalent(old, players)));
    expect(seen.size).toBeGreaterThan(2);
    expect(drawTalent(server, players)).not.toBeNull();
  });

  it('seats a student before the arrival, and the lesson enters the book by the next morning', () => {
    const { server, players } = serverOf(2, [0]);
    const p = players[0]!;
    const talent = poolOf(0).find((t) => !p.book[0]!.has(t))!;
    server.teacherTalent[1] = talent;
    server.teacherVisits.push({
      week: 1,
      talent,
      players: 2,
      eligible: 1,
      learners: 0,
      profiles: [],
      eligibleProfiles: [],
    });
    // Sunday of the week before the arrival: announced since Friday.
    startLearning(p, 6 * 24 + 20, server);
    expect(p.school).toHaveLength(1);
    expect(p.bookTeacher).toBe(0);
    // Monday evening: still waiting; Tuesday 00:00: learned.
    stepSchool(p, 7 * 24 + 20, server);
    expect(p.school).toHaveLength(1);
    stepSchool(p, 8 * 24, server);
    expect(p.school).toHaveLength(0);
    expect(p.book[0]!.has(talent)).toBe(true);
    expect(p.bookTeacher).toBe(1);
    expect(p.wk.teacherLessons).toBe(1);
    expect(server.teacherVisits[0]!.learners).toBe(1);
    // The talent is no longer taught to this player, and learning it on a card costs the price of a first learning, once.
    const acorns = p.stock[R.acorns]!;
    startLearning(p, 8 * 24 + 20, server);
    expect(p.school).toHaveLength(0);
    expect(p.lessonsToPay).toBe(0);
    expect(acorns - p.stock[R.acorns]!).toBeGreaterThanOrEqual(RULES.school.price);
  });

  it('seats on a day of the stay, one per line and up to the seats; none before the announcement or after the stay', () => {
    const { server, players } = serverOf(1, [0, 1, 2]);
    const p = players[0]!;
    const talent = poolOf(0).find((t) => poolOf(1).includes(t) && poolOf(2).includes(t));
    const shared = talent ?? poolOf(0).find((t) => poolOf(1).includes(t))!;
    for (const l of [0, 1, 2]) p.book[l]?.delete(shared);
    server.teacherTalent[1] = shared;
    // Thursday before the announcement (Friday): nobody is seated.
    startLearning(p, 3 * 24 + 20, server);
    expect(p.school).toHaveLength(0);
    // Monday of the stay.
    startLearning(p, 7 * 24 + 8, server);
    expect(p.school.length).toBeGreaterThan(0);
    expect(p.school.length).toBeLessThanOrEqual(RULES.school.seats);
    expect(new Set(p.school.map((s) => s.creature.species)).size).toBe(p.school.length);
    expect(p.school.every((s) => s.until === 8 * 24)).toBe(true);
    // Thursday after the stay: too late.
    const late = serverOf(1, [0]);
    late.players[0]!.book[0]?.delete(shared);
    late.server.teacherTalent[1] = shared;
    startLearning(late.players[0]!, 10 * 24 + 20, late.server);
    expect(late.players[0]!.school).toHaveLength(0);
  });

  it('teaches nothing to a line whose pool lacks it', () => {
    const { server, players } = serverOf(1, [0]);
    server.teacherTalent[1] = talentOutside(0);
    startLearning(players[0]!, 7 * 24 + 8, server);
    expect(players[0]!.school).toHaveLength(0);
  });

  it('visits every week of a run from the second Monday; books fill from finds first', () => {
    const run = runServer({ ...ALL_SERVERS.find((s) => s.id === 'mixed8')!, weeks: 12 }, 5);
    expect(run.teacherVisits.map((v) => v.week)).toEqual(
      Array.from({ length: 11 }, (_, i) => i + 1),
    );
    for (const v of run.teacherVisits) expect(v.eligible).toBeLessThanOrEqual(v.players);
    expect(run.teacherVisits.some((v) => v.learners > 0)).toBe(true);
    const last = (p: (typeof run.players)[number]) => p.weeks[p.weeks.length - 1];
    const finds = run.players.reduce((n, p) => n + (last(p)?.bookFinds ?? 0), 0);
    const taught = run.players.reduce((n, p) => n + (last(p)?.bookTeacher ?? 0), 0);
    expect(taught).toBeGreaterThan(0);
    expect(finds).toBeGreaterThan(taught);
  });
});

describe('the broker', () => {
  it('needs a creature nobody else needs: only a spare one posts', () => {
    const few = setup(4);
    for (let i = 0; i < 2; i++) {
      few.seats.push({ dest: 0, store: 0, wasted: 0, mastery: 0 });
      few.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
    }
    expect(activeCounts(few).brokers).toBe(0);
    addCreature(few, 5);
    expect(activeCounts(few).brokers).toBe(1);
    addCreature(few, 6);
    expect(activeCounts(few).brokers).toBe(RULES.broker.seats);
  });

  it('trades better as its mastery grows', () => {
    const p = setup();
    const rates = [];
    for (const hours of [0, 48, 168, 504]) {
      p.brokerMastery = hours;
      rates.push(brokerTerms(p));
    }
    expect(rates.map((r) => r.rate)).toEqual(RULES.broker.tiers.map((t) => t.rate));
    expect(rates[3]!.rate).toBeLessThan(rates[0]!.rate);
    expect(rates[3]!.critChance).toBeGreaterThan(rates[0]!.critChance);
  });

  it('turns surplus shards into the element the orders wait on, keeping the reserve', () => {
    const p = setup();
    p.anvils.push({ working: false, progress: 0, need: 0, element: 0, rarity: 0, mastery: 0 });
    p.weakByElement[2] = 1;
    creditShard(p, 0, RULES.forge.giveReserveShards + 9, 'test');
    const before = p.shards.reduce((a, b) => a + b, 0);
    brokerHour(p, 1);
    expect(p.shards[2]).toBeGreaterThanOrEqual(RULES.forge.shard);
    expect(p.shards[0]).toBeGreaterThanOrEqual(RULES.forge.giveReserveShards - 1e-9);
    expect(p.shards.reduce((a, b) => a + b, 0)).toBeLessThan(before);
    expect(p.brokerMastery).toBe(1);
    expect(p.wk.brokerHours).toBe(1);
  });
});
