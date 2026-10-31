/**
 * A combat v2 raid weekend (R14): stages that share the boss's HP and carry what the rules say they carry. The lab's weekend, moved
 * here as it was (docs/design/combat/engine-port.md, slice 1).
 */
import type { Rng } from '@creatures/game';
import { contextOf, playFight } from './fight';
import type {
  FightOptions,
  FightResult,
  FighterSpec,
  WeekendFighterSpec,
  WeekendInputV2,
  WeekendResult,
} from './types';

/** The element Element Resistance picks from the damage so far: the one alone on top; a tie for the most gives none. */
export function resistedElement(
  damageByElement: Readonly<Record<string, number>>,
): string | undefined {
  const sorted = Object.entries(damageByElement).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  return top && top[1] > (second?.[1] ?? 0) ? top[0] : undefined;
}

/** A team member as a fight's creature: its uid is its owner, form and slot in the team (`owner:formId:index`). */
const inSlot = (p: WeekendFighterSpec, i: number): FighterSpec => ({
  ...p,
  uid: `${p.owner}:${p.formId}:${i}`,
});

/**
 * A raid weekend with attrition (R14): stages share the boss's HP; creatures keep their HP between
 * stages, nobody heals between them, and a knocked-out creature stays out (its owner may bring a
 * replacement from `bench`, which takes the empty slot). HP carries, and so do Catch Breath's and Stubborn's use (once per weekend) and
 * the boss's escalation (step, phase and count, R22); marks, Stores, Mired and "each fight" effects start fresh each
 * stage. From stage 2 an adapting boss resists the reaction used most so far (Adapts) or the element whose creatures'
 * hits (reactions included, counters not) dealt the most damage so far, chosen at the stage break; a tie for the most
 * gives no resistance (Element Resistance).
 */
export function weekendV2(input: WeekendInputV2, rng: Rng): WeekendResult {
  if (input.version !== 2)
    throw new Error(`weekendV2 plays version 2 inputs, not ${String(input.version)}`);
  const { boss, options: opts } = input;
  const ctx = contextOf(input);
  const stages: FightResult[] = [];
  let current = [...input.team];
  const benchLeft = [...input.bench];
  // Carried state is keyed by the uids of the next stage's fighters (see below).
  let hp = new Map<string, number>();
  let windDone = new Set<string>();
  let holdDone = new Set<string>();
  let escalation: FightOptions['carryEscalation'];
  let bossHp = boss.hp;
  // Damage potential: the real HP (below 1) carries from stage to stage, while the boss is held at 1 HP.
  let shadowHp = boss.hp;
  let replacements = 0;
  const used: Record<string, number> = {};
  const dealt: Record<string, number> = {};
  const most = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (let i = 0; i < (opts.stages ?? 3) && bossHp > 0; i++) {
    const resist = boss.mods.adapts && i > 0 ? most(used) : undefined;
    const resistEl = boss.mods.adaptsElement && i > 0 ? resistedElement(dealt) : undefined;
    const res = playFight(
      ctx,
      boss,
      current.map(inSlot),
      {
        ...opts,
        carryHp: hp,
        carryWindDone: windDone,
        carryHoldOnDone: holdDone,
        ...(escalation ? { carryEscalation: escalation } : {}),
        bossHp,
        shadowHp,
        ...(resist ? { resistReaction: resist } : {}),
        ...(resistEl ? { resistElement: resistEl } : {}),
      },
      rng,
    );
    stages.push(res);
    bossHp = res.bossHpLeft;
    shadowHp = res.bossHpReal;
    if (res.escalation)
      escalation = {
        step: res.escalation.step,
        fallStep: res.escalation.fallStep,
        phase: res.escalation.phase,
        phaseNext: res.escalation.phaseNext,
        count: res.escalation.count,
      };
    for (const [el, n] of Object.entries(res.reactionsByMark)) used[el] = (used[el] ?? 0) + n;
    for (const f of res.fighters) dealt[f.element] = (dealt[f.element] ?? 0) + f.hitDamage;
    const next: WeekendFighterSpec[] = [];
    res.fighters.forEach((f, idx) => {
      const p = current[idx];
      if (!p) return;
      if (f.hp > 0) next.push(p);
      else {
        const j = benchLeft.findIndex((b) => b.owner === p.owner);
        if (j >= 0) {
          const [rep] = benchLeft.splice(j, 1);
          if (rep) {
            next.push({ ...rep, row: p.row, col: p.col });
            replacements++;
          }
        }
      }
    });
    const carried = new Map<string, number>();
    const winds = new Set<string>();
    const holds = new Set<string>();
    next.map(inSlot).forEach((nf) => {
      const prev = res.fighters.find(
        (f) =>
          f.owner === nf.owner &&
          f.formId === nf.formId &&
          f.row === nf.row &&
          f.col === nf.col &&
          f.hp > 0,
      );
      carried.set(nf.uid, prev ? prev.hp : nf.maxHp);
      if (prev?.secondWindDone) winds.add(nf.uid);
      if (prev?.holdOnDone) holds.add(nf.uid);
    });
    hp = carried;
    windDone = winds;
    holdDone = holds;
    current = next;
  }
  return { stages, won: bossHp <= 0, replacements };
}
