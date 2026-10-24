import type { EventNames } from '@creatures/engine';
import { effectIcons } from '../effect-view';
import { GlossaryTag } from '../Glossary';
import { glyphOrUnknown } from '../glyphs';
import type { EffectView } from '../replay';
import { Sprite } from '../sprites/Sprite';

/**
 * The status effects on a fighter as small icons: the glyph, the stacks ("×5") and, on the boss, the
 * turns left. Each opens its glossary entry. On a creature (`compact`) only the glyph and a bare
 * stack count (none for a single stack) show, to fit the small unit; the turns are in the icon's
 * accessible name. Nothing here is drawn for a
 * fighter without effects. With `only`, just the buffs or just the debuffs: they always stand in their
 * own place (buffs above, debuffs below), each chip with a small mark: an open △ for a buff, a solid ▼ for a debuff (a shape, not only a colour).
 */
export function EffectIcons({
  effects,
  names,
  compact = false,
  only,
}: {
  effects: readonly EffectView[];
  names?: Pick<EventNames, 'effects'>;
  compact?: boolean;
  only?: 'buff' | 'debuff';
}) {
  const icons = effectIcons(effects, names).filter((i) => only === undefined || i.kind === only);
  if (icons.length === 0) return null;
  const label = only === 'buff' ? 'Buffs' : only === 'debuff' ? 'Debuffs' : 'Status effects';
  return (
    <ul
      class={`effect-icons${compact ? ' compact' : ''}${only === undefined ? '' : ` ${only}s`}`}
      aria-label={label}
    >
      {icons.map((icon) => (
        <li key={icon.id} class={`effect-chip ${icon.kind}`} data-effect={icon.id}>
          <GlossaryTag entry={icon.entry} look="chip" class="effect-tag" label={icon.label}>
            <span class="effect-sign" aria-hidden="true">
              {icon.kind === 'buff' ? '△' : '▼'}
            </span>
            <span class="effect-top">
              <Sprite sprite={glyphOrUnknown(icon.id)} scale={2} />
              {(!compact || icon.stacks > 1) && (
                <span class="effect-stacks pix">
                  {compact ? String(icon.stacks) : icon.stacksText}
                </span>
              )}
            </span>
            {!compact && <span class="effect-turns pix">{icon.turnsText}</span>}
          </GlossaryTag>
        </li>
      ))}
    </ul>
  );
}
