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
  /** The row is the viewer's own (a scoreboard's "You"): a lighter band behind it and gold type. */
  mine?: boolean;
}

/** The column headings of a `DataTable`, one per column. */
export interface DataHeadings {
  /** The label column ("Player"). */
  label: ComponentChildren;
  /** The value column ("Damage"); it may hold a "?" help tag after the word. */
  value: ComponentChildren;
  /** The extra column ("Score"). Give it whenever any row has an `extra` value. */
  extra?: ComponentChildren;
}

/** The classes of one row: `total` for the closing row, `mine` for the viewer's own. */
function rowClass(row: DataRow): string {
  const classes = ['data-row'];
  if (row.total === true) classes.push('total');
  if (row.mine === true) classes.push('mine');
  return classes.join(' ');
}

/**
 * A table of data in a darker panel: rows of label and value, with an optional second value column and an
 * optional gold total at the end. Use it wherever the screen is essentially a table (the creature page's
 * stats and facts, the experience multiplier's breakdown), so such tables look the same everywhere. Plain
 * `dl` markup with no rounded corners; the columns line up across rows. The type is the panel's own: a
 * pixel panel shows the pixel font, a popover its body font.
 *
 * With `headings` it is a real `table` instead, because a `dl` cannot name its columns: a header row of
 * column headings and each row's label as its row header, so a screen reader says the column and the row
 * for every value. Off by default; turn it on where the columns are not obvious from the values (a scoreboard).
 */
export function DataTable({
  rows,
  tabular = false,
  bright = false,
  headings,
  label,
  class: extra,
}: {
  rows: readonly DataRow[];
  /** Tabular figures, so numbers of equal length line up in a column (stats). Off for body-font text. */
  tabular?: boolean;
  /** Labels in the text colour instead of the muted one (a table inside a popover, where all is body text). */
  bright?: boolean;
  /** Column headings: a header row, and the table becomes a real `table`. Off by default, so other tables are unchanged. */
  headings?: DataHeadings;
  /** Names a table that has `headings` for assistive technology ("Scoreboard"). */
  label?: string;
  /** Where it is used (a hook for a test or a small tweak); never the look. */
  class?: string;
}) {
  const wide = rows.some((row) => row.extra !== undefined) || headings?.extra !== undefined;
  const classes = [
    'data-table',
    wide ? 'wide' : '',
    headings === undefined ? '' : 'headed',
    tabular ? 'tabular' : '',
    bright ? 'bright' : '',
    extra ?? '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  if (headings !== undefined) {
    return (
      <table class={classes} {...(label === undefined ? {} : { 'aria-label': label })}>
        <thead>
          <tr>
            <th scope="col">{headings.label}</th>
            <th scope="col">{headings.value}</th>
            {wide && <th scope="col">{headings.extra ?? ''}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} class={rowClass(row)}>
              <th scope="row">
                <span class="data-label">
                  {row.icon}
                  {row.label}
                </span>
              </th>
              <td>{row.value}</td>
              {wide && <td class="data-extra">{row.extra}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <dl class={classes}>
      {rows.map((row, i) => (
        <div key={i} class={rowClass(row)}>
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
