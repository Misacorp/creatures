import type { Creature, GameState } from '../api';
import { shinyPalette } from '../art';
import { activityBadges, portraitAlt, xpWords } from '../creature-card-view';
import { experienceLabel } from '../CreatureProgress';
import { creatureName, elementName, getSpecies } from '../game';
import { GlossaryTag } from '../Glossary';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { GameIcon } from '../ui/GameIcon';
import { Tag } from '../ui/Tag';
import { XpBar } from '../XpBar';

/**
 * The creature page's head (v3): the portrait, then one row that holds the name, the element icon and the
 * level, all centred on the same line, then the experience bar. A name that is too long for the row wraps
 * to a second line (two at most, then it is cut with an ellipsis; the whole name is in the Rename field and
 * read out in full by screen readers) and the icon and the level stay centred against the whole name. The
 * portrait has one border in the creature's rarity colour (the rarity is in its spoken label). The level
 * badge is a hidden interaction: a tap still opens its explanation, with no "?" drawn. There is no
 * "Next: ..." line, and the species name of a nicknamed creature is a tag on the page, not here.
 */
export function PageHeader({
  creature,
  state,
  nameId,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId'>;
  nameId: string;
}) {
  const species = getSpecies(creature.species);
  const badges = activityBadges(creature, state);
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  const name = creatureName(creature);
  return (
    <div class="v3-head">
      <div
        class={`portrait${sparkleFrame ? ' sparkle-frame' : ''}${species === undefined ? '' : ` rarity-${species.rarity}`}`}
      >
        <Sprite
          sprite={creatureSpriteOrFallback(creature.species)}
          scale={4}
          bob
          alt={portraitAlt(name, creature.shiny, species?.rarity)}
          {...(shinyColours === undefined ? {} : { palette: shinyColours })}
        />
        {sparkleFrame && (
          <>
            <Sprite sprite={sparkle} scale={2} class="sparkle one" />
            <Sprite sprite={sparkle} scale={2} class="sparkle two" />
          </>
        )}
      </div>
      <div class="v3-id">
        <div class="v3-name-row">
          <h2 id={nameId} class="v3-name">
            <span class="v3-name-text">{name}</span>
          </h2>
          {species !== undefined && (
            <span
              class={`chip v3-element t-${species.element}`}
              role="img"
              aria-label={elementName(species.element)}
            >
              <GameIcon icon={{ kind: 'element', element: species.element }} scale={2} />
            </span>
          )}
          <GlossaryTag entry="level" look="chip" bare class="lvl-tag v3-level pix">
            Lv {creature.level}
          </GlossaryTag>
        </div>
        {badges.length > 0 && (
          <p class="cc-sub">
            {badges.map((badge) => (
              <Tag
                key={badge.text}
                kind="badge"
                tone={badge.tone}
                {...(badge.entry === null ? {} : { entry: badge.entry })}
              >
                {badge.text}
              </Tag>
            ))}
          </p>
        )}
        <XpBar
          value={creature.expNeeded === null ? 1 : creature.exp}
          max={creature.expNeeded ?? 1}
          label={experienceLabel(creature)}
          text={xpWords(creature)}
        />
      </div>
    </div>
  );
}
