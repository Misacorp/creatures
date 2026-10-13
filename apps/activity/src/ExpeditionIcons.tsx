import { GLOSSARY_IDS } from '@creatures/game';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';

/**
 * Familiarity stars, three places: a filled star for each earned and a hollow one for the rest. The
 * stars are pictures; the count is said once in words for assistive technology.
 */
export function Stars({ stars, label }: { stars: number; label?: string }) {
  const spoken = label ?? `${String(stars)} of 3 stars`;
  return (
    <span class="stars-row" role="img" aria-label={spoken}>
      {[0, 1, 2].map((i) => (
        <span key={i} class={i < stars ? 'star on' : 'star'} aria-hidden="true">
          <Sprite sprite={glyphOrUnknown(i < stars ? 'star' : 'star-empty')} scale={2} />
        </span>
      ))}
    </span>
  );
}

/** Four pips that show how much of the best a trip brings (the exact words are the label). */
export function Pips({ level, max = 4 }: { level: number; max?: number }) {
  return (
    <span class="pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < level ? 'on' : undefined} />
      ))}
    </span>
  );
}

/** The mark of a supply that makes the end-of-trip choice likely or certain. */
export function ChoiceMark({ choice }: { choice: 'guaranteed' | 'likely' }) {
  return (
    <span class={`choice-mark ${choice}`}>
      <Sprite sprite={glyphOrUnknown('fork')} scale={2} />
      <GlossaryTag entry="push-on" look="text">
        {choice === 'guaranteed' ? 'Choice guaranteed' : 'Choice likely'}
      </GlossaryTag>
    </span>
  );
}

/** The glossary entry of a supply kind (its tiers share the entry). */
export function supplyEntry(kind: string): string {
  return GLOSSARY_IDS.supply(kind);
}
