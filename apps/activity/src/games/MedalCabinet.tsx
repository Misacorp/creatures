import type { BoardRow, GamesYou } from '../games-types';
import { GlossaryTag } from '../Glossary';
import { CountBadge } from '../ui/CountBadge';
import { DataTable, type DataRow } from '../ui/DataTable';
import { MEDAL_NAME, MedalCountsRow, MedalSprite } from './GamesParts';

/** The medal point, what the Prize Stall's prices and the pocket are counted in. */
export const MEDAL_POINT_ICON = { kind: 'glyph', id: 'medal-point' } as const;

/** The server's medal table as rows: rank and name, then gold, silver and bronze in a column each; yours marked. */
export function boardRows(board: readonly BoardRow[], selfId: string): DataRow[] {
  return board.map((row, i) => ({
    label: (
      <>
        <span class="gm-rank">{i + 1}</span>
        <span class="gm-player">{row.name}</span>
      </>
    ),
    value: row.gold,
    extra: row.silver,
    more: [row.bronze],
    mine: row.userId === selfId,
  }));
}

/** A medal column's heading: the medal's picture, named for assistive technology. */
function MedalHeading({ medal }: { medal: 'gold' | 'silver' | 'bronze' }) {
  return (
    <>
      <MedalSprite medal={medal} scale={3} />
      <span class="visually-hidden">{MEDAL_NAME[medal]}</span>
    </>
  );
}

/**
 * The server's medal table, the one layout wherever it shows (the Games tab's cabinet, the living room's
 * trophy shelf popover): the shared data table with a column per medal under its picture (Misa,
 * 2026-10-28), rank and name first, yours marked. `limit` keeps the top few.
 */
export function MedalTable({
  board,
  selfId,
  limit,
  class: extra,
}: {
  board: readonly BoardRow[];
  selfId: string;
  limit?: number;
  class?: string;
}) {
  const shown = limit === undefined ? board : board.slice(0, limit);
  return (
    <DataTable
      class={`gm-board${extra === undefined ? '' : ` ${extra}`}`}
      headings={{
        label: 'Player',
        value: <MedalHeading medal="gold" />,
        extra: <MedalHeading medal="silver" />,
        more: [<MedalHeading key="bronze" medal="bronze" />],
      }}
      label="Medal table"
      sorted="value"
      tabular
      rows={boardRows(shown, selfId)}
    />
  );
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
      {board.length > 0 && <MedalTable board={board} selfId={selfId} />}
    </section>
  );
}
