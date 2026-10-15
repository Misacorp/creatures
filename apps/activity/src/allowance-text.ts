import type { Allowance } from './api';

/** The one plain-text line shown when the daily Bait allowance lands, or null when nothing landed. */
export function allowanceNotice(allowance: Allowance | null): string | null {
  return allowance === null ? null : `Daily allowance: +${String(allowance.amount)} Bait`;
}
