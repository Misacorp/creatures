/**
 * Placements into the engine's creatures (combat v2): a form, Knack and talent ids at a level become a `FighterSpec` with the stats at
 * the level, the Knack's and talents' effects merged, and Max HP set (a stat, so silence does not take it away). The work that never
 * changes for one pack (the merged effects, the stats of a form at a level) is done once per resolver, and every creature's effects
 * share one object shape (`uniformFx`), so the fight's hot reads stay fast.
 */
import type { CombatV2Pack } from '@creatures/game/combat-v2';
import * as effectsMod from '../effects';
import type { KnackFx } from '../effects';
import type { FighterSpec, WeekendFighterSpec } from '../types';
import { formStats, type FormStats } from './forms';
import type { Placement, Shipped } from './types';

// Bound once: a named import is read through a getter on every call under the lab's Vite loader, which costs 15% of a report.
const { STAT_FIELDS, GEAR_FIELDS, mergeFx } = effectsMod;

/** The family whose Knacks reshape or replace a Support's base verb (and so leave Triage idle). */
export const SUPPORT_SHAPE_FAMILY = 'Support shape';

/** Marks a golden talent in a memo key (never part of a talent id). */
const GOLDEN_MARK = '*';

/** Effect numbers that are counts, not sizes: golden leaves them alone (a count of 2 has no x1.25). */
const COUNT_FIELDS: ReadonlySet<string> = new Set(['firstMarkExtra']);

/**
 * A golden talent's effects (R20): every number x1.25, rounded half up, whole numbers only; a flag has no number and stays as it is
 * (the proposal's small golden extras for number-less talents are not defined in the data, so golden is a no-op for them).
 */
export function goldenFx(fx: KnackFx): KnackFx {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fx)) {
    out[key] =
      typeof value === 'number' && !COUNT_FIELDS.has(key)
        ? Math.floor((value * 125 + 50) / 100)
        : value;
  }
  return out;
}

/** What a resolver reads of the pack. */
export type FighterPack = Pick<CombatV2Pack, 'forms' | 'knacks' | 'talents'>;

export interface Resolver {
  /** A form's stats at a level, worked out once. */
  readonly statsOf: (formId: string, level: number) => FormStats;
  /** A placement as the engine's creature without its uid. */
  readonly resolve: (p: Placement) => WeekendFighterSpec;
  /**
   * The creatures of a line-up, as a fight takes them: each one's uid is its owner, form and place in the line
   * (`owner:formId:index`).
   */
  readonly placeFighters: (placements: readonly Placement[]) => FighterSpec[];
}

/**
 * A resolver for one pack. Make it once and keep it: its memos are what keep a search's millions of fights fast. (`knack: 'none'` is
 * no Knack.)
 */
