import { fightTeam } from './honours';
import { note } from './journey';
import type { Rules } from './rules';
import type { Creature, Player } from './types';
import { HOURS_PER_WEEK, R } from './types';
import { debit, speciesRarities } from './world';

/**
 * The School (docs/design/valley/systems/school.md, V-SCH-7..9). A creature learns a talent the first time a slot opens: slot 1 when it
 * is caught, slot 2 at level 20, slot 3 at level 25 on rare and epic lines. The first learning of a slot takes a School seat for
 * `school.hours` effective hours and pays Acorns once (the slot's number times `school.price`); swapping between learned talents is free
 * and is not modelled. A visiting teacher comes once a week: a lesson costs the price of a first learning and a seat for a stay and counts
 * toward the talents found. Graduation is held at the School and has no cost here.
 */

/** How many talent slots a creature has open at its level (the third only on rare and epic lines). */
export function openSlots(rules: Rules, c: Creature): number {
  const { slotLevels, thirdSlotFromRarity } = rules.school;
  const rarity = speciesRarities(rules)[c.species] ?? 0;
  return slotLevels.filter(
    (level, i) => c.level >= level && (i < 2 || rarity >= thirdSlotFromRarity),
  ).length;
}

/** The Acorns a first learning of this slot costs. */
export const learningPrice = (rules: Rules, slot: number): number =>
  rules.school.price * Math.max(1, slot);

/** One hour of the seats: the stay runs down, and a creature that finishes has learned its slot. */
export function stepSchool(p: Player, share: number): void {
  if (p.school.length === 0) return;
  for (const seat of p.school) seat.left -= share;
  p.school = p.school.filter((seat) => {
    if (seat.left > 1e-9) return true;
    if (seat.slot > 0) seat.creature.learned = Math.max(seat.creature.learned, seat.slot);
    p.wk.learnings += seat.slot > 0 ? 1 : 0;
    return false;
  });
}

/**
 * At a visit the player sends creatures with an open, unlearned slot to the School while seats are free, the creatures that fight first, then
 * the highest level, paying the price from the Acorns in hand (one that cannot be paid waits). A visiting teacher's lesson for the week is
 * taken when a seat is free.
 */
export function startLearning(p: Player, hour: number): void {
  const rules = p.rules;
  const learning = new Set(p.school.map((s) => s.creature));
  const team = new Set(p.profile.fights ? fightTeam(p) : []);
  const due = p.creatures
    .filter((c) => !learning.has(c) && c.learned < openSlots(rules, c))
    .sort(
      (a, b) =>
        Number(team.has(b)) - Number(team.has(a)) || b.level - a.level || a.learned - b.learned,
    );
  for (const c of due) {
    if (p.school.length >= rules.school.seats) break;
    const slot = c.learned + 1;
    const price = learningPrice(rules, slot);
    if ((p.stock[R.acorns] ?? 0) < price) break;
    debit(p, R.acorns, price, 'school');
    p.wk.learnAcorns += price;
    p.school.push({ creature: c, slot, left: rules.school.hours });
    note(
      p,
      `school: a creature began learning its talent ${slot} (${price} Acorns, ${rules.school.hours} hours)`,
    );
  }
  // The visiting teacher (V-SCH-8): once a week, on or after his day.
  const week = Math.floor(hour / HOURS_PER_WEEK);
  const dayOfWeek = Math.floor(hour / 24) % 7;
  if (p.schoolTeacherWeek !== week && dayOfWeek >= rules.school.teacherDay) {
    const price = learningPrice(rules, 1);
    const student = [...p.creatures]
      .filter((c) => !p.school.some((s) => s.creature === c))
      .sort((a, b) => b.level - a.level)[0];
    if (student && p.school.length < rules.school.seats && (p.stock[R.acorns] ?? 0) >= price) {
      debit(p, R.acorns, price, 'school');
      p.wk.learnAcorns += price;
      p.wk.teacherLessons += 1;
      p.school.push({ creature: student, slot: 0, left: rules.school.hours });
      p.schoolTeacherWeek = week;
      note(p, `school: a visiting teacher's lesson for a creature (${price} Acorns)`);
    }
  }
}
