import type { ComponentChildren, Ref } from 'preact';

/** The window width from which the columns sit side by side; below it they stack in one column. */
export type ColumnsFrom = '60rem' | '80rem';

/**
 * How the width is shared (the first column's share to the second's). `1-3` keeps the first at 18 rem or more
 * (the Workshop's jobs beside the bag), `2-3` keeps it at 26 rem or more (the dungeon's team beside the map),
 * `5-4` the Raid's boss beside the roster.
 */
export type ColumnsRatio = '1-3' | '2-3' | '5-4';

export interface ColumnsProps {
  /** The width from which there are two columns. Below it the `Column`s vanish and the children stack as one list. */
  from: ColumnsFrom;
  ratio: ColumnsRatio;
  /** Extra classes on the root (the screen's own, for example its phone spacing). */
  class?: string | undefined;
  rootRef?: Ref<HTMLDivElement> | undefined;
  /** `Column`s; any other child spans both columns (a notice above the work, a reveal card). */
  children?: ComponentChildren;
}

/**
 * A screen's two columns on a desktop that collapse into one list on a phone (the Workshop, the open dungeon
 * run, the Raid): the one place that builds "two columns, and the wrappers vanish below a width". Never write a
 * second one in a view's CSS (`columns-guard.test.ts` fails on a hand-built `display: contents` wrapper). Below
 * `from` the root is a plain block (or whatever the screen's own class makes it) and each `Column` is
 * `display: contents`, so the children flow as if there were no columns and keep their phone order.
 */
export function Columns({ from, ratio, class: extra, rootRef, children }: ColumnsProps) {
  const classes = ['cols', `cols-${from.slice(0, 2)}`, `cols-r-${ratio}`, extra ?? '']
    .filter((c) => c !== '')
    .join(' ');
  return (
    <div {...(rootRef === undefined ? {} : { ref: rootRef })} class={classes}>
      {children}
    </div>
  );
}

export interface ColumnProps {
  /** Stays in view while the page scrolls past the other column; only while the window is tall enough to hold it (`min-height: 48rem`). */
  sticky?: boolean | undefined;
  /** Stack the column's children with a gap (`tight` 0.5 rem, `roomy` 0.75 rem); absent: a plain block. */
  stack?: 'tight' | 'roomy' | undefined;
  class?: string | undefined;
  children?: ComponentChildren;
}

/** One column of `Columns`. */
export function Column({ sticky = false, stack, class: extra, children }: ColumnProps) {
  const classes = [
    'col',
    sticky ? 'col-sticky' : '',
    stack === undefined ? '' : `col-stack-${stack}`,
    extra ?? '',
  ]
    .filter((c) => c !== '')
    .join(' ');
  return <div class={classes}>{children}</div>;
}
