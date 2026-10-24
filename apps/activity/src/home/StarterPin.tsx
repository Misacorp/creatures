import { shinyPalette } from '../art';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';

/**
 * The pin in the top right corner of the Today board: a round pushpin badge drawn as the player's starter
 * creature (`starterLook`; Sproutle when none is known). A button that opens the Creatures view, 44 px at least,
 * sitting above the papers (it may overlap a notice). The picture is decoration: the name is "Your creatures".
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
    <button type="button" class="hb-starter" aria-label="Your creatures" onClick={onOpen}>
      <span class="hb-starter-disc">
        <Sprite
          sprite={creatureSpriteOrFallback(species)}
          scale={2}
          {...(palette === undefined ? {} : { palette })}
        />
      </span>
    </button>
  );
}
