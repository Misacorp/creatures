/**
 * The combat v2 fight in the lab (docs/design/combat/proposals/001-combat-v2.md). The rules themselves live in `@creatures/engine/v2`
 * (phase 2 of docs/design/combat/engine-port.md); this module is the lab's side of that seam: it resolves a placement (form, Knack
 * and talent ids at a level) into the creature the engine takes, with the catalogue's content, and calls the engine with the lab's
 * rules numbers (`LAB_RULES`) and the shipped element chart. `fight` and `weekend` keep their signatures.
 */
import { content } from '@creatures/game';
import {
  STAT_FIELDS,
  fightV2,
  mergeFx,
  weekendV2,
  type FighterSpec,
  type KnackFx,
  type WeekendFighterSpec,
} from '@creatures/engine/v2';
import { KNACKS, knack } from './knacks';
import { TALENTS, talent, talentIdleUnder } from './talents';
import { LAB_RULES } from './rules';
import { ELEMENTS, formStats } from './species';
import type { BossDef, FightOptions, FightResult, Placement } from './types';

export { resistedElement } from '@creatures/engine/v2';

/** Every effect name a Knack or talent uses, in a fixed order (see `uniformFx`). */
const FX_KEYS: readonly string[] = [
  ...new Set(
    [...Object.values(KNACKS), ...Object.values(TALENTS)].flatMap((d) => Object.keys(d.fx)),
  ),
];

/**
 * `merged` as an object with every effect name set in one fixed order (the ones it lacks `undefined`). Every creature's
 * effects then share one object shape, so the hot reads of `fx(f).someKey` stay fast; a read gives the same value as before.
 */
function uniformFx(merged: KnackFx): KnackFx {
  const src = merged as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of FX_KEYS) out[key] = src[key];
  for (const key of Object.keys(src)) if (!(key in out)) out[key] = src[key];
  return out;
}

/** The merged effects of a Knack and talents, and the stats of a form at a level: worked out once, they never change. */
const FX_MEMO = new Map<string, KnackFx>();
const STAT_FX_MEMO = new Map<string, KnackFx>();
const STATS_MEMO = new Map<string, ReturnType<typeof formStats>>();

function fxOf(knackId: string | undefined, talents: readonly string[]): KnackFx {
  const key = `${knackId ?? ''}|${talents.join(',')}`;
  let fxAll = FX_MEMO.get(key);
  if (!fxAll) {
    fxAll = uniformFx(
      mergeFx([knack(knackId)?.fx ?? {}, ...talents.map((id) => talent(id)?.fx ?? {})]),
    );
    FX_MEMO.set(key, fxAll);
  }
  return fxAll;
}

/** The talents' plain stat lines alone (`STAT_FIELDS`): what silence leaves (R12). */
function statFxOf(talents: readonly string[]): KnackFx {
  const key = talents.join(',');
  let stat = STAT_FX_MEMO.get(key);
  if (!stat) {
    const merged = mergeFx(talents.map((id) => talent(id)?.fx ?? {})) as Record<string, unknown>;
    const only: Record<string, unknown> = {};
    for (const name of Object.keys(merged))
      if (STAT_FIELDS.has(name as keyof KnackFx)) only[name] = merged[name];
    stat = uniformFx(only);
    STAT_FX_MEMO.set(key, stat);
  }
  return stat;
}

function statsOf(formId: string, level: number): ReturnType<typeof formStats> {
  const key = `${formId}|${level}`;
  let st = STATS_MEMO.get(key);
  if (!st) {
    st = formStats(formId, level);
    STATS_MEMO.set(key, st);
  }
  return st;
}

/** A placement as the engine's creature without its uid: stats at its level, the Knack's and talents' effects merged, Max HP set (a stat, so silence does not take it away). */
function resolve(p: Placement): WeekendFighterSpec {
  const st = statsOf(p.formId, p.level);
  const k = p.knack === 'none' ? undefined : p.knack;
  const fxAll = fxOf(k, p.talents ?? []);
  const maxHp = Math.floor((st.hp * (10_000 + (fxAll.hpBp ?? 0))) / 10_000);
  return {
    owner: p.owner,
    formId: p.formId,
    name: st.name,
    element: st.element,
    role: st.role,
    maxHp,
    atk: st.atk,
    spd: st.spd,
    baseArmour: st.armour,
    critChanceBp: st.critChanceBp,
    critDamageBp: st.critDamageBp,
    knack: k,
    talents: p.talents ?? [],
    fxAll,
    fxStat: statFxOf(p.talents ?? []),
    // Triage aims the Support's own base verb: a Support shape Knack leaves it idle (the engine reads only the flag).
    triageIdle: talentIdleUnder('triage', k),
    row: p.row,
    col: p.col,
  };
}

/** The creatures of a line-up, as a fight takes them: each one's uid is its owner, form and place in the line (`owner:formId:index`). */
export function placeFighters(placements: readonly Placement[]): FighterSpec[] {
  return placements.map((p, i) => ({ ...resolve(p), uid: `${p.owner}:${p.formId}:${i}` }));
}

/** What the engine reads besides the creatures: the lab's rules numbers, the shipped element chart and the elements' order. */
const world = {
  version: 2,
  rules: LAB_RULES,
  elements: ELEMENTS,
  chart: content.elementChart,
} as const;

/** One fight: the boss, the placed creatures, and the rounds of R8 (the engine's, `fightV2`). */
export function fight(
  boss: BossDef,
  placements: readonly Placement[],
  opts: FightOptions,
): FightResult {
  const { rng, ...options } = opts;
  return fightV2({ ...world, boss, fighters: placeFighters(placements), options }, rng);
}

/**
 * A raid weekend with attrition (R14, the engine's `weekendV2`): the placed creatures and each owner's bench are resolved here, and the
 * engine plays the stages and re-places the team between them.
 */
export function weekend(
  boss: BossDef,
  placements: readonly Placement[],
  bench: readonly Placement[],
  opts: FightOptions & { readonly stages?: number },
): { readonly stages: FightResult[]; readonly won: boolean; readonly replacements: number } {
  const { rng, ...options } = opts;
  return weekendV2(
    { ...world, boss, team: placements.map(resolve), bench: bench.map(resolve), options },
    rng,
  );
}
