import { describe, expect, it } from 'vitest';
import {
  PAN_SPEED,
  assignSpots,
  edgeFill,
  fnv1a,
  initialScroll,
  panStep,
  roomScale,
} from './room-layout';
import { ROOM_SPOTS } from './sprites/room-art';

describe('roomScale', () => {
  it('picks the largest integer scale from 2 to 4 at which the whole room fits', () => {
    expect(roomScale(576)).toEqual({ scale: 2, scroll: false });
    expect(roomScale(863)).toEqual({ scale: 2, scroll: false });
    expect(roomScale(864)).toEqual({ scale: 3, scroll: false });
    expect(roomScale(1151)).toEqual({ scale: 3, scroll: false });
    expect(roomScale(1152)).toEqual({ scale: 4, scroll: false });
    expect(roomScale(1200)).toEqual({ scale: 4, scroll: false });
    expect(roomScale(4000)).toEqual({ scale: 4, scroll: false });
  });

  it('scrolls at scale 3 when even scale 2 does not fit', () => {
    expect(roomScale(390)).toEqual({ scale: 3, scroll: true });
    expect(roomScale(575)).toEqual({ scale: 3, scroll: true });
    expect(roomScale(0)).toEqual({ scale: 3, scroll: true });
    expect(roomScale(Number.NaN)).toEqual({ scale: 3, scroll: true });
  });
});

describe('edgeFill', () => {
  it('needs no tiles when the room fills or overflows the width', () => {
    expect(edgeFill(576, 2)).toEqual({ left: 0, right: 0 });
    expect(edgeFill(864, 3)).toEqual({ left: 0, right: 0 });
    expect(edgeFill(390, 3)).toEqual({ left: 0, right: 0 });
  });

  it('fills each side with whole tiles, rounding up', () => {
    // 1200 at scale 4: room 1152, 24 px each side, tile 64 px: one each.
    expect(edgeFill(1200, 4)).toEqual({ left: 1, right: 1 });
    // 1000 at scale 3: room 864, 68 px each side, tile 48 px: two each.
    expect(edgeFill(1000, 3)).toEqual({ left: 2, right: 2 });
    // 1920 at scale 4: room 1152, 384 px each side, tile 64 px: six each.
    expect(edgeFill(1920, 4)).toEqual({ left: 6, right: 6 });
    // 700 at scale 2: room 576, 62 px each side, tile 32 px: two each.
    expect(edgeFill(700, 2)).toEqual({ left: 2, right: 2 });
  });

  it('handles an odd spare width: the right side gets the extra pixel', () => {
    // 865 at scale 3: spare 1 px: left gap 0 (no tile), right gap 1 (one tile).
    expect(edgeFill(865, 3)).toEqual({ left: 0, right: 1 });
  });
});

describe('fnv1a', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });
});

