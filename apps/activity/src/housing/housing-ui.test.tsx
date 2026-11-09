import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, type Page } from '../test-dom';
import { viewOf } from '../valley/valley-nav';
import { HouseRows, houseRowLines, YourHouseRow } from './HouseRows';
import { HouseScene } from './HouseScene';
import { RoomFocus, focusScale } from './RoomFocus';
import { defaultHouseScale } from './HouseScene';
import { sampleHouse, sampleOwn, MANSION, HUT } from './house-scene-sample';
import { displayText, spotLabel } from './house-text';
import {
  afterBuild,
  afterCollect,
  afterHousemate,
  afterPlace,
  afterSeen,
  hasFresh,
  stableJson,
  HouseActionIds,
} from './use-house';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('HouseScene', () => {
  it('draws a button for every room, named for it, and a tap focuses it', () => {
    const house = sampleHouse({ parts: ['hut', 'cottage'] });
    const onRoom = vi.fn();
    page = createPage();
    page.draw(<HouseScene house={house} mode="own" onRoom={onRoom} onFixture={() => undefined} />);
    const rooms = byClass(page.root, 'house-room');
    expect(rooms.map((r) => r.getAttribute('aria-label')).sort()).toEqual([
      'Hearth',
      'Kitchen',
      'Loft',
    ]);
    for (const r of rooms) expect(r.localName).toBe('button');
    const hearth = rooms.find((r) => r.getAttribute('aria-label') === 'Hearth');
    if (hearth === undefined) throw new Error('no hearth');
    page.click(hearth);
    expect(onRoom).toHaveBeenCalledWith('hut:hearth');
  });

  it('names the group and the mailbox, and shows the pan hint', () => {
    page = createPage();
    page.draw(
      <HouseScene
        house={sampleHouse()}
        mode="own"
        onRoom={() => undefined}
        onFixture={() => undefined}
        mailboxLabel="Mailbox, 2 gifts waiting"
      />,
    );
    expect(byName(page.root, 'button', 'Mailbox, 2 gifts waiting')).toHaveLength(1);
    expect(byName(page.root, 'button', 'Workbench')).toHaveLength(1);
    expect(byClass(page.root, 'pan-hint')).toHaveLength(1);
    expect(byClass(page.root, 'house-view')[0]?.getAttribute('aria-label')).toBe('Your house');
  });

  it('is read-only in a visit: no fixture buttons, the owner in its name', () => {
    page = createPage();
    page.draw(<HouseScene house={sampleHouse()} mode="visit" onRoom={() => undefined} />);
    expect(byClass(page.root, 'house-fixture')).toHaveLength(0);
    expect(byClass(page.root, 'house-view')[0]?.getAttribute('aria-label')).toBe("Aino's house");
  });

  it('uses whole scales only: 2 on a phone, 3 from 700 px', () => {
    expect(defaultHouseScale(390)).toBe(2);
    expect(defaultHouseScale(699)).toBe(2);
    expect(defaultHouseScale(700)).toBe(3);
    expect(defaultHouseScale(1100)).toBe(3);
  });
});

describe('RoomFocus', () => {
  const house = sampleHouse({ parts: ['hut', 'cottage'], housemates: 1 });

  it('makes every spot of your own room a button with a spoken name, and an empty one is marked', () => {
    const onSpot = vi.fn();
    page = createPage();
    page.draw(
      <RoomFocus
        house={house}
        roomId="hut:hearth"
        mode="own"
        onSpot={onSpot}
        onSkin={() => undefined}
      />,
    );
    const spots = byClass(page.root, 'house-spot');
    expect(spots.length).toBeGreaterThanOrEqual(8);
    for (const s of spots) expect(s.getAttribute('aria-label')).toMatch(/: /);
    const window = spots.find((s) => s.getAttribute('data-type') === 'window');
    expect(window?.getAttribute('aria-label')).toBe('Window: Cosy Curtains');
    page.click(window as NonNullable<typeof window>);
    expect(onSpot).toHaveBeenCalledWith('window-a');
    expect(byName(page.root, 'button', /Wallpaper: /)).toHaveLength(1);
    expect(byName(page.root, 'button', /Floor: /)).toHaveLength(1);
  });

  it('shows no spot buttons for empty places or chips in a visit', () => {
    page = createPage();
    page.draw(<RoomFocus house={house} roomId="hut:hearth" mode="visit" />);
    const spots = byClass(page.root, 'house-spot');
    for (const s of spots) expect(s.getAttribute('data-empty')).toBeNull();
    expect(byClass(page.root, 'house-chips')).toHaveLength(0);
  });

  it('puts the housemate between the layers as a creature button', () => {
    page = createPage();
    const mate = house.housemates[0];
    expect(mate).toBeDefined();
    page.draw(<RoomFocus house={house} roomId={mate?.roomId ?? ''} mode="own" />);
    expect(byClass(page.root, 'house-sleeper')).toHaveLength(1);
    expect(byClass(page.root, 'house-layer')).toHaveLength(2);
  });

  it('draws at the largest whole scale up to 4 that fits, never under 2', () => {
    expect(focusScale(390, 116)).toBe(3);
    expect(focusScale(1000, 116)).toBe(4);
    expect(focusScale(390, 228)).toBe(2);
    expect(focusScale(300, 228)).toBe(2);
  });
});

