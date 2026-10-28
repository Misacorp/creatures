import { GEAR_SLOTS, RULES } from '@creatures/game';
import type { Creature, GameState } from './api';
import {
  canLounge,
  cardDomId,
  clickedButton,
  lockedText,
  talentKit,
  xpWords,
  type PageFocus,
} from './creature-card-view';
import { creatureNeeds, type Need } from './creature-needs';
import type { CardActions } from './CreaturePage';
import { CreatureHead } from './CreatureHead';
import { CardMedals, CardRibbons } from './CreatureHonours';
import { experienceLabel } from './CreatureProgress';
import { creatureName } from './game';
import type { MedalCounts } from './games-types';
import type { GearState } from './gear-types';
import { gearName, itemLabel, slotName } from './gear-view';
import { ItemThumb } from './GearArt';
import { ActionButton } from './ui/ActionButton';
import { ArmchairIcon } from './ui/ArmchairIcon';
import { XpTrack, type XpSize } from './ui/XpTrack';

/**
 * One creature, small (Misa's variant E, decisions.md 2026-10-19): the sprite at the top left with the name
 * on one line beside it and the creature's tags in words under the name; then the slim experience bar across
 * the card (the level tag at its left, the numbers inside); then the three gear slots as icons on the left
 * and the talents on the right, one to a row; and, only when something is ready, one gold button (the
 * ribbon, the evolution, a waiting catch to answer or a talent slot to fill). Tapping anywhere else on the
 * card opens the creature's page (`CreaturePage`): the card handles the click, and the name is a real button
 * for the keyboard and screen readers. The gear icons and the talents open the page on their part. The
 * server decides what is ready; the card only shows it.
 */
export function CreatureCard({
  creature,
  state,
  gear,
  busy,
  found,
  current = false,
  actions,
  onAnswerCatch,
  onOpen,
  xpSize,
  honours,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  /** The finder chose this card: it is marked until the player does something else. */
  found: boolean;
  /** The creature whose page was open last: marked so the player sees where they were. */
  current?: boolean;
  actions: Pick<CardActions, 'onRibbon' | 'onEvolve' | 'onLounge'>;
  /** Takes the player to the waiting catches at the top of the tab. */
  onAnswerCatch: () => void;
  /** Opens this creature's page, on a part of it or (null) at the top. */
  onOpen: (focus: PageFocus) => void;
  /** A look of the experience bar to compare (the workbench); the game uses the default. */
  xpSize?: XpSize | undefined;
  /**
   * The workbench's variation of the ribbons (strips behind the card) and the Valley Games medals (small, top
   * right): left out, the card shows neither (the list does not have the medals yet).
   */
  honours?: { medals: MedalCounts } | undefined;
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

  const xpTrack = (
    <XpTrack
      level={creature.level}
      value={creature.exp}
      max={creature.expNeeded ?? 1}
      top={creature.expNeeded === null}
      label={experienceLabel(creature)}
      text={xpWords(creature)}
      levelEntry="level"
      size={xpSize}
    />
  );

  const classes = ['card-item', 'creature-card', 'focused', 'pix-panel'];
  if (found) classes.push('found');
  if (current) classes.push('current');
  if (honours !== undefined && creature.ribbons > 0) classes.push('has-ribbons');
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
      {honours !== undefined && <CardRibbons creature={creature} />}
      <CreatureHead
        creature={creature}
        state={state}
        nameId={nameId}
        onOpen={() => {
          onOpen(null);
        }}
        corner={
          <>
            {honours !== undefined && <CardMedals medals={honours.medals} />}
            {canLounge(creature, state) && (
              <button
                type="button"
                class="cc-lounge"
                disabled={busy}
                aria-label={`Lounge ${creatureName(creature)}`}
                title="Lounge"
                onClick={() => {
                  actions.onLounge(creature);
                }}
              >
                <ArmchairIcon />
              </button>
            )}
          </>
        }
      />
      {xpTrack}
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
          <ActionButton
            wide
            label={first.label}
            detail={[first.detail, needs.length > 1 ? `${String(needs.length - 1)} more` : '']
              .filter((part) => part !== '')
              .join(' · ')}
            disabled={busy || first.blocked !== undefined}
            onClick={() => {
              act(first);
            }}
          />
        </div>
      )}
    </li>
  );
}
