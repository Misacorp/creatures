import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { CardGear } from './CardGear';
import {
  cardDomId,
  explorerFacts,
  nextParts,
  ribbonsHeldText,
  type PageFocus,
} from './creature-card-view';
import { creatureNeeds } from './creature-needs';
import { CreatureHead } from './CreatureHead';
import { CreatureTalents } from './CreatureTalents';
import type { EquipBestResult, GearState } from './gear-types';
import { gearShare } from './gear-view';
import { RibbonLine } from './CreatureProgress';
import { scrollAndFocus, scrollToTop } from './scroll-to';
import {
  capitalize,
  creatureAbilityText,
  evolutionText,
  fusionStars,
  getSpecies,
  isFestivalSpecies,
  isFirstOnServer,
  personalityLine,
  speciesAbout,
} from './game';
import { GlossaryTag } from './Glossary';
import { abilityDef } from './live';
import { ElementChip } from './sprites/ElementChip';
import { Accordion } from './ui/Accordion';
import { Tag } from './ui/Tag';

/** What a creature's buttons do; the screen that owns the cards supplies it (one action at a time). */
export interface CardActions {
  /** Wears an item or (null) takes it off; resolves true when the server accepted it. */
  onEquip: (gearId: string, creatureId: string | null) => Promise<boolean>;
  /** The server's "Equip best" for one creature; resolves what it changed (undefined when refused). */
  onEquipBest: (creatureId: string) => Promise<EquipBestResult | undefined>;
  /** Earns the ribbon the creature waits for (materials only). */
  onRibbon: (creature: Creature) => void;
  onEvolve: (creature: Creature) => void;
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

/**
 * A creature's page: everything about it in one place that takes the list's spot on the Creatures tab.
 * Back (top left, or Escape) returns to the list. Top to bottom: who it is (the card's head, what
 * comes next) with the buttons for what is ready (ribbon, evolution, a waiting catch), stats with the gear's share, gear
 * (the three slots, the picker, Equip best), talents (slots and the Talent Book with slotting for Bait),
 * the finale ability, About, fusion, ribbons held, explorer rank, Lounge and Rename. It opens at the top,
 * or on the gear or the talents when the card's icon or chips were tapped.
 */
export function CreaturePage({
  creature,
  state,
  gear,
  busy,
  actions,
  focus,
  onBack,
  onAnswerCatch,
}: {
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  actions: CardActions;
  /** Where to land when the page opens. */
  focus: PageFocus;
  /** Back to the list. */
  onBack: () => void;
  /** Back to the list, at the waiting catches at the top. */
  onAnswerCatch: () => void;
}) {
  const id = `${cardDomId(creature.id)}-page`;
  const rootRef = useRef<HTMLElement>(null);
  const species = getSpecies(creature.species);
  const about = speciesAbout(creature.species);
  const personality = personalityLine(creature.quirk);
  const evolve =
    creature.evolution === undefined
      ? null
      : evolutionText(creature.level, creature.evolution, state.balances.essence);
  const abilityText = creatureAbilityText(creature, abilityDef);
  const abilityInfo = creature.ability === null ? undefined : abilityDef(creature.ability.id);
  const waitingCatch = creatureNeeds(creature, state).find((n) => n.kind === 'duplicate');
  const next = nextParts(creature);
  const hasActions = creature.ribbon !== null || evolve !== null || waitingCatch !== undefined;

  // Opening: the top of the page (focus on the page itself, so a screen reader starts at the name), or
  // straight to the gear or the talents. A jump, not a glide: the list that was here is gone.
  useEffect(() => {
    if (focus === null) {
      scrollToTop();
      rootRef.current?.focus({ preventScroll: true });
    } else {
      scrollAndFocus(document.getElementById(`${id}-${focus.part}`), 'auto');
    }
  }, [id, focus]);

  return (
    <section
      id={id}
      ref={rootRef}
      class="creature-page"
      tabIndex={-1}
      aria-labelledby={`${id}-name`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        // A text field (Rename) keeps Escape for itself; the gear picker stops it before it gets here.
        const target = event.target;
        if (target !== null && 'localName' in target && target.localName === 'input') return;
        onBack();
      }}
    >
      <div class="cp-top">
        <button type="button" class="ghost cp-back" onClick={onBack}>
          <span aria-hidden="true">‹</span> Creatures
        </button>
      </div>

      <div class="cp-block">
        <CreatureHead creature={creature} state={state} heading="h2" nameId={`${id}-name`} />
        {next.length > 0 && (
          <p class="cc-next">
            {next.map((part) => (part.strong ? <b key={part.text}>{part.text}</b> : part.text))}
          </p>
        )}
        <p class="tags">
          {species !== undefined && (
            <>
              <ElementChip element={species.element} role={species.role} />
              <Tag entry="rarity">{capitalize(species.rarity)}</Tag>
            </>
          )}
          {isFestivalSpecies(creature.species) && (
            <Tag kind="badge" tone="festival" entry="festival">
              Festival
            </Tag>
          )}
          {creature.shiny && (
            <Tag kind="badge" tone="shiny" entry="shiny">
              Shiny
            </Tag>
          )}
          {isFirstOnServer(creature, state.serverFirsts) && (
            <Tag kind="badge" tone="first" entry="first-on-server">
              First on server
            </Tag>
          )}
        </p>
        {isFestivalSpecies(creature.species) && (
          <p class="muted">Festival prize, not found on expeditions.</p>
        )}
        {hasActions && (
          <div class="cp-actions">
            <RibbonLine creature={creature} busy={busy} onRibbon={actions.onRibbon} />
            {evolve !== null &&
              (evolve.available ? (
                <p>
                  <button
                    type="button"
                    class="primary"
                    disabled={busy}
                    onClick={() => {
                      actions.onEvolve(creature);
                    }}
                  >
                    {evolve.label}
                  </button>
                </p>
              ) : (
                <p class="locked">{evolve.label}</p>
              ))}
            {waitingCatch !== undefined && (
              <p>
                <button type="button" class="primary" disabled={busy} onClick={onAnswerCatch}>
                  {waitingCatch.label}
                </button>
              </p>
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

      <div class="cp-block">
        <h3 id={`${id}-gear`} class="cp-title" tabIndex={-1}>
          Gear
        </h3>
        <CardGear
          creature={creature}
          creatures={state.creatures}
          gear={gear}
          busy={busy}
          onEquip={actions.onEquip}
          onEquipBest={actions.onEquipBest}
          initialOpen={focus?.part === 'gear' ? focus.slot : null}
        />
      </div>

      <div class="cp-block">
        <h3 id={`${id}-talents`} class="cp-title" tabIndex={-1}>
          <GlossaryTag entry="talent" look="text">
            Talents
          </GlossaryTag>
        </h3>
        <CreatureTalents
          creature={creature}
          bookSlotBait={state.bookSlotBait}
          bait={state.balances.bait}
          busy={busy}
          onSlot={actions.onSlotTalent}
          showLabel={false}
        />
      </div>

      {abilityText !== null && (
        <div class="cp-block creature-ability">
          <h3 class="cp-title">Finale ability</h3>
          <p class={abilityText.unlocked ? undefined : 'locked'}>
            {abilityText.unlocked && abilityInfo !== undefined ? (
              <>
                <GlossaryTag ability={abilityInfo.id}>{abilityInfo.name}</GlossaryTag>:{' '}
                {abilityInfo.description}
              </>
            ) : (
              <GlossaryTag entry="creature-ability">{abilityText.line}</GlossaryTag>
            )}
          </p>
          {abilityText.teaser !== null && <p class="muted">{abilityText.teaser}</p>}
        </div>
      )}

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

      <div class="cp-block cp-buttons">
        {creature.busy === null && creature.id !== state.loungerId && (
          <button
            type="button"
            class="lounge-button"
            disabled={busy}
            onClick={() => {
              actions.onLounge(creature);
            }}
          >
            Lounge
          </button>
        )}
      </div>
      <RenameForm creature={creature} busy={busy} onRename={actions.onRename} />
    </section>
  );
}
