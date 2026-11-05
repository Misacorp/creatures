import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyLook,
  applyRoom,
  isLook,
  isRoomMode,
  LOOKS,
  readRoom,
  ROOM_EVENT,
  ROOM_MODES,
} from './looks';

function fakeRoot() {
  const attrs = new Map<string, string>();
  const root = {
    dataset: {} as Record<string, string>,
    removeAttribute: (name: string) => {
      attrs.delete(name);
      delete root.dataset['look'];
    },
  };
  return root as unknown as HTMLElement;
}

describe('looks', () => {
  it('starts with the current look', () => {
    expect(LOOKS[0]).toBe('current');
    expect(isLook('current')).toBe(true);
    expect(isLook('nope')).toBe(false);
  });

  it('removes data-look for current and unknown ids', () => {
    const root = fakeRoot();
    root.dataset['look'] = 'x';
    applyLook('current', root);
    expect(root.dataset['look']).toBeUndefined();
  });
});

describe('room modes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('start with every, the game default, and know home', () => {
    expect(ROOM_MODES).toEqual(['every', 'home']);
    expect(isRoomMode('home')).toBe(true);
    expect(isRoomMode('nope')).toBe(false);
  });

  it('read every when data-room is absent or unknown', () => {
    const root = fakeRoot();
    expect(readRoom(root)).toBe('every');
    root.dataset['room'] = 'nope';
    expect(readRoom(root)).toBe('every');
    root.dataset['room'] = 'home';
    expect(readRoom(root)).toBe('home');
  });

  it('set data-room for home, remove it for every and unknown values, and tell the frame', () => {
    const seen: string[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => seen.push(event.type),
    });
    const root = fakeRoot();
    applyRoom('home', root);
    expect(root.dataset['room']).toBe('home');
    applyRoom('every', root);
    expect(root.dataset['room']).toBeUndefined();
    root.dataset['room'] = 'home';
    applyRoom('nope', root);
    expect(root.dataset['room']).toBeUndefined();
    expect(seen).toEqual([ROOM_EVENT, ROOM_EVENT, ROOM_EVENT]);
  });
});
