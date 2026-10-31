/**
 * Knack usage read within the form. A Knack on one popular form shows a high share of all picks just because its form is
 * picked often (Living Shelter and Rolling Fog, 2026-10-31), so the usage tables also give the within-form ratio: the Knack's
 * picks over what random would give among the choices its forms can equip, where "no Knack" is one of the choices.
 * 1.0 is random within the form; 2 or more stands out, under 0.3 is rarely chosen.
 */
import { FORM_KNACKS } from './knacks';

/** Every pick of a form, whatever its Knack (the within-form ratio's base). */
export function formPickCounts(
  lines: Iterable<readonly { readonly formId: string }[]>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines)
    for (const p of line) counts.set(p.formId, (counts.get(p.formId) ?? 0) + 1);
  return counts;
}

/**
 * The within-form ratio of `knack` (`'none'` is no Knack): its picks over the picks random would give among the choices of
 * the forms that can equip it (each form's Knacks plus "no Knack"). 0 when its forms were never picked.
 */
export function withinFormRatio(
  knack: string,
  knackPicks: number,
  formPicks: ReadonlyMap<string, number>,
): number {
  let expected = 0;
  for (const [form, knacks] of Object.entries(FORM_KNACKS)) {
    if (knack !== 'none' && !knacks.includes(knack)) continue;
    expected += (formPicks.get(form) ?? 0) / (knacks.length + 1);
  }
  return expected > 0 ? knackPicks / expected : 0;
}
