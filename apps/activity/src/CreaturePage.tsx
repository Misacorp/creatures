import { RULES } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { cardDomId, explorerFacts, ribbonsHeldText, type PageFocus } from './creature-card-view';
import { creatureNeeds } from './creature-needs';
import { ItemPickerDrawer } from './creature-page/ItemPicker';
import { PageHeader } from './creature-page/PageHeader';
import { GearSlots, TalentSlots } from './creature-page/PageSlots';
import { TalentBookDrawer } from './creature-page/TalentBookDrawer';
import type { GearItem, GearSlot, GearState } from './gear-types';
import { gearShare } from './gear-view';
import { RibbonLine } from './CreatureProgress';
import { scrollAndFocus, scrollToTop } from './scroll-to';
import { creatureAbilityText, fusionStars, personalityLine, speciesAbout } from './game';
import { GlossaryTag } from './Glossary';
import { abilityDef } from './live';
import { Accordion } from './ui/Accordion';
import { ActionButton } from './ui/ActionButton';
import { ArmchairIcon } from './ui/ArmchairIcon';
import { handleFlipKey } from './ui/flip-keys';
import type { FlipProps } from './ui/flip-logic';
import { FlipArea, FlipNav } from './ui/Flipper';

/** What a creature's buttons do; the screen that owns the cards supplies it (one action at a time). */
export interface CardActions {
  /** Wears an item or (null) takes it off; resolves true when the server accepted it. */
  onEquip: (gearId: string, creatureId: string | null) => Promise<boolean>;
  /** Earns the ribbon the creature waits for (materials only). */
  onRibbon: (creature: Creature) => void;
  /**
   * Evolves the creature. `species` is the form chosen on the evolve screen; none means the line has one form
   * and the screen is skipped (the screen that owns the cards decides which).
   */
  onEvolve: (creature: Creature, species?: string) => void;
  onRename: (creature: Creature, nickname: string | null) => void;
  /** Makes this creature the one that lounges in the living room. */
  onLounge: (creature: Creature) => void;
  /** Puts a talent from a creature's Talent Book into a slot (for Bait). */
  onSlotTalent: (creature: Creature, talentId: string, golden: boolean, slot: number) => void;
}

export function RenameForm({
  creature,
  busy,
  onRename,
}: {
  creature: Creature;
  busy: boolean;
  onRename: CardActions['onRename'];
}) {
  const [draft, setDraft] = useState(creature.nickname ?? '');
  const inputId = `nickname-${creature.id}`;
  return (
    <Accordion title="Rename" class="rename" keepMounted>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Empty means "clear the nickname"; the server does the real cleaning and validation.
          onRename(creature, draft.trim() === '' ? null : draft);
        }}
      >
        <label for={inputId}>Nickname</label>
        <input
          id={inputId}
          type="text"
          value={draft}
          maxLength={40}
          autoComplete="off"
          onInput={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <button type="submit" disabled={busy}>
          Save
        </button>
      </form>
    </Accordion>
  );
}

/** One stat with gear folded in, and the gear's own share next to it in the gear colour ("ATK 79 +12"). */
function StatRow({
  label,
  stat,
  creature,
}: {
  label: string;
  stat: 'hp' | 'atk' | 'spd';
  creature: Creature;
}) {
  const share = gearShare(creature).find((s) => s.stat === stat)?.amount ?? 0;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {creature.statsWithGear[stat]}
        {share > 0 && (
          <>
            {' '}
            <span class="gear-share" aria-label={`plus ${String(share)} from gear`}>
              +{share}
            </span>
          </>
        )}
      </dd>
    </>
  );
}

/** Which drawer is up: an item picker for a gear slot, the Talent Book for a talent slot, or none. */
export type PageOpen = { kind: 'gear'; slot: GearSlot } | { kind: 'talent'; slot: number } | null;

/**
 * The drawer a page opens with. A gear icon of the card opens that slot's picker (when the slot is open;
 * a locked one has nothing to pick); everything else opens none.
 */
export function startingDrawer(
  focus: PageFocus,
  creature: Pick<Creature, 'level'>,
  slotOpens: Readonly<Record<GearSlot, number>>,
): PageOpen {
  if (focus?.part !== 'gear') return null;
  return creature.level >= slotOpens[focus.slot] ? { kind: 'gear', slot: focus.slot } : null;
}

