/**
 * The app-wide visual styles ("looks"). `current` is the game as it ships (no `data-look` attribute); every other
 * id is a style a stylesheet selects with `:root[data-look='<id>']`. Add an id here to offer it in the workbench's
 * `GameScreens` page and in `scripts/screens.mjs`. Dev tooling only: the shipped game never sets a look.
 */
export const LOOKS = ['current', 'arcade', 'hearth', 'quest'] as const;

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

/**
 * Where the living room is drawn on a wide window (a phone always has it at the top of Home). `every`: the band
 * under the HUD on every place (the game's default). `home`: only on Home, drawn taller as its hero; the other
 * places start under the HUD. A stylesheet selects `home` with `:root[data-room='home']`; `every` has no attribute.
 * The room's presence and XP run either way (`Game`), only the drawing changes.
 */
export const ROOM_MODES = ['every', 'home'] as const;

export type RoomMode = (typeof ROOM_MODES)[number];

/** The event `applyRoom` fires on the window, so what is drawn follows a switch without a reload. */
export const ROOM_EVENT = 'leet-room-mode';

/** Whether `mode` is one of the room modes. */
export function isRoomMode(mode: string): mode is RoomMode {
  return (ROOM_MODES as readonly string[]).includes(mode);
}

/** The mode on the page: `data-room` of the root element, `every` when absent or unknown. */
export function readRoom(root: HTMLElement = document.documentElement): RoomMode {
  const mode = root.dataset['room'];
  return mode !== undefined && isRoomMode(mode) ? mode : 'every';
}

/**
 * Puts a room mode on the page: sets `data-room` on the root element (removes it for `every` and unknown values)
 * and tells the frame (`useRoomMode`). Needs no rebuild: the staging DEV switch and the workbench call it.
 */
export function applyRoom(mode: string, root: HTMLElement = document.documentElement): void {
  if (mode === 'home') root.dataset['room'] = 'home';
  else delete root.dataset['room'];
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ROOM_EVENT));
}