describe('the words', () => {
  it('names a spot and what a display lists', () => {
    expect(spotLabel('floor-small', null)).toBe('Small floor: empty');
    expect(spotLabel('window', 'cosy-curtains')).toBe('Window: Cosy Curtains');
    const text = displayText(
      { roomId: 'a', spotId: 'b', kind: 'dungeon', depth: 12, clears: 1 },
      'x',
    );
    expect(text.lines[0]).toContain('12');
    expect(displayText(null, 'Display').lines).toEqual([]);
  });
});

describe('the rows', () => {
  const house = sampleHouse({ parts: ['hut', 'cottage'] });
  const own = sampleOwn(house);

  it('say what is next at each place', () => {
    const lines = houseRowLines(house, own, 7);
    expect(lines.build).toMatch(/^House: \d+ \/ \d+ lines paid$/);
    expect(lines.mailbox).toBe('2 gifts waiting');
    expect(lines.pip).toBe(true);
    expect(lines.visits).toBe('7 houses');
    expect(lines.catalogue).toMatch(/^\d+ \/ \d+ found$/);
    expect(
      houseRowLines(house, { ...own, mailbox: { gifts: 0, acorns: 0, from: [] } }, null).pip,
    ).toBe(false);
    expect(houseRowLines(sampleHouse({ parts: MANSION }), { ...own, buildable: [] }, 1).build).toBe(
      'everything is built',
    );
  });

  it('are place rows that open their page', () => {
    const onOpen = vi.fn();
    page = createPage();
    page.draw(<HouseRows house={house} own={own} houses={7} onOpen={onOpen} />);
    const buttons = byClass(page.root, 'vy-row');
    expect(buttons).toHaveLength(5);
    page.click(buttons[4] as NonNullable<(typeof buttons)[number]>);
    expect(onOpen).toHaveBeenCalledWith('visits');
    expect(byClass(page.root, 'vy-row-pip')).toHaveLength(1);
  });

  it('give the valley a third House row, "Your house"', () => {
    const onClick = vi.fn();
    page = createPage();
    page.draw(
      <ul>
        <YourHouseRow onClick={onClick} />
      </ul>,
    );
    const [row] = byClass(page.root, 'vy-row');
    expect(row?.getAttribute('aria-label')).toMatch(/^Your house, /);
    page.click(row as NonNullable<typeof row>);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('the valley', () => {
  it('draws the house tab as the House place with the house book', () => {
    expect(viewOf('house', 'valley')).toEqual({ kind: 'place', place: 'house', book: 'house' });
  });
});

describe('answers folded into the page', () => {
  const house = sampleHouse({ parts: ['hut', 'cottage'] });
  const own = sampleOwn(house);
  const state = { house, own };

  it('a payment that is not the last updates the progress; the last one brings the new house', () => {
    const part = { partId: 'house', paid: [], remaining: [] };
    const half = afterBuild(state, { part, built: false });
    expect(half.own.progress.find((p) => p.partId === 'house')).toBeDefined();
    const bigger = sampleHouse({ parts: ['hut', 'cottage', 'house'] });
    const done = afterBuild(state, { part, built: true, house: bigger, own: sampleOwn(bigger) });
    expect(done.house.built).toContain('house');
  });

  it('placing replaces the room and the free copies', () => {
    const room = { ...(house.rooms[0] as (typeof house.rooms)[number]), spots: { 'rug-a': null } };
    const next = afterPlace(state, { room, own: { free: { 'cosy-rug': 1 } } });
    expect(next.house.rooms[0]?.spots).toEqual({ 'rug-a': null });
    expect(next.own.free).toEqual({ 'cosy-rug': 1 });
  });

  it('a collect empties the mailbox and sets the balance; seen clears the +N', () => {
    const after = afterCollect(state, { collected: 10, balance: 190 });
    expect(after.own.mailbox.gifts).toBe(0);
    expect(after.own.purse.bait).toBe(190);
    expect(hasFresh(own)).toBe(true);
    expect(hasFresh(afterSeen(state).own)).toBe(false);
    expect(afterHousemate(state, []).house.housemates).toEqual([]);
  });

  it('names one action by what makes it one action', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
    expect(HouseActionIds.build('house', { scrap: 5, bait: 2 })).toBe(
      HouseActionIds.build('house', { bait: 2, scrap: 5 }),
    );
    expect(HouseActionIds.build('house', { bait: 2 })).not.toBe(
      HouseActionIds.build('house', { bait: 3 }),
    );
    expect(HouseActionIds.craft('x', 1)).not.toBe(HouseActionIds.craft('x', 2));
    void HUT;
  });
});
