/**
 * The Home board's display options, kept on the device (decisions.md 2026-10-24, Settings): a player's
 * preference for how the board looks, never sent to the server. Reading and writing both sit inside
 * try/catch, since Web Storage may be missing or blocked inside Discord; anything unreadable falls back to
 * `DEFAULT_BOARD_SETTINGS`, field by field, so one bad value never spoils the other.
 */
import {
  DEFAULT_BOARD_SETTINGS,
  IDLE_MODES,
  TILT_MODES,
  type BoardSettings,
  type IdleMode,
  type TiltMode,
} from './board';

/** The part of Web Storage the settings use (so tests can pass a fake). */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BOARD_SETTINGS_KEY = 'creatures:board-settings';

/** The browser's storage, or null where it is missing or blocked. */
export function browserSettingsStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** The saved options, or the defaults for anything missing, unknown or unreadable. */
export function loadBoardSettings(storage: SettingsStorage | null): BoardSettings {
  if (storage === null) return DEFAULT_BOARD_SETTINGS;
  try {
    const raw = storage.getItem(BOARD_SETTINGS_KEY);
    if (raw === null) return DEFAULT_BOARD_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BOARD_SETTINGS;
    const record = parsed as Record<string, unknown>;
    // An old saved `sway` (removed 2026-10-25) becomes `still`: the player liked a lean.
    const savedTilt = record['tilt'] === 'sway' ? 'still' : record['tilt'];
    return {
      tilt: pick<TiltMode>(savedTilt, TILT_MODES, DEFAULT_BOARD_SETTINGS.tilt),
      idle: pick<IdleMode>(record['idle'], IDLE_MODES, DEFAULT_BOARD_SETTINGS.idle),
    };
  } catch {
    return DEFAULT_BOARD_SETTINGS;
  }
}

/** Remembers the options. Returns false when the storage refused (the choice still holds until the app closes). */
export function saveBoardSettings(
  storage: SettingsStorage | null,
  settings: BoardSettings,
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(
      BOARD_SETTINGS_KEY,
      JSON.stringify({ tilt: settings.tilt, idle: settings.idle }),
    );
    return true;
  } catch {
    return false;
  }
}
