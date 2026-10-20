import { useRef, useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { CreatureHead } from './CreatureHead';
import { statRows, type CardActions } from './CreaturePage';
import { cardDomId, xpWords } from './creature-card-view';
import { experienceLabel } from './CreatureProgress';
import { ItemPickerDrawer } from './creature-page/ItemPicker';
import { GearSlots, TalentSlots } from './creature-page/PageSlots';
import { GearList } from './GearList';
import { wornItemOf } from './gear-view';
import { WornItemLines } from './WornItemLines';
import { TalentBookDrawer } from './creature-page/TalentBookDrawer';
import { creatureName } from './game';
import type { GearItem, GearSlot, GearState } from './gear-types';
import { GlossaryTag } from './Glossary';
import { abilityDef } from './live';
import { DataTable } from './ui/DataTable';
import { XpTrack } from './ui/XpTrack';

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
  /** The three gear slots; a tap opens the item picker. */
  gear?: boolean;
  /** The talent slots; a tap opens the Talent Book. */
  talents?: boolean;
}

/**
 * How the gear part looks (a mock for Misa to choose from): `slots` (the page's three slots), `worn` (the
 * living room's read-only list as it is, `WornItemLines`), `list` (a row per slot, `GearList`) or `list-lines`
 * (the same rows with each item's lines). `locked`: the list rows do nothing when tapped.
 */
export type GearLook = 'slots' | 'worn' | 'list' | 'list-lines';

/** A button under the parts ("Creature page", "Remove from team"). */
export interface ConfiguratorButton {
  label: string;
  onAct: () => void;
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
  gearLook = 'slots',
  gearLocked = false,
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
  gearLook?: GearLook;
  gearLocked?: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);
  // The slot that was tapped gets the focus back when its drawer closes.
  const opener = useRef<HTMLElement | null>(null);
  const id = `${cardDomId(creature.id)}-configure`;
  const skill = gear?.skills.find((s) => s.creatureId === creature.id);
  const explorer = creature.explorer;
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
        {parts.explorer === true && (
          <XpTrack
            kind="explorer"
            unit="Rank"
            level={explorer.rank}
            value={explorer.xp}
            max={explorer.nextRankXp ?? 1}
            top={explorer.nextRankXp === null}
            label={`${creatureName(creature)}'s explorer XP`}
            levelEntry="explorer-rank"
          />
        )}
        {parts.crafting === true && skill !== undefined && (
          <XpTrack
            kind="crafting"
            level={skill.level}
            value={skill.xp}
            max={skill.nextLevelXp ?? 1}
            top={skill.nextLevelXp === null}
            label={`${creatureName(creature)}'s Crafting XP`}
            levelEntry="skill-crafting"
          />
        )}
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
          {gearLook === 'slots' && (
            <GearSlots
              creature={creature}
              gear={gear}
              openSlot={open?.kind === 'gear' ? open.slot : null}
              onOpen={(slot, button) => {
                opener.current = button;
                setOpen({ kind: 'gear', slot });
              }}
            />
          )}
          {gearLook === 'worn' && (
            <div class="gear-list">
              <WornItemLines worn={creature.gear.map((g) => wornItemOf(g, gear?.items))} />
            </div>
          )}
          {(gearLook === 'list' || gearLook === 'list-lines') && (
            <GearList
              creature={creature}
              gear={gear}
              lines={gearLook === 'list-lines'}
              openSlot={open?.kind === 'gear' ? open.slot : null}
              onPick={
                gearLocked
                  ? undefined
                  : (slot, button) => {
                      opener.current = button;
                      setOpen({ kind: 'gear', slot });
                    }
              }
            />
          )}
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
        <p class="cp-buttons configurator-buttons">
          {buttons.map((b) => (
            <button key={b.label} type="button" disabled={busy} onClick={b.onAct}>
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
