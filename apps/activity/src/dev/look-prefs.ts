/**
 * The staging "Look" switch: which look and room band mode this device tries. Kept in localStorage under
 * dev-only keys (not the `lc.` prefix, so "Reset local flags" leaves them alone). Loaded by the staging
 * build only; production never sets a look.
 */
import { applyLook, applyRoom, isLook, isRoomMode, type LookId, type RoomMode } from '../looks';

export const LOOK_KEY = 'dev-look';
export const ROOM_KEY = 'dev-room';

/** The part of the Web Storage API this needs (so a test can pass a fake). */
export interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): PrefStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(key: string, storage: PrefStorage | null): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string, storage: PrefStorage | null): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

/** The stored look, or `current`. */
export function storedLook(storage: PrefStorage | null = browserStorage()): LookId {
  const value = read(LOOK_KEY, storage);
  return value !== null && isLook(value) ? value : 'current';
}

/** The stored room band mode, or `every`. */
export function storedRoom(storage: PrefStorage | null = browserStorage()): RoomMode {
  const value = read(ROOM_KEY, storage);
  return value !== null && isRoomMode(value) ? value : 'every';
}

/** Applies a look and remembers it. */
export function chooseLook(id: LookId, storage: PrefStorage | null = browserStorage()): void {
  applyLook(id);
  write(LOOK_KEY, id, storage);
}

/** Applies a room band mode and remembers it. */
export function chooseRoom(mode: RoomMode, storage: PrefStorage | null = browserStorage()): void {
  applyRoom(mode);
  write(ROOM_KEY, mode, storage);
}

/** Start-up: puts the remembered choices on the page. */
export function applyStoredLook(storage: PrefStorage | null = browserStorage()): void {
  applyLook(storedLook(storage));
  applyRoom(storedRoom(storage));
}
