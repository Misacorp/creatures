/**
 * Content tests for the real bosses and foes: every raid boss has an arena, a plain attack, moves, cards and intended
 * answers; every dungeon foe has its stats per depth; names match the shipped content; every mechanic is called for.
 */
import { content, createSeededRng, dungeonContent, isLandmark } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  CARDS,
  DUNGEON_DEPTHS,
  FOE_IDS,
  FOE_SPECS,
  FORM_KNACKS,
  MECHANICS,
  RAID_BOSS_IDS,
  RAID_COLS,
  RAID_ROUNDS,
  TALENTS,
  answerLine,
  attacksOf,
  coverage,
  drawRoute,
  fight,
  foeAt,
  foeStats,
  raidBossOf,
  raidMode,
  runDungeon,
  runStats,
  weekendScore,
  weekendStats,
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
      m.powerBp > 0 &&
      !m.silenceTurns &&
      round % m.every === 0 &&
      (m.turn ?? b.rows - 1) === turn,
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

  it.each(RAID_BOSS_IDS)('%s has an arena, armour, a plain attack, many moves and one or two cards', (id) => {
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
  });

  it.each(RAID_BOSS_IDS)('%s: every move lands on a real boss turn within a stage, and no turn has more than two damaging moves', (id) => {
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
  });

  it('three or more raid bosses carry an escalation, on different feeds, and Thornmother has a phase', () => {
    const feeds = RAID_BOSS_IDS.map((id) => raidBossOf(id).escalation?.feed).filter(Boolean);
    expect(feeds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(feeds).size).toBe(feeds.length);
    expect(raidBossOf('thornmother').escalation?.phase).toBeDefined();
  });

  it('the shipped adaptations and Backdraft are carried by cards', () => {
    expect(raidBossOf('tidal-colossus').cards).toContain('adapts');
    expect(raidBossOf('thornmother').cards).toContain('adapts');
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
  it.each(RAID_BOSS_IDS)('%s has two or more answers on different tools, each a legal full arena', (id) => {
    const answers = BOSS_ANSWERS[id] ?? [];
    expect(answers.length).toBeGreaterThanOrEqual(2);
    expect(new Set(answers.map((a) => a.tool)).size).toBeGreaterThanOrEqual(2);
    const b = raidBossOf(id);
    for (const a of answers) {
      const line = answerLine(a.line);
      expect(line).toHaveLength(b.rows * b.cols);
      const copies = new Map<string, number>();
      for (const p of line) {
        copies.set(p.formId, (copies.get(p.formId) ?? 0) + 1);
        expect(FORM_KNACKS[p.formId], `${p.formId} is a form`).toBeDefined();
        expect(p.knack === 'none' || FORM_KNACKS[p.formId]?.includes(p.knack), `${p.formId}/${p.knack}`).toBe(true);
        for (const t of p.talents ?? []) expect(TALENTS[t], `talent ${t}`).toBeDefined();
      }
      for (const n of copies.values()) expect(n).toBeLessThanOrEqual(4);
    }
  });

  it.each(RAID_BOSS_IDS)('%s: every intended answer beats the classic party over weekends', (id) => {
    const b = raidBossOf(id);
    const score = weekendScore(b);
    const classic = score(classicFor(raidMode(b)), 16, `ans:${id}`).score;
    for (const a of BOSS_ANSWERS[id] ?? []) {
      const baseline = a.talent
        ? score(classicFor(raidMode(b)).map((p) => ({ ...p, talents: [a.talent as string] })), 16, `ans:${id}`).score
        : classic;
      expect(score(answerLine(a.line), 16, `ans:${id}`).score, a.label).toBeGreaterThan(baseline);
    }
  });
});

describe('the dungeon foes', () => {
  it('every content foe has a spec and the other way round', () => {
    expect([...FOE_IDS].sort()).toEqual(dungeonContent.foes.map((f) => f.id).sort());
    expect(FOE_SPECS).toHaveLength(15);
  });

  it.each(FOE_IDS)('%s: name, kind, element and rounds from the content; a line of three; stats per depth', (id) => {
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
  });

  it('a floor boss gains its charged signature only at a landmark depth; a foe has none', () => {
    expect(isLandmark(7)).toBe(true);
    expect(isLandmark(6)).toBe(false);
    for (const spec of FOE_SPECS) {
      const plain = foeAt(spec.id, 6).moves.length;
      const landmark = foeAt(spec.id, 7).moves;
      if (spec.signature) {
        expect(landmark.length).toBe(plain + 1);
        expect(landmark.at(-1)?.charged).toBe(true);
      } else expect(landmark.length).toBe(plain);
    }
    const kinds = dungeonContent.foes.filter((f) => f.kind === 'boss').map((f) => f.id);
    for (const id of kinds) expect(FOE_SPECS.find((s) => s.id === id)?.signature).toBeDefined();
  });

  it('a deeper foe is harder: the classic line wins less often', () => {
    const rate = (id: string, depth: number) => {
      let w = 0;
      for (let i = 0; i < 20; i++)
        if (fight(foeAt(id, depth), toPlacements(CLASSIC_LINE, GAUNTLET), { rng: createSeededRng(`d:${id}:${i}`) }).won) w++;
      return w / 20;
    };
    expect(rate('moss-lurker', 8)).toBeLessThanOrEqual(rate('moss-lurker', 1));
    expect(rate('coil-baron', 8)).toBeLessThan(rate('coil-baron', 1));
  });
});

describe('dungeon runs and the camp', () => {
  it('a route is two fights, the camp, two fights and a floor boss, with no foe twice', () => {
    for (const depth of [1, 3, 7, 14]) {
      const route = drawRoute(createSeededRng(`route${depth}`), depth);
      expect(route.map((r) => r.kind)).toEqual(['fight', 'fight', 'camp', 'fight', 'fight', 'boss']);
      const foes = route.flatMap((r) => (r.foe ? [r.foe] : []));
      expect(new Set(foes).size).toBe(foes.length);
      expect(dungeonContent.foes.find((f) => f.id === route.at(-1)?.foe)?.kind).toBe('boss');
    }
  });

  it('the camp rests the standing creatures, and a run with the camp clears more than one without', () => {
    const withCamp = runStats(CLASSIC_LINE, 3, true, 60, 'camp');
    const without = runStats(CLASSIC_LINE, 3, false, 60, 'camp');
    expect(withCamp.cleared).toBeGreaterThan(without.cleared);
    expect(withCamp.winRate).toBeGreaterThan(without.winRate);
  });

  it('a run is deterministic for a seed, and a lost fight ends it', () => {
    const route = drawRoute(createSeededRng('r'), 5);
    const a = runDungeon(CLASSIC_LINE, route, 5, true, createSeededRng('x'));
    const b = runDungeon(CLASSIC_LINE, route, 5, true, createSeededRng('x'));
    expect(a).toEqual(b);
    const hopeless = runDungeon(CLASSIC_LINE, route, 60, true, createSeededRng('x'));
    expect(hopeless.won).toBe(false);
    expect(hopeless.cleared).toBeLessThan(5);
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