export function createResolver(pack: FighterPack, shipped: Pick<Shipped, 'creatures'>): Resolver {
  const knackFx = (id: string | undefined): KnackFx =>
    id !== undefined && Object.hasOwn(pack.knacks, id) ? (pack.knacks[id]?.fx ?? {}) : {};
  /** A talent's effects; a golden one (`id` + `GOLDEN_MARK`) has every number x1.25 (`goldenFx`). */
  const talentFx = (key: string): KnackFx => {
    const golden = key.endsWith(GOLDEN_MARK);
    const id = golden ? key.slice(0, -GOLDEN_MARK.length) : key;
    const fx = Object.hasOwn(pack.talents, id) ? (pack.talents[id]?.fx ?? {}) : {};
    return golden ? goldenFx(fx) : fx;
  };

  /** Every effect name a Knack or talent uses, in a fixed order (see `uniformFx`). */
  const fxKeys: readonly string[] = [
    ...new Set([
      ...[...Object.values(pack.knacks), ...Object.values(pack.talents)].flatMap((d) =>
        Object.keys(d.fx),
      ),
      ...GEAR_FIELDS,
    ]),
  ];
  /** The Knacks that reshape the Support's base verb: Triage aims that verb, so they leave it idle. */
  const supportShape: ReadonlySet<string> = new Set(
    Object.values(pack.knacks)
      .filter((k) => k.family === SUPPORT_SHAPE_FAMILY)
      .map((k) => k.id),
  );

  /**
   * `merged` as an object with every effect name set in one fixed order (the ones it lacks `undefined`). Every creature's effects then
   * share one object shape, so the hot reads of `fx(f).someKey` stay fast; a read gives the same value as before.
   */
  function uniformFx(merged: KnackFx): KnackFx {
    const src = merged as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of fxKeys) out[key] = src[key];
    for (const key of Object.keys(src)) if (!(key in out)) out[key] = src[key];
    return out;
  }

  const fxMemo = new Map<string, KnackFx>();
  const statFxMemo = new Map<string, KnackFx>();
  const statsMemo = new Map<string, FormStats>();

  /** A gear sheet as a memo key (its fields in name order), or '' for no gear. */
  function gearKey(gear: KnackFx | undefined): string {
    if (gear === undefined) return '';
    const names = Object.keys(gear).sort();
    return names.length === 0
      ? ''
      : names.map((n) => `${n}=${String((gear as Record<string, unknown>)[n])}`).join(',');
  }

  function fxOf(
    knackId: string | undefined,
    talents: readonly string[],
    gear: KnackFx | undefined,
  ): KnackFx {
    const gk = gearKey(gear);
    const key = `${knackId ?? ''}|${talents.join(',')}|${gk}`;
    let fxAll = fxMemo.get(key);
    if (!fxAll) {
      const knack = knackFx(knackId);
      const parts = [knack, ...talents.map(talentFx)];
      if (gk === '') fxAll = uniformFx(mergeFx(parts));
      else {
        // Gear joins the sum, except Retaliate: a Knack's and the gear's make one counter with the larger chance.
        const { retaliateBp: gearCounter, ...rest } = gear as KnackFx;
        const merged: Record<string, unknown> = { ...mergeFx([...parts, rest]) };
        if (gearCounter !== undefined) {
          merged['retaliateBp'] = Math.max(knack.retaliateBp ?? 0, gearCounter);
        }
        fxAll = uniformFx(merged);
      }
      fxMemo.set(key, fxAll);
    }
    return fxAll;
  }

  /** The talents' plain stat lines alone (`STAT_FIELDS`): what silence leaves (R12). */
  function statFxOf(talents: readonly string[], gear: KnackFx | undefined): KnackFx {
    const gk = gearKey(gear);
    const key = `${talents.join(',')}|${gk}`;
    let stat = statFxMemo.get(key);
    if (!stat) {
      // Of the gear only its Armour is a stat line (the rest of its stat lines are added to the fighter by the caller).
      const gearStat: KnackFx =
        gear?.armourBonus === undefined ? {} : { armourBonus: gear.armourBonus };
      const merged = mergeFx([...talents.map(talentFx), gearStat]) as Record<string, unknown>;
      const only: Record<string, unknown> = {};
      for (const name of Object.keys(merged))
        if (STAT_FIELDS.has(name as keyof KnackFx)) only[name] = merged[name];
      stat = uniformFx(only);
      statFxMemo.set(key, stat);
    }
    return stat;
  }

  function statsOf(formId: string, level: number): FormStats {
    const key = `${formId}|${level}`;
    let st = statsMemo.get(key);
    if (!st) {
      st = formStats(pack, shipped, formId, level);
      statsMemo.set(key, st);
    }
    return st;
  }

  /** The talents as memo and effect keys: a golden one carries `GOLDEN_MARK`. Without golden ones these are the plain ids. */
  function talentKeys(p: Placement): readonly string[] {
    const talents = p.talents ?? [];
    const golden = p.goldenTalents;
    if (golden === undefined || golden.length === 0) return talents;
    return talents.map((id) => (golden.includes(id) ? id + GOLDEN_MARK : id));
  }

  function resolve(p: Placement): WeekendFighterSpec {
    const st = statsOf(p.formId, p.level);
    const k = p.knack === 'none' ? undefined : p.knack;
    const keys = talentKeys(p);
    const fxAll = fxOf(k, keys, p.gear);
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
      fxStat: statFxOf(keys, p.gear),
      // Triage aims the Support's own base verb: a Support shape Knack leaves it idle (the fight reads only the flag).
      triageIdle: k !== undefined && supportShape.has(k),
      row: p.row,
      col: p.col,
    };
  }

  function placeFighters(placements: readonly Placement[]): FighterSpec[] {
    return placements.map((p, i) => ({ ...resolve(p), uid: `${p.owner}:${p.formId}:${i}` }));
  }

  return { statsOf, resolve, placeFighters };
}
