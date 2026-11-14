import { learningPrice as gameLearningPrice, teacherCandidates } from '@creatures/game';
import { fightTeam } from './honours';
import { note } from './journey';
import type { Rules } from './rules';
import { TALENT_IDS, benefits, poolOf } from './talents';
import type { Creature, Player, Server } from './types';
import { R } from './types';
import { uniform } from './util';
import { debit, speciesRarities } from './world';

/**
 * The School (docs/design/valley/systems/school.md, "As decided (round 22)", V-SCH-10..15).
 *
 * First learning (V-SCH-10): a creature learns a talent the first time a slot opens, ON ITS CARD (not at the School): slot 1 when it is caught (free: the born talent, the owner 2026-11-09),
 * slot 2 at level 20, slot 3 at level 25 on rare and epic lines. It is instant at the player's visit and pays Acorns once (the slot's number
 * times `school.price`); swapping between learned talents is free and is not modelled. (Before round 22 the lab seated the creature at the
 * School for 24 hours for the same price.)
 *
 * The visiting teacher (V-SCH-11..13): every week, Monday to Wednesday, announced `teacherAnnounceDays` days ahead. One talent for the server,
 * drawn among the talents that would benefit at least one player, preferring ones that benefit more than one and never all of them. A player
 * seats a student (up to `school.seats`, one per line) at a visit once the announcement shows one of their lines benefits; a creature seated
 * before the arrival or on any day of the stay learns by the next morning: the talent enters that player's book for the line. A lesson is
 * free at the School; the talent is then learned on a creature's card for the price of a later first learning (slot 2) and adds no slot. Graduation is held at the School and has no cost here.
 */

/** How many talent slots a creature has open at its level (the third only on rare and epic lines). */
export function openSlots(rules: Rules, c: Creature): number {
  const { slotLevels, thirdSlotFromRarity } = rules.school;
  const rarity = speciesRarities(rules)[c.species] ?? 0;
  return slotLevels.filter(
    (level, i) => c.level >= level && (i < 2 || rarity >= thirdSlotFromRarity),
  ).length;
}

/**
 * A creature is born with its first talent (free, learned at catch); the talent a lesson adds is learned on the card as a later talent, so
 * the server charges at least the second slot's price for it.
 */
const LESSON_SLOT = 2;

/** The Acorns a first learning of this slot costs (slot 1, the born talent, is free). */
export const learningPrice = (rules: Rules, slot: number): number => gameLearningPrice(rules, slot);

/**
 * The server's day (at 00:00): announces the next teacher's talent `teacherAnnounceDays` ahead and, on the Monday of the arrival, records the
 * visit. The talent is drawn from the books as they stand at the announcement (deterministic from the seed).
 */
export function teacherDay(
  server: Server,
  players: readonly Player[],
  day: number,
  rules: Rules,
): void {
  const { teacherAnnounceDays } = rules.school;
  const joined = players.filter((p) => day * 24 >= p.joinHour && p.creatures.length > 0);
  if ((day + teacherAnnounceDays) % 7 === 0 && day + teacherAnnounceDays >= 7) {
    const week = (day + teacherAnnounceDays) / 7;
    server.teacherTalent[week] = drawTalent(server, joined);
  }
  if (day % 7 === 0 && day >= 7) {
    const week = day / 7;
    const talent = server.teacherTalent[week] ?? null;
    server.teacherVisits.push({
      week,
      talent,
      players: joined.length,
      eligible: talent === null ? 0 : joined.filter((p) => benefits(p, talent)).length,
      learners: 0,
      profiles: joined.map((p) => p.profile.id),
      eligibleProfiles:
        talent === null ? [] : joined.filter((p) => benefits(p, talent)).map((p) => p.profile.id),
    });
  }
}

/**
 * V-SCH-12 (the owner's words: "it's fine if it doesn't benefit many players ... select one that benefits hopefully more than one. But we
 * don't want ... everyone"). Of the talents that benefit at least one player: first those that benefit a few players, from 2 up to
 * max(2, 25% of the server's players) and never all; else those that benefit exactly one; else the fewest there are. (The first draft,
 * rule `several`: any number from 2 to all but one, else exactly one.) Null when no talent benefits anyone. `cull` is in five pools and is drawn like any other talent.
 */
