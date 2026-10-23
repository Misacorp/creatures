import type { Creature } from '../api';
import { GlossaryTag } from '../Glossary';
import type { GamesNext, LineupEvent } from '../games-types';
import { favourView, pickerRows } from '../games-view';
import { GameIcon } from '../ui/GameIcon';
import { CreatureList } from '../ui/CreatureList';
import { Drawer } from '../ui/Drawer';
import { FavourIcons, FitPips } from './GamesParts';

/**
 * The picker of one entry slot: a drawer headed by the event's name, its favours and its teaser line,
 * with the player's creatures best fit first (the shared `CreatureList`: element and role chips, the
 * fit pips at the right, "In Melon Run" under a creature entered elsewhere, which a tap moves here).
 * When the event favours small or big creatures, each creature of that size shows the favour's glyph
 * before its pips, so the link between the favour and the creature is visible. "Clear" at the bottom
 * empties the slot. A pick acts at once.
 */
export function EntryPicker({
  event,
  slot,
  next,
  creatures,
  busy,
  onPick,
  onClear,
  onClose,
  returnFocusTo,
}: {
  event: LineupEvent;
  slot: number;
  next: GamesNext;
  creatures: readonly Creature[];
  busy: boolean;
  onPick: (creatureId: string) => void;
  onClear: () => void;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
}) {
  const rows = pickerRows(next, event, slot, creatures);
  const filled = (next.entries[event.id] ?? [])[slot] !== undefined;
  return (
    <Drawer
      open
      title={event.name}
      onClose={onClose}
      class="ge-picker"
      titleHelp={<GlossaryTag entry="games-fit" look="help" />}
      returnFocusTo={returnFocusTo}
      footer={
        filled ? (
          <button type="button" class="ghost ge-clear" disabled={busy} onClick={onClear}>
            Clear
          </button>
        ) : undefined
      }
    >
      <div class="ge-picker-head pix-panel">
        <FavourIcons event={event} />
        <p class="ge-line prose">{event.line}</p>
      </div>
      <CreatureList
        options={rows}
        class="flat"
        placedNote=""
        selection={{ mode: 'pick', onPick, label: `Creatures for ${event.name}` }}
        side={(o) => (
          <span class="ge-fit">
            {o.size !== null && <SizeMark size={o.size} />}
            <FitPips fit={o.fit} />
          </span>
        )}
      />
    </Drawer>
  );
}

/** The favour's small or big glyph on a creature of that size (inside the row's button: not a tag). */
export function SizeMark({ size }: { size: 'small' | 'big' }) {
  const view = favourView(size);
  return (
    <span
      class={`ge-size is-${size}`}
      role="img"
      aria-label={size === 'small' ? 'Small creature' : 'Big creature'}
    >
      <GameIcon icon={view.icon} scale={2} />
    </span>
  );
}
