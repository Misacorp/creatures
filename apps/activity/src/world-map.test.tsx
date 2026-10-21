import { afterEach, describe, expect, it } from 'vitest';
import { WorldMap } from './WorldMap';
import { SAMPLE_EXPLORERS, sampleMapTrips } from './map-sample';
import { mapPlaces } from './map-view';
import { byClass, createPage, type Page } from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function build(
  selected: string | null,
  night = false,
  onPick: (id: string) => void = () => undefined,
) {
  const p = createPage();
  page = p;
  const places = mapPlaces({
    trips: sampleMapTrips('four-out', NOW),
    creatures: SAMPLE_EXPLORERS,
    now: NOW,
    selected,
    rules: { 'moonlit-reef': 'Night only' },
  });
  p.draw(
    <WorldMap places={places} selected={selected} night={night} onPick={onPick} width={390} />,
  );
  return p;
}

function markers(p: Page) {
  return p.root.querySelectorAll('[data-place]');
}

describe('WorldMap', () => {
  it('lists a button per place in trail order, each with its spoken label', () => {
    const p = build(null);
    const list = markers(p);
    expect(list).toHaveLength(8);
    expect(list.every((b) => b.localName === 'button')).toBe(true);
    expect(list[0]?.getAttribute('data-place')).toBe('tidepools');
    expect(list[7]?.getAttribute('data-place')).toBe('festival-grounds');
    expect(list[1]?.getAttribute('aria-label')).toBe('Ember Caves, 1 explorer there, 1 home');
    expect(list[6]?.getAttribute('aria-label')).toBe('Moonlit Reef, Night only');
  });

  it('keeps the canvas out of the accessibility tree and draws the list inside a labelled list', () => {
    const p = build(null);
    expect(byClass(p.root, 'world-map-canvas')[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(byClass(p.root, 'world-map-places')[0]?.getAttribute('aria-label')).toBe(
      'Places on the map',
    );
  });

  it('shows the HOME flag, the push-on mark and the faces over the right places', () => {
    const p = build(null);
    expect(byClass(p.root, 'wm-flag')).toHaveLength(1);
    expect(byClass(p.root, 'wm-choice')).toHaveLength(1);
    expect(byClass(p.root, 'wm-chip')).toHaveLength(3);
    const ember = markers(p)[1];
    expect(ember?.classList.contains('home')).toBe(true);
    expect(markers(p)[3]?.classList.contains('push-on')).toBe(true);
  });

  it('presses only the selected place and tells the caller which was picked', () => {
    const picked: string[] = [];
    const p = build('ember-caves', false, (id) => picked.push(id));
    const pressed = markers(p).filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.getAttribute('data-place'))).toEqual(['ember-caves']);
    expect(pressed[0]?.classList.contains('selected')).toBe(true);
    const fen = markers(p)[4];
    if (fen === undefined) throw new Error('no fen');
    p.click(fen);
    expect(picked).toEqual(['sunken-fen']);
  });

  it('tints the map at night', () => {
    expect(byClass(build(null, true).root, 'night')).toHaveLength(1);
    page?.unmount();
    expect(byClass(build(null, false).root, 'night')).toHaveLength(0);
  });

  it('moves focus along the trail with the arrow keys and brings the marker into view', () => {
    const p = build(null);
    const list = markers(p);
    const [first, second] = list;
    if (first === undefined || second === undefined) throw new Error('markers');
    const event = p.key(first, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(second.focused).toBe(1);
    expect(second.scrolled).toBe(1);
    // Past the end it stays on the last one; other keys do nothing.
    const last = list[7];
    if (last === undefined) throw new Error('last');
    p.key(last, 'ArrowRight');
    expect(last.focused).toBe(1);
    expect(p.key(first, 'a').defaultPrevented).toBe(false);
    p.key(second, 'ArrowLeft');
    expect(first.focused).toBe(1);
  });
});
