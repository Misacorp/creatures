import type { Creature } from './api';
import { shinyPalette } from './art';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** A creature's small picture in a button (2x, its shiny colours when it is shiny). Decoration: the words say what it does. */
export function CreatureIcon({ creature }: { creature: Pick<Creature, 'species' | 'shiny'> }) {
  const palette = creature.shiny ? shinyPalette(creature.species) : undefined;
  return (
    <Sprite
      sprite={creatureSpriteOrFallback(creature.species)}
      scale={2}
      class="button-creature"
      {...(palette === undefined ? {} : { palette })}
    />
  );
}
