/**
 * Combat talents of the combat v2 draft (docs/design/combat/proposals/001-combat-v2.md, R20). One
 * shared library; each creature line links to its own pool from it (Misa, 2026-10-27), so two lines
 * of the same role can roll different tools. A creature rolls from its line's pool when it is found
 * and through the Talent Book over time; the migration rerolls them (roadmap phase 6, a golden talent
 * rolls golden). Talents use the Knacks' effect grammar; their numbers add to the Knack's.
 *
 * Rules (panel 2, Misa 2026-10-26):
 * - One name per effect, one number per name (P-06), across Knacks, talents and gear; every species
 *   uses the shared names.
 * - A talent never repeats a Knack's effect, and Seal is never a talent: the roll must not decide
 *   the Knack choice.
 * - Talents use only fields that add up (`ADDITIVE_FIELDS`), never a Knack's multipliers.
 * - A talent that does nothing for a form's role is idle on it (shown as such, as in the game today). Triage is also
 *   idle under a Support shape Knack (`talentIdleUnder`).
 * - A talent takes the name of the shipped gear line when it is the same effect (Misa, 2026-10-28); a name a gear line
 *   has with a different effect is not used (`TALENT_IS_GEAR` in modifiers.ts maps each talent that is a line).
 * - Silence blanks talents (panel 3): triggers do not arm, rhythm counters do not count, once-per-fight effects are
 *   not spent; what was stored before the silence stays stored.
 * Exploration and crafting talents stay out of the combat rework (Misa, 2026-10-26).
 */
import { content } from '@creatures/game';
import { ADDITIVE_FIELDS, STAT_FIELDS, mergeFx } from '@creatures/engine/v2';
import { combatV2, type TalentDef } from '@creatures/game/combat-v2';
import { SUPPORT_SHAPE_KNACKS } from './knacks';
import type { Role } from './types';

// The effect merge and its field lists are the engine's (`@creatures/engine/v2`); the talents are content written in them.
export { ADDITIVE_FIELDS, STAT_FIELDS, mergeFx };
export type { TalentDef };

/** The talent library: data in `@creatures/game/combat-v2` (`talents.json`). */
export const TALENTS: Readonly<Record<string, TalentDef>> = combatV2.talents;

/**
 * Each line's pool: 7 talents from the library, chosen for the line's forms and flavour (`talents.json`; the themes are in the
 * header of `packages/game/src/combat-v2/schema.ts`).
 */
export const LINE_POOLS: Readonly<Record<string, readonly string[]>> = combatV2.pools;

export interface PoolEntry {
  readonly talent: string;
  /** The roles of the line's forms this talent does something for. */
  readonly roles: readonly Role[];
}

/** The roles of a line's forms. */
export function lineRoles(line: string): Role[] {
  return [...new Set(content.creatures.filter((c) => c.line === line).map((c) => c.role))];
}

/** A line's pool, each talent with the line's roles it fits. */
export function talentPool(line: string): PoolEntry[] {
  const roles = lineRoles(line);
  return (LINE_POOLS[line] ?? []).map((t) => ({
    talent: t,
    roles: roles.filter((r) => TALENTS[t]?.roles.includes(r)),
  }));
}

/**
 * Whether a talent does nothing under a Knack, whatever the role: Triage aims the Support's own base verb, so a
 * Support shape Knack (Sunbeam, Drizzle, Starlight, Wide Embrace, Curl Up and the rest) leaves it idle.
 */
export function talentIdleUnder(talentId: string, knackId: string | undefined): boolean {
  return talentId === 'triage' && knackId !== undefined && SUPPORT_SHAPE_KNACKS.has(knackId);
}

/** The line of a form (a form with no line is its own). */
export const lineOfForm = (form: string): string =>
  content.creatures.find((c) => c.id === form)?.line ?? form;

/**
 * The talents a creature of `form` may carry (R20): those in its line's pool that work for its role. A talent outside the
 * pool cannot be rolled or learned, and one that does nothing for the role is idle (not a choice anyone makes).
 */
export function legalTalents(form: string): string[] {
  const role = content.creatures.find((c) => c.id === form)?.role;
  return (LINE_POOLS[lineOfForm(form)] ?? []).filter(
    (t) => role !== undefined && TALENTS[t]?.roles.includes(role),
  );
}

export interface IllegalTalent {
  readonly formId: string;
  readonly talent: string;
  /** Why it is not legal on this form. */
  readonly why: string;
}

/** The talents on `picks` that their creature may not carry (see `legalTalents`); an empty list means every one is legal. */
export function illegalTalents(
  picks: readonly { readonly formId: string; readonly talents?: readonly string[] | undefined }[],
): IllegalTalent[] {
  const out: IllegalTalent[] = [];
  for (const p of picks)
    for (const t of p.talents ?? []) {
      if (!TALENTS[t]) out.push({ formId: p.formId, talent: t, why: 'no such talent' });
      else if (!(LINE_POOLS[lineOfForm(p.formId)] ?? []).includes(t))
        out.push({ formId: p.formId, talent: t, why: `not in the ${lineOfForm(p.formId)} pool` });
      else if (!legalTalents(p.formId).includes(t))
        out.push({ formId: p.formId, talent: t, why: 'idle for its role' });
    }
  return out;
}

/** Throws, naming the creature and the talent, when a line carries an illegal talent. `label` says whose line it is. */
export function assertLegalTalents(
  picks: readonly { readonly formId: string; readonly talents?: readonly string[] | undefined }[],
  label: string,
): void {
  const bad = illegalTalents(picks);
  if (bad.length)
    throw new Error(
      `${label}: illegal talents: ${bad.map((b) => `${b.formId} carries ${b.talent} (${b.why})`).join('; ')}`,
    );
}

/** The lines with a talent pool. */
export const TALENT_LINES: readonly string[] = Object.keys(LINE_POOLS);

export function talent(id: string): TalentDef | undefined {
  return TALENTS[id];
}
