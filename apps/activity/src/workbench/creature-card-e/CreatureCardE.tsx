/**
 * DESIGN ROUND, workbench only (2026-10-19): variant E of the creature card, for Misa's approval. The game's
 * card (`CreatureCard.tsx`) is untouched; this draws the same creature from the same helpers in E's layout:
 *
 * - the sprite at the top left; to its right the name on one line and, under it, the creature's tags in
 *   words (the species of a nickname, the element, the role, Festival, Shiny, First on server, Away, On a
 *   job, Lounging); no level tag at the top right and no arrow;
 * - a full-width experience bar in the slim "Count-up" look (variant D of the XP round, at rest): the
 *   level tag at its left, the numbers small inside the bar, wholly on one side of the fill's edge;
 * - the gear slots on the left and the talents on the right;
 * - the gold button when something is ready, as today.
 *
 * Styles: `.cce-*` in `styles/components/creature-card-variants.css`. When the shared slim bar lands in
 * `XpBar`, `StaticBar` here is replaced by it.
 */
import { GEAR_SLOTS, RULES } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import type { Creature, GameState } from '../../api';
import { shinyPalette } from '../../art';
import {
  activityBadges,
  cardDomId,
  clickedButton,
  lockedText,
  portraitAlt,
  talentKit,
  type PageFocus,
} from '../../creature-card-view';
import { creatureNeeds } from '../../creature-needs';
import { experienceLabel } from '../../CreatureProgress';
import { cssVars } from '../../css-vars';
import {
  capitalize,
  creatureName,
  elementName,
  getSpecies,
  isFestivalSpecies,
  isFirstOnServer,
  speciesName,
} from '../../game';
import type { GearState } from '../../gear-types';
import { gearName, itemLabel, slotName } from '../../gear-view';
import { ItemThumb } from '../../GearArt';
import { GlossaryTag } from '../../Glossary';
import { glyphOrUnknown } from '../../glyphs';
import { Sprite } from '../../sprites/Sprite';
import { creatureSpriteOrFallback } from '../../sprites/creature-sprites';
import { elementIcon } from '../../sprites/element-icons';
import { ArmchairIcon } from '../../ui/ArmchairIcon';
import { Tag } from '../../ui/Tag';
import { xpBarView } from '../../xp-bar';

/** A name longer than this many code points steps down from the title size to the heading size, so it stays on one line. */
const LONG_NAME = 20;

/**
 * The slim bar at rest: the level tag, then the bar with its numbers inside. The numbers sit in the larger
 * part (on the fill, in ink, from half full; on the dark trough, in bone, below that), so no number is ever
 * cut by the fill's edge.
 */
function StaticBar({ creature }: { creature: Creature }) {
  const top = creature.expNeeded === null;
  const view = xpBarView(top ? 1 : creature.exp, creature.expNeeded ?? 1);
  const text = top ? 'Top level' : `${String(view.now)} / ${String(view.max)}`;
  const onFill = view.pct >= 50;
  return (
    <div class="cce-xp">
      <GlossaryTag entry="level" look="chip" bare class="cce-lv pix">
        Lv {creature.level}
      </GlossaryTag>
      <div
        class="cce-bar"
        role="progressbar"
        aria-label={experienceLabel(creature)}
        aria-valuemin={0}
        aria-valuemax={view.max}
        aria-valuenow={view.now}
        aria-valuetext={text}
        ref={cssVars({ '--fill': view.pct })}
      >
        <span class="cce-fill" />
        <span class={onFill ? 'cce-num on-fill' : 'cce-num'} aria-hidden="true">
          {text}
        </span>
      </div>
    </div>
  );
}

/** The tags under the name, in words. Plain on the card (the whole card opens the page, which has their help). */
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
    );
    tags.push(
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
      <Tag key={badge.text} kind="badge" tone={badge.tone}>
        {badge.icon === 'armchair' && <ArmchairIcon />}
        {badge.text}
      </Tag>,
    );
  }
  return <p class="cce-tags">{tags}</p>;
}

export function CreatureCardE({
  creature,
  state,
  gear,
  busy,
  onOpen,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  onOpen: (focus: PageFocus) => void;
}) {
  const domId = cardDomId(creature.id);
  const name = creatureName(creature);
  const species = getSpecies(creature.species);
  const needs = creatureNeeds(creature, state);
  const first = needs[0];
  const kit = talentKit(creature);
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');
  const long = [...name].length > LONG_NAME;
  return (
    <li
      id={domId}
      class="card-item creature-card focused cce"
      tabIndex={-1}
      aria-label={name}
      onClick={(event) => {
        if (!clickedButton(event.target, event.currentTarget)) onOpen(null);
      }}
    >
      <div class="cce-head">
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
        <div class="cce-id">
          <h3
            class={[
              'cce-name',
              long ? 'long' : '',
              species === undefined ? '' : `rarity-name rarity-${species.rarity}`,
            ]
              .filter((c) => c !== '')
              .join(' ')}
            title={name}
          >
            <button
              type="button"
              class="cc-open"
              aria-label={`Open ${name}${species === undefined ? '' : `, ${species.rarity}`}`}
              onClick={() => {
                onOpen(null);
              }}
            >
              {name}
            </button>
          </h3>
          <NameTags creature={creature} state={state} />
        </div>
      </div>
      <StaticBar creature={creature} />
      <div class="cce-kit">
        <ul class="cc-gear" aria-label="Gear">
          {GEAR_SLOTS.map((slot) => {
            const worn = creature.gear.find((g) => g.slot === slot);
            const locked = creature.level < opens[slot];
            const label = locked
              ? `${slotName(slot)}: opens at level ${String(opens[slot])}`
              : worn === undefined
                ? `${slotName(slot)}: empty`
                : `${slotName(slot)}: ${itemLabel(worn.baseId, worn.itemLevel)}`;
            return (
              <li key={slot}>
                <button
                  type="button"
                  class={locked ? 'cc-slot locked' : 'cc-slot'}
                  disabled={locked}
                  aria-label={label}
                  title={
                    worn === undefined
                      ? undefined
                      : `${gearName(worn.baseId)}, item level ${String(worn.itemLevel)}`
                  }
                  onClick={() => {
                    onOpen({ part: 'gear', slot });
                  }}
                >
                  {worn !== undefined ? (
                    <ItemThumb item={worn} scale={3} />
                  ) : (
                    <span class="cc-slot-empty pix" aria-hidden="true">
                      {locked ? `Lv ${String(opens[slot])}` : '+'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          class="cc-talents"
          aria-label={kit.label}
          onClick={() => {
            onOpen({ part: 'talents' });
          }}
        >
          {kit.chips.map((chip) => (
            <span
              key={chip.key}
              class={`cc-chip${chip.golden ? ' golden' : ''}${chip.kind === 'empty' ? ' empty' : ''}`}
              aria-hidden="true"
            >
              <span class={chip.golden ? 'pix gold-shimmer' : 'pix'}>{chip.name}</span>
            </span>
          ))}
          {kit.locked.length > 0 && (
            <span class="cc-chip locked-slots pix" aria-hidden="true">
              {lockedText(kit.locked)}
            </span>
          )}
        </button>
      </div>
      {first !== undefined && (
        <div class="cc-do">
          <button type="button" class="primary wide" disabled={busy || first.blocked !== undefined}>
            {first.label}
            <small>
              {first.detail}
              {needs.length > 1 ? ` · ${String(needs.length - 1)} more` : ''}
            </small>
          </button>
        </div>
      )}
    </li>
  );
}
