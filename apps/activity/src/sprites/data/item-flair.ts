/**
 * Element flair for items that share a look (Misa, 2026-10-30): when element versions of one item
 * share a sprite (`itemLookId`), each element's version gets a small touch of its own drawn over the
 * shared shape, so the six charms of `trail-charm` are not only a colour swap. Spark is spiky, Grove
 * has vines or a leaf, Tide a drop or shell, Ember a flicker of flame, Mire a drip of mud or a reed.
 * The neutral version stays plain.
 *
 * Keyed by look id, then element. A flair is a 12x12 overlay: `.` keeps the shared sprite's pixel,
 * any other key replaces it. Its palette adds keys to the shared one; `t`, `u` and `h` are still
 * tinted by the element, other keys stay fixed. `gear-sprites.test.ts` checks that every element
 * version of a shared look has one.
 */
import type { Flair } from '../../gear-sprites';

export const ITEM_FLAIR: Readonly<Record<string, Readonly<Record<string, Flair>>>> = {};
