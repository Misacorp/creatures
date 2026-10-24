import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainNav, type LoungeButton } from './MainNav';
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
  props: {
    current?: string;
    wide?: boolean;
    openGroup?: string;
    onSelect?: (id: string) => void;
    lounge?: LoungeButton;
  } = {},
) {
  return (
    <MainNav
      places={navPlaces(PIPS)}
      current={props.current ?? 'collection'}
      wide={props.wide ?? false}
      openGroup={props.openGroup}
      lounge={props.lounge}
      onSelect={props.onSelect ?? vi.fn()}
    />
  );
}

const LOUNGE: LoungeButton = { pip: null, open: false, onOpen: () => undefined };

/** The dock's group buttons (a direct group's button also has `data-place`). */
function groupButtons(root: FakeElement): FakeElement[] {
  return find(
    root,
    (el) => el.localName === 'button' && (el.getAttribute('class') ?? '').includes('group'),
  );
}

function trayItems(root: FakeElement): FakeElement[] {
  return byClass(root, 'nav-tray-item');
}

/** Every button of the dock bar itself (not the tray's), left to right. */
function dockButtons(root: FakeElement): FakeElement[] {
  return find(
    root,
    (el) => el.localName === 'button' && (el.getAttribute('class') ?? '').includes('nav-btn'),
  );
}

