import { GEAR_SLOTS, RULES } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { shinyPalette } from './art';
import {
  activityBadges,
  cardDomId,
  lockedText,
  nextParts,
  speciesSubtitle,
  talentKit,
  xpWords,
} from './creature-card-view';
import { creatureNeeds, type Need } from './creature-needs';
import { CreatureSheet, type CardActions } from './CreatureSheet';
import { experienceLabel } from './CreatureProgress';
import { creatureName, elementName, getSpecies } from './game';
import type { GearSlot, GearState } from './gear-types';
import { gearName, itemLabel, slotName } from './gear-view';
import { ItemFrame, ItemSprite } from './GearArt';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { scrollAndFocus } from './scroll-to';
import { GameIcon } from './ui/GameIcon';
import { Tag } from './ui/Tag';
import { XpBar } from './XpBar';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/**
 * One creature, small: sprite, name, element, level, the XP bar with what comes next, the three gear
 * slots as icons, the talents as chips and, only when something is ready, one gold button (the ribbon,
 * the evolution, a waiting catch to answer or a talent slot to fill). Everything else is one tap away
 * under "More" (`CreatureSheet`). Gear icons and the talent chips open that sheet on their part. About
 * 250 px tall on a phone. The server decides what is ready; the card only shows it.
 */
export function CreatureCard({
  creature,
  state,
  gear,
  busy,
  found,
  actions,
  onAnswerCatch,
  initiallyOpen = false,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  /** The finder chose this card: it is marked until the player does something else. */
  found: boolean;
  actions: CardActions;
  /** Takes the player to the waiting catches at the top of the tab. */
  onAnswerCatch: () => void;
  /** Starts with the "More" sheet open (the workbench and the tests). */
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [gearSlot, setGearSlot] = useState<GearSlot | null>(null);
  const [gearKey, setGearKey] = useState(0);
  // Where the sheet should scroll to once it is drawn (a gear icon or the talent chips).
  const [target, setTarget] = useState<{ part: 'gear' | 'talents'; n: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const domId = cardDomId(creature.id);
  const sheetId = `${domId}-sheet`;
  const nameId = `${domId}-name`;

  useEffect(() => {
    if (target === null) return;
    scrollAndFocus(document.getElementById(`${sheetId}-${target.part}`));
  }, [target, sheetId]);

  const needs = creatureNeeds(creature, state);
  const first = needs[0];
  const kit = talentKit(creature);
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;
  const species = getSpecies(creature.species);
  const subtitle = speciesSubtitle(creature);
  const badges = activityBadges(creature, state);
  const shinyColours = creature.shiny ? shinyPalette(creature.species) : undefined;
  // A shiny without its own palette gets a sparkle frame instead.
  const sparkleFrame = creature.shiny && shinyColours === undefined;
  const sparkle = glyphOrUnknown('sparkle');

  function openGear(slot: GearSlot): void {
    setGearSlot(slot);
    setGearKey((k) => k + 1);
    setOpen(true);
    setTarget((t) => ({ part: 'gear', n: (t?.n ?? 0) + 1 }));
  }

  function act(need: Need): void {
    switch (need.kind) {
      case 'ribbon':
        actions.onRibbon(creature);
        return;
      case 'evolve':
        actions.onEvolve(creature);
        return;
      case 'duplicate':
        onAnswerCatch();
        return;
      case 'talent':
        setOpen(true);
        setTarget((t) => ({ part: 'talents', n: (t?.n ?? 0) + 1 }));
        return;
    }
  }

  const classes = ['card-item', 'creature-card', 'focused'];
  if (open) classes.push('open');
  if (found) classes.push('found');
  return (
    <li id={domId} class={classes.join(' ')} tabIndex={-1} aria-labelledby={nameId}>
      <div class="cc-head">
        <div class={sparkleFrame ? 'portrait sparkle-frame' : 'portrait'}>
          <Sprite
            sprite={creatureSpriteOrFallback(creature.species)}
            scale={4}
            bob
            alt={`${creatureName(creature)}${creature.shiny ? ' (shiny)' : ''}`}
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
            <h3 id={nameId}>{creatureName(creature)}</h3>
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
      </div>
      <p class="cc-next">
        {nextParts(creature).map((part) =>
          part.strong ? <b key={part.text}>{part.text}</b> : part.text,
        )}
      </p>
      <div class="cc-kit">
        <ul class="cc-gear" aria-label="Gear">
          {GEAR_SLOTS.map((slot) => {
            const worn = creature.gear.find((g) => g.slot === slot);
            const locked = creature.level < opens[slot];
            const label = locked
              ? `${slotName(slot)}: opens at creature level ${String(opens[slot])}`
              : worn === undefined
                ? `${slotName(slot)}: empty. Open gear to equip an item.`
                : `${slotName(slot)}: ${itemLabel(worn.baseId, worn.itemLevel)}. Open gear to change it.`;
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
                    openGear(slot);
                  }}
                >
                  {worn !== undefined ? (
                    <ItemFrame rarity={worn.rarity} baseId={worn.baseId}>
                      <ItemSprite baseId={worn.baseId} scale={2} />
                    </ItemFrame>
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
            setOpen(true);
            setTarget((t) => ({ part: 'talents', n: (t?.n ?? 0) + 1 }));
          }}
        >
          {kit.chips.map((chip) => (
            <span
              key={chip.key}
              class={`cc-chip${chip.golden ? ' golden' : ''}${chip.kind === 'empty' ? ' empty' : ''}`}
              aria-hidden="true"
            >
              <span class="pix">{chip.name}</span>
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
          <button
            type="button"
            class="primary wide"
            disabled={busy}
            onClick={() => {
              act(first);
            }}
          >
            {first.label}
            <small>
              {first.detail}
              {needs.length > 1 ? ` · ${String(needs.length - 1)} more in More` : ''}
            </small>
          </button>
        </div>
      )}
      <div class="cc-bot">
        <button
          type="button"
          class="ghost more-button"
          ref={moreRef}
          aria-label={`${open ? 'Less' : 'More'} about ${creatureName(creature)}`}
          aria-expanded={open}
          {...(open ? { 'aria-controls': sheetId } : {})}
          onClick={() => {
            setOpen(!open);
            setTarget(null);
          }}
        >
          {open ? 'Less' : 'More'}
        </button>
      </div>
      {open && (
        <CreatureSheet
          id={sheetId}
          creature={creature}
          state={state}
          gear={gear}
          busy={busy}
          gearSlot={gearSlot}
          gearKey={gearKey}
          actions={actions}
          onClose={() => {
            setOpen(false);
            setTarget(null);
            // The sheet that had the focus is gone: hand it back to the button that opened it.
            moreRef.current?.focus();
          }}
        />
      )}
    </li>
  );
}
