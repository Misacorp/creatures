import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainNav } from './MainNav';
import { navPlaces } from './nav-places';
import { ALERT_TEXT, NO_ALERTS } from './tab-alerts';
import {
  byClass,
  byName,
  byRole,
  createPage,
  find,
  nameOf,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page ??= createPage();
  page.draw(vnode);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

const PIPS = {
  ...NO_ALERTS,
  expeditions: ALERT_TEXT.tripHome,
  raid: ALERT_TEXT.raidPlace,
};

function nav(
  props: { current?: string; wide?: boolean; slots?: number; onSelect?: (id: string) => void } = {},
) {
  return (
    <MainNav
      places={navPlaces(PIPS)}
      current={props.current ?? 'collection'}
      wide={props.wide ?? false}
      slots={props.slots}
      onSelect={props.onSelect ?? vi.fn()}
    />
  );
}

/** The place buttons of the dock or rail (the More button has no `data-place`). */
function placeButtons(root: FakeElement): FakeElement[] {
  return find(root, (el) => el.localName === 'button' && el.getAttribute('data-place') !== null);
}

describe('MainNav as the phone dock', () => {
  it('is a nav landmark with a button per place, in order, and marks the place you are in', () => {
    const p = draw(nav({ current: 'games' }));
    const landmark = first(find(p.root, (el) => el.localName === 'nav'));
    expect(landmark.getAttribute('aria-label')).toBe('Places');
    expect(landmark.getAttribute('class')).toContain('dock');
    const buttons = placeButtons(p.root);
    expect(buttons.map((b) => b.getAttribute('data-place'))).toEqual([
      'collection',
      'workshop',
      'expeditions',
      'games',
      'dungeon',
      'raid',
    ]);
    const current = buttons.filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.getAttribute('data-place'))).toEqual(['games']);
    // Plain buttons in the tab order: no roving tabindex, no tab roles.
    expect(buttons.every((b) => b.getAttribute('tabindex') === null)).toBe(true);
    expect(byRole(p.root, 'tab')).toHaveLength(0);
  });

  it('says each place and why it has a pip, in the button name, and draws the pip as decoration', () => {
    const p = draw(nav());
    expect(byName(p.root, 'button', 'Expeditions, a trip is home')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Raid, creatures to place')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Creatures')).toHaveLength(1);
    const pips = byClass(p.root, 'nav-pip');
    expect(pips).toHaveLength(2);
    expect(pips.every((pip) => pip.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('hands the id of the tapped place back', () => {
    const onSelect = vi.fn();
    const p = draw(nav({ onSelect }));
    p.click(first(byName(p.root, 'button', 'Workshop')));
    expect(onSelect).toHaveBeenCalledWith('workshop');
  });

  it('has no More button while every place fits', () => {
    const p = draw(nav({ slots: 6 }));
    expect(byName(p.root, 'button', /^More/)).toHaveLength(0);
  });

  it('sends what does not fit to More, keeps the active place in the dock and rolls up the pips', () => {
    const p = draw(nav({ slots: 4, current: 'collection' }));
    expect(placeButtons(p.root).map((b) => b.getAttribute('data-place'))).toEqual([
      'collection',
      'workshop',
      'expeditions',
    ]);
    // Raid is in More with a pip; Dungeon has none; Expeditions' pip is in the dock.
    const more = first(byName(p.root, 'button', /^More/));
    expect(nameOf(more)).toBe('More, Raid: creatures to place');
    expect(byClass(more, 'nav-pip')).toHaveLength(1);

    // The active place is never hidden: the Raid takes the last dock button.
    p.draw(nav({ slots: 4, current: 'raid' }));
    expect(placeButtons(p.root).map((b) => b.getAttribute('data-place'))).toEqual([
      'collection',
      'workshop',
      'raid',
    ]);
    // Expeditions (a pip) is in More now, so More still carries the pip.
    expect(nameOf(first(byName(p.root, 'button', /^More/)))).toBe(
      'More, Expeditions: a trip is home',
    );
  });

  it('opens the More drawer with the rest and their reasons, and a pick goes there and closes it', () => {
    const onSelect = vi.fn();
    const p = draw(nav({ slots: 4, onSelect }));
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /^More/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialog.textContent).toContain('More places');
    const rows = byClass(dialog, 'nav-more-row');
    expect(rows.map((r) => r.getAttribute('data-place'))).toEqual(['games', 'dungeon', 'raid']);
    expect(first(rows.slice(2)).textContent).toContain('creatures to place');
    expect(first(rows.slice(1)).textContent).not.toContain('to place');
    p.click(first(rows.slice(2)));
    expect(onSelect).toHaveBeenCalledWith('raid');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });
});

describe('MainNav as the wide rail', () => {
  it('lists every place, never shows More, and keeps the same names, current mark and pips', () => {
    const p = draw(nav({ wide: true, current: 'workshop', slots: 3 }));
    const landmark = first(find(p.root, (el) => el.localName === 'nav'));
    expect(landmark.getAttribute('class')).toContain('rail');
    expect(landmark.getAttribute('aria-label')).toBe('Places');
    const buttons = placeButtons(p.root);
    expect(buttons).toHaveLength(6);
    expect(byName(p.root, 'button', /^More/)).toHaveLength(0);
    expect(
      buttons.filter((b) => b.getAttribute('aria-current') === 'page').map((b) => nameOf(b)),
    ).toEqual(['Workshop']);
    expect(byName(p.root, 'button', 'Expeditions, a trip is home')).toHaveLength(1);
  });
});
