/**
 * What a status effect icon says, from the content and the replay's effect state. Pure: the stage
 * draws it (`ui/EffectIcons.tsx`). All text is plain text.
 */
import { GLOSSARY_IDS, content } from '@creatures/game';
import type { EventNames } from '@creatures/engine';
import type { EffectView } from './replay';

export interface EffectIconInfo {
  /** The effect's content id (also the glyph key). */
  id: string;
  name: string;
  kind: 'buff' | 'debuff';
  stacks: number;
  turnsLeft: number;
  /** "×5". */
  stacksText: string;
  /** "3 turns" / "1 turn". */
  turnsText: string;
  /** The glossary entry the icon opens. */
  entry: string;
  /** For assistive technology. */
  label: string;
}

export const turnsText = (n: number): string => `${String(n)} turn${n === 1 ? '' : 's'}`;

/** The icons for a fighter's effects, in the order they were applied. */
export function effectIcons(
  list: readonly EffectView[],
  names?: Pick<EventNames, 'effects'>,
): EffectIconInfo[] {
  return list.map((e) => {
    const def = content.statusEffects.find((d) => d.id === e.effect);
    const name = names?.effects?.[e.effect] ?? def?.name ?? e.effect;
    return {
      id: e.effect,
      name,
      kind: def?.kind ?? 'debuff',
      stacks: e.stacks,
      turnsLeft: e.turnsLeft,
      stacksText: `×${String(e.stacks)}`,
      turnsText: turnsText(e.turnsLeft),
      entry: GLOSSARY_IDS.status(e.effect),
      label: `${name}, ${String(e.stacks)} ${e.stacks === 1 ? 'stack' : 'stacks'}, ${turnsText(e.turnsLeft)} left. What does this mean?`,
    };
  });
}
