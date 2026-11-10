import { isLandmark } from '@creatures/game';
import { useRef, useState } from 'preact/hooks';
import { GlossaryTag } from './Glossary';
import { depthName, depthPickNote, depthScalarChips, depthSpoken } from './dungeon-depth';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { DropChevron } from './ui/DropChevron';
import { DropList } from './ui/DropList';
import { PreviewStatus } from './ui/PreviewStatus';
import { useRovingList } from './ui/use-roving-list';
import type { PreviewStatusName } from './use-job-preview';

/**
 * What a depth is, drawn the same in the trigger and in every row, on one line: its name and mark on the left, the
 * two plain numbers in a fixed column at the right (so the numbers line up and a jump stands out). The landmark mark is
 * shown only at the player's own depth, the one place a landmark's extras pay.
 */
function DepthFace({ depth, own }: { depth: number; own: number }) {
  const chips = depthScalarChips(depth);
  return (
    <span class="depth-face">
      <span class="depth-line">
        <span class="depth-name">{depthName(depth)}</span>
        {depth === own && isLandmark(depth) && (
          <span class="depth-landmark">
            <Sprite sprite={glyphOrUnknown('flag')} scale={2} />
            <span class="depth-mark">Landmark</span>
          </span>
        )}
        {depth === own && <span class="depth-mark depth-own">Your depth</span>}
      </span>
      <span class="depth-chips">
        <span class="depth-xp">{chips.xp}</span>
        <span class="depth-loot">{chips.loot}</span>
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
  const depths = Array.from({ length: own }, (_, i) => own - i);
  const { listRef, active, onKeyDown } = useRovingList({
    count: depths.length,
    initial: own - picked,
    center: true,
    onChoose: (index) => {
      const depth = depths[index];
      if (depth !== undefined) onPick(depth);
    },
  });
  return (
    <ul
      ref={listRef}
      class="roster-list depth-list"
      role="listbox"
      aria-label="Depths, deepest first"
      onKeyDown={onKeyDown}
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
          {/* The picked row is marked as the creature list marks its chosen row (`roster-option.on`, the gold ring). */}
          <DepthFace depth={depth} own={own} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The depth picker of the pre-run card (combat v2): "Depth to play", then a trigger that looks like a dropdown
 * (the depth picked, what it pays against depth 1 as two plain numbers, a chevron). A tap opens the shared dropdown panel (`ui/DropList`) under it with
 * every depth from the player's own down to 1, each with its two numbers, the own one marked (and a landmark there). A pick
 * closes it. One line under the trigger says which depth is the player's own and that a lower one does not
 * advance it. Nothing is drawn when the player's own depth is 1 (nothing to pick). The pick is only a request: the
 * server checks it against the player's progress.
 */
export function DepthPicker({
  own,
  picked,
  onPick,
  status = 'idle',
}: {
  /** The player's own depth: the highest one they may pick. */
  own: number;
  /** The depth picked, 1 to `own`. */
  picked: number;
  onPick: (depth: number) => void;
  /** The preview of a lower depth: loading or failed shows its line under the picker. */
  status?: PreviewStatusName;
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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Depth to play: ${depthSpoken(picked, own)}`}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <DepthFace depth={picked} own={own} />
        <DropChevron />
      </button>
      <p class="muted depth-pick-note" role="status">
        {depthPickNote(own, picked)}
      </p>
      <PreviewStatus
        status={status}
        what="that depth's map"
        loading="Loading that depth's map..."
      />
      {open && (
        <DropList
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
        </DropList>
      )}
    </div>
  );
}
