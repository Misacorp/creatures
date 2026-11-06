import type { IconRef } from './icon-ref';

/**
 * The shapes of a count badge and of one entry of a row of them, in a plain `.ts` file so view code that is no
 * component (and the worker's type check, which has no JSX) can name them. `ui/CountBadge.tsx` draws them.
 */
export interface CountBadgeProps {
  icon: IconRef;
  /** A number, or a short text for a range ("3–4") or a time ("51 min"). */
  amount?: number | string;
  /** What assistive technology says for a text amount instead of the text itself ("3 to 4"); a number is spoken as it is. */
  spokenAmount?: string;
  /** What assistive technology says with the amount ("Scrap: 3"); the icon never carries the meaning alone. */
  label?: string;
  /** The glossary entry it opens when tapped. Without one it is not a button (it can sit inside one). */
  entry?: string;
  /** A visible name after the number, for a badge that is not explained anywhere else. */
  name?: string;
  /**
   * `chip` (the default) is the ink chip of a reward or a cost line; `inline` is the same icon and number with no
   * chip, small enough to sit inside a sentence or a button's detail (a cost beside words, "Still needed:").
   */
  size?: 'chip' | 'inline';
}

/** One entry of a row of count badges: the props of a badge and a key for the list. */
export type CountItem = CountBadgeProps & { key: string };
