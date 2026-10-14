import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { bannerArt, bannerScale, shinyPalette } from './art';
import { cssVars } from './css-vars';
import { useElementWidth } from './hooks';
import { SmallCreature } from './SmallCreature';
import { Sprite } from './sprites/Sprite';
import { BANNER_SIZE, creatureSpriteOrFallback } from './sprites/creature-sprites';
import type { CreatureInfo } from './creature-info';

/** The creature that walks across a banner: how far along (0 to 1) and who it is. */
interface Walker {
  species: string;
  shiny: boolean;
  /** 0 is the left edge, 1 the right edge. Its position is the trip's progress. */
  fraction: number;
  /** For the creature's popover (name, level, role and element); null leaves it a plain picture. */
  info: CreatureInfo | null;
  id: string;
}

/**
 * A destination's pixel banner at a whole-number scale that fits the space (never wider than it), with
 * an optional creature walking across it from left to right. The creature has a small bob while the
 * player allows motion; with reduced motion it stands still at the progress position. The picture is
 * decoration: progress is always said in words next to it.
 */
export function Banner({
  destination,
  walker,
  children,
}: {
  destination: string;
  walker?: Walker;
  /** Drawn over the picture, inside its edges (the catalogue's arrows). */
  children?: ComponentChildren;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const width = useElementWidth(slot, 320);
  const scale = bannerScale(width);
  const walkerScale = Math.max(2, Math.floor(scale * 0.6));
  const palette = walker !== undefined && walker.shiny ? shinyPalette(walker.species) : undefined;
  const sprite =
    walker === undefined ? null : (
      <Sprite
        sprite={creatureSpriteOrFallback(walker.species)}
        scale={walkerScale}
        {...(palette === undefined ? {} : { palette })}
      />
    );
  return (
    <div class="banner" ref={slot}>
      <div
        class="banner-art"
        ref={cssVars({
          '--banner-w': `${String(BANNER_SIZE.width * scale)}px`,
          '--walker-w': `${String(16 * walkerScale)}px`,
        })}
      >
        <Sprite sprite={bannerArt(destination)} scale={scale} />
        {walker !== undefined && sprite !== null && (
          <span class="walker" ref={cssVars({ '--p': String(walker.fraction) })}>
            <span class="walker-bob">
              {walker.info === null ? (
                sprite
              ) : (
                <SmallCreature id={walker.id} info={walker.info}>
                  {sprite}
                </SmallCreature>
              )}
            </span>
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
