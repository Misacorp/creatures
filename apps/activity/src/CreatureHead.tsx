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
import { ElementChip } from './sprites/ElementChip';
import { ArmchairIcon } from './ui/ArmchairIcon';
import { Tag } from './ui/Tag';

/** The species name as a tag, only for a creature whose nickname says something else (any case). */
function showsSpecies(creature: Creature): boolean {
  const nickname = creature.nickname?.trim().toLowerCase();
  return (
    nickname !== undefined &&
    nickname !== '' &&
    nickname !== speciesName(creature.species).toLowerCase()
  );
}

/**
 * The creature's tags under its name, in words, in one order on the card and on the page: the species of a
 * nickname, the element (with its icon), the role, then Festival, Shiny, First on server and what it is doing
 * now (Away, On a job, Lounging). Away and On a job open their glossary entry on both. The other tags are
 * plain on the card (the whole card opens the page) and, with `help` (the page), open their own entry.
 */
export function NameTags({
  creature,
  state,
  help = false,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId' | 'serverFirsts'>;
  /** The page: element, role, Festival, Shiny and First on server explain themselves when tapped. */
  help?: boolean;
}) {
  const species = getSpecies(creature.species);
  const tags: ComponentChildren[] = [];
  if (showsSpecies(creature)) {
    tags.push(<Tag key="species">{speciesName(creature.species)}</Tag>);
  }
  if (species !== undefined && help) {
    tags.push(<ElementChip key="element" element={species.element} role={species.role} />);
  } else if (species !== undefined) {
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
      <Tag key="festival" kind="badge" tone="festival" {...(help ? { entry: 'festival' } : {})}>
        Festival
      </Tag>,
    );
  }
  if (creature.shiny) {
    tags.push(
      <Tag key="shiny" kind="badge" tone="shiny" {...(help ? { entry: 'shiny' } : {})}>
        Shiny
      </Tag>,
    );
  }
  if (isFirstOnServer(creature, state.serverFirsts)) {
    tags.push(
      <Tag key="first" kind="badge" tone="first" {...(help ? { entry: 'first-on-server' } : {})}>
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
 * The top of a creature, one look on the card and on its page (so a player who taps a card lands on a page
 * that starts the same way): the portrait at the top left and, beside it, the name on one line with the
 * creature's tags in words under it. The level is on the experience bar under this block, not here.
 *
 * On the card (`onOpen` given) the name is a button that opens the page, for the keyboard and screen readers;
 * an over-long name ends in "…". On the page (no `onOpen`) the name is the page's heading, plain text that may
 * wrap to two lines, and the tags explain themselves when tapped. Both name the rarity: the card in the
 * button's label, the page in a hidden word.
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
  /** The card's: opens the page. Leave out on the page itself. */
  onOpen?: (() => void) | undefined;
}) {
  const species = getSpecies(creature.species);
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  // A shiny without its own palette gets a sparkle frame instead.
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  const name = creatureName(creature);
  const nameClass =
    species === undefined ? 'cc-name' : `cc-name rarity-name rarity-${species.rarity}`;
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
        {onOpen === undefined ? (
          <h2 id={nameId} class={`${nameClass} cc-name-page`}>
            <span class="cc-name-text">{name}</span>
            {species !== undefined && <span class="visually-hidden">, {species.rarity}</span>}
          </h2>
        ) : (
          <h3 id={nameId} class={nameClass}>
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
        )}
        <NameTags creature={creature} state={state} help={onOpen === undefined} />
      </div>
    </div>
  );
}
