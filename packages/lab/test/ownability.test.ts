/** Ownability: a slot's tool line must be ownable by a mixed server at the week the slot arrives (`ownability.ts`, `boss-track.md`). */
import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import { BOSS_ANSWERS, answerLine } from '../src/bossAnswers';
import {
  answerOwnability,
  lineOfForm,
  lineRarity,
  nonCommonLines,
  ownabilityMarkdown,
  ownabilityTable,
  ownableChance,
  slotOwnability,
} from '../src/ownability';
import { OWNABLE_CHANCE_MIN, OWNABLE_SERVER } from '../src/targets';
import { SLOT_WEEKS, TRACK_ORDER } from '../src/track';
import { ROSTER_WEEKS } from '../src/roster';
import { VALLEY_COVERAGE, type ServerCoverage } from '../src/valley';

/** A coverage where every server has these shares at every week. */
const flat = (rare: number, epic: number): ServerCoverage => {
  const weeks = Array.from({ length: ROSTER_WEEKS }, (_, i) => ({
    week: i + 1,
    common: 1,
    rare,
    epic,
  }));
  return { mixed5: weeks, mixed8: weeks, mixed15: weeks };
};

describe('lines and rarity', () => {
  it('counts ownership per line, with the rarity of the first stage', () => {
    expect(lineOfForm('tempestray')).toBe('stormray');
    expect(lineOfForm('halcyray')).toBe('stormray');
    expect(lineRarity('stormray')).toBe('rare');
    expect(lineRarity('splashet')).toBe('common');
    expect(lineRarity('solmane')).toBe('epic');
    expect(() => lineOfForm('nothing')).toThrow(/not a form/);
  });

  it('has the rare and epic lines the design names', () => {
    const lines = [...new Set(content.creatures.map((c) => c.line))];
    expect(lines.filter((l) => lineRarity(l) === 'rare').sort()).toEqual([
      'coralynx',
      'mossback',
      'stormray',
    ]);
    expect(lines.filter((l) => lineRarity(l) === 'epic').sort()).toEqual([
      'aurorix',
      'gaiadrake',
      'hearthshell',
      'lanternfin',
      'solmane',
    ]);
  });

  it('lists each non-common line once, with the forms of it the line uses', () => {
    const needed = nonCommonLines(
      answerLine('tempestray/none halcyray/none tempestray/none splashet/none gaiadrake/none'),
    );
    expect(needed.map((n) => [n.line, n.rarity])).toEqual([
      ['stormray', 'rare'],
      ['gaiadrake', 'epic'],
    ]);
    expect(needed[0]?.forms).toEqual(['tempestray', 'halcyray']);
    expect(nonCommonLines(answerLine('splashet/none tidewing/none'))).toEqual([]);
  });
});

describe('the chance', () => {
  const rareTwo = nonCommonLines(answerLine('tempestray/none ancientshell/none'));

  it('is the product of the rarity coverages, one per distinct line, and 1 for an all-common answer', () => {
    expect(ownableChance(rareTwo, 5, 'mixed8', flat(0.6, 0.2))).toBeCloseTo(0.36);
    expect(
      ownableChance(
        nonCommonLines(answerLine('tempestray/none gaiadrake/none')),
        5,
        'mixed8',
        flat(0.6, 0.2),
      ),
    ).toBeCloseTo(0.12);
    expect(ownableChance([], 1, 'mixed5', flat(0, 0))).toBe(1);
  });

  it('is ownable from the minimum chance on the rule’s server, and not below it', () => {
    const answer = { label: 'x', tool: 'x', line: 'tempestray/none splashet/none' };
    expect(answerOwnability(answer, 1, flat(OWNABLE_CHANCE_MIN, 0)).ownable).toBe(true);
    expect(answerOwnability(answer, 1, flat(OWNABLE_CHANCE_MIN - 0.01, 0)).ownable).toBe(false);
    // The rule reads one server: the others are only shown.
    const mixed = { ...flat(0, 0), [OWNABLE_SERVER]: flat(0.9, 0)[OWNABLE_SERVER] };
    expect(answerOwnability(answer, 1, mixed).ownable).toBe(true);
    expect(answerOwnability(answer, 1, mixed).chance.mixed5).toBe(0);
    const allCommon = { label: 'x', tool: 'x', line: 'splashet/none tidewing/none' };
    expect(answerOwnability(allCommon, 1, flat(0, 0)).ownable).toBe(true);
  });

  it('reads the coverage at the week asked', () => {
    const early = ownableChance(rareTwo, 1, 'mixed8', VALLEY_COVERAGE);
    const late = ownableChance(rareTwo, 24, 'mixed8', VALLEY_COVERAGE);
    expect(late).toBeGreaterThan(early);
  });
});

describe('the track', () => {
  it('has an arrival week for each slot of three laps, in order', () => {
    expect(SLOT_WEEKS).toHaveLength(3 * TRACK_ORDER.length);
    SLOT_WEEKS.forEach((w, i) => {
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(ROSTER_WEEKS);
      if (i > 0) expect(w).toBeGreaterThanOrEqual(SLOT_WEEKS[i - 1] as number);
    });
  });

  it('takes the tool line as the boss’s first answer, with every answer listed', () => {
    const s = slotOwnability(1);
    expect(s.bossId).toBe(TRACK_ORDER[0]);
    expect(s.answers).toHaveLength(BOSS_ANSWERS[s.bossId]?.length as number);
    expect(s.tool).toBe(s.answers[0]);
    expect(s.pass).toBe(s.tool.ownable);
  });

  it('prints one row for each slot, naming the failures', () => {
    const rows = ownabilityTable([1, 24]);
    const md = ownabilityMarkdown(rows, 'a test').join('\n');
    expect(md).toContain('Arrival weeks: a test');
    expect(md).toContain(`| 1 | ${TRACK_ORDER[0]} | 1 |`);
    expect(md).toContain(`| 2 | ${TRACK_ORDER[1]} | 24 |`);
  });

  // The rule of `boss-track.md`, "Ownability". If a slot fails here the content is the problem (the first answer of a boss uses a rare
  // line before rare lines are common enough): the lead decides whether to change the answer, the slot or the rule. Do not loosen it here.
  it('has a tool line every slot’s server can own at the week the slot arrives', () => {
    const failing = ownabilityTable().filter((r) => !r.pass);
    expect(
      failing.map(
        (r) =>
          `slot ${r.slot} ${r.bossId} week ${r.week}: needs ${r.tool.needed.map((n) => n.line).join(', ')}, chance ${Math.round(100 * r.tool.chance[OWNABLE_SERVER])}%`,
      ),
    ).toEqual([]);
  });
});
