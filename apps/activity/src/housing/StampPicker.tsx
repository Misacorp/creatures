import { housing } from '@creatures/game/housing-content';
import { useRef, useState } from 'preact/hooks';
import { DropList } from '../ui/DropList';
import { useRovingList } from '../ui/use-roving-list';
import { PinnedAct } from '../valley/PinnedAct';
import { HouseThumb } from './HouseThumb';

export interface StampPickerProps {
  /** The stamp ids the visitor holds: only these are offered. */
  owned: readonly string[];
  /** The visitor stamped this house today: the line says so. */
  used: boolean;
  /** A request is running: the list does not open. */
  busy: boolean;
  /** A stamp was picked: leave it at once. */
  onStamp: (stampId: string) => void;
}

/** The stamps the visitor holds, in the content's order (a stamp the content lacks is left out). */
export function ownedStamps(owned: readonly string[]): { id: string; name: string }[] {
  const held = new Set(owned);
  return housing.stamps.filter((s) => held.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
}

function StampList({
  stamps,
  onPick,
}: {
  stamps: readonly { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const { listRef, active, onKeyDown } = useRovingList({
    count: stamps.length,
    initial: 0,
    onChoose: (index) => {
      const stamp = stamps[index];
      if (stamp !== undefined) onPick(stamp.id);
    },
  });
  return (
    <ul
      ref={listRef}
      class="roster-list"
      role="listbox"
      aria-label="Your stamps"
      onKeyDown={onKeyDown}
    >
      {stamps.map((stamp, index) => (
        <li
          key={stamp.id}
          role="option"
          aria-selected="false"
          aria-label={stamp.name}
          tabIndex={index === active ? 0 : -1}
          class="roster-option hp-stamp-option"
          onClick={() => {
            onPick(stamp.id);
          }}
        >
          <HouseThumb id={stamp.id} box={32} max={2} />
          <span class="hp-stamp-name">{stamp.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A visitor's stamp, pinned like a place's one action (`valley/PinnedAct`): "Leave a stamp" opens the stamps the visitor holds
 * in a dropdown list; a pick leaves it at once. It is never shown as a disabled button: after today's stamp it is the calm line
 * "Stamped today" (with the check), and with no stamp held the calm line "No stamps yet". Data in, callbacks out: it fetches nothing.
 */
export function StampPicker({ owned, used, busy, onStamp }: StampPickerProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const stamps = ownedStamps(owned);
  if (used) return <PinnedAct calm="Stamped today" mark />;
  if (stamps.length === 0) return <PinnedAct calm="No stamps yet" />;
  return (
    <div class="hp-stamp" ref={anchor}>
      <PinnedAct
        label="Leave a stamp"
        onClick={() => {
          if (!busy) setOpen(!open);
        }}
      />
      {open && (
        <DropList
          anchor={() => anchor.current}
          onClose={() => {
            setOpen(false);
          }}
        >
          <StampList
            stamps={stamps}
            onPick={(id) => {
              setOpen(false);
              onStamp(id);
            }}
          />
        </DropList>
      )}
    </div>
  );
}