export function drawTalent(server: Server, joined: readonly Player[]): number | null {
  const n = joined.length;
  const counts = TALENT_IDS.map((_, t) => joined.filter((p) => benefits(p, t)).length);
  // The band rule is the game's (`teacherCandidates`, shared with the server's weekly pick).
  const from = teacherCandidates(counts, n, server.config.teacherRule ?? 'few');
  if (from.length === 0) return null;
  return from[Math.floor(uniform(server.teacherRng) * from.length)] ?? null;
}

/** A student whose seat time has come learns the talent: it enters the player's book for the line if the line can take it and the book lacks it. */
export function stepSchool(p: Player, hour: number, server?: Server): void {
  if (p.school.length === 0) return;
  p.school = p.school.filter((seat) => {
    if (seat.until > hour) return true;
    const line = seat.creature.species;
    const book = (p.book[line] ??= new Set<number>());
    if (poolOf(line).includes(seat.talent) && !book.has(seat.talent)) {
      book.add(seat.talent);
      p.bookTeacher += 1;
      p.lessonsToPay += 1;
      p.wk.teacherLessons += 1;
      const visit = server?.teacherVisits.find((v) => v.week === seat.teacher);
      if (visit && p.lessonWeek !== seat.teacher) visit.learners += 1;
      p.lessonWeek = seat.teacher;
      note(
        p,
        `school: a creature learned ${TALENT_IDS[seat.talent] ?? 'a talent'} from the visiting teacher`,
      );
    }
    return false;
  });
}

/**
 * At a visit: pay for the first learnings on the cards (the creatures that fight first, then the highest level), and seat students for the
 * teacher whose talent is announced or at the School (the teacher of the coming Monday from the day of the announcement, the current
 * one Monday to Wednesday). Without a server there is no teacher.
 */
export function startLearning(p: Player, hour: number, server?: Server): void {
  const rules = p.rules;
  const day = Math.floor(hour / 24);
  const dow = day % 7;
  const week = Math.floor(day / 7);
  // The teacher this visit can send a student to, and the morning the lesson is learned.
  let teacher = -1;
  let until = 0;
  if (dow < rules.school.teacherStayDays) {
    teacher = week;
    until = (day + 1) * 24;
  } else if (dow >= 7 - rules.school.teacherAnnounceDays) {
    teacher = week + 1;
    until = ((week + 1) * 7 + 1) * 24;
  }
  const talent = server && teacher >= 1 ? (server.teacherTalent[teacher] ?? null) : null;
  if (talent !== null) {
    const seated = new Set(p.school.map((s) => s.creature.species));
    const students = [...p.creatures]
      .filter((c) => !seated.has(c.species) && poolOf(c.species).includes(talent))
      .filter((c) => !p.book[c.species]?.has(talent))
      .sort((a, b) => b.level - a.level);
    for (const c of students) {
      if (p.school.length >= rules.school.seats) break;
      if (p.school.some((s) => s.creature.species === c.species)) continue;
      p.school.push({ creature: c, teacher, talent, until });
      note(p, `school: a student seated for ${TALENT_IDS[talent] ?? 'the teacher'}`);
    }
  }
  // A talent that entered the book is learned on a creature's card for the price of a first learning (the Acorn sink the lab had for a lesson).
  while (p.lessonsToPay > 0 && (p.stock[R.acorns] ?? 0) >= learningPrice(rules, LESSON_SLOT)) {
    const price = learningPrice(rules, LESSON_SLOT);
    debit(p, R.acorns, price, 'school');
    p.wk.learnAcorns += price;
    p.lessonsToPay -= 1;
    note(p, `school: a creature learned the teacher's talent on its card (${price} Acorns)`);
  }
  const team = new Set(p.profile.fights ? fightTeam(p) : []);
  const due = p.creatures
    .filter((c) => c.learned < openSlots(rules, c))
    .sort(
      (a, b) =>
        Number(team.has(b)) - Number(team.has(a)) || b.level - a.level || a.learned - b.learned,
    );
  for (const c of due) {
    const slot = c.learned + 1;
    const price = learningPrice(rules, slot);
    if ((p.stock[R.acorns] ?? 0) < price) break;
    debit(p, R.acorns, price, 'school');
    p.wk.learnAcorns += price;
    p.wk.learnings += 1;
    c.learned = slot;
    note(p, `school: a creature learned its talent ${slot} on its card (${price} Acorns)`);
  }
}
