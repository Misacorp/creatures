import { GLOSSARY_IDS, RULES } from '@creatures/game';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';

/**
 * Familiarity stars, three places: a filled star for each earned and a hollow one for the rest. The
 * stars are pictures; the count is said once in words for assistive technology.
 */
export function Stars({ stars, label }: { stars: number; label?: string }) {
  const spoken = label ?? `${String(stars)} / 3 stars`;
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

/** The colour of the star a fusion would add: a fresh green, so it reads apart from the gold ones. */
const GAIN_STAR = { g: '#6fdc8c' };

/**
 * A creature's fusions as five stars: gold for each it has, hollow for the rest. With `gain`, the next
 * star is the one this choice adds: green, and it pulses while the player allows motion. The count is
 * said in words for assistive technology.
 */
export function FusionStars({ count, gain = false }: { count: number; gain?: boolean }) {
  const max = RULES.fusion.maxFusions;
  const spoken = gain
    ? `Fusion ${String(count)} to ${String(count + 1)} / ${String(max)}`
    : `Fusion ${String(count)} / ${String(max)}`;
  return (
    <span class="stars-row fusion-stars" role="img" aria-label={spoken}>
      {Array.from({ length: max }, (_, i) => {
        const on = i < count;
        const next = gain && i === count;
        return (
          <span key={i} class={on ? 'star on' : next ? 'star gain' : 'star'} aria-hidden="true">
            <Sprite
              sprite={glyphOrUnknown(on || next ? 'star' : 'star-empty')}
              scale={2}
              {...(next ? { palette: GAIN_STAR } : {})}
            />
          </span>
        );
      })}
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