describe('assignSpots', () => {
  const ids = ['1001', '1002', '1003', '1004', '1005', '1006', '1007'];

  it('gives every user their own spot', () => {
    const result = assignSpots('inst-1', ids, ROOM_SPOTS);
    expect(result.size).toBe(ids.length);
    expect(new Set(result.values()).size).toBe(ids.length);
    const known = new Set(ROOM_SPOTS.map((s) => s.id));
    for (const spot of result.values()) expect(known.has(spot)).toBe(true);
  });

  it('gives a lone user the spot their hash prefers', () => {
    const result = assignSpots('inst-1', ['1001'], ROOM_SPOTS);
    const preferred = ROOM_SPOTS[fnv1a('inst-1:1001') % 16];
    expect(result.get('1001')).toBe(preferred?.id);
  });

  it('does not depend on the order the ids arrive in', () => {
    const base = assignSpots('inst-1', ids, ROOM_SPOTS);
    const reversed = assignSpots('inst-1', [...ids].reverse(), ROOM_SPOTS);
    const shuffled = assignSpots(
      'inst-1',
      [ids[3], ids[0], ids[6], ids[2], ids[5], ids[1], ids[4]].filter((x) => x !== undefined),
      ROOM_SPOTS,
    );
    expect([...reversed.entries()].sort()).toEqual([...base.entries()].sort());
    expect([...shuffled.entries()].sort()).toEqual([...base.entries()].sort());
  });

  it('reshuffles for another activity instance', () => {
    const a = assignSpots('inst-1', ids, ROOM_SPOTS);
    const b = assignSpots('inst-2', ids, ROOM_SPOTS);
    expect([...a.entries()]).not.toEqual([...b.entries()]);
  });

  it('counts a repeated id once', () => {
    const once = assignSpots('inst-1', ['1001', '1002'], ROOM_SPOTS);
    const twice = assignSpots('inst-1', ['1001', '1002', '1001'], ROOM_SPOTS);
    expect([...twice.entries()].sort()).toEqual([...once.entries()].sort());
  });

  it('moves a collision to the next free spot, wrapping at the end', () => {
    const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    // Find two users whose preferred spot is the same, and one whose preference is the last spot.
    const instance = 'wrap';
    const prefer = (u: string): number => fnv1a(`${instance}:${u}`) % 3;
    const same: string[] = [];
    for (let i = 0; same.length < 2; i++) if (prefer(String(i)) === 2) same.push(String(i));
    const result = assignSpots(instance, same, three);
    const spots = same.map((u) => result.get(u));
    // The user placed first keeps spot c; the second wraps to a.
    expect([...spots].sort()).toEqual(['a', 'c']);
  });

  it('breaks a collision by hash order, then by id', () => {
    const two = [{ id: 'left' }, { id: 'right' }];
    // With one spot and two users, the lower (hash, id) pair wins.
    const instance = 'tie';
    const users = ['p', 'q'];
    const winner = [...users].sort(
      (x, y) => fnv1a(`${instance}:${x}`) - fnv1a(`${instance}:${y}`) || x.localeCompare(y),
    )[0];
    const result = assignSpots(instance, users, two.slice(0, 1));
    expect(result.size).toBe(1);
    expect(result.has(winner ?? '')).toBe(true);
  });

  it('leaves the extra users without a spot when there are more users than spots', () => {
    const many = Array.from({ length: 20 }, (_, i) => String(2000 + i));
    const result = assignSpots('inst-1', many, ROOM_SPOTS);
    expect(result.size).toBe(16);
    expect(new Set(result.values()).size).toBe(16);
    // The same 16 are chosen whatever the order.
    const again = assignSpots('inst-1', [...many].reverse(), ROOM_SPOTS);
    expect([...again.entries()].sort()).toEqual([...result.entries()].sort());
  });

  it('seats exactly 16 users in all 16 spots', () => {
    const sixteen = Array.from({ length: 16 }, (_, i) => String(3000 + i));
    const result = assignSpots('inst-1', sixteen, ROOM_SPOTS);
    expect(new Set(result.values())).toEqual(new Set(ROOM_SPOTS.map((s) => s.id)));
  });

  it('returns nothing for no users or no spots', () => {
    expect(assignSpots('inst-1', [], ROOM_SPOTS).size).toBe(0);
    expect(assignSpots('inst-1', ['1001'], []).size).toBe(0);
  });
});

describe('initialScroll', () => {
  it('centres the spot in the viewport', () => {
    // Spot at x 112 (centre 120) at scale 3 is 360 px in; a 390 px viewport starts 165 px before it.
    expect(initialScroll(112, 3, 390, 864)).toBe(165);
  });

  it('clamps to the start and to the end', () => {
    expect(initialScroll(0, 3, 390, 864)).toBe(0);
    expect(initialScroll(16, 3, 390, 864)).toBe(0);
    expect(initialScroll(272, 3, 390, 864)).toBe(474);
  });

  it('is zero when the room is no wider than the viewport', () => {
    expect(initialScroll(200, 3, 900, 864)).toBe(0);
  });
});

describe('panStep', () => {
  it('moves about 8 CSS px per second', () => {
    expect(PAN_SPEED).toBe(8);
    expect(panStep(100, 1, 474, 250)).toEqual({ scrollLeft: 102, direction: 1 });
    expect(panStep(100, -1, 474, 125)).toEqual({ scrollLeft: 99, direction: -1 });
    // Sixty frames of 16 ms is about a second: close to 8 px.
    let state = { scrollLeft: 0, direction: 1 as 1 | -1 };
    for (let i = 0; i < 62; i++) state = panStep(state.scrollLeft, state.direction, 474, 16);
    expect(state.scrollLeft).toBeCloseTo(7.936, 3);
  });

  it('turns around at the right end and at the left end', () => {
    expect(panStep(473, 1, 474, 250)).toEqual({ scrollLeft: 474, direction: -1 });
    expect(panStep(1, -1, 474, 250)).toEqual({ scrollLeft: 0, direction: 1 });
  });

  it('ping-pongs over time', () => {
    let state = { scrollLeft: 0, direction: 1 as 1 | -1 };
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      state = panStep(state.scrollLeft, state.direction, 4, 250);
      seen.push(state.scrollLeft);
    }
    // 2, 4 (end, turn), 2, 0 (start, turn)
    expect(seen).toEqual([2, 4, 2, 0]);
    expect(state.direction).toBe(1);
  });

  it('caps one step at 250 ms and ignores a negative step', () => {
    expect(panStep(100, 1, 474, 60_000)).toEqual({ scrollLeft: 102, direction: 1 });
    expect(panStep(100, 1, 474, -5)).toEqual({ scrollLeft: 100, direction: 1 });
  });

  it('stays at 0 when there is nothing to scroll', () => {
    expect(panStep(0, 1, 0, 1000)).toEqual({ scrollLeft: 0, direction: 1 });
  });
});
