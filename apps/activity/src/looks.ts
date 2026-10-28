/**
 * The app-wide visual styles ("looks"). `current` is the game as it ships (no `data-look` attribute); every other
 * id is a style a stylesheet selects with `:root[data-look='<id>']`. Add an id here to offer it in the workbench's
 * `GameScreens` page and in `scripts/screens.mjs`. Dev tooling only: the shipped game never sets a look.
 */
export const LOOKS = ['current', 'arcade'] as const;

export type LookId = (typeof LOOKS)[number];

/** Whether `id` is one of the looks. */
export function isLook(id: string): id is LookId {
  return (LOOKS as readonly string[]).includes(id);
}

/** Puts a look on the page: sets `data-look` on the root element, or removes it for `current`. */
export function applyLook(id: string, root: HTMLElement = document.documentElement): void {
  if (id === 'current' || !isLook(id)) root.removeAttribute('data-look');
  else root.dataset['look'] = id;
}
