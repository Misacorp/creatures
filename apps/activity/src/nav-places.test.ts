import { describe, expect, it } from 'vitest';
import {
  DOCK_GAP_PX,
  dockCapacity,
  moreAlert,
  navPlaces,
  splitDock,
  type DockWidths,
  type NavPlace,
} from './nav-places';
import { ALERT_TEXT, NO_ALERTS } from './tab-alerts';
import { TABS } from './tabs';

function place(id: string, pip: string | null = null): NavPlace {
  return { id, label: id.toUpperCase(), glyph: 'paw', pip };
}

const NINE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => place(id));
const ids = (list: readonly NavPlace[]): string[] => list.map((p) => p.id);

describe('the place list', () => {
  it('is the six tabs in their order, each with its pip from the alerts', () => {
    const places = navPlaces({ ...NO_ALERTS, workshop: ALERT_TEXT.jobReady });
    expect(ids(places)).toEqual(TABS.map((t) => t.id));
    expect(places.map((p) => p.label)).toEqual(TABS.map((t) => t.label));
    expect(places.find((p) => p.id === 'workshop')?.pip).toBe('a job is ready');
    expect(places.filter((p) => p.pip !== null)).toHaveLength(1);
  });
});

describe('splitDock', () => {
  it('shows every place, with no More, when they all fit', () => {
    const six = NINE.slice(0, 6);
    const split = splitDock(six, 'c', 6);
    expect(ids(split.dock)).toEqual(ids(six));
    expect(split.more).toEqual([]);
    expect(splitDock(six, 'c', 9).more).toEqual([]);
  });

  it('keeps the first places and sends the rest to More, one button short for More itself', () => {
    const split = splitDock(NINE, 'a', 5);
    expect(ids(split.dock)).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(split.more)).toEqual(['e', 'f', 'g', 'h', 'i']);
  });

  it('always shows the active place: it takes the last button, the others stay put', () => {
    const split = splitDock(NINE, 'h', 5);
    expect(ids(split.dock)).toEqual(['a', 'b', 'c', 'h']);
    // The displaced place moved into More, which stays in list order.
    expect(ids(split.more)).toEqual(['d', 'e', 'f', 'g', 'i']);
    expect(split.dock.map((p) => p.id)).toContain('h');
  });

  it('shows an active place that is already in the dock where it is', () => {
    expect(ids(splitDock(NINE, 'b', 5).dock)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts every place in exactly one of dock and More', () => {
    for (let capacity = 2; capacity <= 9; capacity += 1) {
      for (const active of ids(NINE)) {
        const { dock, more } = splitDock(NINE, active, capacity);
        expect([...ids(dock), ...ids(more)].sort()).toEqual(ids(NINE));
        expect(ids(dock)).toContain(active);
        expect(dock.length + (more.length > 0 ? 1 : 0)).toBeLessThanOrEqual(capacity);
      }
    }
  });

  it('keeps the active place even when only one place fits beside More', () => {
    const split = splitDock(NINE, 'i', 2);
    expect(ids(split.dock)).toEqual(['i']);
    expect(split.more).toHaveLength(8);
  });

  it('ignores an unknown active id', () => {
    expect(ids(splitDock(NINE, 'zzz', 5).dock)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('moreAlert, the roll-up pip', () => {
  it('is absent while nothing in More waits', () => {
    expect(moreAlert([])).toBeNull();
    expect(moreAlert([place('a'), place('b')])).toBeNull();
  });

  it('names the one place that waits, with its reason', () => {
    expect(moreAlert([place('a'), place('b', 'a trip is home')])).toBe('B: a trip is home');
  });

  it('counts several', () => {
    expect(moreAlert([place('a', 'x'), place('b', 'y'), place('c')])).toBe('2 places need you');
  });
});

describe('dockCapacity, what fits the measured width', () => {
  const widths: DockWidths = {
    places: Object.fromEntries(NINE.map((p) => [p.id, 60])),
    more: 44,
  };
  const gap = DOCK_GAP_PX;
  /** Room for `n` buttons of 60 px with gaps. */
  const roomFor = (n: number): number => n * 60 + (n - 1) * gap;

  it('keeps everything in the dock when it all fits', () => {
    const six = NINE.slice(0, 6);
    expect(dockCapacity(six, 'a', widths, roomFor(6))).toBe(6);
    expect(dockCapacity(six, 'a', widths, roomFor(6) + 30)).toBe(6);
  });

  it('gives More the room it needs and fills the rest', () => {
    // Nine places do not fit; five 60 px places and a 44 px More do, a sixth does not.
    const room = roomFor(5) + gap + 44;
    const capacity = dockCapacity(NINE, 'a', widths, room);
    expect(capacity).toBe(6);
    const { dock, more } = splitDock(NINE, 'a', capacity);
    expect(dock).toHaveLength(5);
    expect(more.length).toBeGreaterThan(0);
  });

  it('counts the width of the active place that takes the last button', () => {
    const wide: DockWidths = { ...widths, places: { ...widths.places, h: 100 } };
    const room = roomFor(5) + gap + 44;
    // Active h (100 px) swaps in for a 60 px place: one place fewer fits.
    expect(dockCapacity(NINE, 'h', wide, room)).toBe(5);
  });

  it('never goes under the active place and More', () => {
    expect(dockCapacity(NINE, 'a', widths, 10)).toBe(2);
  });

  it('treats a place with no measured width as a 44 px touch target', () => {
    const none: DockWidths = { places: {}, more: 44 };
    expect(dockCapacity(NINE.slice(0, 4), 'a', none, 4 * 44 + 3 * gap)).toBe(4);
  });
});
