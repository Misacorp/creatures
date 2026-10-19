import type { ComponentChildren } from 'preact';
import type { Creature, GameState } from './api';
import { shinyPalette } from './art';
import { activityBadges, portraitAlt } from './creature-card-view';
import {
  capitalize,
  creatureName,
  elementName,
  getSpecies,
  isFestivalSpecies,
  isFirstOnServer,
  speciesName,
} from './game';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { elementIcon } from './sprites/element-icons';
import { ArmchairIcon } from './ui/ArmchairIcon';
import { Tag } from './ui/Tag';

/**
 * The creature's tags under its name, in words: the species of a nickname, the element (with its icon), the
 * role, then Festival, Shiny, First on server and what it is doing now (Away, On a job, Lounging). Away and
 * On a job open their glossary entry, as on the page; the others are plain (the whole card opens the page).
 */
function NameTags({
  creature,
  state,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId' | 'serverFirsts'>;
}) {
  const species = getSpecies(creature.species);
  const tags: ComponentChildren[] = [];
  if (creature.nickname !== null) {
    tags.push(<Tag key="species">{speciesName(creature.species)}</Tag>);
  }
  if (species !== undefined) {
    const icon =
      elementIcon(species.element) === undefined
        ? undefined
        : { kind: 'element' as const, element: species.element };
    tags.push(
      <Tag key="element" kind="chip" tone={`t-${species.element}`} icon={icon}>
        {elementName(species.element)}
      </Tag>,
      <Tag key="role" kind="chip" tone="role-chip">
        {capitalize(species.role)}
      </Tag>,
    );
  }
  if (isFestivalSpecies(creature.species)) {
    tags.push(
      <Tag key="festival" kind="badge" tone="festival">
        Festival
      </Tag>,
    );
  }
  if (creature.shiny) {
    tags.push(
      <Tag key="shiny" kind="badge" tone="shiny">
        Shiny
      </Tag>,
    );
  }
  if (isFirstOnServer(creature, state.serverFirsts)) {
    tags.push(
      <Tag key="first" kind="badge" tone="first">
        First on server
      </Tag>,
    );
  }
  for (const badge of activityBadges(creature, state)) {
    tags.push(
      <Tag
        key={badge.text}
        kind="badge"
        tone={badge.tone}
        {...(badge.entry === null ? {} : { entry: badge.entry })}
      >
        {badge.icon === 'armchair' && <ArmchairIcon />}
        {badge.text}
      </Tag>,
    );
  }
  return <p class="cc-tags">{tags}</p>;
}

/**
 * The top of the creature card: the portrait at the top left and, beside it, the name on one line (a button
 * that opens the page, for the keyboard and screen readers; an over-long name ends in "…") with the
 * creature's tags in words under it. No level tag and no arrow: the level is on the bar under this block,
 * and the whole card says it can be tapped. The creature page has its own head (`creature-page/PageHeader`).
 */
export function CreatureHead({
  creature,
  state,
  nameId,
  onOpen,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId' | 'serverFirsts'>;
  nameId: string;
  onOpen: () => void;
}) {
  const species = getSpecies(creature.species);
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  // A shiny without its own palette gets a sparkle frame instead.
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  const name = creatureName(creature);
  return (
    <div class="cc-head">
      <div class={`portrait${sparkleFrame ? ' sparkle-frame' : ''}`}>
        <Sprite
          sprite={creatureSpriteOrFallback(creature.species)}
          scale={4}
          bob
          alt={portraitAlt(name, creature.shiny)}
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
        <h3
          id={nameId}
          class={species === undefined ? 'cc-name' : `cc-name rarity-name rarity-${species.rarity}`}
        >
          <button
            type="button"
            class="cc-open"
            title={name}
            aria-label={`Open ${name}${species === undefined ? '' : `, ${species.rarity}`}`}
            onClick={onOpen}
          >
            {name}
          </button>
        </h3>
        <NameTags creature={creature} state={state} />
      </div>
    </div>
  );
}
