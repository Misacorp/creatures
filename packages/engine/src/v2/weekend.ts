/**
 * A combat v2 raid weekend (R14): stages that share the boss's HP and carry what the rules say they carry. A loop over `stageV2`
 * (`stage.ts`), which holds the carry; this module keeps the lab's bench: a knocked-out creature's owner may bring a replacement.
 */
import type { Rng } from '@creatures/game';
import { resistedElement, stageV2, startCarry } from './stage';
import type {
  FightResult,
  FighterSpec,
  StageInputV2,
  WeekendFighterSpec,
  WeekendInputV2,
  WeekendResult,
} from './types';

export { resistedElement };

/** A team member as a fight's creature: its uid is its owner, form and slot in the team (`owner:formId:index`). */
const inSlot = (p: WeekendFighterSpec, i: number): FighterSpec => ({
  ...p,
  uid: `${p.owner}:${p.formId}:${i}`,
});

/**
 * A raid weekend with attrition (R14): stages share the boss's HP; creatures keep their HP between stages, nobody heals between them, and
 * a knocked-out creature stays out (its owner may bring a replacement from `bench`, which takes the empty slot). What carries, and what
 * starts fresh, is `stageV2`'s. A creature is carried by its spec's `key`, else by its place in the weekend's team or bench (`team:i`,
 * `bench:j`): its identity, which its slot is not once a replacement takes the slot of a knocked-out one.
 */
export function weekendV2(input: WeekendInputV2, rng: Rng): WeekendResult {
  if (input.version !== 2)
    throw new Error(`weekendV2 plays version 2 inputs, not ${String(input.version)}`);
  const { version, rules, elements, chart, boss, options } = input;
  const stages: FightResult[] = [];
  let current: WeekendFighterSpec[] = input.team.map((p, i) => ({
    ...p,
    key: p.key ?? `team:${i}`,
  }));
  const benchLeft: WeekendFighterSpec[] = input.bench.map((p, i) => ({
    ...p,
    key: p.key ?? `bench:${i}`,
  }));
  let carry = startCarry(boss);
  let replacements = 0;
  while (carry.stage < (options.stages ?? 3) && carry.bossHp > 0) {
    const stageInput: StageInputV2 = {
      version,
      rules,
      elements,
      chart,
      boss,
      fighters: current.map(inSlot),
      options,
    };
    const played = stageV2(stageInput, carry, rng);
    const res = played.result;
    carry = played.carry;
    stages.push(res);
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
    current = next;
  }
  return { stages, won: carry.bossHp <= 0, replacements };
}
