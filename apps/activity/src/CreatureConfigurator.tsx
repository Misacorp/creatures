import { useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { CreatureHead } from './CreatureHead';
import { CreatureIcon } from './CreatureIcon';
import { statRows, type CardActions } from './CreaturePage';
import { cardDomId, xpWords } from './creature-card-view';
import { experienceLabel } from './CreatureProgress';
import { ItemPickerDrawer } from './creature-page/ItemPicker';
import { TalentSlots } from './creature-page/PageSlots';
import { GearList } from './GearList';
import { wornItemOf } from './gear-view';
import { TalentBookDrawer } from './creature-page/TalentBookDrawer';
import type { GearItem, GearSlot, GearState } from './gear-types';
import { GlossaryTag } from './Glossary';
import { abilityDef } from './live';
import { DataTable } from './ui/DataTable';
import { XpTrack } from './ui/XpTrack';
import { skillRows } from './creature-page/skill-rows';

/**
 * What the configurator shows, part by part; a part left out is not drawn. The screen that uses it picks
 * the parts its task needs (a dungeon run: experience, stats, gear and talents).
 */
export interface ConfiguratorParts {
  /** The level and the experience bar (the card's row). */
  experience?: boolean;
  /** The explorer rank and its bar. */
  explorer?: boolean;
  /** The Crafting level and its bar (from the gear view's skills; nothing until it has loaded). */
  crafting?: boolean;
  /** The Stats table, gear folded in (the page's). */
  stats?: boolean;
  /** The finale ability, once unlocked (the page's). */
  ability?: boolean;
  /** The gear list (`GearList`); a tap on a slot opens the item picker. */
  gear?: boolean;
  /** The gear list is locked: it shows what is worn, a tap does nothing. */
  gearLocked?: boolean;
  /** The talent slots; a tap opens the Talent Book. */
  talents?: boolean;
}

/** A button under the parts ("Creature page", "Remove from team"). */
export interface ConfiguratorButton {
  label: string;
  onAct: () => void;
  /** It takes something away (Remove from team): the red button. */
  danger?: boolean;
  /** The creature's small picture before the words, so a button far down the card says whose it is. */
  withCreature?: boolean;
}

/** Which drawer is up. */
type Open = { kind: 'gear'; slot: GearSlot } | { kind: 'talent'; slot: number } | null;

/**
 * A creature, small, to see what it is and get it ready for a task: the card's top (portrait, name, the
 * tags in words), then the parts asked for in `parts`, in the page's order and with the page's own pieces
 * (the experience row, the Stats table, the gear and talent slots and their drawers), then `buttons`. It
 * knows nothing of the task: the screen decides the parts and the buttons. Everything is in the pixel font
 * (`.pix-panel`); the server decides every change.
 */
export function CreatureConfigurator({
  creature,
  state,
  gear,
  busy,
  parts,
  actions,
  buttons = [],
}: {
  creature: Creature;
  state: Pick<
    GameState,
    'loungerId' | 'loungeXp' | 'serverFirsts' | 'creatures' | 'bookSlotBait' | 'balances'
  >;
  /** The gear view; null until it has loaded (the picker then says "Loading..."). */
  gear: GearState | null;
  busy: boolean;
  parts: ConfiguratorParts;
  actions: Pick<CardActions, 'onEquip' | 'onSlotTalent'>;
  buttons?: readonly ConfiguratorButton[];
}) {
  const [open, setOpen] = useState<Open>(null);
  // The slot that was tapped gets the focus back when its drawer closes.
  const opener = useRef<HTMLElement | null>(null);
  const id = `${cardDomId(creature.id)}-configure`;
  const ability =
    creature.ability !== null && creature.ability.unlocked
      ? abilityDef(creature.ability.id)
      : undefined;

  async function equip(gearId: string, creatureId: string | null): Promise<void> {
    if (await actions.onEquip(gearId, creatureId)) setOpen(null);
  }

  return (
    <section class="card-item configurator pix-panel" aria-labelledby={`${id}-name`}>
      <div class="cp-head">
        <CreatureHead creature={creature} state={state} nameId={`${id}-name`} />
        {parts.experience === true && (
          <XpTrack
            level={creature.level}
            value={creature.exp}
            max={creature.expNeeded ?? 1}
            top={creature.expNeeded === null}
            label={experienceLabel(creature)}
            text={xpWords(creature)}
            levelEntry="level"
          />
        )}
        {/* Into the current rank or level, as on the creature page (not the cumulative XP). */}
        {skillRows(creature, gear?.skills)
          .filter((row) => parts[row.kind] === true)
          .map((row) => (
            <XpTrack
              key={row.kind}
              kind={row.kind}
              unit={row.unit}
              level={row.level}
              value={row.value}
              max={row.max}
              top={row.top}
              label={row.label}
              text={row.text}
              levelEntry={row.entry}
            />
          ))}
      </div>

      {parts.stats === true && (
        <div class="cp-block">
          <h3 class="cp-title">Stats</h3>
          <DataTable tabular rows={statRows(creature)} />
        </div>
      )}

      {parts.ability === true && ability !== undefined && (
        <div class="cp-block creature-ability">
          <h3 class="cp-title">Finale ability</h3>
          <p class="prose">
            <GlossaryTag ability={ability.id}>{ability.name}</GlossaryTag>: {ability.description}
          </p>
        </div>
      )}

      {parts.gear === true && (
        <div class="cp-block">
          <h3 class="cp-title">
            <GlossaryTag entry="gear" look="text">
              Gear
            </GlossaryTag>
          </h3>
          <GearList
            level={creature.level}
            worn={creature.gear.map((g) => wornItemOf(g, gear?.items))}
            slotOpens={gear?.slotOpens}
            openSlot={open?.kind === 'gear' ? open.slot : null}
            onPick={
              parts.gearLocked === true
                ? undefined
                : (slot, button) => {
                    opener.current = button;
                    setOpen({ kind: 'gear', slot });
                  }
            }
          />
        </div>
      )}

      {parts.talents === true && (
        <div class="cp-block">
          <h3 class="cp-title">
            <GlossaryTag entry="talent" look="text">
              Talents
            </GlossaryTag>
          </h3>
          <TalentSlots
            creature={creature}
            openSlot={open?.kind === 'talent' ? open.slot : null}
            onOpen={(slot, button) => {
              opener.current = button;
              setOpen({ kind: 'talent', slot });
            }}
          />
        </div>
      )}

      {buttons.length > 0 && (
        <p class="configurator-buttons">
          {buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              {...(b.danger === true ? { class: 'danger' } : {})}
              disabled={busy}
              onClick={b.onAct}
            >
              {b.withCreature === true && <CreatureIcon creature={creature} />}
              {b.label}
            </button>
          ))}
        </p>
      )}

      {open?.kind === 'gear' && (
        <ItemPickerDrawer
          key={open.slot}
          open
          onClose={() => {
            setOpen(null);
          }}
          slot={open.slot}
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
          returnFocusTo={opener.current}
        />
      )}
      {open?.kind === 'talent' && (
        <TalentBookDrawer
          key={open.slot}
          open
          onClose={() => {
            setOpen(null);
          }}
          creature={creature}
          slot={open.slot}
          bookSlotBait={state.bookSlotBait}
          bait={state.balances.bait}
          busy={busy}
          onSlot={(c, talentId, golden, slot) => {
            actions.onSlotTalent(c, talentId, golden, slot);
            setOpen(null);
          }}
          returnFocusTo={opener.current}
        />
      )}
    </section>
  );
}
