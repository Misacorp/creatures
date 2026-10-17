import type { Creature, GameState } from './api';
import { shinyPalette } from './art';
import { activityBadges, speciesSubtitle, xpWords } from './creature-card-view';
import { experienceLabel } from './CreatureProgress';
import { creatureName, elementName, getSpecies } from './game';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { GameIcon } from './ui/GameIcon';
import { Tag } from './ui/Tag';
import { XpBar } from './XpBar';

/**
 * Who a creature is, in one block: portrait, name, element icon, level, the nickname's species and what
 * the creature is doing now (Away, On a job, Lounging) and the XP bar. The card and the creature page
 * both start with it. On the card the name is a button that opens the page (`onOpen`); on the page it is
 * plain text. `heading` is the level of the name's heading.
 */
export function CreatureHead({
  creature,
  state,
  heading,
  nameId,
  onOpen,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId'>;
  heading: 'h2' | 'h3';
  nameId: string;
  /** The card's way into the page for the keyboard: the name becomes a button that opens it. */
  onOpen?: () => void;
}) {
  const species = getSpecies(creature.species);
  const subtitle = speciesSubtitle(creature);
  const badges = activityBadges(creature, state);
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  // A shiny without its own palette gets a sparkle frame instead.
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  const Heading = heading;
  const name = creatureName(creature);
  return (
    <div class="cc-head">
      <div class={sparkleFrame ? 'portrait sparkle-frame' : 'portrait'}>
        <Sprite
          sprite={creatureSpriteOrFallback(creature.species)}
          scale={4}
          bob
          alt={`${name}${creature.shiny ? ' (shiny)' : ''}`}
          {...(shinyColours === undefined ? {} : { palette: shinyColours })}
        />
        {sparkleFrame && (
          <>
            <Sprite sprite={sparkle} scale={2} class="sparkle one" />
            <Sprite sprite={sparkle} scale={2} class="sparkle two" />
          </>
        )}
      </div>
      <div class="cc-id">
        <div class="cc-name">
          <Heading id={nameId}>
            {onOpen === undefined ? (
              name
            ) : (
              <button type="button" class="cc-open" aria-label={`Open ${name}`} onClick={onOpen}>
                {name}
              </button>
            )}
          </Heading>
          {species !== undefined && (
            <span
              class={`chip cc-element t-${species.element}`}
              role="img"
              aria-label={elementName(species.element)}
            >
              <GameIcon icon={{ kind: 'element', element: species.element }} scale={2} />
            </span>
          )}
          <GlossaryTag entry="level" look="chip" class="lvl-tag pix">
            Lv {creature.level}
          </GlossaryTag>
        </div>
        {(subtitle !== null || badges.length > 0) && (
          <p class="cc-sub">
            {subtitle !== null && <span class="muted">{subtitle}</span>}
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
      {onOpen !== undefined && (
        <span class="cc-chev pix" aria-hidden="true">
          ›
        </span>
      )}
    </div>
  );
}
