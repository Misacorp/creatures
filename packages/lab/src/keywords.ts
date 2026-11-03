/**
 * The keyword list of combat v2 (docs/design/combat/keywords.md is its readable copy): data in `@creatures/game/combat-v2`
 * (`keywords.json`). Knack text writes keywords in braces, `{Taunt}`; the game's loader checks that every one used exists.
 */
import { combatV2 } from '@creatures/game/combat-v2';

export const KEYWORDS: Readonly<
  Record<string, { readonly means: string; readonly not: string; readonly step: string }>
> = combatV2.keywords;

/** The keywords a text uses, `{Like} {This}`. */
export function keywordsIn(text: string): string[] {
  return [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
}
