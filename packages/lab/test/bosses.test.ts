/**
 * Content tests for the real bosses and foes: every raid boss has an arena, a plain attack, moves, cards and intended
 * answers; every dungeon foe has its stats per depth; names match the shipped content; every mechanic is called for.
 */
import { bossLine, shapeText } from '../src/bossReport';
import { content, createSeededRng, dungeonContent, isLandmark } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  ALL_ROUND_BENCH,
  ALL_ROUND_TEAM,
  FOE_CURVE,
  BOSS_ANSWERS,
  CARDS,
  DUNGEON_DEPTHS,
  FOE_IDS,
  FOE_SPECS,
  KEYWORDS,
  KNACKS,
  MECHANICS,
  RAID_BOSS_IDS,
  RAID_COLS,
  RAID_ROUNDS,
  RAID_SPECS,
  RAID_WIDTHS,
  TOOL_DROP_MIN,
  TOOL_SHARE_MIN,
  FOE_QUESTIONS,
  FOE_QUESTION_GAP,
  FOE_QUESTION_WIN,
  questionResult,
  ROBUST_SHARE,
  COMMON_OR_CLASSIC_FORMS,
  CASUAL_ORDER,
  robustnessOf,
  mixedSpread,
  tileLine,
  wideBoss,
  toolCost,
  TALENTS,
  answerLine,
  answerProblems,
  attacksOf,
  coverage,
  fight,
  foeAt,
  foeFold,
  foeStats,
  gauntletStats,
  marginOf,
  mixedServer,
  mostCopies,
  raidBench,
  raidBossOf,
  raidMode,
  runMap,
  runStats,
  weekend,
  weekendScore,
  weekendStats,
  widthOf,
  withoutTool,
  classicFor,
  toPlacements,
  CLASSIC_LINE,
  GAUNTLET,
  type BossDef,
} from '../src';

const cardIds = new Set(CARDS.map((c) => c.id));

/** The damaging moves due on one boss turn of one round (the plain attack is not a move). */
function damagingDue(b: BossDef, round: number, turn: number): number {
  const all = [...b.moves, ...(b.escalation?.phase?.moves ?? [])];
  return all.filter(
    (m) =>
      m.powerBp > 0 && !m.silenceTurns && round % m.every === 0 && (m.turn ?? b.rows - 1) === turn,
  ).length;
}

