/** Ownability: a slot's tool line must be ownable by a mixed server at the week the slot arrives (`ownability.ts`, `boss-track.md`). */
import { describe, expect, it } from 'vitest';
import { content } from '@creatures/game';
import {
  BOSS_ANSWERS,
  answerLine,
  answerProblems,
  withoutTool,
  type BossAnswer,
} from '../src/bossAnswers';
import {
  answerOwnability,
  lineFindable,
  lineOfForm,
  lineRarity,
  evolvedAt,
  nonCommonLines,
  ownabilityMarkdown,
  ownabilityTable,
  ownableChance,
  slotOwnability,
} from '../src/ownability';
import { ANSWERS } from '../src/report';
import { OWNABLE_CHANCE_MIN, OWNABLE_SERVER } from '../src/targets';
import {
  SLOT_EXTRA_CARDS,
  SLOT_LINE,
  SLOT_WEEKS,
  TRACK_ORDER,
  slotExtraCards,
  slotPreparedOf,
  trackSlot,
} from '../src/track';
import { ROSTER_WEEKS, gatedPick } from '../src/roster';
import {
  COVERAGE_RARITIES,
  COVERAGE_SERVERS,
  VALLEY_COVERAGE,
  coverageAt,
  type ServerCoverage,
} from '../src/valley';

/**
 * A coverage where every server has these launch shares at every week. The all-lines shares are set to something else (0.1), so a
 * test fails if the code reads them instead of the launch shares.
 */
