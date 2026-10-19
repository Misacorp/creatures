import { useRef, useState } from 'preact/hooks';
import type { Creature } from './api';
import { statRow, type CardActions } from './CreaturePage';
import { ItemPickerDrawer } from './creature-page/ItemPicker';
import { GearSlots, TalentSlots } from './creature-page/PageSlots';
import { TalentBookDrawer } from './creature-page/TalentBookDrawer';
import { creatureName, getSpecies } from './game';
import type { GearItem, GearSlot, GearState } from './gear-types';
import { ElementChip } from './sprites/ElementChip';

/**
 * How the loadout shows: `all` (every creature of the team at once, compact) or `tap` (only the creature
 * whose tile was tapped, at the creature page's own size).
 */
export type LoadoutMode = 'all' | 'tap';

/** The three stats, as their short labels. */
const STATS = [
  ['HP', 'hp'],
  ['ATK', 'atk'],
  ['SPD', 'spd'],
] as const;

/** Which drawer is up, and for whom. */
type Open =
  | { kind: 'gear'; creatureId: string; slot: GearSlot }
  | { kind: 'talent'; creatureId: string; slot: number }
  | null;

export interface LoadoutProps {
  mode: LoadoutMode;
  /** The team, left to right (empty places left out). */
  team: readonly Creature[];
  /** Every creature the player owns (the item picker says who else wears an item). */
  creatures: readonly Creature[];
  /** `tap`: the creature whose tile was tapped (null: none, nothing shows). */
  selectedId?: string | null;
  /** The gear view; null until it has loaded (the picker then says "Loading..."). */
  gear: GearState | null;
  bait: number;
  bookSlotBait: number;
  busy: boolean;
  onEquip: CardActions['onEquip'];
  onSlotTalent: CardActions['onSlotTalent'];
  /** `tap`: opens the creature's own page (evolve, ribbon, rename and the rest). */
  onOpenPage?: (creature: Creature) => void;
  /** `tap`: takes the creature out of the team. */
  onRemove?: (creature: Creature) => void;
}

/** One creature's loadout: who it is, its stats with the gear's share, its gear and its talents. */
function LoadoutCard({
  creature,
  index,
  gear,
  compact,
  open,
  onOpen,
  onOpenPage,
  onRemove,
}: {
  creature: Creature;
  index: number;
  gear: GearState | null;
  compact: boolean;
  open: Open;
  onOpen: (next: Open, button: HTMLButtonElement) => void;
  onOpenPage?: ((creature: Creature) => void) | undefined;
  onRemove?: ((creature: Creature) => void) | undefined;
}) {
  const species = getSpecies(creature.species);
  const mine = open?.creatureId === creature.id ? open : null;
  return (
    <article
      class={`loadout-card${compact ? ' compact' : ' full'}`}
      aria-label={`${creatureName(creature)}: gear and talents`}
    >
      <header class="loadout-head">
        <span class="loadout-num pix" aria-hidden="true">
          {index + 1}
        </span>
        <strong class="loadout-name pix">{creatureName(creature)}</strong>
        <span class="loadout-level pix">Lv {creature.level}</span>
        {!compact && species !== undefined && (
          <ElementChip element={species.element} role={species.role} />
        )}
      </header>
      <dl class="loadout-stats">
        {STATS.map(([label, stat]) => {
          const row = statRow(label, stat, creature);
          return (
            <div key={stat} class="loadout-stat">
              <dt>{row.label}</dt>
              <dd>
                {row.value}
                {row.extra !== undefined && <> {row.extra}</>}
              </dd>
            </div>
          );
        })}
      </dl>
      <div class="loadout-slots">
        <div class="loadout-gear">
          <GearSlots
            creature={creature}
            gear={gear}
            compact={compact}
            openSlot={mine?.kind === 'gear' ? mine.slot : null}
            onOpen={(slot, button) => {
              onOpen({ kind: 'gear', creatureId: creature.id, slot }, button);
            }}
          />
        </div>
        <div class="loadout-talents">
          <TalentSlots
            creature={creature}
            openSlot={mine?.kind === 'talent' ? mine.slot : null}
            onOpen={(slot, button) => {
              onOpen({ kind: 'talent', creatureId: creature.id, slot }, button);
            }}
          />
        </div>
      </div>
      {(onOpenPage !== undefined || onRemove !== undefined) && (
        <p class="loadout-buttons">
          {onOpenPage !== undefined && (
            <button
              type="button"
              onClick={() => {
                onOpenPage(creature);
              }}
            >
              Creature page
            </button>
          )}
          {onRemove !== undefined && (
            <button
              type="button"
              onClick={() => {
                onRemove(creature);
              }}
            >
              Remove from team
            </button>
          )}
        </p>
      )}
    </article>
  );
}

/**
 * The team's gear and talents on the dungeon card, so the entry is the place to get ready. `all` lists the
 * three creatures at once in compact cards (side by side on a wide screen); `tap` shows only the creature
 * whose tile was tapped, at full size, with buttons for its page and for taking it out. A slot opens the
 * creature page's own drawer: the item picker or the Talent Book. The server decides every change.
 */
export function DungeonLoadout(props: LoadoutProps) {
  const [open, setOpen] = useState<Open>(null);
  const opener = useRef<HTMLElement | null>(null);
  const shown =
    props.mode === 'all'
      ? props.team
      : props.team.filter((c) => c.id === (props.selectedId ?? null));
  if (shown.length === 0) return null;
  const openCreature = open === null ? undefined : props.team.find((c) => c.id === open.creatureId);

  return (
    <section class={`dungeon-loadout ${props.mode}`} aria-label="Gear and talents">
      {props.mode === 'all' && <h3 class="cp-title loadout-title">Gear and talents</h3>}
      <div class="loadout-list">
        {shown.map((creature) => (
          <LoadoutCard
            key={creature.id}
            creature={creature}
            index={props.team.indexOf(creature)}
            gear={props.gear}
            compact={props.mode === 'all'}
            open={open}
            onOpen={(next, button) => {
              opener.current = button;
              setOpen(next);
            }}
            onOpenPage={props.mode === 'tap' ? props.onOpenPage : undefined}
            onRemove={props.mode === 'tap' ? props.onRemove : undefined}
          />
        ))}
      </div>

      {open?.kind === 'gear' && openCreature !== undefined && (
        <ItemPickerDrawer
          key={`${open.creatureId}-${open.slot}`}
          open
          onClose={() => {
            setOpen(null);
          }}
          slot={open.slot}
          creature={openCreature}
          creatures={props.creatures}
          items={props.gear === null ? null : props.gear.items}
          busy={props.busy}
          onEquip={(item: GearItem) => {
            void props.onEquip(item.id, openCreature.id).then((ok) => {
              if (ok) setOpen(null);
            });
          }}
          onTakeOff={(item: GearItem) => {
            void props.onEquip(item.id, null).then((ok) => {
              if (ok) setOpen(null);
            });
          }}
          returnFocusTo={opener.current}
        />
      )}
      {open?.kind === 'talent' && openCreature !== undefined && (
        <TalentBookDrawer
          key={`${open.creatureId}-${String(open.slot)}`}
          open
          onClose={() => {
            setOpen(null);
          }}
          creature={openCreature}
          slot={open.slot}
          bookSlotBait={props.bookSlotBait}
          bait={props.bait}
          busy={props.busy}
          onSlot={(c, talentId, golden, slot) => {
            props.onSlotTalent(c, talentId, golden, slot);
            setOpen(null);
          }}
          returnFocusTo={opener.current}
        />
      )}
    </section>
  );
}
