import { useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { CardGear } from './CardGear';
import { explorerFacts, ribbonsHeldText, speciesSubtitle } from './creature-card-view';
import type { NeedKind } from './creature-needs';
import { CreatureTalents } from './CreatureTalents';
import type { EquipBestResult, GearSlot, GearState } from './gear-types';
import { gearShare } from './gear-view';
import { RibbonLine, experienceLine } from './CreatureProgress';
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
  speciesName,
} from './game';
import { GlossaryTag } from './Glossary';
import { abilityDef } from './live';
import { ElementChip } from './sprites/ElementChip';
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
    <details class="rename">
      <summary>Rename</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // Empty means "clear the nickname"; the server does the real cleaning and validation.
          onRename(creature, draft.trim() === '' ? null : draft);
        }}
      >
        <label for={inputId}>Nickname for {speciesName(creature.species)}</label>
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
          Save nickname
        </button>
      </form>
    </details>
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
 * Everything about a creature that is not on its small card, in one place that opens under the card
 * ("More"): who it is (element, role, rarity, badges), growth (experience line, the ribbon button with its
 * cost and what is missing, evolution), stats with the gear's share, the three gear slots (equip, take
 * off, Equip best, item lines), talents (slots and the Talent Book with slotting for Bait), the finale
 * ability, a short About, fusion, ribbons held, explorer rank, Lounge and Rename. Nothing is hidden by
 * design: it is the whole of what a creature card used to show.
 */
export function CreatureSheet({
  id,
  creature,
  state,
  gear,
  busy,
  gearSlot,
  gearKey,
  actions,
  shownNeed,
  onClose,
}: {
  /** The sheet's id on the page (the card's More button controls it); section ids are built from it. */
  id: string;
  creature: Creature;
  state: GameState;
  gear: GearState | null;
  busy: boolean;
  /** The gear slot whose picker is open at first (the card's gear icon that was tapped). */
  gearSlot: GearSlot | null;
  /** Changes when a gear icon is tapped again, so the picker opens on the new slot. */
  gearKey: number;
  actions: CardActions;
  /** The need the card's gold button shows right above, so this sheet does not repeat that button. */
  shownNeed: NeedKind | null;
  onClose: () => void;
}) {
  const species = getSpecies(creature.species);
  const about = speciesAbout(creature.species);
  const personality = personalityLine(creature.quirk);
  const evolve =
    creature.evolution === undefined
      ? null
      : evolutionText(creature.level, creature.evolution, state.balances.essence);
  const abilityText = creatureAbilityText(creature, abilityDef);
  const abilityInfo = creature.ability === null ? undefined : abilityDef(creature.ability.id);
  const subtitle = speciesSubtitle(creature);
  return (
    <section
      id={id}
      class="creature-sheet"
      aria-label={`More about ${creature.nickname ?? speciesName(creature.species)}`}
    >
      <div class="sheet-block">
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
        {subtitle !== null && <p class="muted">{subtitle}</p>}
        {isFestivalSpecies(creature.species) && (
          <p class="muted">Won in a Festival week. It is not found on expeditions.</p>
        )}
      </div>

      <div class="sheet-block">
        <h4 class="sheet-title">Growth</h4>
        <p class="muted exp-line">
          <GlossaryTag entry="experience">{experienceLine(creature)}</GlossaryTag>
        </p>
        <RibbonLine
          creature={creature}
          busy={busy}
          onRibbon={actions.onRibbon}
          hideButton={shownNeed === 'ribbon'}
        />
        {evolve !== null &&
          (evolve.available && shownNeed === 'evolve' ? (
            <p class="muted">{evolve.label}. Ready, the button is above.</p>
          ) : evolve.available ? (
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
      </div>

      <div class="sheet-block">
        <h4 class="sheet-title">
          Stats <span class="muted gear-note">(gear included)</span>
        </h4>
        <dl class="sheet-stats">
          <StatRow label="HP" stat="hp" creature={creature} />
          <StatRow label="Attack" stat="atk" creature={creature} />
          <StatRow label="Speed" stat="spd" creature={creature} />
        </dl>
      </div>

      <div class="sheet-block">
        <h4 id={`${id}-gear`} class="sheet-title" tabIndex={-1}>
          Gear
        </h4>
        <CardGear
          key={gearKey}
          creature={creature}
          creatures={state.creatures}
          gear={gear}
          busy={busy}
          onEquip={actions.onEquip}
          onEquipBest={actions.onEquipBest}
          initialOpen={gearSlot}
        />
      </div>

      <div class="sheet-block">
        <h4 id={`${id}-talents`} class="sheet-title" tabIndex={-1}>
          <GlossaryTag entry="talent" look="text">
            Talents
          </GlossaryTag>
        </h4>
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
        <div class="sheet-block creature-ability">
          <h4 class="sheet-title">Finale ability</h4>
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

      <div class="sheet-block">
        <h4 class="sheet-title">About</h4>
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
      </div>

      <div class="sheet-block sheet-buttons">
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
        <button type="button" class="ghost" onClick={onClose}>
          Show less
        </button>
      </div>
      <RenameForm creature={creature} busy={busy} onRename={actions.onRename} />
    </section>
  );
}
