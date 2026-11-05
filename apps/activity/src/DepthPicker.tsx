import { GlossaryTag } from './Glossary';
import { FlipNav } from './ui/Flipper';
import { depthName, depthPickNote, depthScalarsText } from './dungeon-depth';

/**
 * The depth picker of the pre-run card (combat v2): "Depth to play" with what the pick pays against depth 1
 * ("1.4x XP · 2.1x loot"), the arrows and the position ("16 / 23": the depth picked out of the player's own, the
 * last one unlocked), and one line that says which depth is the player's own and that a lower one does not advance
 * it. The arrows are the shared `FlipNav`; nothing is drawn when the player's own depth is 1 (nothing to pick).
 * The pick is only a request: the server checks it against the player's progress.
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
  if (own < 2) return null;
  return (
    <div class="depth-pick">
      <p class="treats-head">
        <span class="treats-title">Depth to play</span>
        <GlossaryTag entry="depth-choice" look="help" />
        <span class="treats-left" role="status">
          {depthScalarsText(picked)}
        </span>
      </p>
      <FlipNav
        flip={{
          index: picked - 1,
          count: own,
          noun: 'depth',
          name: depthName(picked),
          prevName: picked > 1 ? depthName(picked - 1) : undefined,
          nextName: picked < own ? depthName(picked + 1) : undefined,
          onFlip: (step) => {
            onPick(Math.min(own, Math.max(1, picked + step)));
          },
        }}
      />
      <p class="muted depth-pick-note">{depthPickNote(own, picked)}</p>
    </div>
  );
}
