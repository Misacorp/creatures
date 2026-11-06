/**
 * P-13, the gate's second check: every rule card's intended answers beat the classic line on their own card, on the seeds the
 * lab report uses ("Do each card's intended answers work?"). An answer that loses would point a player at a losing pick.
 */
import { describe, expect, it } from 'vitest';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  ANSWERS,
  ANSWER_WITH,
  CARDS,
  CLASSIC_LINE,
  FAMILIES,
  GAUNTLET,
  KNACKS,
  RAID,
  RAID_ANSWERS,
  bossFor,
  classicFor,
  evaluate,
  type Pick,
} from '../src';

const pick = (s: string): Pick => {
  const [formId, knack] = s.split('/');
  return { formId: formId ?? '', knack: knack ?? 'none' };
};
const lineOf = (spec: string): Pick[] => spec.split(' ').map(pick);

describe("each card's intended answers beat the classic line (P-13)", () => {
  const cases = Object.entries(ANSWERS).flatMap(([card, answers]) =>
    answers.map(([label, spec]) => ({ card, label, spec })),
  );

  it('every card that has answers is a card of the lab', () => {
    for (const card of Object.keys(ANSWERS)) expect(CARDS.map((c) => c.id)).toContain(card);
  });

  it.each(cases)('$card: $label', ({ card, label, spec }) => {
    // A card that has nothing to answer alone is measured beside the card it needs (Breakwater with Full Sweep).
    const boss = bossFor(GAUNTLET, [card, ...(ANSWER_WITH[card] ?? [])]);
    const answer = evaluate(boss, lineOf(spec), GAUNTLET, 24, `ans:${card}`);
    const classic = evaluate(boss, CLASSIC_LINE, GAUNTLET, 24, `ans:${card}`);
    expect(answer.score, `${label} must beat the classic line`).toBeGreaterThan(classic.score);
  });

  const raidCases = Object.entries(RAID_ANSWERS).flatMap(([card, answers]) =>
    answers.map(([label, spec]) => ({ card, label, spec })),
  );

  it.each(raidCases)('$card (raid): $label', ({ card, label, spec }) => {
    const boss = bossFor(RAID, [card, ...(ANSWER_WITH[card] ?? [])]);
    expect(lineOf(spec)).toHaveLength(RAID.rows * RAID.cols);
    const answer = evaluate(boss, lineOf(spec), RAID, 24, `ans:${card}`);
    const classic = evaluate(boss, classicFor(RAID), RAID, 24, `ans:${card}`);
    expect(answer.score, `${label} must beat the classic raid line`).toBeGreaterThan(classic.score);
  });

  // P-13: an icon points only at what was measured. A card's answer that is a Knack id needs a line that uses that Knack; one that is a
  // family needs a line with a Knack of that family. (Talents are measured by the talent report, against the classic party.)
  it('every Knack or family a card lists as an answer has a line that measures it', () => {
    // Shake It Off's Debuff answer is measured on the raid weekends of the Tidal Colossus (a Mired build and a boss that sheds it),
    // not in the gauntlet, where Mired never builds (balance.md section 8, 2026-11-05 second answers). Misa accepted it as a
    // one-answer card (2026-11-06): do not lean on a debuff is the only answer, and nothing else is owed.
    const WEEKEND_MEASURED: readonly string[] = ['shake-it-off: Debuff'];
    const missing: string[] = [];
    for (const card of Object.values(combatV2.cards)) {
      const lines = [...(ANSWERS[card.id] ?? []), ...(RAID_ANSWERS[card.id] ?? [])].flatMap(
        ([, spec]) => lineOf(spec),
      );
      for (const a of card.answers) {
        const byId = Object.hasOwn(KNACKS, a);
        const isFamily = Object.hasOwn(FAMILIES, a);
        if (!byId && !isFamily) continue;
        const measured = lines.some((p) => (byId ? p.knack === a : KNACKS[p.knack]?.family === a));
        if (!measured && !WEEKEND_MEASURED.includes(`${card.id}: ${a}`))
          missing.push(`${card.id}: ${a}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('a Spark Setter is paired with a Payoff that cashes its mark (Swarm: Zoom on Voltaro, a Grove Payoff)', () => {
    // Voltaro marks Spark; Tempestray is a Spark Payoff and cashes Tide, so it would never react to it.
    const zoom = lineOf(ANSWERS['swarm']?.find(([label]) => label === 'Zoom')?.[1] ?? '');
    expect(zoom.map((p) => p.formId)).toContain('voltaro');
    expect(zoom.map((p) => p.formId)).not.toContain('tempestray');
    const boss = bossFor(GAUNTLET, ['swarm']);
    expect(evaluate(boss, zoom, GAUNTLET, 24, 'zoom:pair').reactions).toBeGreaterThan(0);
  });
});
