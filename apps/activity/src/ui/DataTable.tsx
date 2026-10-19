import type { ComponentChildren } from 'preact';

/** One row of a `DataTable`. */
export interface DataRow {
  /** What the row is ("HP", "Fusion", "Hearty Breakfast"). May hold a glossary tag. */
  label: ComponentChildren;
  /** Its value ("349", "1.25x"), at the right. */
  value: ComponentChildren;
  /** A second value in its own column after the first ("+204" of gear). Rows without one leave it empty. */
  extra?: ComponentChildren;
  /** A small picture before the label (the treat's icon). Decorative: the label says it all. */
  icon?: ComponentChildren;
  /** The closing row: a line above it and gold type ("Total 3.15x"). Put it last. */
  total?: boolean;
}

/**
 * A table of data in a darker panel: rows of label and value, with an optional second value column and an
 * optional gold total at the end. Use it wherever the screen is essentially a table (the creature page's
 * stats and facts, the experience multiplier's breakdown), so such tables look the same everywhere. Plain
 * `dl` markup with no rounded corners; the columns line up across rows. The type is the panel's own: a
 * pixel panel shows the pixel font, a popover its body font.
 */
export function DataTable({
  rows,
  tabular = false,
  bright = false,
  class: extra,
}: {
  rows: readonly DataRow[];
  /** Tabular figures, so numbers of equal length line up in a column (stats). Off for body-font text. */
  tabular?: boolean;
  /** Labels in the text colour instead of the muted one (a table inside a popover, where all is body text). */
  bright?: boolean;
  /** Where it is used (a hook for a test or a small tweak); never the look. */
  class?: string;
}) {
  const wide = rows.some((row) => row.extra !== undefined);
  const classes = [
    'data-table',
    wide ? 'wide' : '',
    tabular ? 'tabular' : '',
    bright ? 'bright' : '',
    extra ?? '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  return (
    <dl class={classes}>
      {rows.map((row, i) => (
        <div key={i} class={row.total === true ? 'data-row total' : 'data-row'}>
          <dt>
            {row.icon}
            {row.label}
          </dt>
          <dd>{row.value}</dd>
          {row.extra !== undefined && <dd class="data-extra">{row.extra}</dd>}
        </div>
      ))}
    </dl>
  );
}
