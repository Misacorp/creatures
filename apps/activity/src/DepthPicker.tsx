import { isLandmark } from '@creatures/game';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GlossaryTag } from './Glossary';
import { depthName, depthPickNote, depthScalarChips, depthSpoken } from './dungeon-depth';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { DropChevron } from './ui/DropChevron';
import { PickSheet } from './ui/PickSheet';
import { Tag } from './ui/Tag';

/** What a depth is, drawn the same in the trigger and in every row: its name, its marks and what it pays. */
function DepthFace({ depth, own }: { depth: number; own: number }) {
  const chips = depthScalarChips(depth);
  return (
    <span class="depth-face">
      <span class="depth-line">
        <span class="depth-name">{depthName(depth)}</span>
        {isLandmark(depth) && (
          <span class="depth-landmark">
            <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
            <span class="depth-mark">Landmark</span>
          </span>
        )}
        {depth === own && <span class="depth-mark depth-own">Your depth</span>}
      </span>
      <span class="depth-chips">
        <Tag class="xp-times">{chips.xp}</Tag>
        <Tag class="xp-times">{chips.loot}</Tag>
      </span>
    </span>
  );
}

/**
 * The list of depths, deepest first (the player's own on top): a listbox with a roving focus (Up, Down, Home, End,
 * Enter, Space, a tap picks). It opens with the picked depth in view and focused, so a long range starts where the
 * player is and scrolls from there.
 */
function DepthList({
  own,
  picked,
  onPick,
}: {
  own: number;
  picked: number;
  onPick: (depth: number) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const depths = Array.from({ length: own }, (_, i) => own - i);
  const [active, setActive] = useState(own - picked);
  function focusOption(index: number, center: boolean): void {
    setActive(index);
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    if (el === undefined) return;
    if (center) el.scrollIntoView?.({ block: 'center' });
    el.focus({ preventScroll: center });
  }
  useEffect(() => {
    focusOption(active, true);
  }, []);
  function onKey(event: KeyboardEvent): void {
    const last = depths.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
    };
    const to = keys[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusOption(to, false);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const depth = depths[active];
      if (depth !== undefined) onPick(depth);
    }
  }
  return (
    <ul
      ref={listRef}
      class="roster-list depth-list"
      role="listbox"
      aria-label="Depths, deepest first"
      onKeyDown={onKey}
    >
      {depths.map((depth, index) => (
        <li
          key={depth}
          role="option"
          aria-selected={depth === picked}
          aria-label={depthSpoken(depth, own)}
          tabIndex={index === active ? 0 : -1}
          class={depth === picked ? 'roster-option depth-option on' : 'roster-option depth-option'}
          onClick={() => {
            onPick(depth);
          }}
        >
          <DepthFace depth={depth} own={own} />
          {depth === picked && (
            <span class="choice-check" aria-hidden="true">
              {'✓'}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The depth picker of the pre-run card (combat v2): "Depth to play", then a trigger that looks like a dropdown
 * (the depth picked, what it pays against depth 1 as two chips, a chevron). A tap opens the shared pick sheet with
 * every depth from the player's own down to 1, each with its chips, the own one and the landmarks marked. A pick
 * closes it. One line under the trigger says which depth is the player's own and that a lower one does not
 * advance it. Nothing is drawn when the player's own depth is 1 (nothing to pick). The pick is only a request: the
 * server checks it against the player's progress.
 */
export function DepthPicker({
  own,
  picked,
  onPick,
}: {
  /** The player's own depth: the highest one they may pick. */
  own: number;
  /** The depth picked, 1 to `own`. */
  picked: number;
  onPick: (depth: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  if (own < 2) return null;
  return (
    <div class="depth-pick">
      <p class="treats-head">
        <span class="treats-title">Depth to play</span>
        <GlossaryTag entry="depth-choice" look="help" />
      </p>
      <button
        ref={trigger}
        type="button"
        class="equip-trigger depth-trigger"
        aria-haspopup="dialog"
        aria-label={`Depth to play: ${depthSpoken(picked, own)}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <DepthFace depth={picked} own={own} />
        <DropChevron />
      </button>
      <p class="muted depth-pick-note" role="status">
        {depthPickNote(own, picked)}
      </p>
      {open && (
        <PickSheet
          title="Depth to play"
          status={`Deepest first. You have reached depth ${String(own)}.`}
          class="depth-sheet"
          anchor={() => trigger.current}
          onClose={() => {
            setOpen(false);
          }}
        >
          <DepthList
            own={own}
            picked={picked}
            onPick={(depth) => {
              onPick(depth);
              setOpen(false);
            }}
          />
        </PickSheet>
      )}
    </div>
  );
}
