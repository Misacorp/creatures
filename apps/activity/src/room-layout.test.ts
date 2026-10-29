import { describe, expect, it } from 'vitest';
import {
  PAN_SPEED,
  assignSpots,
  dropSpotAt,
  dropSpotIds,
  edgeFill,
  fnv1a,
  initialScroll,
  panStep,
  roomScale,
  HERO_MAX_SCALE,
  HERO_SLACK,
  spotRect,
  type RoomGeometry,
  type SpotClaim,
} from './room-layout';
import { ROOM_SPOTS } from './sprites/room-art';

describe('roomScale', () => {
  it('goes up to the hero scale when asked (Home in the home room mode)', () => {
    expect(roomScale(1439, HERO_MAX_SCALE)).toEqual({ scale: 4, scroll: false });
    // The hero is asked with `HERO_SLACK` more, so a scrollbar does not drop 1440 from 5 to 4.
    expect(roomScale(1425 + HERO_SLACK, HERO_MAX_SCALE)).toEqual({ scale: 5, scroll: false });
    expect(roomScale(1423 + HERO_SLACK, HERO_MAX_SCALE)).toEqual({ scale: 4, scroll: false });
    expect(roomScale(1440, HERO_MAX_SCALE)).toEqual({ scale: 5, scroll: false });
    expect(roomScale(1728, HERO_MAX_SCALE)).toEqual({ scale: 6, scroll: false });
    expect(roomScale(1920, HERO_MAX_SCALE)).toEqual({ scale: 6, scroll: false });
    expect(roomScale(1920)).toEqual({ scale: 4, scroll: false });
    expect(roomScale(390, HERO_MAX_SCALE)).toEqual({ scale: 3, scroll: true });
  });

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

describe('assignSpots with claims', () => {
  const claims = (entries: [string, SpotClaim | null][]) => new Map(entries);

  it('seats a claim on the spot it names', () => {
    const result = assignSpots(
      'inst-1',
      ['1', '2', '3'],
      ROOM_SPOTS,
      claims([['2', { id: 'couch-middle', at: 100 }]]),
    );
    expect(result.get('2')).toBe('couch-middle');
    expect(new Set(result.values()).size).toBe(3);
  });

  it('lets the older claim win a spot, and the younger one falls back', () => {
    const result = assignSpots(
      'inst-1',
      ['1', '2'],
      ROOM_SPOTS,
      claims([
        ['1', { id: 'fire-pouf', at: 2000 }],
        ['2', { id: 'fire-pouf', at: 1000 }],
      ]),
    );
    expect(result.get('2')).toBe('fire-pouf');
    expect(result.get('1')).not.toBe('fire-pouf');
    expect(result.get('1')).toBeDefined();
  });

  it('breaks a tie of equal times by user id', () => {
    const tied = (ids: string[]) =>
      assignSpots(
        'inst-1',
        ids,
        ROOM_SPOTS,
        claims([
          ['20', { id: 'shelf-top', at: 5 }],
          ['3', { id: 'shelf-top', at: 5 }],
        ]),
      );
    expect(tied(['20', '3']).get('20')).toBe('shelf-top');
    expect(tied(['3', '20']).get('20')).toBe('shelf-top');
  });

  it('seats claims before everyone else, so nobody else takes a claimed spot', () => {
    // Every other user would prefer some spot; whoever claims the spot a hash prefers still gets it.
    const others = Array.from({ length: 15 }, (_, i) => String(4000 + i));
    const everyone = ['me', ...others];
    for (const spot of ROOM_SPOTS) {
      const result = assignSpots(
        'inst-1',
        everyone,
        ROOM_SPOTS,
        claims([['me', { id: spot.id, at: 1 }]]),
      );
      expect(result.get('me')).toBe(spot.id);
      expect(new Set(result.values()).size).toBe(16);
    }
  });

  it('falls back to the hash spot when the claim is not a spot of the room', () => {
    const plain = assignSpots('inst-1', ['1', '2'], ROOM_SPOTS);
    const result = assignSpots(
      'inst-1',
      ['1', '2'],
      ROOM_SPOTS,
      claims([['1', { id: 'removed-spot', at: 1 }]]),
    );
    expect([...result.entries()].sort()).toEqual([...plain.entries()].sort());
  });

  it('treats a null claim as no claim', () => {
    const plain = assignSpots('inst-1', ['1', '2'], ROOM_SPOTS);
    const result = assignSpots('inst-1', ['1', '2'], ROOM_SPOTS, claims([['1', null]]));
    expect([...result.entries()].sort()).toEqual([...plain.entries()].sort());
  });

  it('ignores a claim of someone who is not present', () => {
    const result = assignSpots(
      'inst-1',
      ['1'],
      ROOM_SPOTS,
      claims([['ghost', { id: 'couch-left', at: 1 }]]),
    );
    expect([...result.keys()]).toEqual(['1']);
  });

  it('does not depend on the order of the ids', () => {
    const ids = ['1', '2', '3', '4', '5'];
    const map = claims([
      ['1', { id: 'couch-left', at: 30 }],
      ['2', { id: 'couch-left', at: 10 }],
      ['3', { id: 'table-stool', at: 20 }],
      ['5', { id: 'removed', at: 5 }],
    ]);
    const base = assignSpots('inst-1', ids, ROOM_SPOTS, map);
    const reversed = assignSpots('inst-1', [...ids].reverse(), ROOM_SPOTS, map);
    expect([...reversed.entries()].sort()).toEqual([...base.entries()].sort());
    expect(base.get('2')).toBe('couch-left');
    expect(base.get('3')).toBe('table-stool');
    expect(base.get('1')).not.toBe('couch-left');
  });

  it('keeps claimed users in the room when there are more users than spots', () => {
    const many = Array.from({ length: 20 }, (_, i) => String(5000 + i));
    for (const last of ['5000', '5019']) {
      const result = assignSpots(
        'inst-1',
        many,
        ROOM_SPOTS,
        claims([[last, { id: 'shelf-top', at: 1 }]]),
      );
      expect(result.size).toBe(16);
      expect(result.get(last)).toBe('shelf-top');
    }
  });
});

describe('dropSpotIds', () => {
  const occupied = new Map([
    ['couch-left', 'a'],
    ['couch-middle', 'me'],
    ['table-stool', 'b'],
  ]);

  it('lists every empty spot and the mover own spot, in room order', () => {
    const ids = dropSpotIds(ROOM_SPOTS, occupied, 'me');
    expect(ids).toHaveLength(ROOM_SPOTS.length - 2);
    expect(ids).toContain('couch-middle');
    expect(ids).not.toContain('couch-left');
    expect(ids).not.toContain('table-stool');
    expect(ids).toEqual(ROOM_SPOTS.map((s) => s.id).filter((id) => ids.includes(id)));
  });

  it('offers every spot to someone who is alone', () => {
    expect(dropSpotIds(ROOM_SPOTS, new Map([['window-sill', 'me']]), 'me')).toHaveLength(16);
  });

  it('offers nothing but the own spot in a full room', () => {
    const full = new Map(ROOM_SPOTS.map((s, i) => [s.id, i === 0 ? 'me' : `u${String(i)}`]));
    expect(dropSpotIds(ROOM_SPOTS, full, 'me')).toEqual([ROOM_SPOTS[0]?.id]);
  });
});

describe('dropSpotAt', () => {
  // The view starts 10 px from the left and 20 px from the top of the window, at scale 3, unscrolled.
  const geo: RoomGeometry = {
    view: { left: 10, top: 20, right: 10 + 390, bottom: 20 + 168 },
    scrollLeft: 0,
    originX: 0,
    scale: 3,
  };
  const all = ROOM_SPOTS.map((s) => s.id);
  const spot = (id: string) => {
    const found = ROOM_SPOTS.find((s) => s.id === id);
    if (found === undefined) throw new Error(id);
    return found;
  };

  it('puts a spot footprint where the room is on screen', () => {
    // couch-middle is at x 72, y 28: 216 px and 84 px into the room, 48 px square.
    expect(spotRect(spot('couch-middle'), geo)).toEqual({
      left: 10 + 216,
      top: 20 + 84,
      right: 10 + 216 + 48,
      bottom: 20 + 84 + 48,
    });
  });

  it('follows the scroll and the centring offset', () => {
    const moved = spotRect(spot('couch-middle'), { ...geo, scrollLeft: 100, originX: 6 });
    expect(moved.left).toBe(10 + 6 + 216 - 100);
  });

  it('finds the spot under the pointer', () => {
    const rect = spotRect(spot('window-sill'), geo);
    const inside = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    expect(dropSpotAt(inside, ROOM_SPOTS, all, geo)).toBe('window-sill');
  });

  it('finds nothing over a spot that is not a candidate', () => {
    const rect = spotRect(spot('couch-left'), geo);
    const inside = { x: rect.left + 24, y: rect.top + 24 };
    const without = all.filter((id) => id !== 'couch-left');
    expect(dropSpotAt(inside, ROOM_SPOTS, without, geo)).toBeNull();
  });

  it('finds nothing outside the room view', () => {
    const rect = spotRect(spot('window-sill'), geo);
    const above = { x: rect.left + 24, y: geo.view.top - 5 };
    expect(dropSpotAt(above, ROOM_SPOTS, all, geo)).toBeNull();
    // A spot scrolled out of sight is no target, even if the pointer is over where it would be.
    const scrolled = { ...geo, scrollLeft: 0 };
    const right = spotRect(spot('shelf-beanbag'), scrolled);
    expect(right.left).toBeGreaterThan(scrolled.view.right);
    expect(
      dropSpotAt({ x: right.left + 10, y: right.top + 10 }, ROOM_SPOTS, all, scrolled),
    ).toBeNull();
  });

  it('prefers the nearer centre where two footprints overlap', () => {
    // window-sill (16,22) and window-cushion (30,35) overlap at room px x 90..96, y 105..114.
    const at = (x: number, y: number) => ({ x: 10 + x, y: 20 + y });
    expect(dropSpotAt(at(91, 106), ROOM_SPOTS, all, geo)).toBe('window-sill');
    expect(dropSpotAt(at(95, 113), ROOM_SPOTS, all, geo)).toBe('window-cushion');
  });

  it('lets a little slop catch a pointer just off a spot', () => {
    const wide = { ...geo, view: { ...geo.view, right: 1000 } };
    const rect = spotRect(spot('table-stool'), wide);
    const near = { x: rect.right + 3, y: (rect.top + rect.bottom) / 2 };
    expect(dropSpotAt(near, ROOM_SPOTS, ['table-stool'], wide)).toBeNull();
    expect(dropSpotAt(near, ROOM_SPOTS, ['table-stool'], wide, 4)).toBe('table-stool');
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
