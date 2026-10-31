/**
 * P-13, the gate's second check: every rule card's intended answers beat the classic line on their own card, on the seeds the
 * lab report uses ("Do each card's intended answers work?"). An answer that loses would point a player at a losing pick.
 */
import { describe, expect, it } from 'vitest';
import { ANSWERS, CARDS, CLASSIC_LINE, GAUNTLET, bossFor, evaluate, type Pick } from '../src';

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
    const boss = bossFor(GAUNTLET, [card]);
    const answer = evaluate(boss, lineOf(spec), GAUNTLET, 24, `ans:${card}`);
    const classic = evaluate(boss, CLASSIC_LINE, GAUNTLET, 24, `ans:${card}`);
    expect(answer.score, `${label} must beat the classic line`).toBeGreaterThan(classic.score);
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
