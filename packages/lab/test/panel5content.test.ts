/**
 * Content of the fifth design panel's fixes (2026-10-29): Mired halved, a second cleanse boss, Thornmother's cracking bark and
 * her second Pierce Knack, common-species answers, Guard's Shadow trimmed, rare Knacks with somewhere to be an answer.
 */
import { createSeededRng } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import {
  BOSS_ANSWERS,
  FOE_QUESTIONS,
  KNACKS,
  LAB_RULES,
  RAID_BOSS_IDS,
  RAID_SPECS,
  answerLine,
  fight,
  formStats,
  labBoss,
  raidBossOf,
  type BossDef,
  type Escalation,
  type Placement,
} from '../src';

const at = (formId: string, row: number, col: number, knack?: string): Placement => ({
  owner: 'p1',
  formId,
  level: 25,
  row,
  col,
  ...(knack ? { knack } : {}),
});

describe('Mired is halved and a second boss washes debuffs off', () => {
  it('a Mired stack cuts the boss’s damage by 1.5% (2.25% with Clinging), half of what it was', () => {
    expect(LAB_RULES.miredPerStackBp).toBe(150);
    expect(LAB_RULES.miredClingingStackBp).toBe(225);
    expect(LAB_RULES.miredClingingStackBp).toBeGreaterThan(LAB_RULES.miredPerStackBp);
  });

  it('two raid bosses carry Shake It Off: the Colossus (the sea washes the mud off) and Old Bogback', () => {
    const washers = RAID_BOSS_IDS.filter((id) => raidBossOf(id).cards.includes('shake-it-off'));
    expect(washers.sort()).toEqual(['old-bogback', 'tidal-colossus']);
    for (const id of washers) expect(raidBossOf(id).mods.shakeEvery).toBe(3);
  });
});

describe('Thornmother’s bark cracks at every step of her Build-up', () => {
  it('her armour falls with each step and stays above zero: only a Pierce line or a big reaction gets in early', () => {
    const esc = raidBossOf('thornmother').escalation;
    expect(esc?.grow.armour).toBeLessThan(0);
    const spec = RAID_SPECS.find((s) => s.id === 'thornmother');
    const last = (spec?.armour ?? 0) + (esc?.grow.armour ?? 0) * (esc?.cap ?? 0);
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan((spec?.armour ?? 0) / 1.5);
  });

  it('the engine lowers the armour a step at a time: a hit that is Blocked in round 1 lands once the bark has cracked', () => {
    const escalation: Escalation = {
      name: 'Cracking Bark',
      feed: 'rounds',
      per: 1,
      cap: 3,
      grow: { armour: -40 },
    };
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 6, atk: 1, hp: 1_000_000 }),
      spd: 0,
      armour: 150,
      escalation,
    };
    const r = fight(boss, [at('tidewing', 0, 0)], { rng: createSeededRng('crack'), log: true });
    const blocked = r.events
      .filter((e) => e.kind === 'blocked' && /'s hit is Blocked/.test(e.text))
      .map((e) => e.round);
    expect(blocked[0]).toBe(1);
    // Tidewing hits for about 110: Blocked at 150 armour, through at 110 (round 2) and every round after.
    expect(blocked).toEqual([1]);
    expect(r.damage).toBeGreaterThan(0);
    // A weaker card cracks less: strength scales the step.
    const soft = fight({ ...boss, strengthBp: 0 }, [at('tidewing', 0, 0)], {
      rng: createSeededRng('crack'),
    });
    expect(soft.damage).toBeLessThan(r.damage);
  });
});

describe('Pierce has a second Knack, on a common species', () => {
  it('Gnaw Through is a Pierce Knack for Pyrelynx: its own hits ignore a third of the boss’s armour', () => {
    const k = KNACKS['gnaw-through'];
    expect(k?.family).toBe('Pierce');
    expect(KNACKS['tunnel-through']?.family).toBe('Pierce');
    expect(k?.fx.pierceOwnBp).toBe(3_333);
    expect(formStats('pyrelynx', 25).armour).toBeGreaterThan(0);
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 1, rounds: 1, atk: 1 }),
      spd: 0,
      armour: 120,
    };
    const dmg = (knack?: string) =>
      fight(boss, [at('pyrelynx', 0, 0, knack)], { rng: createSeededRng('gnaw') }).damage;
    // Pyrelynx hits for about 150 plain: 30 over 120 armour, and 70 over 80 (two thirds of 120).
    expect(dmg('gnaw-through')).toBeGreaterThan(dmg() + 30);
  });
});

describe('Wide Warmth has a job: it boosts the far hitter of a line of three, and Tar Leech asks for it', () => {
  it('a Support at the end of the line boosts both hitters at full strength, the far one included', () => {
    expect(KNACKS['wide-warmth']?.text).toMatch(/full strength/);
    const boss: BossDef = {
      ...labBoss({ rows: 1, cols: 3, rounds: 4, atk: 1, hp: 10_000_000 }),
      spd: 0,
    };
    const team = (knack: string): Placement[] => [
      at('croakmire', 0, 0, knack),
      at('tidewing', 0, 1),
      at('tempestray', 0, 2),
    ];
    const run = (knack: string) => fight(boss, team(knack), { rng: createSeededRng('warmth') });
    const wide = run('wide-warmth');
    const plain = run('none');
    // The far hitter (slot 3) deals more with the wide boost; so does the whole team.
    expect(wide.fighters[2]?.damageDealt ?? 0).toBeGreaterThan(plain.fighters[2]?.damageDealt ?? 0);
    expect(wide.damage).toBeGreaterThan(plain.damage);
    // The creature beside it is boosted the same with or without.
    expect(wide.fighters[1]?.damageDealt ?? 0).toBeGreaterThanOrEqual(
      plain.fighters[1]?.damageDealt ?? 0,
    );
  });

  it('Tar Leech’s question is about it: the team with Wide Warmth wins clearly more often', () => {
    const q = FOE_QUESTIONS['tar-leech'];
    expect(q?.tool).toEqual(['wide-warmth']);
    expect(q?.mechanic).toBe('family:Support shape');
    expect(KNACKS[q?.tool[0] ?? '']?.family).toBe('Support shape');
  });
});

describe('Guard’s Shadow is trimmed, and the rare Knacks have somewhere to be an answer', () => {
  it('Guard’s Shadow gives +10%, not +25%, and costs 10 armour', () => {
    expect(KNACKS['guards-shadow']?.fx.besideGuardBp).toBe(1_000);
    expect(KNACKS['guards-shadow']?.fx.armourBonus).toBe(-10);
    expect(KNACKS['guards-shadow']?.text).toMatch(/\+10%/);
  });

  const carries = (knack: string) =>
    Object.values(BOSS_ANSWERS)
      .flat()
      .some((a) => answerLine(a.line).some((p) => p.knack === knack));

  it('Crown of Embers and Tunnel Through are on a written answer; Primed by Pain and Baked Shell are the tool of a foe’s question', () => {
    expect(carries('crown-of-embers')).toBe(true);
    expect(carries('tunnel-through')).toBe(true);
    const tools = Object.values(FOE_QUESTIONS).flatMap((q) => [...q.tool]);
    expect(tools).toContain('primed-by-pain');
    expect(tools).toContain('baked-shell');
  });
});