/**
 * A creature's page: everything about it in one place that takes the list's spot on the Creatures tab.
 * Back (top left, or Escape) returns to the list; Lounge sits at the top right of the same row. Top to
 * bottom: who it is (one row of name, element and level; the name in its rarity colour;
 * the experience bar; tags) with the buttons for what is ready (the ribbon once the creature waits for
 * one, evolution, a waiting catch), stats with the gear's share, the finale ability (once unlocked), gear
 * and talents as slots (a tap opens a bottom drawer: the item picker, or the Talent Book), About and
 * Rename. Nothing on it looks forward: a locked slot says its own level, nothing else does. It opens at
 * the top, or on the picker or the talents when the card's icon or chips were tapped.
 */
export function CreaturePage({
  creature,
  state,
  gear,
  busy,
  actions,
  focus,
  initialOpen,
  onBack,
  onAnswerCatch,
  flip,
}: {
  creature: Creature;
  state: GameState;
  /** The gear view; null until it has loaded (the picker then says "Loading..."). */
  gear: GearState | null;
  busy: boolean;
  actions: CardActions;
  /** Where to land when the page opens. */
  focus: PageFocus;
  /** The drawer that is up when the page opens (the workbench shows one; the game derives it from `focus`). */
  initialOpen?: PageOpen;
  /** Back to the list. */
  onBack: () => void;
  /** Back to the list, at the waiting catches at the top. */
  onAnswerCatch: () => void;
  /**
   * Flip between the creatures of the list the player came from: the arrows with the position at the top,
   * a swipe on the page, Left and Right. Without it (one creature, the workbench) the page does not flip.
   * The owner draws the next creature's page anew, so scroll, drawers and expansions start clean.
   */
  flip?: FlipProps | undefined;
}) {
  const id = `${cardDomId(creature.id)}-page`;
  const rootRef = useRef<HTMLElement>(null);
  const about = speciesAbout(creature.species);
  const personality = personalityLine(creature.quirk);
  const abilityText = creatureAbilityText(creature, abilityDef);
  const abilityInfo = creature.ability === null ? undefined : abilityDef(creature.ability.id);
  const showAbility = abilityText !== null && abilityText.unlocked && abilityInfo !== undefined;
  // The same needs, in the same words, as the card's gold button (the server decides what is ready).
  const needs = creatureNeeds(creature, state);
  const evolveNeed = needs.find((n) => n.kind === 'evolve');
  const waitingCatch = needs.find((n) => n.kind === 'duplicate');
  // The server sends a ribbon only for a creature that stands at the level that asks for one.
  const hasActions =
    creature.ribbon !== null || evolveNeed !== undefined || waitingCatch !== undefined;
  const slotOpens = gear?.slotOpens ?? RULES.gear.slotUnlockLevel;

  const start = initialOpen ?? startingDrawer(focus, creature, slotOpens);
  const [gearOpen, setGearOpen] = useState<GearSlot | null>(
    start?.kind === 'gear' ? start.slot : null,
  );
  const [talentOpen, setTalentOpen] = useState<number | null>(
    start?.kind === 'talent' ? start.slot : null,
  );
  // The slot that was tapped gets the focus back when its drawer closes.
  const opener = useRef<HTMLElement | null>(null);

  // Opening: the top of the page (focus on the page itself, so a screen reader starts at the name), or
  // on the talents. A jump, not a glide: the list that was here is gone. A drawer that opens with the
  // page takes the focus itself.
  useEffect(() => {
    if (focus?.part === 'talents') {
      scrollAndFocus(document.getElementById(`${id}-talents`), 'auto');
    } else {
      scrollToTop();
      // After a flip with a button, that button (drawn anew with the page) keeps the focus instead.
      if (start === null && (flip?.focusButton ?? null) === null) {
        rootRef.current?.focus({ preventScroll: true });
      }
    }
  }, [id, focus]);

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await actions.onEquip(gearId, creatureId)) setGearOpen(null);
  }

  return (
    <section
      id={id}
      ref={rootRef}
      class="creature-page"
      tabIndex={-1}
      aria-labelledby={`${id}-name`}
      onKeyDown={(event) => {
        // Left and Right flip to the previous and next creature (a drawer keeps them for itself).
        if (handleFlipKey(event, flip)) return;
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        // A text field (Rename) keeps Escape for itself; a drawer stops it before it gets here.
        const target = event.target;
        if (target !== null && 'localName' in target && target.localName === 'input') return;
        onBack();
      }}
    >
      <div class="cp-top">
        <button type="button" class="ghost cp-back" onClick={onBack}>
          <span aria-hidden="true">‹</span> Creatures
        </button>
        {flip !== undefined && <FlipNav flip={flip} />}
        {creature.busy === null && creature.id !== state.loungerId && (
          <button
            type="button"
            class="lounge-button"
            disabled={busy}
            onClick={() => {
              actions.onLounge(creature);
            }}
          >
            <ArmchairIcon /> Lounge
          </button>
        )}
      </div>

      <FlipArea flip={flip}>
        <div class="cp-block">
          <PageHeader creature={creature} state={state} nameId={`${id}-name`} />
          {hasActions && (
            <div class="cp-actions">
              <RibbonLine creature={creature} busy={busy} onRibbon={actions.onRibbon} large />
              {evolveNeed !== undefined && (
                <ActionButton
                  wide
                  large
                  label={evolveNeed.label}
                  detail={evolveNeed.detail}
                  disabled={busy || evolveNeed.blocked !== undefined}
                  onClick={() => {
                    actions.onEvolve(creature);
                  }}
                />
              )}
              {waitingCatch !== undefined && (
                <ActionButton
                  wide
                  large
                  label={waitingCatch.label}
                  detail={waitingCatch.detail}
                  disabled={busy}
                  onClick={onAnswerCatch}
                />
              )}
            </div>
          )}
        </div>

        <div class="cp-block">
          <h3 class="cp-title">Stats</h3>
          <dl class="sheet-stats">
            <StatRow label="HP" stat="hp" creature={creature} />
            <StatRow label="Attack" stat="atk" creature={creature} />
            <StatRow label="Speed" stat="spd" creature={creature} />
          </dl>
        </div>

        {showAbility && (
          <div class="cp-block creature-ability">
            <h3 class="cp-title">Finale ability</h3>
            <p>
              <GlossaryTag ability={abilityInfo.id}>{abilityInfo.name}</GlossaryTag>:{' '}
              {abilityInfo.description}
            </p>
          </div>
        )}

        <div class="cp-block">
          <h3 id={`${id}-gear`} class="cp-title">
            <GlossaryTag entry="gear" look="text">
              Gear
            </GlossaryTag>
          </h3>
          <GearSlots
            creature={creature}
            gear={gear}
            openSlot={gearOpen}
            onOpen={(slot, button) => {
              opener.current = button;
              setGearOpen(slot);
            }}
          />
        </div>

        <div class="cp-block">
          <h3 id={`${id}-talents`} class="cp-title" tabIndex={-1}>
            <GlossaryTag entry="talent" look="text">
              Talents
            </GlossaryTag>
          </h3>
          <TalentSlots
            creature={creature}
            openSlot={talentOpen}
            onOpen={(slot, button) => {
              opener.current = button;
              setTalentOpen(slot);
            }}
          />
        </div>

        <Accordion title="About" headingLevel={3} defaultOpen class="cp-block">
          {about !== null && (
            <>
              <p>{about.description}</p>
              <ul class="tags traits" aria-label="Traits">
                {about.traits.map((trait) => (
                  <li class="tag" key={trait}>
                    {trait}
                  </li>
                ))}
              </ul>
            </>
          )}
          {personality !== null && <p class="muted">{personality}</p>}
          <dl class="sheet-facts">
            <div class="sheet-fact">
              <dt>
                <GlossaryTag entry="fusion">Fusion</GlossaryTag>
              </dt>
              <dd>
                <span class="stars" aria-hidden="true">
                  {fusionStars(creature.fusionCount)}
                </span>{' '}
                {creature.fusionCount} / 5
              </dd>
            </div>
            <div class="sheet-fact">
              <dt>
                <GlossaryTag entry="ribbon">Ribbons</GlossaryTag>
              </dt>
              <dd>{ribbonsHeldText(creature.ribbons)}</dd>
            </div>
            {explorerFacts(creature.explorer).map((fact) => (
              <div class="sheet-fact" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </Accordion>

        <RenameForm creature={creature} busy={busy} onRename={actions.onRename} />
      </FlipArea>

      {gearOpen !== null && (
        <ItemPickerDrawer
          key={gearOpen}
          open
          onClose={() => {
            setGearOpen(null);
          }}
          slot={gearOpen}
          creature={creature}
          creatures={state.creatures}
          items={gear === null ? null : gear.items}
          busy={busy}
          onEquip={(item: GearItem) => {
            void equip(item.id, creature.id);
          }}
          onTakeOff={(item: GearItem) => {
            void equip(item.id, null);
          }}
          returnFocusTo={opener.current ?? rootRef.current}
        />
      )}
      {talentOpen !== null && (
        <TalentBookDrawer
          key={talentOpen}
          open
          onClose={() => {
            setTalentOpen(null);
          }}
          creature={creature}
          slot={talentOpen}
          bookSlotBait={state.bookSlotBait}
          bait={state.balances.bait}
          busy={busy}
          onSlot={(c, talentId, golden, slot) => {
            actions.onSlotTalent(c, talentId, golden, slot);
            setTalentOpen(null);
          }}
          returnFocusTo={opener.current ?? rootRef.current}
        />
      )}
    </section>
  );
}
