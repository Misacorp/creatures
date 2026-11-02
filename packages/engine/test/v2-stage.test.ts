/**
 * Combat v2: one raid stage at a time (`stageV2`, R14). The carry is plain JSON, a creature is carried by its key (else its uid), a
 * knocked-out creature stays out, HP and the once-a-weekend uses carry, and marks, Stores and Mired start fresh. The weekend is a loop over
 * it, so a weekend played stage by stage with the carry stored and read back as JSON is the same weekend.
 */
import { createSeededRng } from '@creatures/game';
import { startCarry, stageV2, type FighterSpec, type StageInputV2 } from '@creatures/engine/v2';
import { describe, expect, it } from 'vitest';
import {
  boss,
  by,
  CHART,
  ELEMENTS,
  marks,
  member,
  mired,
  move,
  playWeekend,
  RULES,
  scripted,
  spec,
  striker,
  type SpecOver,
} from './v2-helpers';
import type { BossDef } from '@creatures/engine/v2';

const stageInput = (
  b: BossDef,
  fighters: readonly FighterSpec[],
  over: Partial<StageInputV2> = {},
): StageInputV2 => ({
  version: 2,
  rules: RULES,
  elements: ELEMENTS,
  chart: CHART,
  boss: b,
  fighters,
  options: { log: true },
  ...over,
});

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const crew = (...over: SpecOver[]) => over.map((o) => spec(o));

