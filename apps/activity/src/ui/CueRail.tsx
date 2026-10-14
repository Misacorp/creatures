/** What the cue rail under a row of slots says right now. */
export interface CueRailProps {
  /** Nothing in the row would react: show the "no reaction" mark. */
  none: boolean;
  /** One short line about what the creature in focus does (`effectLine`), or null. */
  effect: string | null;
}

/** The small "no reaction" mark: a crossed-out ring and the words. Text only. */
export function NoReactionMark() {
  return (
    <span class="cue-none">
      <i class="cue-none-glyph" aria-hidden="true" />
      No reaction
    </span>
  );
}

/**
 * The strip under the dungeon's slot row and the raid board. It keeps its height whether or not it has
 * anything to say, so the page does not jump while the pointer moves over the tiles. It holds the
 * "no reaction" mark when the order cannot react and, when a creature that does something for its
 * neighbours is in focus, the one line that says what. The screen reader hears it as a status.
 */
export function CueRail(props: CueRailProps) {
  return (
    <div class="cue-rail" role="status">
      {props.none && <NoReactionMark />}
      {props.effect !== null && <span class="cue-effect">{props.effect}</span>}
    </div>
  );
}
