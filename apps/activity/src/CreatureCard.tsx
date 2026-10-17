import { GEAR_SLOTS, RULES } from '@creatures/game';
import type { Creature, GameState } from './api';
import {
  cardDomId,
  clickedButton,
  lockedText,
  nextParts,
  talentKit,
  type PageFocus,
} from './creature-card-view';
import { creatureNeeds, type Need } from './creature-needs';
import type { CardActions } from './CreaturePage';
import { CreatureHead } from './CreatureHead';
import { creatureName } from './game';
import type { GearState } from './gear-types';
import { gearName, itemLabel, slotName } from './gear-view';
import { ItemFrame, ItemSprite } from './GearArt';

/**
 * One creature, small: sprite, name, element, level, the XP bar with what comes next, the three gear
 * slots as icons, the talents as chips and, only when something is ready, one gold button (the ribbon,
 * the evolution, a waiting catch to answer or a talent slot to fill). Tapping anywhere else on the card
 * opens the creature's page (`CreaturePage`): the card handles the click, and the name is a real button for
 * the keyboard and screen readers. The gear icons and the talent chips open the page on
 * their part. About 250 px tall on a phone. The server decides what is ready; the card only shows it.
 */
export function CreatureCard({
  creature,
  state,
  gear,
  busy,
  found,
  actions,
  onAnswerCatch,
  onOpen,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  /** The finder chose this card: it is marked until the player does something else. */
  found: boolean;
  actions: Pick<CardActions, 'onRibbon' | 'onEvolve'>;
  /** Takes the player to the waiting catches at the top of the tab. */
  onAnswerCatch: () => void;
  /** Opens this creature's page, on a part of it or (null) at the top. */
  onOpen: (focus: PageFocus) => void;
}) {
  const domId = cardDomId(creature.id);
  const nameId = `${domId}-name`;
  const needs = creatureNeeds(creature, state);
  const first = needs[0];
  const kit = talentKit(creature);
  const opens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;

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
        onOpen({ part: 'talents' });
        return;
    }
  }

  const classes = ['card-item', 'creature-card', 'focused'];
  if (found) classes.push('found');
  return (
    <li
      id={domId}
      class={classes.join(' ')}
      tabIndex={-1}
      aria-label={creatureName(creature)}
      onClick={(event) => {
        // Anywhere on the card opens the page; the card's own buttons (and the name button, which
        // opens it itself) are left to do their own thing.
        if (!clickedButton(event.target, event.currentTarget)) onOpen(null);
      }}
    >
      <CreatureHead
        creature={creature}
        state={state}
        heading="h3"
        nameId={nameId}
        onOpen={() => {
          onOpen(null);
        }}
      />
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
              {needs.length > 1 ? ` · ${String(needs.length - 1)} more` : ''}
            </small>
          </button>
        </div>
      )}
    </li>
  );
}