describe('stageV2', () => {
  it('starts from a plain carry: the boss at full HP, nobody hurt or out', () => {
    expect(startCarry({ hp: 900 })).toEqual({
      stage: 0,
      bossHp: 900,
      shadowHp: 900,
      hp: {},
      out: [],
      windDone: [],
      holdDone: [],
      used: {},
      dealt: {},
    });
  });

  it('the carry survives a JSON round trip unchanged, and stage by stage it plays the weekend weekendV2 plays', () => {
    const arena = striker({ cols: 3, rounds: 4, atk: 140, hp: 5_000, mods: { adapts: true } });
    const team = [
      { name: 'A', maxHp: 500, role: 'setter' as const },
      { name: 'B', maxHp: 500, role: 'payoff' as const, element: 'spark', col: 1 },
      { name: 'C', maxHp: 500, role: 'guard' as const, element: 'ember', col: 2 },
    ];
    const members = crew(...team);
    const weekend = playWeekend(
      arena,
      team.map((t) => member(t)),
      [],
      { stages: 3 },
      createSeededRng('stage-loop'),
    );
    const rng = createSeededRng('stage-loop');
    let carry = startCarry(arena);
    const stages = [];
    for (let i = 0; i < 3 && carry.bossHp > 0; i++) {
      // The caller names creatures by a stable key; the uids are the slots of this stage's team.
      const played = stageV2(
        stageInput(
          arena,
          members.map((m, idx) => ({ ...m, uid: `s${i}:${idx}`, key: `creature-${m.name}` })),
        ),
        carry,
        rng,
      );
      expect(json(played.carry)).toEqual(played.carry);
      carry = json(played.carry);
      stages.push(played.result);
    }
    expect(stages).toHaveLength(weekend.stages.length);
    stages.forEach((s, i) => {
      const w = weekend.stages[i];
      expect(s.damage).toBe(w?.damage);
      expect(s.bossHpLeft).toBe(w?.bossHpLeft);
      expect(s.knockouts).toBe(w?.knockouts);
      expect(s.events).toEqual(w?.events);
      expect(s.fighters.map((f) => f.hp)).toEqual(w?.fighters.map((f) => f.hp));
    });
    expect(carry.stage).toBe(stages.length);
  });

  it('HP carries by key, whatever the uid of the stage', () => {
    const arena = striker({ rounds: 3, atk: 100 });
    let carry = startCarry(arena);
    const hps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = spec({ name: 'A', maxHp: 1_000, uid: `slot-${i}`, key: 'creature-1' });
      const played = stageV2(stageInput(arena, [a]), carry, scripted().rng);
      hps.push(by(played.result, 'A').hp);
      carry = played.carry;
    }
    expect(hps).toEqual([700, 400, 100]);
    expect(carry.hp).toEqual({ 'creature-1': 100 });
  });

  it('without a key the carry falls back to the uid', () => {
    const arena = striker({ rounds: 1, atk: 100 });
    const a = spec({ name: 'A', maxHp: 1_000, uid: 'u1' });
    const first = stageV2(stageInput(arena, [a]), startCarry(arena), scripted().rng);
    expect(first.carry.hp).toEqual({ u1: 900 });
    const second = stageV2(stageInput(arena, [a]), first.carry, scripted().rng);
    expect(by(second.result, 'A').hp).toBe(800);
  });

  it('a knocked-out creature stays out: it is in the carry and is not played again', () => {
    const arena = striker({ cols: 2, rounds: 1, atk: 5_000 });
    const team = [
      spec({ name: 'A', key: 'a' }),
      spec({ name: 'B', key: 'b', col: 1, maxHp: 100_000 }),
    ];
    const first = stageV2(stageInput(arena, team), startCarry(arena), scripted().rng);
    expect(by(first.result, 'A').hp).toBe(0);
    expect(first.carry.out).toEqual(['a']);
    expect(first.carry.hp['a']).toBeUndefined();
    // The caller still lists it: the stage leaves it out.
    const second = stageV2(stageInput(arena, team), first.carry, scripted().rng);
    expect(second.result.fighters.map((f) => f.name)).toEqual(['B']);
    expect(second.carry.out).toEqual(['a']);
    // A replacement with another key takes its place and starts at full HP.
    const swapped = [spec({ name: 'R', key: 'r', maxHp: 700 }), team[1] as FighterSpec];
    const soft = striker({ cols: 2, rounds: 1, atk: 100 });
    const third = stageV2(stageInput(soft, swapped), first.carry, scripted().rng);
    expect(third.result.fighters.map((f) => f.name)).toEqual(['R', 'B']);
    expect(by(third.result, 'R').hp).toBe(600);
  });

  it('Catch Breath and Refuse to Fall are once per weekend: the carry holds them by key', () => {
    const arena = striker({ rounds: 1, atk: 240 });
    const a = spec({ name: 'A', maxHp: 1_000, key: 'a', fx: { secondWindBp: 4_000 } });
    const hurt = { ...a, maxHp: 400 };
    const first = stageV2(stageInput(arena, [hurt]), startCarry(arena), scripted().rng);
    expect(first.result.healed).toBe(160);
    expect(first.carry.windDone).toEqual(['a']);
    const second = stageV2(stageInput(arena, [hurt]), first.carry, scripted().rng);
    expect(second.result.healed).toBe(0);
    const holdArena = striker({ rounds: 1, atk: 2_000 });
    const h = spec({ name: 'H', key: 'h', fx: { holdOn: true } });
    const one = stageV2(stageInput(holdArena, [h]), startCarry(holdArena), scripted().rng);
    expect(one.carry.holdDone).toEqual(['h']);
    expect(one.carry.out).toEqual([]);
    const two = stageV2(stageInput(holdArena, [h]), one.carry, scripted().rng);
    expect(two.carry.out).toEqual(['h']);
  });

  it('marks, Stores and Mired start fresh each stage; the boss HP and the escalation carry', () => {
    const arena = boss({
      rounds: 2,
      hp: 10_000,
      escalation: {
        name: 'Rage',
        feed: 'rounds',
        per: 2,
        cap: 5,
        grow: { atkBp: 1_000 },
      },
    });
    const team = [spec({ name: 'S', key: 's', fx: { miresAtStart: true, firstHitBp: 5_000 } })];
    let carry = startCarry(arena);
    for (let i = 0; i < 2; i++) {
      const played = stageV2(stageInput(arena, team), carry, scripted().rng);
      expect(marks(played.result)).toEqual(['tide x1', 'tide x2']);
      expect(mired(played.result)).toEqual(['Mired x1', 'Mired x0', 'Mired x1', 'Mired x0']);
      expect(played.carry.bossHp).toBe(played.result.bossHpLeft);
      expect(played.carry.bossHp).toBeLessThan(arena.hp);
      expect(played.carry.escalation?.count).toBe((i + 1) * 2);
      carry = played.carry;
    }
    expect(carry.stage).toBe(2);
  });

  it('Adapts reads the reactions used so far and Element Resistance the damage by element, both from the carry', () => {
    const arena = boss({ cols: 2, rounds: 1, mods: { adaptsElement: true } });
    const team = [
      spec({ name: 'A', role: 'guard', element: 'tide', key: 'a', atk: 100 }),
      spec({ name: 'B', role: 'guard', element: 'ember', key: 'b', col: 1, atk: 300 }),
    ];
    const first = stageV2(stageInput(arena, team), startCarry(arena), scripted().rng);
    expect(first.carry.dealt['ember']).toBeGreaterThan(first.carry.dealt['tide'] ?? 0);
    const plain = stageV2(stageInput(arena, team), first.carry, scripted().rng);
    const none = stageV2(stageInput(arena, team), { ...first.carry, dealt: {} }, scripted().rng);
    // From stage 2 the element on top hits softer; without the carried damage nothing is resisted.
    expect(plain.result.damage).toBeLessThan(none.result.damage);
  });

  it('plays only what a boss with no moves does when the stage is empty of creatures', () => {
    const arena = boss({ moves: [move({ anchor: 'front', shape: 'single' })] });
    const played = stageV2(stageInput(arena, []), startCarry(arena), scripted().rng);
    expect(played.result.fighters).toEqual([]);
    expect(played.carry.stage).toBe(1);
  });
});
