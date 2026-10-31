/** The School (V-SCH-7, V-SCH-8) and the broker (V-FORGE-11). */
import { describe, expect, it } from 'vitest';
import { brokerHour, brokerTerms } from '../src/forge';
import { profileById } from '../src/profiles';
import { RULES } from '../src/rules';
import { activeCounts } from '../src/scouts';
import { learningPrice, openSlots, startLearning, stepSchool } from '../src/school';
import { R } from '../src/types';
import { addCreature, createPlayer, creditShard } from '../src/world';

const MONDAY = 0;
const WEDNESDAY = 2 * 24 + 20;

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

  it('cost the slot number times the price', () => {
    expect(learningPrice(RULES, 1)).toBe(RULES.school.price);
    expect(learningPrice(RULES, 3)).toBe(3 * RULES.school.price);
  });
});

describe('learning at the School', () => {
  it('takes a seat for the stay and the Acorns once, then the creature has learned the slot', () => {
    const p = setup(1);
    const before = p.stock[R.acorns]!;
    startLearning(p, MONDAY);
    expect(p.school).toHaveLength(1);
    expect(before - p.stock[R.acorns]!).toBe(RULES.school.price);
    expect(p.wk.learnAcorns).toBe(RULES.school.price);
    for (let h = 0; h < RULES.school.hours - 1; h++) stepSchool(p, 1);
    expect(p.creatures[0]!.learned).toBe(0);
    stepSchool(p, 1);
    expect(p.creatures[0]!.learned).toBe(1);
    expect(p.school).toHaveLength(0);
    expect(p.wk.learnings).toBe(1);
    // Learned: it is not sent again, and nothing more is paid.
    const acorns = p.stock[R.acorns]!;
    startLearning(p, MONDAY + 24);
    expect(p.stock[R.acorns]).toBe(acorns);
  });

  it('is limited by the seats, and a creature that cannot be paid for waits', () => {
    const p = setup(5);
    startLearning(p, MONDAY);
    expect(p.school).toHaveLength(RULES.school.seats);
    const poor = setup(2);
    poor.stock[R.acorns] = RULES.school.price - 1;
    startLearning(poor, MONDAY);
    expect(poor.school).toHaveLength(0);
    expect(poor.stock[R.acorns]).toBe(RULES.school.price - 1);
  });

  it('has a visiting teacher whose offer stays until claimed or the next teacher comes: once a week, from his day', () => {
    const p = setup(3);
    for (const c of p.creatures) c.learned = 1;
    startLearning(p, MONDAY);
    expect(p.wk.teacherLessons).toBe(0);
    startLearning(p, WEDNESDAY);
    expect(p.wk.teacherLessons).toBe(1);
    expect(p.wk.learnAcorns).toBe(RULES.school.price);
    // Not twice for the same teacher, whatever the seats and the day (up to the Tuesday after).
    startLearning(p, WEDNESDAY + 24);
    startLearning(p, 168 + 20);
    expect(p.wk.teacherLessons).toBe(1);
    // A lesson teaches no slot: the creature has the slots it had.
    for (let h = 0; h < RULES.school.hours; h++) stepSchool(p, 1);
    expect(p.creatures.every((c) => c.learned === 1)).toBe(true);
    // The next teacher (the next Wednesday) has a new lesson.
    startLearning(p, 168 + WEDNESDAY);
    expect(p.wk.teacherLessons).toBe(2);
  });

  it('lets a Sunday-only player take the lesson of the teacher who came on Wednesday', () => {
    const p = setup(3);
    for (const c of p.creatures) c.learned = 1;
    startLearning(p, 6 * 24 + 20);
    expect(p.wk.teacherLessons).toBe(1);
    // The Sunday before his first Wednesday had no teacher yet.
    const early = setup(3);
    for (const c of early.creatures) c.learned = 1;
    startLearning(early, 24 + 20);
    expect(early.wk.teacherLessons).toBe(0);
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
