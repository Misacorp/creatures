import type { BoardRow, GamesYou } from '../games-types';
import { GlossaryTag } from '../Glossary';
import { CountBadge } from '../ui/CountBadge';
import { DataTable, type DataRow } from '../ui/DataTable';
import { MedalCountsRow } from './GamesParts';

/** The medal point, what the Prize Stall's prices and the pocket are counted in. */
export const MEDAL_POINT_ICON = { kind: 'glyph', id: 'medal-point' } as const;

/** The server's medal table as rows: rank and name, then the medals as pictures; yours marked. */
export function boardRows(board: readonly BoardRow[], selfId: string): DataRow[] {
  return board.map((row, i) => ({
    label: (
      <>
        <span class="gm-rank">{i + 1}</span>
        <span class="gm-player">{row.name}</span>
      </>
    ),
    value: <MedalCountsRow medals={row} pins={false} scale={1} tags={false} />,
    mine: row.userId === selfId,
  }));
}

/**
 * The medal cabinet: your lifetime medals and pins as pictures with counts, your pocket (medal points
 * to spend at the Prize Stall), then the server's medal table with you highlighted.
 */
export function MedalCabinet({
  you,
  board,
  selfId,
}: {
  you: GamesYou;
  board: readonly BoardRow[];
  selfId: string;
}) {
  return (
    <section class="gm-cabinet pix-panel" aria-labelledby="gm-cabinet-title">
      <h3 id="gm-cabinet-title" class="gm-title">
        <GlossaryTag entry="games-medals">Medals</GlossaryTag>
      </h3>
      <div class="gm-shelf">
        <MedalCountsRow medals={you.medals} scale={3} />
        <CountBadge
          icon={MEDAL_POINT_ICON}
          amount={you.pocket}
          label="Medal points"
          entry="games-medal-points"
        />
      </div>
      {board.length > 0 && (
        <DataTable
          class="gm-board"
          headings={{ label: 'Player', value: 'Medals' }}
          label="Medal table"
          rows={boardRows(board, selfId)}
        />
      )}
    </section>
  );
}
