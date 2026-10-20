import type { ComponentChildren } from 'preact';
import { shinyPalette } from '../art';
import { getSpecies, speciesName } from '../game';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import type { TalentView } from '../talent-types';
import { TalentChip } from '../TalentChip';
import { Tag } from './Tag';

/** What a found creature's card shows. `FindCard` (a trip's find) builds it from a `Find`; a Festival creature builds it too. */
export interface FoundCreature {
  species: string;
  shiny: boolean;
  /** The talent it rolled; null when it has none (a catch from before talents). */
  talent: TalentView | null;
  /** The talent is new to every creature of its line the player has (or the creature itself is new): a green New. */
  talentNew: boolean;
  /** Small badges after the name ("New!", "Duplicate", "First on server!"); one with an `entry` opens its help. */
  badges: readonly { text: string; entry: string | null }[];
}

/**
 * A creature that was found or won, as a card: its picture, its name in its rarity's colour, its element
 * and role, its badges, and the talent it rolled in a box headed "Discovered talent". The one card of a
 * creature find everywhere (a trip's catches, a waiting duplicate, a Festival creature). `children` go
 * under the card's facts: a duplicate's choice and what it became. It is a list item: put it in a `FindList`.
 */
export function FindCreature({
  creature,
  duplicate = false,
  children,
}: {
  creature: FoundCreature;
  /** The card holds a choice (a dashed box under it), so it is drawn a little differently. */
  duplicate?: boolean;
  children?: ComponentChildren;
}) {
  const def = getSpecies(creature.species);
  const palette = creature.shiny ? shinyPalette(creature.species) : undefined;
  return (
    <li class={`find-card${duplicate ? ' dup' : ''}`}>
      <div class="find-head">
        <Sprite
          sprite={creatureSpriteOrFallback(creature.species)}
          scale={3}
          bob
          {...(palette === undefined ? {} : { palette })}
        />
        <div class="find-name">
          <strong class={`pix rarity-name rarity-${def?.rarity ?? 'common'}`}>
            {speciesName(creature.species)}
          </strong>
          <span class="find-tags">
            {def !== undefined && <ElementChip element={def.element} role={def.role} />}
            {creature.badges.map((b) => (
              <Tag key={b.text} kind="badge" {...(b.entry === null ? {} : { entry: b.entry })}>
                {b.text}
              </Tag>
            ))}
            {creature.shiny && (
              <Tag kind="badge" tone="shiny" entry="shiny">
                Shiny!
              </Tag>
            )}
          </span>
        </div>
      </div>
      {creature.talent !== null && (
        <div class="find-talent">
          <p class="find-talent-head">
            Discovered talent
            {creature.talentNew && <span class="find-new pix">New</span>}
          </p>
          <TalentChip talent={creature.talent} />
        </div>
      )}
      {children}
    </li>
  );
}
