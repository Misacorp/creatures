/**
 * The Knacks a creature knows (R11, docs/design/combat/proposals/001-combat-v2.md): worked out from its form and
 * its line, never stored. A creature knows every Knack of its form from the moment it is caught; evolving adds the
 * new form's own Knacks to the ones it knew; on a role change (Mossback, a Setter, into Bloomback, a Payoff) only
 * the new form's own Knacks are kept, since the old role's would do nothing.
 *
 * So the list is the own Knacks of every form on the path from the line's base form to the creature's form, cut at
 * the last role change on that path. Pure over the species list and the forms file; `index.ts` binds it to the
 * shipped content as `knownKnacks`.
 */
import type { Role } from '../content/schema';
import type { FormDef } from './schema';

/** A species as far as the path needs it: its line, role and the forms it grows into. */
export interface PathSpecies {
  readonly id: string;
  readonly line: string;
  readonly role: Role;
  readonly evolvesTo?: { readonly species: string } | undefined;
  readonly altEvolvesTo?: { readonly species: string } | undefined;
}

/**
 * The forms from the line's base form to `formId`, base form first. A form that is nobody's evolution is its own
 * base form. Throws for a species the list does not hold.
 */
export function formPath(species: readonly PathSpecies[], formId: string): PathSpecies[] {
  const byId = new Map(species.map((s) => [s.id, s] as const));
  const parentOf = new Map<string, PathSpecies>();
  for (const s of species) {
    for (const to of [s.evolvesTo?.species, s.altEvolvesTo?.species]) {
      if (to !== undefined) parentOf.set(to, s);
    }
  }
  const last = byId.get(formId);
  if (last === undefined) throw new RangeError(`unknown form "${formId}"`);
  const path: PathSpecies[] = [last];
  for (let at = parentOf.get(last.id); at !== undefined; at = parentOf.get(at.id)) {
    // A cycle would be a content error; the guard keeps it from looping.
    if (path.length > species.length) throw new RangeError(`form "${formId}" has a cyclic path`);
    path.unshift(at);
  }
  return path;
}

/**
 * The form ids whose own Knacks the creature knows: the path from the base form to `formId`, from the last form
 * whose role differs from the one before it (a role change keeps only the new form's Knacks).
 */
export function knackForms(species: readonly PathSpecies[], formId: string): string[] {
  const path = formPath(species, formId);
  let from = 0;
  for (let i = 1; i < path.length; i++) {
    if ((path[i] as PathSpecies).role !== (path[i - 1] as PathSpecies).role) from = i;
  }
  return path.slice(from).map((s) => s.id);
}

/**
 * The Knack ids a creature of form `formId` knows, in order: each form's own Knacks from the earliest form kept to
 * the latest, each Knack once. Throws for a form the forms file does not hold.
 */
export function knownKnacksOf(
  forms: Readonly<Record<string, FormDef>>,
  species: readonly PathSpecies[],
  formId: string,
): string[] {
  const out: string[] = [];
  for (const id of knackForms(species, formId)) {
    const form = forms[id];
    if (form === undefined) throw new RangeError(`form "${id}" has no combat v2 entry`);
    for (const knack of form.ownKnacks) if (!out.includes(knack)) out.push(knack);
  }
  return out;
}
