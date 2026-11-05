import { describe, expect, it } from 'vitest';
import type { ValleyVisit } from '../api';
import { HOME_NOW, homeInput } from '../workbench/home-sample';
import {
  FIRE_SEATS,
  MAX_AT_FIRE,
  bonfireCalm,
  bonfireLine,
  fireStands,
  firesideOf,
  moreCount,
  restingOf,
  totalGained,
} from './bonfire-cast';
import { standSpots } from './place-plates';
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
  creatures: list.map((c, i) => ({ id: c.id, state: 'resting', gained: i * 10, catchUpBp: 10000 })),
  allowance: { store: 0, cap: 480, brought: 0 },
});

describe('who rests at the fire', () => {
  it('joins the server list to the creatures, skipping ids the client does not hold', () => {
    const visit = visitOf(creatures.slice(0, 3));
    visit.creatures.push({ id: 'ghost', state: 'resting', gained: 5, catchUpBp: 10000 });
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

  it('"+N more" counts the resting creatures that are not drawn, after the plates have fitted', () => {
    const many = restingOf(creatures, visitOf(creatures));
    const stands = fireStands(firesideOf(many, HOME_NOW));
    const art = { x: 40, y: 26 };
    const phone = standSpots(stands, art, { W: 130, H: 200, s: 3, top: 6 });
    const wide = standSpots(stands, art, { W: 500, H: 200, s: 4, top: 4 });
    expect(phone.length).toBeLessThanOrEqual(wide.length);
    expect(moreCount(12, phone.length)).toBe(12 - phone.length);
    expect(moreCount(3, 5)).toBe(0);
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
