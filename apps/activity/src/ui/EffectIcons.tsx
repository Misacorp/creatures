import type { EventNames } from '@creatures/engine';
import { effectIcons } from '../effect-view';
import { GlossaryTag } from '../Glossary';
import { glyphOrUnknown } from '../glyphs';
import type { EffectView } from '../replay';
import { Sprite } from '../sprites/Sprite';

/**
 * The status effects on a fighter as small icons: the glyph, the stacks ("×5") and, on the boss, the
 * turns left. Each opens its glossary entry. On a creature (`compact`) only the glyph and the stacks
 * show, to fit the small unit; the turns are in the icon's accessible name. Nothing here is drawn for a
 * fighter without effects.
 */
export function EffectIcons({
  effects,
  names,
  compact = false,
}: {
  effects: readonly EffectView[];
  names?: Pick<EventNames, 'effects'>;
  compact?: boolean;
}) {
  if (effects.length === 0) return null;
  const icons = effectIcons(effects, names);
  return (
    <ul class={`effect-icons${compact ? ' compact' : ''}`} aria-label="Status effects">
      {icons.map((icon) => (
        <li key={icon.id} class={`effect-chip ${icon.kind}`} data-effect={icon.id}>
          <GlossaryTag entry={icon.entry} look="chip" bare class="effect-tag" label={icon.label}>
            <span class="effect-top">
              <Sprite sprite={glyphOrUnknown(icon.id)} scale={2} />
              <span class="effect-stacks pix">{icon.stacksText}</span>
            </span>
            {!compact && <span class="effect-turns pix">{icon.turnsText}</span>}
          </GlossaryTag>
        </li>
      ))}
    </ul>
  );
}
