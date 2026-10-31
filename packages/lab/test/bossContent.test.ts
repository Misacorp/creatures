/**
 * Content tests for the real raid bosses: every raid boss has an arena, a plain attack, moves, cards and intended
 * answers; names match the shipped content; every mechanic is called for.
 */
import { bossLine, shapeText } from '../src/bossReport';
import { BOSS_ARMOUR_MIN, CONTENT_CLASSIC_KILL_MAX, CONTENT_KNOCKOUTS_MIN } from '../src/targets';
import { content, createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  CARDS,
  FOE_IDS,
  MECHANICS,
  RAID_BOSS_IDS,
  RAID_COLS,
  RAID_ROUNDS,
  answerLine,
  attacksOf,
  coverage,
  foeAt,
  raidBench,
  raidBossOf,
  raidMode,
  weekend,
  contentRule,
  classicFor,
  toPlacements,
  type BossDef,
} from '../src';
import { cardIds, damagingDue } from './helpers/bossHelpers';

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

  it('three or more raid bosses carry an escalation, on at least three feeds, none on knockouts, and Thornmother has her Second Bloom', () => {
    const feeds = RAID_BOSS_IDS.map((id) => raidBossOf(id).escalation?.feed).filter(Boolean);
    expect(feeds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(feeds).size).toBeGreaterThanOrEqual(3);
    // Knockouts invite blame on a shared server: no raid boss grows from them.
    expect(feeds).not.toContain('knockouts');
    const esc = raidBossOf('thornmother').escalation;
    expect(esc?.phase?.name).toBe('Second Bloom');
    // The Second Bloom starts at half of the weekend's HP (the escalation feeds on HP lost, in bp of the whole).
    expect(esc?.feed).toBe('hpLost');
    expect(esc ? esc.per * (esc.phase?.atStep ?? 0) : 0).toBe(5_000);
  });

  it('Thornmother’s Second Bloom comes at half of the weekend’s HP, announced a round ahead, with Mired on her or not', () => {
    const b = raidBossOf('thornmother');
    const weekendOf = (line: string, seed: string) =>
      weekend(b, toPlacements(answerLine(line), raidMode(b)), raidBench(b.cols, b.rosterLevel), {
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
    expect(raidBossOf('cinder-wyrm').armour).toBeGreaterThanOrEqual(
      BOSS_ARMOUR_MIN['cinder-wyrm'] ?? 0,
    );
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
    expect(hush?.name).toBe('Hush');
    expect(hush?.pattern.shape).toBe('rowEnds');
  });

  it('counts scale with the width of the raid (perColumns): scatter, row ends, chains, several columns, and an event escalation', () => {
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
      const w = contentRule(id, raidBossOf(id));
      expect(w.knockouts).toBeGreaterThanOrEqual(CONTENT_KNOCKOUTS_MIN);
      expect(w.kill).toBeLessThanOrEqual(CONTENT_CLASSIC_KILL_MAX);
    }
  });
});

// The names and words of the content (P-06, the compendium tone) are the content gate: `packages/game/test/combat-v2-content.test.ts`.
describe('the boss report speaks the words', () => {
  it('the report says Wind-up and Most hurt, never Charged or wounded', () => {
    const line = RAID_BOSS_IDS.map((id) => bossLine(raidBossOf(id))).join('\n');
    expect(line).toMatch(/Wind-up/);
    expect(line).not.toMatch(/charged|wounded/i);
    expect(shapeText({ anchor: 'weakest', shape: 'single' })).toBe('the most hurt, one slot');
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