describe('MainNav as the phone dock', () => {
  it('is a nav landmark with three buttons in order: the Creatures group, the Lounge, the Adventure group', () => {
    const p = draw(nav({ lounge: LOUNGE }));
    const landmark = first(find(p.root, (el) => el.localName === 'nav'));
    expect(landmark.getAttribute('aria-label')).toBe('Places');
    expect(landmark.getAttribute('class')).toContain('dock');
    expect(dockButtons(p.root).map((b) => nameOf(b))).toEqual([
      'Creatures',
      'Lounge',
      'Adventure, 2 places need you',
    ]);
    expect(
      groupButtons(p.root).map((b) => b.getAttribute('data-group') ?? b.getAttribute('data-place')),
    ).toEqual(['creatures', 'adventure']);
    expect(trayItems(p.root)).toHaveLength(0);
    expect(byRole(p.root, 'tab')).toHaveLength(0);
  });

  it('has just the two group buttons when it is given no Lounge (a window that shows the room itself)', () => {
    const p = draw(nav());
    expect(dockButtons(p.root).map((b) => nameOf(b))).toEqual([
      'Creatures',
      'Adventure, 2 places need you',
    ]);
  });

  it('highlights the group of the current place, never the Lounge', () => {
    const p = draw(nav({ current: 'games', lounge: LOUNGE }));
    const active = groupButtons(p.root).filter((b) =>
      (b.getAttribute('class') ?? '').includes('active'),
    );
    expect(active.map((b) => b.getAttribute('data-group'))).toEqual(['adventure']);
    const lounge = first(byName(p.root, 'button', 'Lounge'));
    expect(lounge.getAttribute('aria-current')).toBeNull();
  });

  it('gives each group the roll-up of its pips in its name, and draws the pip as decoration', () => {
    const p = draw(nav({ lounge: LOUNGE }));
    expect(byName(p.root, 'button', 'Creatures')).toHaveLength(1);
    expect(byName(p.root, 'button', 'Adventure, 2 places need you')).toHaveLength(1);
    const pips = byClass(p.root, 'nav-pip');
    expect(pips).toHaveLength(1);
    expect(pips.every((pip) => pip.getAttribute('aria-hidden') === 'true')).toBe(true);

    p.draw(
      <MainNav
        places={navPlaces({ ...NO_ALERTS, workshop: ALERT_TEXT.jobReady })}
        current="collection"
        wide={false}
        onSelect={vi.fn()}
      />,
    );
    expect(byName(p.root, 'button', 'Creatures, Workshop: a job is ready')).toHaveLength(1);
  });

  it('rolls all four Adventure places, the Games too, into the right button', () => {
    const p = draw(
      <MainNav
        places={navPlaces({ ...NO_ALERTS, games: ALERT_TEXT.gamesEntries })}
        current="collection"
        wide={false}
        onSelect={vi.fn()}
      />,
    );
    expect(byName(p.root, 'button', `Adventure, Games: ${ALERT_TEXT.gamesEntries}`)).toHaveLength(
      1,
    );
  });

  it('draws the Lounge as the primary button, says it opens a dialog, and carries its pip in its name', () => {
    const p = draw(nav({ lounge: { ...LOUNGE, pip: 'someone new is here' } }));
    const lounge = first(byName(p.root, 'button', 'Lounge, someone new is here'));
    expect(lounge.getAttribute('class')).toContain('lounge');
    expect(lounge.getAttribute('aria-haspopup')).toBe('dialog');
    expect(lounge.getAttribute('aria-expanded')).toBe('false');
    expect(byClass(p.root, 'nav-pip')).toHaveLength(2);

    p.draw(nav({ lounge: { ...LOUNGE, open: true } }));
    expect(first(byName(p.root, 'button', 'Lounge')).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the lounge on a tap and closes an open tray', () => {
    const onOpen = vi.fn();
    const p = draw(nav({ lounge: { ...LOUNGE, onOpen } }));
    p.click(first(byName(p.root, 'button', /^Adventure/)));
    expect(trayItems(p.root).length).toBeGreaterThan(0);
    p.click(first(byName(p.root, 'button', 'Lounge')));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(trayItems(p.root)).toHaveLength(0);
  });

  it('goes straight to the place from a group with one place, with no menu', () => {
    const onSelect = vi.fn();
    const only = navPlaces(NO_ALERTS).filter((p) => p.id !== 'workshop');
    const p = draw(<MainNav places={only} current="collection" wide={false} onSelect={onSelect} />);
    const creatures = first(byName(p.root, 'button', /^Creatures/));
    expect(creatures.getAttribute('aria-expanded')).toBeNull();
    p.click(creatures);
    expect(onSelect).toHaveBeenCalledWith('collection');
    expect(trayItems(p.root)).toHaveLength(0);
  });

  it('opens a tray of big buttons with the places and their reasons, the current one marked', () => {
    const p = draw(nav({ current: 'dungeon' }));
    const button = first(byName(p.root, 'button', /^Adventure/));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    p.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const tray = first(
      find(p.root, (el) => el.getAttribute('id') === button.getAttribute('aria-controls')),
    );
    const items = trayItems(tray);
    expect(items.map((i) => i.getAttribute('data-place'))).toEqual([
      'expeditions',
      'dungeon',
      'raid',
      'games',
    ]);
    expect(
      items
        .filter((i) => i.getAttribute('aria-current') === 'page')
        .map((i) => i.getAttribute('data-place')),
    ).toEqual(['dungeon']);
    expect(nameOf(first(items))).toBe('Expeditions, a trip is home');
    expect(nameOf(first(items.slice(1)))).toBe('Dungeon');
    expect(nameOf(first(items.slice(3)))).toBe('Games');
    // The focus moved to the current place.
    expect(p.document.activeElement).toBe(first(items.slice(1)));
  });

  it('puts the focus on the first place when the current place is in another group', () => {
    const p = draw(nav({ current: 'collection' }));
    p.click(first(byName(p.root, 'button', /^Adventure/)));
    expect(p.document.activeElement).toBe(first(trayItems(p.root)));
  });

  it('goes to the picked place, closes the tray and gives the focus back to the group button', () => {
    const onSelect = vi.fn();
    const p = draw(nav({ onSelect }));
    const button = first(byName(p.root, 'button', /^Adventure/));
    p.click(button);
    p.click(first(trayItems(p.root).slice(2)));
    expect(onSelect).toHaveBeenCalledWith('raid');
    expect(trayItems(p.root)).toHaveLength(0);
    expect(p.document.activeElement).toBe(button);
  });

  it('closes on Escape, with the focus back on the group button', () => {
    const p = draw(nav());
    const button = first(byName(p.root, 'button', /^Adventure/));
    p.click(button);
    const event = p.key(first(trayItems(p.root)), 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(trayItems(p.root)).toHaveLength(0);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(p.document.activeElement).toBe(button);
  });

  it('closes on a second tap of the same group button, and on a tap outside (the scrim)', () => {
    const p = draw(nav());
    const button = first(byName(p.root, 'button', /^Adventure/));
    p.click(button);
    p.click(button);
    expect(trayItems(p.root)).toHaveLength(0);

    p.click(button);
    expect(trayItems(p.root).length).toBeGreaterThan(0);
    p.pointer(first(byClass(p.root, 'nav-scrim')), 'pointerdown', { x: 5, y: 5 });
    expect(trayItems(p.root)).toHaveLength(0);
    expect(byClass(p.root, 'nav-scrim')).toHaveLength(0);
  });

  it('opens one tray at a time', () => {
    const p = draw(nav());
    p.click(first(byName(p.root, 'button', /^Creatures/)));
    p.click(first(byName(p.root, 'button', /^Adventure/)));
    expect(trayItems(p.root).map((i) => i.getAttribute('data-place'))).toEqual([
      'expeditions',
      'dungeon',
      'raid',
      'games',
    ]);
  });

  it('can start with a tray open (the workbench)', () => {
    const p = draw(nav({ openGroup: 'creatures' }));
    expect(trayItems(p.root).map((i) => i.getAttribute('data-place'))).toEqual([
      'collection',
      'workshop',
    ]);
  });

  it('has no More button and no drawer', () => {
    const p = draw(nav());
    expect(byName(p.root, 'button', /^More/)).toHaveLength(0);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });
});

describe('MainNav as the wide rail', () => {
  it('lists every place under its group heading, with no menus, and keeps names, current mark and pips', () => {
    const p = draw(nav({ wide: true, current: 'workshop' }));
    const landmark = first(find(p.root, (el) => el.localName === 'nav'));
    expect(landmark.getAttribute('class')).toContain('rail');
    expect(landmark.getAttribute('aria-label')).toBe('Places');
    expect(byClass(p.root, 'nav-heading').map((h) => nameOf(h))).toEqual([
      'Creatures',
      'Adventure',
    ]);
    const buttons = find(p.root, (el) => el.localName === 'button');
    expect(buttons).toHaveLength(6);
    expect(buttons.every((b) => b.getAttribute('aria-expanded') === null)).toBe(true);
    expect(
      buttons.filter((b) => b.getAttribute('aria-current') === 'page').map((b) => nameOf(b)),
    ).toEqual(['Workshop']);
    expect(byName(p.root, 'button', 'Expeditions, a trip is home')).toHaveLength(1);
    expect(byClass(p.root, 'nav-tray')).toHaveLength(0);
  });

  it('has no Lounge button: the room is on screen', () => {
    const p = draw(nav({ wide: true, lounge: LOUNGE }));
    expect(byName(p.root, 'button', /^Lounge/)).toHaveLength(0);
  });
});
