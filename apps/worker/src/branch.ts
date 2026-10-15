/**
 * The deployed branch, as `/api/config` shows it in the game's footer (so Misa can see which branch is
 * on staging). CI sets the `BRANCH` var at deploy time; anything outside a plain branch-name shape is
 * left out rather than shown, so the footer only ever shows text CI could have put there.
 */
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/;

export function shownBranch(value: unknown): string | undefined {
  return typeof value === 'string' && BRANCH_RE.test(value) ? value : undefined;
}
