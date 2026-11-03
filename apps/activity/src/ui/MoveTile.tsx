import { combatGlyph, moveGlyphId } from '../combat-glyphs';
import { cssVars } from '../css-vars';
import { glyphOrUnknown } from '../glyphs';
import { everyShort } from '../raid-board-v2';
import type { BossMoveV2 } from '../raid-v2-api';
import { Sprite } from '../sprites/Sprite';

/** The arena a tile draws: the boss's rows by the party's columns, a slot is `col * rows + row`. */
export interface TileArena {
  rows: number;
  cols: number;
}

interface MoveTileProps {
  move: BossMoveV2;
  arena: TileArena;
  /**
   * The slots the move would hit with the board as it stands, lit in the tiny arena; null for a move aimed when it comes (a roll
   * or a Wind-up): the arena is dim with the move's picture over it.
   */
  lit: readonly number[] | null;
  /** The move is the one tapped: its slots light on the board too. */
  selected: boolean;
  onToggle: () => void;
}

/** "every 3 rounds" in few words, for the tile and for a screen reader. */
export const everyText = (every: number): string =>
  every === 1 ? 'every round' : `every ${String(every)} rounds`;

/**
 * One boss move as a tile (docs/design/combat/proposals/001-combat-v2.md, "On the board: The boss card"): a tiny arena with the
 * shape lit (or, for a move aimed when it comes, the shape's picture over a dim arena), how often it is due, a Wind-up badge and
 * its name with its plain label under it ("Deepwater Spear" over "Nemesis Lance"). A tap selects it: the board lights the slots
 * it would hit. Names and labels are the server's, drawn as text only.
 */
export function MoveTile({ move, arena, lit, selected, onToggle }: MoveTileProps) {
  const cells = arena.rows * arena.cols;
  const hits = new Set(lit ?? []);
  const glyphId = moveGlyphId(move);
  const name = `${move.name}, ${move.label}, ${everyText(move.every)}${move.windUp ? ', Wind-up' : ''}`;
  return (
    <button
      type="button"
      class={`move-tile${selected ? ' selected' : ''}${move.later ? ' later' : ''}`}
      aria-pressed={selected}
      aria-label={name}
      onClick={onToggle}
    >
      <span
        class={`move-arena${lit === null ? ' unaimed' : ''}`}
        ref={cssVars({ '--cols': String(arena.cols), '--rows': String(arena.rows) })}
        aria-hidden="true"
      >
        {Array.from({ length: cells }, (_, index) => {
          // Cells run row by row; a slot is column-major.
          const row = Math.floor(index / arena.cols);
          const col = index % arena.cols;
          return <i key={index} class={hits.has(col * arena.rows + row) ? 'on' : undefined} />;
        })}
        {lit === null && (
          <span class="move-arena-icon">
            <Sprite sprite={combatGlyph(glyphId) ?? glyphOrUnknown('unknown')} scale={2} />
          </span>
        )}
      </span>
      <span class="move-badges" aria-hidden="true">
        <span class="move-every">{everyShort(move.every)}</span>
        {move.windUp && (
          <span class="move-windup">
            <Sprite sprite={glyphOrUnknown('charge')} scale={1} />
          </span>
        )}
      </span>
      <span class="move-name" aria-hidden="true">
        {move.name}
      </span>
      <span class="move-label" aria-hidden="true">
        {move.label}
      </span>
    </button>
  );
}
