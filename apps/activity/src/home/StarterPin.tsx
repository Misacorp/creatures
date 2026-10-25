import { shinyPalette } from '../art';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';

/**
 * A pin in the top right corner of the Today board, left of the "?" when that is drawn: a round pushpin badge
 * drawn as the player's starter creature (`starterLook`; Sproutle when none is known). A button that opens the
 * Creatures view, 44 px at least, sitting above the papers (it may overlap a notice); the look is the shared
 * `hb-badge` (as the "?" pin's). The picture is decoration: the name is "Your creatures".
 */
export function StarterPin({
  species,
  shiny,
  onOpen,
}: {
  species: string;
  shiny: boolean;
  onOpen: () => void;
}) {
  const palette = shiny ? shinyPalette(species) : undefined;
  return (
    <button type="button" class="hb-badge hb-starter" aria-label="Your creatures" onClick={onOpen}>
      <span class="hb-badge-disc">
        <Sprite
          sprite={creatureSpriteOrFallback(species)}
          scale={2}
          {...(palette === undefined ? {} : { palette })}
        />
      </span>
    </button>
  );
}
