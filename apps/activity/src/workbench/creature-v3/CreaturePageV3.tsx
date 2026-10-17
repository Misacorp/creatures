import { useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from '../../api';
import { cardDomId, explorerFacts, ribbonsHeldText } from '../../creature-card-view';
import { creatureNeeds } from '../../creature-needs';
import { RenameForm, type CardActions } from '../../CreaturePage';
import { RibbonLine } from '../../CreatureProgress';
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
} from '../../game';
import { gearShare } from '../../gear-view';
import type { GearItem, GearSlot, GearState } from '../../gear-types';
import { GlossaryTag } from '../../Glossary';
import { abilityDef } from '../../live';
import { ElementChip } from '../../sprites/ElementChip';
import { Accordion } from '../../ui/Accordion';
import { Tag } from '../../ui/Tag';
import { HeaderV3 } from './HeaderV3';
import { ItemPickerDrawer, type PickerView } from './ItemPicker';
import { GearSlots, TalentSlots } from './PageSlots';
import { TalentBookDrawer } from './TalentBookDrawer';
import type { ItemFilters } from './picker-view';

/** What the v3 page's buttons do (the live page's actions, without "Equip best", which has no button here). */
export type PageV3Actions = Pick<
  CardActions,
  'onEquip' | 'onRibbon' | 'onEvolve' | 'onRename' | 'onLounge' | 'onSlotTalent'
>;

/** Which drawer is up at first (the workbench opens it so a screenshot can show it). */
export type PageV3Open = { kind: 'gear'; slot: GearSlot } | { kind: 'talent'; slot: number } | null;

/** One stat with the gear's own share next to it ("ATK 79 +12"), as on the live page. */
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
 * The creature page, version 3 (a design round, shown in the workbench only; the live page is
 * `CreaturePage`). What changed from the live page:
 *
 * - The head is one row (name, element icon, level, centred together) and has no "Next: ..." line.
 * - Nothing looks forward. Locked things say their level only inside their own locked slot; the evolve
 *   button, the ribbon button and the waiting-catch button are gold and appear when ready.
 * - Gear is three slots side by side, talents are two or three slots in the same Slot component; a tap
 *   opens a bottom Drawer (the item picker, or the Talent Book) instead of a picker under the row or an
 *   accordion. The "Equip best" button is gone (the server route stays).
 *
 * The stats, the unlocked finale ability, About, Lounge and Rename are the live page's own.
 */
export function CreaturePageV3({
  creature,
  state,
  gear,
  busy,
  actions,
  picker,
  find,
  initialFilters,
  initialQuery,
  initialOpen = null,
  onBack,
  onAnswerCatch,
}: {
  creature: Creature;
  state: GameState;
  /** The gear view: the bag for the picker and the levels the slots open at. */
  gear: GearState | null;
  busy: boolean;
  actions: PageV3Actions;
  /** The picker's body: a list of rows (P-A) or an icon grid with a detail panel (P-B). */
  picker: PickerView;
  /** Add find and filter to the picker (P-C). */
  find: boolean;
  initialFilters?: ItemFilters;
  initialQuery?: string;
  initialOpen?: PageV3Open;
  onBack: () => void;
  onAnswerCatch: () => void;
}) {
  const id = `${cardDomId(creature.id)}-page`;
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
  const [gearOpen, setGearOpen] = useState<GearSlot | null>(
    initialOpen?.kind === 'gear' ? initialOpen.slot : null,
  );
  const [talentOpen, setTalentOpen] = useState<number | null>(
    initialOpen?.kind === 'talent' ? initialOpen.slot : null,
  );
  // The slot that was tapped gets the focus back when its drawer closes.
  const opener = useRef<HTMLElement | null>(null);

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await actions.onEquip(gearId, creatureId)) setGearOpen(null);
  }

  const readyEvolve = evolve !== null && evolve.available ? evolve : null;
  const hasActions = creature.ribbon !== null || readyEvolve !== null || waitingCatch !== undefined;
  const ability = abilityText !== null && abilityText.unlocked && abilityInfo !== undefined;

  return (
    <section
      id={id}
      class="creature-page cp-v3"
      tabIndex={-1}
      aria-labelledby={`${id}-name`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
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
        <HeaderV3 creature={creature} state={state} nameId={`${id}-name`} />
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
        {hasActions && (
          <div class="cp-actions">
            <RibbonLine creature={creature} busy={busy} onRibbon={actions.onRibbon} />
            {readyEvolve !== null && (
              <p>
                <button
                  type="button"
                  class="primary"
                  disabled={busy}
                  onClick={() => {
                    actions.onEvolve(creature);
                  }}
                >
                  {readyEvolve.label}
                </button>
              </p>
            )}
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
        <h3 id={`${id}-talents`} class="cp-title">
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

      {ability && (
        <div class="cp-block creature-ability">
          <h3 class="cp-title">Finale ability</h3>
          <p>
            <GlossaryTag ability={abilityInfo.id}>{abilityInfo.name}</GlossaryTag>:{' '}
            {abilityInfo.description}
          </p>
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

      {gearOpen !== null && gear !== null && (
        <ItemPickerDrawer
          key={gearOpen}
          open
          onClose={() => {
            setGearOpen(null);
          }}
          slot={gearOpen}
          creature={creature}
          creatures={state.creatures}
          items={gear.items}
          view={picker}
          find={find}
          {...(initialFilters === undefined ? {} : { initialFilters })}
          {...(initialQuery === undefined ? {} : { initialQuery })}
          busy={busy}
          onEquip={(item: GearItem) => {
            void equip(item.id, creature.id);
          }}
          onTakeOff={(item: GearItem) => {
            void equip(item.id, null);
          }}
          returnFocusTo={opener.current}
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
          returnFocusTo={opener.current}
        />
      )}
    </section>
  );
}
