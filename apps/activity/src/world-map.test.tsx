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

function place(p: Page, id: string) {
  const found = p.root.querySelector(`[data-place="${id}"]`);
  if (found === null) throw new Error(id);
  return found;
}

function markers(p: Page) {
  return p.root.querySelectorAll('[data-place]');
}

describe('WorldMap', () => {
  it('goes on in grass east of its edge when the window is wider than the map', () => {
    const p = createPage();
    page = p;
    p.draw(
      <WorldMap
        places={[]}
        selected={null}
        night={false}
        onPick={() => undefined}
        width={1000}
        scale={2}
      />,
    );
    // The map at scale 2 is 736 px and the map's side padding 6 px: the rest of 1000 px is grass.
    const more = byClass(p.root, 'world-map-more');
    expect(more).toHaveLength(1);
    expect(more[0]?.getAttribute('width')).toBe('258');
    expect(more[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws no extra grass when the map fills its window or pans', () => {
    const p = createPage();
    page = p;
    p.draw(
      <WorldMap
        places={[]}
        selected={null}
        night={false}
        onPick={() => undefined}
        width={742}
        scale={2}
      />,
    );
    expect(byClass(p.root, 'world-map-more')).toHaveLength(0);
    p.unmount();
    const narrow = build(null);
    expect(byClass(narrow.root, 'world-map-more')).toHaveLength(0);
  });

  it('lists a button per place in reading order, each with its spoken label', () => {
    const p = build(null);
    const list = markers(p);
    expect(list).toHaveLength(8);
    expect(list.every((b) => b.localName === 'button')).toBe(true);
    // West to east, north to south within a column (not the content order).
    expect(list.map((b) => b.getAttribute('data-place'))).toEqual([
      'tidepools',
      'moonlit-reef',
      'ember-caves',
      'verdant-hollow',
      'old-crossroads',
      'storm-ridge',
      'sunken-fen',
      'festival-grounds',
    ]);
    expect(place(p, 'ember-caves').getAttribute('aria-label')).toBe(
      'Ember Caves, 1 explorer there, 1 home',
    );
    expect(place(p, 'moonlit-reef').getAttribute('aria-label')).toBe('Moonlit Reef, Night only');
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
    expect(place(p, 'ember-caves').classList.contains('home')).toBe(true);
    expect(place(p, 'storm-ridge').classList.contains('choosing')).toBe(true);
  });

  it('presses only the selected place and tells the caller which was picked', () => {
    const picked: string[] = [];
    const p = build('ember-caves', false, (id) => picked.push(id));
    const pressed = markers(p).filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.getAttribute('data-place'))).toEqual(['ember-caves']);
    expect(pressed[0]?.classList.contains('selected')).toBe(true);
    p.click(place(p, 'sunken-fen'));
    expect(picked).toEqual(['sunken-fen']);
  });

  it('shows each place as a logo over its landmark and keeps the real name for screen readers', () => {
    const p = build(null);
    expect(byClass(p.root, 'wm-logo')).toHaveLength(8);
    for (const logo of byClass(p.root, 'wm-logo'))
      expect(logo.getAttribute('aria-hidden')).toBe('true');
    expect(byClass(p.root, 'wm-plate')).toHaveLength(0);
    expect(place(p, 'tidepools').getAttribute('aria-label')).toMatch(/^Tidepools/);
  });

  it('tints the map at night', () => {
    expect(byClass(build(null, true).root, 'night')).toHaveLength(1);
    page?.unmount();
    expect(byClass(build(null, false).root, 'night')).toHaveLength(0);
  });

  it('moves focus in reading order with the arrow keys and brings the marker into view', () => {
    const p = build(null);
    const list = markers(p);
    const [first, second] = list;
    if (first === undefined || second === undefined) throw new Error('markers');
    expect(first.getAttribute('data-place')).toBe('tidepools');
    expect(second.getAttribute('data-place')).toBe('moonlit-reef');
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