const flat = (rare: number, epic: number): ServerCoverage => {
  const weeks = Array.from({ length: ROSTER_WEEKS }, (_, i) => ({
    week: i + 1,
    common: 0.1,
    rare: 0.1,
    epic: 0.1,
    forms: { common: 0.1, rare: 0.1, epic: 0.1 },
    launch: { common: 1, rare, epic },
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

  it('reads from the content which lines scouts cannot find: the festival prizes', () => {
    const lines = [...new Set(content.creatures.map((c) => c.line))];
    expect(lines.filter((l) => !lineFindable(l)).sort()).toEqual(['hearthshell', 'lanternfin']);
    // The launch content is 16 lines, and scouts find 14 of them: 8 common, 3 rare, 3 epic (the valley's numbers).
    expect(lines).toHaveLength(16);
    const count = (r: string) => lines.filter((l) => lineFindable(l) && lineRarity(l) === r).length;
    expect([count('common'), count('rare'), count('epic')]).toEqual([8, 3, 3]);
    // No common line is a festival prize, so `nonCommonLines` loses none.
    expect(lines.filter((l) => !lineFindable(l) && lineRarity(l) === 'common')).toEqual([]);
    expect(() => lineFindable('nothing')).toThrow(/no stage 1 form/);
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
    expect(needed.map((n) => n.findable)).toEqual([true, true]);
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

  it('is 0 for a festival prize (a line scouts cannot find), even when every share is 1', () => {
    const prize = nonCommonLines(answerLine('lanternfin/none tempestray/none'));
    expect(prize.map((n) => [n.line, n.findable])).toEqual([
      ['lanternfin', false],
      ['stormray', true],
    ]);
    for (const server of COVERAGE_SERVERS)
      expect(ownableChance(prize, 24, server, flat(1, 1))).toBe(0);
    const shell = { label: 'x', tool: 'x', line: 'hearthshell/none splashet/none' };
    const a = answerOwnability(shell, 24, flat(1, 1));
    expect(a.chance).toEqual({ mixed5: 0, mixed8: 0, mixed15: 0 });
    expect(a.ownable).toBe(false);
    // An epic scouts can find is ownable by its coverage.
    expect(
      ownableChance(nonCommonLines(answerLine('solmane/none')), 24, 'mixed8', flat(1, 1)),
    ).toBe(1);
    // The report names it.
    const md = ownabilityMarkdown(
      [{ ...slotOwnability(1, 1, flat(1, 1)), tool: a, answers: [a], pass: false }],
      'a test',
    ).join('\n');
    expect(md).toContain('hearthshell (epic, festival prize)');
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

  it('reads the launch shares, not the all-lines shares that dip when a content drop joins', () => {
    // `flat` gives the all-lines shares 0.1 and the launch shares what the test says.
    expect(ownableChance(rareTwo, 5, 'mixed8', flat(0.6, 0.2))).toBeCloseTo(0.36);
    // The valley's all-lines share dips at a content drop; the launch share is read as it is, week to week, and does not.
    const dips = COVERAGE_SERVERS.flatMap((server) =>
      VALLEY_COVERAGE[server].filter((w, i, all) => i > 0 && w.rare < (all[i - 1]?.rare ?? 0)),
    );
    expect(dips.length).toBeGreaterThan(0);
    const dipped = VALLEY_COVERAGE.mixed8.find(
      (w, i, all) => i > 0 && w.rare < (all[i - 1]?.rare ?? 0),
    );
    expect(dipped).toBeDefined();
    expect(coverageAt(VALLEY_COVERAGE, 'mixed8', 'rare', dipped?.week ?? 1)).toBe(
      dipped?.launch.rare,
    );
  });

  it('has a launch share that never falls, on every server and rarity', () => {
    for (const server of COVERAGE_SERVERS)
      for (const rarity of COVERAGE_RARITIES)
        for (let w = 2; w <= ROSTER_WEEKS; w++)
          expect(coverageAt(VALLEY_COVERAGE, server, rarity, w)).toBeGreaterThanOrEqual(
            coverageAt(VALLEY_COVERAGE, server, rarity, w - 1),
          );
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

  it('takes the tool line as the line the tuner measures, with every answer listed', () => {
    const s = slotOwnability(3);
    expect(s.bossId).toBe(TRACK_ORDER[2]);
    expect(s.answers).toHaveLength(BOSS_ANSWERS[s.bossId]?.length as number);
    expect(s.tool).toBe(s.answers[0]);
    expect(s.pass).toBe(s.tool.ownable);
  });

  it('asks every slot, slot 1 included, for the line the tuner measures: slot 1’s own line is all common, so it passes on its own', () => {
    const s = slotOwnability(1, 1, flat(0, 0));
    expect(s.tool.needed).toEqual([]);
    expect(s.tool.ownable).toBe(true);
    expect(slotPreparedOf(1).line).toEqual(answerLine(SLOT_LINE[1] as string));
    // Without its own line the boss's first answer would need a rare line and fail in week 1.
    expect(
      answerOwnability(BOSS_ANSWERS['tidal-colossus']?.[0] as BossAnswer, 1, flat(0, 0)).ownable,
    ).toBe(false);
    expect(slotOwnability(3, 3, flat(0, 0)).tool.ownable).toBe(false);
    expect(slotOwnability(2, 2, flat(0, 0)).tool.ownable).toBe(true);
  });

  it('gives a slot its own prepared line only where SLOT_LINE names one, a legal line of the same boss’s shape', () => {
    for (const [slot, spec] of Object.entries(SLOT_LINE)) {
      const own = answerLine(spec);
      const first = answerLine(BOSS_ANSWERS[trackSlot(Number(slot)).bossId]?.[0]?.line as string);
      expect(answerProblems(own)).toEqual([]);
      expect(own).toHaveLength(first.length);
    }
    expect(slotPreparedOf(3).line).toEqual(
      answerLine(BOSS_ANSWERS[trackSlot(3).bossId]?.[0]?.line as string),
    );
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
    const failing = ownabilityTable().filter((r) => !r.tool.ownable);
    expect(
      failing.map(
        (r) =>
          `slot ${r.slot} ${r.bossId} week ${r.week}: needs ${r.tool.needed.map((n) => n.line).join(', ')}, chance ${Math.round(100 * r.tool.chance[OWNABLE_SERVER])}%`,
      ),
    ).toEqual([]);
  });
  // The evolution gate (design panel 6): the second half of the rule. A creature of the tool line under its form's evolution level
  // fights as its stage 1 form, so the line the tuner measures is not the line the slot is tuned for. If a slot fails here the lead
  // decides (a different line, a later week, or a different rule). Do not loosen it here.
  it('has a tool line whose every creature is at or above its form’s evolution level at the arrival week, at the expected speed', () => {
    const failing = ownabilityTable().filter((r) => r.unevolved.length);
    expect(
      failing.map(
        (r) =>
          `slot ${r.slot} ${r.bossId} week ${r.week}: ${r.unevolved.map((b) => `${b.formId} row ${b.row + 1} level ${b.level} under ${b.evolvesAt}`).join(', ')}`,
      ),
    ).toEqual([]);
  });

  it('finds the creatures of a line under their evolution level: slot 3’s line is stage 2 forms, under 15 at level 11 in week 1, and a late week has none', () => {
    const early = evolvedAt(3, 1);
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((b) => b.level < b.evolvesAt && b.evolvesAt === 15)).toBe(true);
    expect(slotOwnability(3, 1).pass).toBe(false);
    expect(slotOwnability(3, 1).unevolved).toEqual(early);
    expect(evolvedAt(3, 24)).toEqual([]);
    expect(slotOwnability(3, 24).pass).toBe(slotOwnability(3, 24).tool.ownable);
    // A form is listed once for a row, not once for each column that brings it.
    expect(new Set(early.map((b) => `${b.formId}/${b.row}`)).size).toBe(early.length);
  });

  // A week-1 or week-2 server has no evolved forms (the evolution level is 15; a daily player's best creature is level 11 in week 1 and
  // 14 in week 2), so slots 1 and 2 name a stage 1 line of their own: the gated version of the boss's first answer.
  it('gives slots 1 and 2 a line of stage 1 forms, evolved by definition, that passes at the weeks they arrive', () => {
    for (const slot of [1, 2]) {
      const { line } = slotPreparedOf(slot);
      expect(line.length).toBeGreaterThan(0);
      for (const p of line)
        expect(content.creatures.find((c) => c.id === p.formId)?.stage, `${slot} ${p.formId}`).toBe(
          1,
        );
      expect(evolvedAt(slot, SLOT_WEEKS[slot - 1] as number)).toEqual([]);
      expect(slotOwnability(slot).pass).toBe(true);
    }
  });

  it('keeps slot 2’s tool on a stage 1 line: the boss’s first card’s answer (Squelch Song) is on a Squelch', () => {
    const { line, core } = slotPreparedOf(2);
    expect(core).toEqual(BOSS_ANSWERS['cinder-wyrm']?.[0]?.core);
    const carriers = line.filter((p) => core.includes(p.knack));
    expect(carriers.length).toBeGreaterThanOrEqual(3);
    expect(carriers.every((p) => p.formId === 'squelch')).toBe(true);
    expect(withoutTool(line, core).some((p) => core.includes(p.knack))).toBe(false);
  });

  it('is, for slot 2, the gated version of the boss’s first answer: the same shape, each stage 2 form its stage 1 form', () => {
    const first = answerLine(BOSS_ANSWERS[trackSlot(2).bossId]?.[0]?.line as string);
    expect(slotPreparedOf(2).line).toEqual(first.map((p) => gatedPick(p, 1)));
  });

  // No written answer may use a festival prize (Hearthshell, Lanternfin: scouts cannot find them), and every answer must be
  // possible for a server of any size by the last slot's week: a chance of 0 means a line nobody can own.
  it('has no written answer that needs a line nobody can own at the last slot’s week', () => {
    const week = SLOT_WEEKS[SLOT_WEEKS.length - 1] as number;
    const zero: string[] = [];
    for (const [bossId, answers] of Object.entries(BOSS_ANSWERS))
      for (const a of answers) {
        const o = answerOwnability(a, week);
        for (const server of COVERAGE_SERVERS)
          if (!(o.chance[server] > 0))
            zero.push(
              `${bossId} / ${a.label} on ${server}: needs ${o.needed.map((n) => `${n.line}${n.findable ? '' : ' (festival prize)'}`).join(', ')}`,
            );
      }
    expect(zero).toEqual([]);
  });

  // A later lap's new card (`SLOT_EXTRA_CARDS`, Misa 2026-10-31) is a rule card like any other: a server must be able to own an answer to
  // it in the week its slot arrives. Cool Head is on Thornbuck (common), Clear Skies on Halcyray (the Stormray line, rare).
  it('has an answer built on the card’s own Knack that a server can own, at each slot that carries it', () => {
    const knackOf: Record<string, string> = {
      'lucky-strike': 'cool-head',
      slippery: 'clear-skies',
    };
    const cards = new Set(Object.values(SLOT_EXTRA_CARDS).flat());
    expect(cards.size).toBeGreaterThan(0);
    const failing: string[] = [];
    SLOT_WEEKS.forEach((week, i) => {
      for (const card of slotExtraCards(i + 1)) {
        const knack = knackOf[card] as string;
        const answers = (ANSWERS[card] ?? [])
          .filter(([, line]) => answerLine(line).some((p) => p.knack === knack))
          .map(([label, line]) => answerOwnability({ label, tool: knack, line }, week));
        if (!answers.some((a) => a.ownable))
          failing.push(`slot ${i + 1} week ${week}: no ownable ${knack} answer to ${card}`);
      }
    });
    expect(failing).toEqual([]);
  });
});
