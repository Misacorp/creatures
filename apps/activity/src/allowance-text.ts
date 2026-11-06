import type { Allowance } from './api';
import { acornCount, type Say } from './resource-count';

/** The one line shown when the daily allowance lands ("Daily allowance: +25" and the Bait icon), or null when nothing landed. */
export function allowanceNotice(allowance: Allowance | null): Say | null {
  return allowance === null ? null : ['Daily allowance: +', acornCount(allowance.amount)];
}
