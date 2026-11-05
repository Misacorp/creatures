import { describe, expect, it } from 'vitest';
import type { ValleyVisit } from '../api';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import {
  FIRE_SEATS,
  MAX_AT_FIRE,
  bonfireCalm,
  bonfireLine,
  FIRE_BOX,
  fireSpots,
  moreSpot,
  firesideOf,
  moreCount,
  restingOf,
  totalGained,
} from './bonfire-cast';
import { PLATE_ROW_PX, PLATE_MAX_PX, crowded, plateGap, standBounds } from './place-plates';
import { placeStates } from './place-state';
import { trayBadge, trayFor } from './tray-state';

const base = homeInput('busy', true);
const creatures = Array.from({ length: 12 }, (_, i) => {
  const from = base.creatures[i % base.creatures.length];
  if (from === undefined) throw new Error('no fixture creature');
  return { ...from, id: `c${String(i)}`, busy: null, away: false };
});
const visitOf = (list: typeof creatures, at = HOME_NOW): ValleyVisit => ({
  settledAt: at,
  arrived: true,
  awayHours: 3,
  creatures: list.map((c, i) => ({
    id: c.id,
    state: 'resting',
    gained: i * 10,
    catchUpBp: 10000,
    seatId: null,
  })),
  allowance: { store: 0, cap: 480, brought: 0 },
  seats: [],
  seatPrices: { owned: 0, max: 2, next: 0, ladder: [0, 113] },
  kit: { owned: [], price: 875 },
  places: [],
  night: false,
  special: null,
});

describe('who rests at the fire', () => {
  it('joins the server list to the creatures, skipping ids the client does not hold', () => {
    const visit = visitOf(creatures.slice(0, 3));
    visit.creatures.push({
      id: 'ghost',
      state: 'resting',
      gained: 5,
      catchUpBp: 10000,
      seatId: null,
    });
    const resting = restingOf(creatures, visit);
    expect(resting.map((r) => r.creature.id)).toEqual(['c0', 'c1', 'c2']);
    expect(totalGained(resting)).toBe(30);
  });

  it('seats everyone while they fit, else a rotating few that turns each hour', () => {
    const few = restingOf(creatures, visitOf(creatures.slice(0, 5)));
    expect(firesideOf(few, HOME_NOW)).toHaveLength(5);
    const many = restingOf(creatures, visitOf(creatures));
    const now = firesideOf(many, HOME_NOW).map((r) => r.creature.id);
    const later = firesideOf(many, HOME_NOW + 3_600_000).map((r) => r.creature.id);
    expect(now).toHaveLength(MAX_AT_FIRE);
    expect(later).not.toEqual(now);
    expect(firesideOf(many, HOME_NOW).map((r) => r.creature.id)).toEqual(now);
    expect(MAX_AT_FIRE).toBeLessThanOrEqual(FIRE_SEATS.length);
  });

  it('"+N more" counts the resting creatures that are not drawn, after the seats have fitted', () => {
    const many = restingOf(creatures, visitOf(creatures));
    const fireside = firesideOf(many, HOME_NOW);
    const art = { x: 40, y: 26 };
    const phone = fireSpots(fireside, art, { W: 130, H: 200, s: 3, top: 6 });
    const wide = fireSpots(fireside, art, { W: 500, H: 200, s: 4, top: 4 });
    expect(phone.length).toBeLessThanOrEqual(wide.length);
    expect(wide).toHaveLength(MAX_AT_FIRE);
    expect(fireSpots(fireside, { x: 6, y: 24 }, { W: 68, H: 200, s: 5, top: 4 })).toHaveLength(
      MAX_AT_FIRE,
    );
    expect(moreCount(12, phone.length)).toBe(12 - phone.length);
    expect(moreCount(3, 5)).toBe(0);
  });
});

