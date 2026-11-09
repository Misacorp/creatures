import { housing } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DropChevron } from '../ui/DropChevron';
import { DropList } from '../ui/DropList';
import { GameIcon } from '../ui/GameIcon';
import { HouseThumb } from './HouseThumb';

export interface StampPickerProps {
  /** The stamp ids the visitor holds: only these are offered. */
  owned: readonly string[];
  /** The visitor stamped this house today: the trigger is off and says so. */
  used: boolean;
  /** A request is running: the trigger waits. */
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
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  function focusOption(index: number): void {
    setActive(index);
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[index]?.focus();
  }
  useEffect(() => {
    focusOption(0);
  }, []);
  function onKey(event: KeyboardEvent): void {
    const last = stamps.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    const to = keys[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusOption(to);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const stamp = stamps[active];
      if (stamp !== undefined) onPick(stamp.id);
    }
  }
  return (
    <ul ref={list} class="roster-list" role="listbox" aria-label="Your stamps" onKeyDown={onKey}>
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
 * A visitor's stamp: a trigger that looks like a dropdown (the stamp glyph, "Leave a stamp", a chevron) that opens
 * the stamps the visitor holds; a pick leaves it at once. After today's stamp the trigger is off and reads
 * "Stamped today". Data in, callbacks out: it fetches nothing.
 */
export function StampPicker({ owned, used, busy, onStamp }: StampPickerProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const stamps = ownedStamps(owned);
  const disabled = used || busy || stamps.length === 0;
  return (
    <div class="hp-stamp">
      <button
        ref={trigger}
        type="button"
        class="equip-trigger hp-stamp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open && !used}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <GameIcon icon={{ kind: 'glyph', id: 'stamp' }} scale={3} />
        <span class="equip-name">{used ? 'Stamped today' : 'Leave a stamp'}</span>
        {!used && <DropChevron />}
      </button>
      {open && !disabled && (
        <DropList
          anchor={() => trigger.current}
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
