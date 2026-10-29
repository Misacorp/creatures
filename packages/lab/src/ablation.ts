/**
 * Mechanics that matter, measured (panel 4): a mechanic is "called for" by a boss only when taking it out of the boss's
 * best legal line makes the line do clearly worse. Each mechanic that a line can carry has a tool matcher (which Knacks
 * and talents are the mechanic); `strip` takes those off a line (a Knack becomes none, a talent is dropped), `ablate`
 * measures the drop. Mechanics that only the boss has (an escalation feed, adaptation) have no tool on a line: they are
 * reported by the structural check in `mechanics.ts`, as "features present", not as measured.
 */
import { KNACKS, type KnackDef, type KnackFx } from './knacks';
import { keywordsIn } from './keywords';
import { MECHANICS, type Mechanic } from './mechanics';
import { MODIFIERS } from './modifiers';
import { lineKey, type Pick } from './search';
import { TALENTS, type TalentDef } from './talents';

/** Which Knacks and talents are a mechanic. */
export interface Tool {
  readonly knack?: (k: KnackDef) => boolean;
  readonly talent?: (t: TalentDef) => boolean;
}

const on = (v: unknown): boolean => v !== undefined && v !== false && v !== 0;
const any = (fx: KnackFx, keys: readonly (keyof KnackFx)[]): boolean => keys.some((k) => on(fx[k]));

/** The effects that make up each rule mechanic, read off a Knack's or a talent's effect fields. */
const RULE_FX: Readonly<Record<string, (fx: KnackFx) => boolean>> = {
  'rule:armour': (fx) => (fx.armourBonus ?? 0) > 0 || on(fx.pierceBesideBp),
  'rule:dodge': (fx) =>
    any(fx, [
      'dodgeBonusBp',
      'areaDodgeBp',
      'rowDodgeBp',
      'besideDodgeBp',
      'retaliateBp',
      'storeDodgeStacks',
      'momentumBp',
    ]) || fx.support === 'clearSkies',
  'rule:silence': (fx) =>
    any(fx, ['ignoreSilence', 'besideNoSilence']) || fx.support === 'clearAir',
  'rule:mired': (fx) => any(fx, ['miresAtStart', 'miresOnHit', 'miredExtraBp', 'clinging']),
  'rule:marks': (fx) =>
    any(fx, [
      'seal',
      'markOthers',
      'marksAs',
      'markStacks',
      'trail',
      'firstMarkExtra',
      'ownMarkBp',
      'primeOnIntercept',
    ]) || fx.support === 'readyMark',
  'rule:charged': (fx) => any(fx, ['interceptCharged', 'braceBp']),
  'rule:taunt': (fx) => on(fx.taunt),
  'rule:intercept': (fx) =>
    any(fx, [
      'interceptArea',
      'interceptCharged',
      'interceptLikeGuard',
      'interceptHitBackBp',
      'primeOnIntercept',
      'distanceCoverBp',
    ]),
  'rule:cover': (fx) =>
    any(fx, [
      'coverBonusBp',
      'distanceCoverBp',
      'flankGuard',
      'reachBonus',
      'rowAreaCutBp',
      'besideAreaCutBp',
      'areaCutBp',
      'guardMendBp',
    ]),
};

/** The category of a talent (damage, marks, protection, team), from the modifier library. */
export const talentCategory = (id: string): string | undefined =>
  MODIFIERS.find((m) => m.talents.includes(id))?.category;

/** The tool of a mechanic, or undefined when a line cannot carry it (only the boss has it). */
export function toolOf(m: Mechanic): Tool | undefined {
  const [kind, id = ''] = m.id.split(/:(.*)/s);
  if (kind === 'family') return { knack: (k) => k.family === id };
  if (kind === 'keyword')
    return {
      knack: (k) => keywordsIn(k.text).includes(id),
      talent: (t) => keywordsIn(t.text).includes(id),
    };
  if (kind === 'talent') return { talent: (t) => talentCategory(t.id) === id };
  const fx = RULE_FX[m.id];
  if (fx) return { knack: (k) => fx(k.fx), talent: (t) => fx(t.fx) };
  return undefined;
}

/** `line` without the mechanic's Knacks (they become none) and talents. */
export function strip(line: readonly Pick[], tool: Tool): Pick[] {
  return line.map((p) => {
    const k = KNACKS[p.knack];
    const knackGoes = !!(k && tool.knack?.(k));
    const talents = (p.talents ?? []).filter((t) => {
      const def = TALENTS[t];
      return !(def && tool.talent?.(def));
    });
    return {
      formId: p.formId,
      knack: knackGoes ? 'none' : p.knack,
      ...(p.level !== undefined ? { level: p.level } : {}),
      ...(talents.length ? { talents } : {}),
    };
  });
}

export interface Measured {
  readonly mechanic: Mechanic;
  /** False when only the boss can have it (no tool on a line). */
  readonly hasTool: boolean;
  /** Whether the line carries it at all. */
  readonly carried: boolean;
  /** How far the measure falls when it is taken out (0 when the line does not carry it). */
  readonly drop: number;
}

/**
 * Takes each mechanic out of `line` and measures it: `measure` is higher for a line that does better (a win rate in
 * points for a raid boss, a score for a foe), run on the same seeds each time. Lines that come out the same are measured once.
 */
export function ablate(line: readonly Pick[], measure: (l: readonly Pick[]) => number): Measured[] {
  const base = measure(line);
  const cache = new Map<string, number>();
  const baseKey = lineKey(line);
  cache.set(baseKey, base);
  return MECHANICS.map((mechanic) => {
    const tool = toolOf(mechanic);
    if (!tool) return { mechanic, hasTool: false, carried: false, drop: 0 };
    const stripped = strip(line, tool);
    const key = lineKey(stripped);
    if (key === baseKey) return { mechanic, hasTool: true, carried: false, drop: 0 };
    let v = cache.get(key);
    if (v === undefined) {
      v = measure(stripped);
      cache.set(key, v);
    }
    return { mechanic, hasTool: true, carried: true, drop: base - v };
  });
}