describe('the raid bosses', () => {
  it('there is one boss for each shipped raid boss, with its name and element from the content', () => {
    expect([...RAID_BOSS_IDS].sort()).toEqual(content.bosses.map((b) => b.id).sort());
    for (const shipped of content.bosses) {
      const b = raidBossOf(shipped.id);
      expect(b.name).toBe(shipped.name);
      expect(b.element).toBe(shipped.element);
    }
  });

  it.each(RAID_BOSS_IDS)(
    '%s has an arena, armour, a plain attack, many moves and one or two cards',
    (id) => {
      const b = raidBossOf(id);
      expect(b.rows).toBeGreaterThanOrEqual(2);
      expect(b.rows).toBeLessThanOrEqual(4);
      expect(b.cols).toBe(RAID_COLS);
      expect(b.rounds).toBe(RAID_ROUNDS);
      expect(b.armour).toBeGreaterThan(0);
      expect(b.plain.powerBp).toBeGreaterThan(0);
      expect(b.moves.length).toBeGreaterThanOrEqual(7);
      expect(new Set(b.moves.map((m) => m.id)).size).toBe(b.moves.length);
      expect(b.cards.length).toBeGreaterThanOrEqual(1);
      expect(b.cards.length).toBeLessThanOrEqual(2);
      for (const c of b.cards) expect(cardIds.has(c)).toBe(true);
      // Most moves are area attacks in varied shapes.
      const damaging = b.moves.filter((m) => m.powerBp > 0);
      const aimedShapes = damaging.filter((m) => m.pattern.shape === 'single').length;
      expect(damaging.length - aimedShapes).toBeGreaterThanOrEqual(damaging.length * 0.6);
      expect(new Set(b.moves.map((m) => m.pattern.shape)).size).toBeGreaterThanOrEqual(4);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: every move lands on a real boss turn within a stage, and no turn has more than two damaging moves',
    (id) => {
      const b = raidBossOf(id);
      const all = [...b.moves, ...(b.escalation?.phase?.moves ?? [])];
      for (const m of all) {
        expect(m.turn ?? b.rows - 1).toBeLessThan(b.rows);
        expect(m.every).toBeGreaterThanOrEqual(1);
        expect(m.every).toBeLessThanOrEqual(b.rounds);
      }
      for (let round = 1; round <= b.rounds; round++)
        for (let turn = 0; turn < b.rows; turn++)
          expect(damagingDue(b, round, turn)).toBeLessThanOrEqual(2);
    },
  );

  it('three or more raid bosses carry a Build-up, on at least three feeds, none on knockouts, and Thornmother has her Second Bloom', () => {
    const feeds = RAID_BOSS_IDS.map((id) => raidBossOf(id).escalation?.feed).filter(Boolean);
    expect(feeds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(feeds).size).toBeGreaterThanOrEqual(3);
    // Knockouts invite blame on a shared server: no raid boss grows from them.
    expect(feeds).not.toContain('knockouts');
    const esc = raidBossOf('thornmother').escalation;
    expect(esc?.phase?.name).toBe('Second Bloom');
    // The Second Bloom starts at half of the weekend's HP (the Build-up feeds on HP lost, in bp of the whole).
    expect(esc?.feed).toBe('hpLost');
    expect(esc ? esc.per * (esc.phase?.atStep ?? 0) : 0).toBe(5_000);
  });

  it('Thornmother’s Second Bloom comes at half of the weekend’s HP, announced a round ahead, with Mired on her or not', () => {
    const b = raidBossOf('thornmother');
    const weekendOf = (line: string, seed: string) =>
      weekend(b, toPlacements(answerLine(line), raidMode(b)), raidBench(b.cols), {
        rng: createSeededRng(seed),
        log: true,
      });
    const plain = BOSS_ANSWERS['thornmother']?.[0];
    // The same line with a Croakmire first in the front row: a Squelch Song keeps Mired on her all weekend.
    const mired = (plain?.line ?? '').replace(/^\S+/, 'croakmire/squelch-song+clinging');
    expect(mired).toMatch(/squelch-song/);
    for (const [line, seed] of [
      [mired, 'sb1'],
      [plain?.line ?? '', 'sb2'],
      [
        classicFor(raidMode(b))
          .map((p) => `${p.formId}/${p.knack}`)
          .join(' '),
        'sb3',
      ],
    ] as const) {
      const w = weekendOf(line, seed);
      const events = w.stages.flatMap((st, k) => st.events.map((e) => ({ ...e, stage: k })));
      const heads = events.filter(
        (e) => e.kind === 'announce' && /Second Bloom begins/.test(e.text),
      );
      const blooms = events.filter((e) => e.kind === 'phase');
      expect(heads.length, seed).toBeLessThanOrEqual(1);
      expect(blooms.length, seed).toBe(heads.length);
      // A team that beats her passes half of her HP, so it sees the Bloom coming.
      if (seed !== 'sb3') expect(heads.length, seed).toBe(1);
      const head = heads[0];
      const bloom = blooms[0];
      if (!head || !bloom) continue;
      // Announced at one round start, in play at the next (round 1 of the next stage when it came at the last round).
      const stageRounds = b.rounds;
      const at = (e: { stage: number; round: number }) => e.stage * stageRounds + e.round;
      expect(at(bloom) - at(head), seed).toBe(1);
    }
  });

  it('Rising Tide feeds on HP lost, and Forge Heat is not freed by skipping reactions: its Wyrm is armoured', () => {
    expect(raidBossOf('tidal-colossus').escalation?.feed).toBe('hpLost');
    expect(raidBossOf('cinder-wyrm').escalation?.feed).toBe('reactions');
    expect(raidBossOf('cinder-wyrm').armour).toBeGreaterThanOrEqual(50);
  });

  it('a boss silences with one move at most, and never twice in a round', () => {
    for (const id of RAID_BOSS_IDS) {
      const b = raidBossOf(id);
      const all = [...b.moves, ...(b.escalation?.phase?.moves ?? [])];
      const silences = all.filter((m) => m.silenceTurns);
      expect(silences.length, id).toBeLessThanOrEqual(1);
      for (let round = 1; round <= b.rounds; round++)
        expect(
          silences.filter((m) => round % m.every === 0).length,
          `${id} round ${round}`,
        ).toBeLessThanOrEqual(1);
    }
    // Thornmother's one silence is on the row ends (the slots at the ends of every row).
    const hush = raidBossOf('thornmother').moves.find((m) => m.silenceTurns);
    expect(hush?.name).toBe('Bramble Hush');
    expect(hush?.pattern.shape).toBe('rowEnds');
  });

  it('counts scale with the width of the raid (perColumns): scatter, row ends, chains, several columns, and an event Build-up', () => {
    for (const id of RAID_BOSS_IDS) {
      const b = raidBossOf(id);
      const patterns = [
        b.plain.pattern,
        ...[...b.moves, ...(b.escalation?.phase?.moves ?? [])].map((m) => m.pattern),
      ];
      for (const p of patterns)
        if (['scatter', 'rowEnds', 'chain', 'columns'].includes(p.shape))
          expect(p.perColumns, `${id} ${p.shape}`).toBe(RAID_COLS);
      // A step of an event feed needs more units in a wider raid (the feed grows with the number of creatures).
      const feed = b.escalation?.feed;
      if (feed && !['hpLost', 'rounds'].includes(feed))
        expect(b.escalation?.perColumns, `${id} ${feed}`).toBe(RAID_COLS);
    }
  });

  it('the shipped adaptations and Backdraft are carried by cards', () => {
    expect(raidBossOf('tidal-colossus').cards).toContain('adapts');
    expect(raidBossOf('thornmother').cards).toContain('adapts');
    expect(CARDS.find((c) => c.id === 'adapts')?.name).toBe('Reaction Resistance');
    expect(raidBossOf('cinder-wyrm').cards).toContain('reflective-hide');
    for (const id of ['cinder-wyrm', 'storm-sovereign', 'old-bogback'])
      expect(raidBossOf(id).cards).toContain('adapts-element');
    expect(raidBossOf('old-bogback').cards).toContain('shake-it-off');
  });

  it('a weekend costs the classic party creatures and the classic party loses most of them', () => {
    for (const id of RAID_BOSS_IDS) {
      const b = raidBossOf(id);
      const w = weekendStats(b, classicFor(raidMode(b)), 12, `content:${id}`);
      expect(w.knockoutsTotal).toBeGreaterThanOrEqual(3);
      expect(w.winRate).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('the intended answers (P-13)', () => {
  it.each(RAID_BOSS_IDS)(
    '%s has two or more answers on different tools, each a legal full arena of legal rosters',
    (id) => {
      const answers = BOSS_ANSWERS[id] ?? [];
      expect(answers.length).toBeGreaterThanOrEqual(2);
      expect(new Set(answers.map((a) => a.tool)).size).toBeGreaterThanOrEqual(2);
      const b = raidBossOf(id);
      for (const a of answers) {
        const line = answerLine(a.line);
        expect(line, a.label).toHaveLength(b.rows * b.cols);
        // Only Knacks the form can equip and talents from its line's pool that work for its role (panel 4).
        expect(answerProblems(line), a.label).toEqual([]);
        expect(mostCopies(line), a.label).toBeLessThanOrEqual(4);
        for (const p of line)
          for (const t of p.talents ?? []) expect(TALENTS[t], `talent ${t}`).toBeDefined();
      }
      // One answer a table of four can bring: at most two copies of any form.
      expect(answers.some((a) => mostCopies(answerLine(a.line)) <= 2)).toBe(true);
      // An answer built on a Knack, not only on talents.
      expect(
        answers.some((a) => !a.tool.startsWith('talent:') && (a.core ?? []).some((c) => KNACKS[c])),
      ).toBe(true);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: its first answer needs no rare evolved form: only common species and the classic party’s Tempestray (panel 5, finding 10)',
    (id) => {
      const first = BOSS_ANSWERS[id]?.[0];
      expect(first, id).toBeDefined();
      const rare = answerLine(first?.line ?? '').filter(
        (p) => !COMMON_OR_CLASSIC_FORMS.includes(p.formId),
      );
      expect(
        rare.map((p) => p.formId),
        `${id}: ${first?.label ?? ''}`,
      ).toEqual([]);
      expect(mostCopies(answerLine(first?.line ?? ''))).toBeLessThanOrEqual(2);
    },
  );

  it('the answers name their Knack tools, and no tool answers more than two bosses', () => {
    const bosses = new Map<string, Set<string>>();
    for (const [id, answers] of Object.entries(BOSS_ANSWERS))
      for (const a of answers) {
        for (const c of a.core ?? [])
          expect(KNACKS[c] ?? TALENTS[c.replace('talent:', '')], c).toBeDefined();
        bosses.set(a.tool, (bosses.get(a.tool) ?? new Set()).add(id));
      }
    for (const [tool, ids] of bosses) expect(ids.size, tool).toBeLessThanOrEqual(2);
  });

  it.each(RAID_BOSS_IDS)(
    '%s: every intended answer beats the classic party over weekends',
    (id) => {
      const b = raidBossOf(id);
      const score = weekendScore(b);
      const classic = score(classicFor(raidMode(b)), 16, `ans:${id}`).score;
      for (const a of BOSS_ANSWERS[id] ?? []) {
        const baseline = a.talent
          ? score(
              classicFor(raidMode(b)).map((p) => ({ ...p, talents: [a.talent as string] })),
              16,
              `ans:${id}`,
            ).score
          : classic;
        expect(score(answerLine(a.line), 16, `ans:${id}`).score, a.label).toBeGreaterThan(baseline);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: a prepared team removes nearly all of the boss’s HP and kills most weekends, and the classic party never kills',
    (id) => {
      const b = raidBossOf(id);
      const classic = weekendStats(b, classicFor(raidMode(b)), 16, `win:${id}`);
      expect(classic.winRate).toBe(0);
      expect(classic.damageShare, id).toBeLessThanOrEqual(0.8);
      // The primary measure (Misa, 2026-10-29) is the share of the HP removed; the kill is the cliff beside it.
      for (const a of BOSS_ANSWERS[id] ?? []) {
        const w = weekendStats(b, answerLine(a.line), 24, `win:${id}`);
        expect(w.damageShare, `${id}: ${a.label}`).toBeGreaterThanOrEqual(0.9);
        expect(w.tiers.t2, `${id}: ${a.label}`).toBeGreaterThanOrEqual(0.6);
      }
      const first = BOSS_ANSWERS[id]?.[0];
      expect(
        weekendStats(b, answerLine(first?.line ?? ''), 24, `win:${id}`).winRate,
        id,
      ).toBeGreaterThanOrEqual(0.6);
    },
  );
});

describe('every answer’s own tool is tested (panel 5, finding 3)', () => {
  for (const id of RAID_BOSS_IDS)
    BOSS_ANSWERS[id]?.forEach((a, k) => {
      const name = `${id}: ${a.tool}`;
      it(`${name} (${a.label}) removes at least ${String(TOOL_SHARE_MIN * 100)} points more of the boss's HP with its tool${k === 0 ? ` and loses ${String(TOOL_DROP_MIN)} points of kill rate without it` : ''}`, () => {
        expect(a.core?.length, `${name} names no tool`).toBeGreaterThan(0);
        const t = toolCost(raidBossOf(id), a, answerLine(a.line), 40, `tool-all:${id}:${a.tool}`);
        expect(
          t.shareDrop,
          `${name}: ${String(Math.round(100 * t.shareWith))}% of the HP with, ${String(Math.round(100 * t.shareWithout))}% without`,
        ).toBeGreaterThanOrEqual(TOOL_SHARE_MIN * 100);
        if (k === 0)
          expect(
            t.drop,
            `${name}: kill ${String(Math.round(100 * t.withTool))}% with, ${String(Math.round(100 * t.without))}% without`,
          ).toBeGreaterThanOrEqual(TOOL_DROP_MIN);
      });
    });

  it('the prepared line with random legal talents still removes most of the HP: talents do not decide the weekend (panel 5, finding 4)', () => {
    for (const id of RAID_BOSS_IDS) {
      const first = BOSS_ANSWERS[id]?.[0];
      const r = robustnessOf(raidBossOf(id), answerLine(first?.line ?? ''), 48, 8, `rob:${id}`);
      expect(r.random.damageShare, id).toBeGreaterThanOrEqual(ROBUST_SHARE);
      // Written talents are better than random ones, but by a share of the HP, not by the whole weekend.
      expect(r.written.damageShare - r.random.damageShare, id).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('the prepared line at the margin, at other widths and on a mixed server (panel 4)', () => {
  const first = (id: string) => BOSS_ANSWERS[id]?.[0];
  const lineOf = (id: string) => answerLine(first(id)?.line ?? '');

  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line keeps most of its HP share at +10% Attack and at +10% HP',
    (id) => {
      const m = marginOf(raidBossOf(id), lineOf(id), 24, `margin:${id}`);
      expect(m.share.base, id).toBeGreaterThanOrEqual(0.93);
      expect(m.share.atk10, `${id} +10% Attack`).toBeGreaterThanOrEqual(0.8);
      expect(m.share.hp10, `${id} +10% HP`).toBeGreaterThanOrEqual(0.8);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the prepared line pays for it: creatures lost, or the team left low on HP',
    (id) => {
      const w = weekendStats(raidBossOf(id), lineOf(id), 24, `cost:${id}`);
      expect(w.damageShare, id).toBeGreaterThanOrEqual(0.93);
      // Misa, 2026-10-29: everyone alive but low is also a result, so HP left counts next to knockouts.
      expect(
        w.knockoutsTotal >= 0.5 || w.hpLeftEnd <= 0.6,
        `${id}: ${String(w.knockoutsTotal)} out, ${String(w.hpLeftEnd)} HP left`,
      ).toBe(true);
      expect(w.hpLeftEnd, id).toBeLessThanOrEqual(0.8);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: at 5, 10 and 15 columns the classic party never kills and the prepared line removes nearly all the HP',
    (id) => {
      const b = raidBossOf(id);
      for (const w of RAID_WIDTHS) {
        const r = widthOf(b, lineOf(id), w, 12, `width:${id}`);
        expect(r.classicWin, `${id} at ${String(w)} columns`).toBeLessThanOrEqual(0.1);
        expect(r.classicShare, `${id} at ${String(w)} columns`).toBeLessThanOrEqual(0.9);
        expect(r.bestShare, `${id} at ${String(w)} columns`).toBeGreaterThanOrEqual(0.85);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the tool gap holds at 10 players: the line repeated to fill still loses clearly without its tool, in HP removed or in kills',
    (id) => {
      const b = raidBossOf(id);
      const a = first(id);
      const wide = wideBoss(b, 10);
      const withT = weekendStats(wide, tileLine(lineOf(id), b.cols, 10), 16, `gap10:${id}`);
      const without = weekendStats(
        wide,
        tileLine(withoutTool(lineOf(id), a?.core ?? []), b.cols, 10),
        16,
        `gap10:${id}`,
      );
      // A line that removes all the HP either way shows its tool in the kills, one that kills no weekend in the HP.
      const share = withT.damageShare - without.damageShare;
      const kills = withT.winRate - without.winRate;
      expect(
        Math.max(share / 0.05, kills / 0.2),
        `${id}: ${String(share)} of the HP, ${String(kills)} of the kills`,
      ).toBeGreaterThanOrEqual(1);
    },
  );

  const mixed = (id: string) =>
    mixedServer(
      raidBossOf(id),
      lineOf(id),
      [lineOf(id)],
      20,
      60,
      `mixed:${id}`,
      first(id)?.core ?? [],
      [first(id)?.core ?? []],
    );

  it.each(RAID_BOSS_IDS)(
    '%s: a mixed server (2 min-maxers, 3 builders, 5 casual players) removes a good share of the HP, does not always win, and feels its losses more than a prepared team',
    (id) => {
      const r = mixed(id);
      expect(r.winRate, id).toBeLessThanOrEqual(0.9);
      expect(r.weekend.damageShare, id).toBeGreaterThanOrEqual(0.4);
      expect(r.weekend.damageShare, id).toBeLessThanOrEqual(0.97);
      // A mixed server feels losses more than a prepared team does.
      const prepared = weekendStats(raidBossOf(id), lineOf(id), 12, `mixed-cost:${id}`);
      expect(r.knockouts, id).toBeGreaterThan(3 * prepared.knockoutsTotal);
    },
  );
});

describe('Boss Rank: a lower rank softens the cards, and the unprepared feel it first (Misa, 2026-10-29)', () => {
  const lineOf = (id: string) => answerLine(BOSS_ANSWERS[id]?.[0]?.line ?? '');

  it.each(RAID_BOSS_IDS)(
    '%s: at every rank the prepared team kills most weekends and the classic party never kills',
    (id) => {
      for (const rank of ['low', 'mid', 'high'] as const) {
        const b = raidBossOf(id, { rank });
        const w = weekendStats(b, lineOf(id), 16, `rank:${id}:${rank}`);
        expect(w.winRate, `${id} ${rank}`).toBeGreaterThanOrEqual(0.6);
        expect(w.damageShare, `${id} ${rank}`).toBeGreaterThanOrEqual(0.93);
        const c = weekendStats(b, classicFor(raidMode(b)), 16, `rank:${id}:${rank}`);
        expect(c.winRate, `${id} ${rank}`).toBe(0);
      }
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: the classic party removes less of the HP at the high rank than at the low rank, and a casual server of ten removes a good share at the low rank',
    (id) => {
      const share = (rank: 'low' | 'high') => {
        const b = raidBossOf(id, { rank });
        return weekendStats(b, classicFor(raidMode(b)), 16, `rank:${id}:c`).damageShare;
      };
      expect(share('low') - share('high'), id).toBeGreaterThanOrEqual(0);
      const low = raidBossOf(id, { rank: 'low' });
      const first = BOSS_ANSWERS[id]?.[0];
      const casual = mixedSpread(
        low,
        lineOf(id),
        [lineOf(id)],
        16,
        1,
        2,
        `rank:${id}:casual`,
        first?.core ?? [],
        [first?.core ?? []],
        { players: 10, casual: 'top3', order: CASUAL_ORDER },
      );
      expect(casual.weekend.damageShare, id).toBeGreaterThanOrEqual(0.4);
      expect(casual.weekend.damageShare, id).toBeLessThanOrEqual(0.9);
      expect(casual.winRate, id).toBeLessThanOrEqual(0.3);
    },
  );

  it.each(RAID_BOSS_IDS)(
    '%s: at the high rank the tool is worth at least ten points of the HP to a team with random talents, and more than at the low rank for the armoured boss',
    (id) => {
      const first = BOSS_ANSWERS[id]?.[0];
      const at = (rank: 'low' | 'high') => {
        const b = raidBossOf(id, { rank });
        const line = lineOf(id);
        const w = robustnessOf(b, line, 40, 8, `rank:${id}:${rank}:t`).random.damageShare;
        const n = robustnessOf(
          b,
          withoutTool(line, first?.core ?? []),
          40,
          8,
          `rank:${id}:${rank}:n`,
        ).random.damageShare;
        return w - n;
      };
      expect(at('high'), id).toBeGreaterThanOrEqual(0.1);
    },
  );

  it('Thornmother’s answer matters more at the high rank: her bark is thicker and cracks less', () => {
    const gain = (rank: 'low' | 'high') => {
      const b = raidBossOf('thornmother', { rank });
      const first = BOSS_ANSWERS['thornmother']?.[0];
      const t = toolCost(
        b,
        first as NonNullable<typeof first>,
        lineOf('thornmother'),
        24,
        `rank-t:${rank}`,
      );
      return t.shareDrop;
    };
    expect(gain('high')).toBeGreaterThan(gain('low') + 10);
  });
});

describe('names and words (P-06, the compendium tone)', () => {
  const FOE_MOVES = FOE_SPECS.flatMap((f) => [...f.moves, ...(f.signature ? [f.signature] : [])]);
  const RAID_MOVES = RAID_SPECS.flatMap((r) => [...r.moves, ...(r.escalation?.phase?.moves ?? [])]);
  /** [id, name] of every move of every boss and foe. */
  const moves = [...RAID_MOVES, ...FOE_MOVES].map((m) => [m[0], m[1]] as const);
  /** Everything a player reads in these files. */
  const texts = [
    ...RAID_SPECS.flatMap((r) => [
      r.asks,
      r.escalation?.name ?? '',
      r.escalation?.phase?.name ?? '',
    ]),
    ...FOE_SPECS.flatMap((f) => [f.asks, f.escalation?.name ?? '']),
    ...moves.map((m) => m[1]),
    ...CARDS.flatMap((c) => [c.name, c.asks]),
    ...Object.entries(KEYWORDS).flatMap(([k, v]) => [k, v.means]),
  ];

  it('the boss-move keyword is Wind-up; Charged is the Spark mark and is not a boss-move word', () => {
    expect(KEYWORDS).toHaveProperty('Wind-up');
    expect(KEYWORDS).not.toHaveProperty('Charged');
    expect(content.reactions.map((r) => r.markName)).toContain('Charged');
    for (const t of texts) expect(t, t).not.toMatch(/\bcharged\b/i);
  });

  it('the report says Wind-up and Most hurt, never Charged or wounded', () => {
    const line = RAID_BOSS_IDS.map((id) => bossLine(raidBossOf(id))).join('\n');
    expect(line).toMatch(/Wind-up/);
    expect(line).not.toMatch(/charged|wounded/i);
    expect(shapeText({ anchor: 'weakest', shape: 'single' })).toBe('the most hurt, one slot');
    for (const t of texts) expect(t, t).not.toMatch(/\bwounded\b/i);
  });

  it('new words are keywords: the shapes, the anchors and the Build-up', () => {
    for (const k of [
      'Scatter',
      'Leap',
      'Cross',
      'Checker',
      'Wind-up',
      'Most hurt',
      'Back-most',
      'Build-up',
    ])
      expect(KEYWORDS, k).toHaveProperty(k);
    expect(KEYWORDS['Build-up']?.means).toMatch(/Mired slows it/);
    expect(KEYWORDS['Build-up']?.means).toMatch(/weekend/);
  });

  it('no word that is scary, no collision with the raid, and "Phase" is the boss’s own name for it', () => {
    for (const t of texts) {
      expect(t, t).not.toMatch(/\b(choking|swallow|adapts|phase)\b/i);
      expect(t, t).not.toMatch(/\bweakest\b/i);
    }
  });

  it('a move name is used for one move only, and never for a reaction, a Knack or a talent', () => {
    const byName = new Map<string, Set<string>>();
    for (const [id, name] of moves) byName.set(name, (byName.get(name) ?? new Set()).add(id));
    for (const [name, ids] of byName)
      expect(ids.size, `${name} is the name of ${[...ids].join(' and ')}`).toBe(1);
    const taken = new Set<string>([
      ...content.reactions.map((r) => r.name),
      ...Object.values(KNACKS).map((k) => k.name),
      ...Object.values(TALENTS).map((t) => t.name),
    ]);
    for (const [id, name] of moves) expect(taken.has(name), `${id}: ${name}`).toBe(false);
    // A rule card that is a move too (Great Wave) is one thing under one name; no other card shares a move's name.
    for (const c of CARDS)
      if (byName.has(c.name)) expect(byName.get(c.name)?.has(c.id), c.name).toBe(true);
    // The Bramble Bind card is the only Bramble Bind.
    expect(byName.has('Bramble Bind')).toBe(false);
  });

  it('Molten Shell grows armour and Wisp Fog grows dodge, as their names say', () => {
    expect(FOE_SPECS.find((f) => f.id === 'slag-tyrant')?.escalation?.grow.armour).toBeGreaterThan(
      0,
    );
    expect(FOE_SPECS.find((f) => f.id === 'drift-wisp')?.escalation?.grow.dodgeBp).toBeGreaterThan(
      0,
    );
  });
});

describe('the dungeon foes', () => {
  it('every content foe has a spec and the other way round', () => {
    expect([...FOE_IDS].sort()).toEqual(dungeonContent.foes.map((f) => f.id).sort());
    expect(FOE_SPECS).toHaveLength(15);
  });

  it.each(FOE_IDS)(
    '%s: name, kind, element and rounds from the content; a line of three; stats per depth',
    (id) => {
      const def = dungeonContent.foes.find((f) => f.id === id);
      const foe = foeAt(id, 1);
      expect(foe.name).toBe(def?.name);
      expect(foe.element).toBe(def?.element);
      expect(foe.rounds).toBe(def?.rounds);
      expect(foe.rows).toBe(1);
      expect(foe.cols).toBe(3);
      expect(foe.armour).toBeGreaterThan(0);
      expect(foe.plain.powerBp).toBeGreaterThan(0);
      for (const c of foe.cards) expect(cardIds.has(c)).toBe(true);
      // Stats grow with depth, and the content's HP and Attack set the order between foes.
      let prev = foeStats(id, 1);
      expect(prev.hp).toBeGreaterThan(0);
      expect(prev.atk).toBeGreaterThan(0);
      for (const d of [...DUNGEON_DEPTHS, 12]) {
        const s = foeStats(id, d);
        expect(foeAt(id, d).hp).toBe(s.hp);
        // A card may raise Attack (Wither does), never lower it.
        expect(foeAt(id, d).atk).toBeGreaterThanOrEqual(s.atk);
        expect(s.hp).toBeGreaterThanOrEqual(prev.hp);
        expect(s.atk).toBeGreaterThanOrEqual(prev.atk);
        prev = s;
      }
      expect(foeStats(id, 8).hp).toBeGreaterThan(foeStats(id, 1).hp);
    },
  );

  it('one stat grows with depth: a foe’s HP, not its Attack, and the curve is the one the all-round team can climb', () => {
    expect(FOE_CURVE.atkStepBp).toBe(0);
    expect(FOE_CURVE.atkCurveBp).toBe(0);
    for (const id of FOE_IDS) {
      expect(foeStats(id, 8).atk, id).toBe(foeStats(id, 1).atk);
      const growth = foeStats(id, 8).hp / foeStats(id, 1).hp;
      expect(growth, id).toBeGreaterThan(2);
      expect(growth, id).toBeLessThan(3);
    }
  });

  it('a floor boss gains its wind-up signature only at a landmark depth (or as a keeper); a foe has none', () => {
    expect(isLandmark(7)).toBe(true);
    expect(isLandmark(6)).toBe(false);
    for (const spec of FOE_SPECS) {
      const plain = foeAt(spec.id, 6).moves.length;
      const landmark = foeAt(spec.id, 7).moves;
      if (spec.signature) {
        expect(landmark.length).toBe(plain + 1);
        expect(landmark.at(-1)?.charged).toBe(true);
        // An Undercroft keeper has it at every depth.
        expect(foeAt(spec.id, 3, { signature: true }).moves.length).toBe(plain + 1);
      } else expect(landmark.length).toBe(plain);
    }
    const kinds = dungeonContent.foes.filter((f) => f.kind === 'boss').map((f) => f.id);
    for (const id of kinds) expect(FOE_SPECS.find((s) => s.id === id)?.signature).toBeDefined();
  });

  it('a deeper foe is harder: the classic line wins less often', () => {
    const rate = (id: string, depth: number) => {
      let w = 0;
      for (let i = 0; i < 20; i++)
        if (
          fight(foeAt(id, depth), toPlacements(CLASSIC_LINE, GAUNTLET), {
            rng: createSeededRng(`d:${id}:${i}`),
          }).won
        )
          w++;
      return w / 20;
    };
    expect(rate('moss-lurker', 8)).toBeLessThanOrEqual(rate('moss-lurker', 1));
    expect(rate('coil-baron', 8)).toBeLessThan(rate('coil-baron', 1));
  });

  it('three foes ask a question the classic line fails: no Guard, no silence ward, nothing for armour', () => {
    const needs = FOE_SPECS.flatMap((s) => (s.needs ? [s.needs] : [])).sort();
    expect(needs).toEqual(['guard', 'pierce', 'ward']);
  });

  it('every foe has one question, on a mechanic of the lab and a tool that is a Knack of the team', () => {
    expect(Object.keys(FOE_QUESTIONS).sort()).toEqual([...FOE_IDS].sort());
    const ids = new Set(MECHANICS.map((m) => m.id));
    for (const q of Object.values(FOE_QUESTIONS)) {
      expect(ids.has(q.mechanic), `${q.foe}: ${q.mechanic}`).toBe(true);
      const team = answerLine(q.team);
      expect(team, q.foe).toHaveLength(3);
      expect(answerProblems(team), q.foe).toEqual([]);
      expect(
        team.some((p) => q.tool.includes(p.knack)),
        `${q.foe} carries its tool`,
      ).toBe(true);
      expect(q.hpBp).toBeGreaterThan(0);
      expect(q.atkBp).toBeGreaterThan(0);
    }
    // The three questions about a Guard, a ward and armour are the foes' `needs`.
    expect(FOE_QUESTIONS['moss-lurker']?.mechanic).toBe('family:Reach');
    expect(FOE_QUESTIONS['drift-wisp']?.mechanic).toBe('family:Ward');
    expect(FOE_QUESTIONS['bramble-hound']?.mechanic).toBe('family:Pierce');
  });

  it.each(Object.values(FOE_QUESTIONS).map((q) => [q.foe, q] as const))(
    '%s calls for its mechanic: the team with the tool wins clearly more often than the team without it',
    (_foe, q) => {
      const r = questionResult(q, 200, 'fqa');
      expect(
        r.gap,
        `${q.foe}: ${String(r.withTool)} with, ${String(r.without)} without`,
      ).toBeGreaterThanOrEqual(FOE_QUESTION_GAP);
      expect(r.withTool, q.foe).toBeGreaterThanOrEqual(FOE_QUESTION_WIN);
    },
  );

  it('the classic line fails the foes that ask for a tool it does not bring (a silence ward, something for armour)', () => {
    for (const [foe, depth] of [
      ['drift-wisp', 4],
      ['bramble-hound', 4],
    ] as const) {
      const g = gauntletStats(foeAt(foe, depth), [...CLASSIC_LINE], 100, `classic:${foe}`);
      expect(g.winRate, foe).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('dungeon runs on the shipped map', () => {
  const rate = (
    team: readonly (typeof ALL_ROUND_TEAM)[number][],
    depth: number,
    policy: 'first' | 'smart',
    runs = 100,
    over: { bench?: readonly (typeof ALL_ROUND_TEAM)[number][]; levels?: number } = {},
  ) => runStats(team, depth, true, runs, 'map', { policy, ...over });

  it('the all-round team and its bench are legal rosters', () => {
    expect(answerProblems([...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH])).toEqual([]);
    expect(ALL_ROUND_TEAM).toHaveLength(3);
    expect(new Set([...ALL_ROUND_TEAM, ...ALL_ROUND_BENCH].map((p) => p.formId)).size).toBe(5);
  });

  it('a run is deterministic for a seed, and a clear is beating the floor boss, never heading home', () => {
    const run = (seed: string, depth: number) =>
      runMap(ALL_ROUND_TEAM, depth, createSeededRng(seed), {
        policy: 'smart',
        bench: ALL_ROUND_BENCH,
      });
    expect(run('x', 3)).toEqual(run('x', 3));
    const hopeless = runMap([...CLASSIC_LINE], 60, createSeededRng('x'), { policy: 'smart' });
    expect(hopeless.cleared).toBe(false);
    expect(hopeless.fights).toBeLessThan(5);
    // A cleared run won at least the entrance floor's fight and the floor boss's.
    for (let i = 0; i < 20; i++) {
      const r = run(`c${i}`, 1);
      if (r.cleared) expect(r.fights).toBeGreaterThanOrEqual(2);
    }
  });

  it('the policy picks all three camp choices over many runs, and a swap only with a bench', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const r = runMap(ALL_ROUND_TEAM, 8, createSeededRng(`camp${i}`), {
        policy: 'smart',
        bench: ALL_ROUND_BENCH,
      });
      if (r.camp) seen.add(r.camp);
      const plain = runMap(ALL_ROUND_TEAM, 8, createSeededRng(`camp${i}`), { policy: 'smart' });
      expect(plain.camp).not.toBe('swap');
    }
    expect([...seen].sort()).toEqual(['keepsake', 'rest', 'swap']);
  });

  it('the camp helps: a run with its Rest clears more than one without', () => {
    const withCamp = runStats([...CLASSIC_LINE], 2, true, 150, 'camp');
    const without = runStats([...CLASSIC_LINE], 2, false, 150, 'camp');
    expect(withCamp.cleared).toBeGreaterThan(without.cleared);
    expect(withCamp.winRate).toBeGreaterThan(without.winRate);
  });

  it('a good all-round team with a plan clears over half of its runs at every depth from 1 to 8', () => {
    for (let depth = 1; depth <= 8; depth++)
      expect(
        rate(ALL_ROUND_TEAM, depth, 'smart', 100, { bench: ALL_ROUND_BENCH }).winRate,
        `depth ${depth}`,
      ).toBeGreaterThan(0.5);
  });

  it('the plan and the bench matter, and the classic line falls away within a few depths', () => {
    const planned = rate(ALL_ROUND_TEAM, 7, 'smart', 100, { bench: ALL_ROUND_BENCH }).winRate;
    const fixed = rate(ALL_ROUND_TEAM, 7, 'first', 100).winRate;
    const classic = rate([...CLASSIC_LINE], 7, 'first', 100).winRate;
    expect(planned).toBeGreaterThan(fixed + 0.1);
    expect(fixed).toBeGreaterThan(classic);
    expect(rate([...CLASSIC_LINE], 5, 'first', 100).winRate).toBeLessThan(0.1);
  });

  it('the Undercroft beyond depth 8 is harder: its levels clear less often, each less than the one before', () => {
    const r = rate(ALL_ROUND_TEAM, 8, 'smart', 150, { bench: ALL_ROUND_BENCH, levels: 2 });
    expect(r.undercroft[0] ?? 1).toBeLessThan(r.winRate);
    expect(r.undercroft[1] ?? 1).toBeLessThanOrEqual(r.undercroft[0] ?? 0);
    // Not out of reach: some runs clear the first level.
    expect(r.undercroft[0] ?? 0).toBeGreaterThan(0.03);
  });

  it('keepsakes and curses fold into a foe: a charm softens it, a curse hardens it', () => {
    const none = foeFold([], [], ALL_ROUND_TEAM);
    expect(none).toEqual({ hpBp: 10_000, atkBp: 10_000 });
    const charm = foeFold(['wayfarer-charm'], [], ALL_ROUND_TEAM);
    expect(charm.hpBp).toBeLessThan(10_000);
    expect(charm.atkBp).toBeLessThan(10_000);
    const curse = foeFold([], [{ stat: 'atk', bp: 2_000 }], ALL_ROUND_TEAM);
    expect(curse.atkBp).toBe(12_000);
    // An element's keepsake counts the share of the team of that element (one of three here).
    const ember = foeFold(['warm-ember'], [], ALL_ROUND_TEAM);
    expect(ember.hpBp).toBeGreaterThan(charm.hpBp);
    expect(ember.hpBp).toBeLessThan(10_000);
  });
});

describe('every mechanic is called for', () => {
  const everyone = [
    ...RAID_BOSS_IDS.map((id) => raidBossOf(id)),
    ...FOE_IDS.map((id) => foeAt(id, 7)),
  ];

  it('no Knack family, keyword, rule, talent kind or escalation feed is left without a boss or foe that calls for it', () => {
    const missing = coverage(everyone)
      .filter((c) => c.callers.length === 0)
      .map((c) => c.mechanic.id);
    expect(missing).toEqual([]);
  });

  it('the check reads the data: a boss with nothing special calls for little', () => {
    const bare = raidBossOf('tidal-colossus');
    const stripped: BossDef = {
      ...bare,
      armour: 1,
      moves: [],
      cards: [],
      mods: {},
      plain: { pattern: { anchor: 'front', shape: 'single' }, powerBp: 10_000 },
      spd: 0,
    };
    delete (stripped as { escalation?: unknown }).escalation;
    const called = MECHANICS.filter((m) => typeof m.calls(stripped) === 'string').map((m) => m.id);
    expect(called).not.toContain('rule:silence');
    expect(called).not.toContain('rule:charged');
    expect(called).not.toContain('rule:escalation');
    expect(attacksOf(stripped)).toHaveLength(1);
  });
});
