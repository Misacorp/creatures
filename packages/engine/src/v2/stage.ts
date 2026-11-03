/**
 * One combat v2 raid stage (R14): `stageV2` plays a stage from the carry of the earlier ones and returns the result and the carry for
 * the next, as plain JSON. The worker stores the carry between Saturday and Sunday; `weekendV2` (the lab's weekend) is a loop over it.
 * The caller decides who fights each stage (the worker's placements, the lab's bench).
 */
import type { Rng } from '@creatures/game';
import { playFight } from './fight';
import { contextOf } from './state';
import type { BossDef, FighterSpec, StageCarry, StageInputV2, StageOutput } from './types';

/** The carry before stage 1: the boss at full HP, nobody hurt, nobody out, nothing used. */
export function startCarry(boss: Pick<BossDef, 'hp'>): StageCarry {
  return {
    stage: 0,
    bossHp: boss.hp,
    shadowHp: boss.hp,
    hp: {},
    out: [],
    windDone: [],
    holdDone: [],
    used: {},
    dealt: {},
  };
}

/** The element Element Resistance picks from the damage so far: the one alone on top; a tie for the most gives none. */
export function resistedElement(
  damageByElement: Readonly<Record<string, number>>,
): string | undefined {
  const sorted = Object.entries(damageByElement).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  return top && top[1] > (second?.[1] ?? 0) ? top[0] : undefined;
}

/**
 * Adapts: the reaction used most so far. A tie for the most goes to the one used first: the sort is stable and `used` keeps
 * the order its reactions were first cashed in (unlike Element Resistance, where a tie gives no resistance).
 */
const most = (m: Readonly<Record<string, number>>) =>
  Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0];

/** The key a creature is carried by: its own, else its uid. */
export const carryKey = (spec: Pick<FighterSpec, 'key' | 'uid'>): string => spec.key ?? spec.uid;

/**
 * One raid stage with attrition (R14): creatures keep their HP from the carry, nobody heals between stages, a creature knocked out earlier
 * is not played, and Catch Breath's and Refuse to Fall's use (once per weekend) and the boss's escalation (step, phase and count, R22) pass
 * on; marks, Stores, Mired and "each fight" effects start fresh. From stage 2 an adapting boss resists the reaction used most so far
 * (Adapts) or the element whose creatures' hits (reactions included, counters not) dealt the most damage so far, chosen at the stage break;
 * a tie for the most gives no resistance (Element Resistance). The result's `fighters` are the creatures that were played, in input order.
 */
export function stageV2(input: StageInputV2, carry: StageCarry, rng: Rng): StageOutput {
  if (input.version !== 2)
    throw new Error(`stageV2 plays version 2 inputs, not ${String(input.version)}`);
  const { boss, options } = input;
  const out = new Set(carry.out);
  const winds = new Set(carry.windDone);
  const holds = new Set(carry.holdDone);
  const fighters = input.fighters.filter((f) => !out.has(carryKey(f)));
  // The fight reads its carried state by uid; the carry names creatures by key.
  const hp = new Map<string, number>();
  const windDone = new Set<string>();
  const holdDone = new Set<string>();
  for (const f of fighters) {
    const key = carryKey(f);
    const h = carry.hp[key];
    if (h !== undefined) hp.set(f.uid, h);
    if (winds.has(key)) windDone.add(f.uid);
    if (holds.has(key)) holdDone.add(f.uid);
  }
  const resist = boss.mods.adapts && carry.stage > 0 ? most(carry.used) : undefined;
  const resistEl =
    boss.mods.adaptsElement && carry.stage > 0 ? resistedElement(carry.dealt) : undefined;
  const result = playFight(
    contextOf(input),
    boss,
    fighters,
    {
      ...options,
      carryHp: hp,
      carryWindDone: windDone,
      carryHoldOnDone: holdDone,
      ...(carry.escalation ? { carryEscalation: carry.escalation } : {}),
      bossHp: carry.bossHp,
      shadowHp: carry.shadowHp,
      ...(resist ? { resistReaction: resist } : {}),
      ...(resistEl ? { resistElement: resistEl } : {}),
    },
    rng,
    input.actions,
  );
  const hpAfter: Record<string, number> = { ...carry.hp };
  const outAfter = [...carry.out];
  const windAfter = new Set(carry.windDone);
  const holdAfter = new Set(carry.holdDone);
  const used: Record<string, number> = { ...carry.used };
  const dealt: Record<string, number> = { ...carry.dealt };
  for (const [el, n] of Object.entries(result.reactionsByMark)) used[el] = (used[el] ?? 0) + n;
  for (const f of result.fighters) {
    const key = carryKey(f);
    dealt[f.element] = (dealt[f.element] ?? 0) + f.hitDamage;
    if (f.hp > 0) hpAfter[key] = f.hp;
    else {
      delete hpAfter[key];
      outAfter.push(key);
    }
    if (f.secondWindDone) windAfter.add(key);
    if (f.holdOnDone) holdAfter.add(key);
  }
  const e = result.escalation;
  const escalation = e
    ? {
        step: e.step,
        fallStep: e.fallStep,
        phase: e.phase,
        phaseNext: e.phaseNext,
        count: e.count,
      }
    : carry.escalation;
  return {
    result,
    carry: {
      stage: carry.stage + 1,
      bossHp: result.bossHpLeft,
      shadowHp: result.bossHpReal,
      hp: hpAfter,
      out: outAfter,
      windDone: [...windAfter],
      holdDone: [...holdAfter],
      ...(escalation ? { escalation } : {}),
      used,
      dealt,
    },
  };
}