describe('the ring round the fire', () => {
  const many = firesideOf(restingOf(creatures, visitOf(creatures)), HOME_NOW);
  const centre = { x: FIRE_BOX.width / 2, y: 32 };
  const scenes = [
    { W: 68, H: 200, s: 5, top: 4 },
    { W: 80, H: 200, s: 4, top: 4 },
    { W: 85, H: 200, s: 4, top: 4 },
    { W: 130, H: 200, s: 3, top: 6 },
    { W: 233, H: 200, s: 3, top: 6 },
    { W: 275, H: 220, s: 4, top: 4 },
    { W: 360, H: 220, s: 4, top: 4 },
  ];

  it('every seat is in the band of an ellipse about the fire, the same at every size', () => {
    for (const seat of FIRE_SEATS) {
      const dx = (seat.x + 8 - centre.x) / 24;
      const dy = (seat.y + 8 - centre.y) / 32;
      const r = Math.hypot(dx, dy);
      expect(r).toBeGreaterThan(0.85);
      expect(r).toBeLessThan(1.3);
    }
    // Relative to the fire, not the scene: moving the fire moves every spot by the same amount.
    for (const scene of scenes) {
      const a = fireSpots(many, { x: 100, y: 30 }, { ...scene, W: 400 });
      for (const spot of a) {
        const seat = FIRE_SEATS.find((s) => s.x + 100 === spot.x && s.y + 30 === spot.y);
        expect(seat).toBeDefined();
      }
    }
  });

  it('plates never overlap, everyone is inside the scene, and a front plate never covers the fire', () => {
    for (const scene of scenes) {
      const art = { x: Math.floor(scene.W / 2) - FIRE_BOX.width / 2, y: scene.top + 20 };
      const spots = fireSpots(many, art, scene);
      const gap = plateGap(scene.s);
      const bounds = standBounds(scene);
      spots.forEach((a, i) => {
        expect(a.x).toBeGreaterThanOrEqual(bounds.x);
        expect(a.x).toBeLessThan(bounds.x + bounds.width);
        expect(a.y).toBeLessThan(bounds.y + bounds.height);
        spots.slice(i + 1).forEach((b) => {
          expect(crowded(a, b, gap)).toBe(false);
        });
        // A creature whose feet are in the fire box's lower part is in front: its plate (under its feet) is clear of the fire's box.
        if (a.y + 16 > art.y + FIRE_BOX.height - 8) {
          const half = PLATE_MAX_PX / scene.s / 2;
          const plate = {
            left: a.x + 8 - half,
            right: a.x + 8 + half,
            top: a.y + 16,
            bottom: a.y + 16 + Math.ceil(PLATE_ROW_PX / scene.s),
          };
          const overlaps =
            plate.left < art.x + FIRE_BOX.width &&
            plate.right > art.x &&
            plate.top < art.y + FIRE_BOX.height &&
            plate.bottom > art.y;
          expect(overlaps, `plate of ${a.creature.id} over the fire at s=${String(scene.s)}`).toBe(
            false,
          );
        }
      });
    }
  });

  it('the "+N more" button sits under the front seat, clear of the creatures', () => {
    const art = { x: 40, y: 26 };
    const at = moreSpot(art, 3);
    const front = fireSpots(many, art, { W: 130, H: 200, s: 3, top: 6 })[0];
    expect(at.x).toBe((front?.x ?? 0) + 8);
    expect(at.y).toBeGreaterThan((front?.y ?? 0) + 16);
  });
});

describe('what the place says', () => {
  it('the Places line counts the resting and the visit gain; it is open only with the valley block', () => {
    const visit = visitOf(creatures.slice(0, 4));
    expect(bonfireLine(visit, creatures)).toBe('4 resting, +60 XP');
    expect(bonfireLine(null, creatures)).toBeNull();
    const none = { ...visit, creatures: visit.creatures.map((r) => ({ ...r, gained: 0 })) };
    expect(bonfireLine(none, creatures)).toBe('4 resting');
    expect(placeStates({ ...base, creatures, visit }).bonfire).toBe('4 resting, +60 XP');
    expect(placeStates(base).bonfire).toBe('not open yet');
  });

  it('the calm line shows only the total, and nothing when there is none', () => {
    expect(bonfireCalm(restingOf(creatures, visitOf(creatures.slice(0, 4))))).toBe(
      '+60 XP this visit',
    );
    expect(bonfireCalm([])).toBe('');
  });
});

describe('the tray says resting', () => {
  const input = { trips: [], jobs: null, now: HOME_NOW, resting: new Set(['c0']) };
  it('a creature the server says rests is Resting; others are as before', () => {
    const c0 = creatures[0];
    const c1 = creatures[1];
    if (c0 === undefined || c1 === undefined) throw new Error('fixtures');
    expect(trayBadge(c0, input).state).toBe('resting');
    expect(trayBadge(c0, input).label).toContain('Resting');
    expect(trayBadge(c1, input).state).not.toBe('resting');
    expect(trayBadge(c0, { ...input, resting: new Set() }).state).not.toBe('resting');
    expect(trayFor(creatures, input)).toHaveLength(creatures.length);
  });
});
