import { afterEach, describe, expect, it, vi } from 'vitest';
import { byClass, byName, createPage, type Page } from '../test-dom';
import { viewOf } from '../valley/valley-nav';
import { HouseRows, houseRowLines } from './HouseRows';
import { YourHouseRow } from '../valley/YourHouseRow';
import { HouseScene, roomLabel } from './HouseScene';
import { RoomFocus, focusScale, spotLayers } from './RoomFocus';
import { placedNames, standsAt } from './HousePlace';
import { defaultHouseScale } from './HouseScene';
import { sceneHouse, sceneOwn, MANSION, HUT } from './house-scene-sample';

function first<T>(list: readonly T[]): T {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}
import { displayText, spotLabel } from './house-text';
import {
  afterBuild,
  afterCollect,
  afterCraft,
  afterHousemate,
  afterPlace,
  afterSeen,
  afterSkin,
  freshFinds,
  hasFresh,
  stableJson,
  HouseActionIds,
} from './use-house';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

/** The little of `window` the pan hint and the layout read while the box is scrolled. */
function stubWindow(): void {
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 390,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    requestAnimationFrame: (f: () => void) => {
      f();
      return 1;
    },
    cancelAnimationFrame: () => undefined,
  });
}

describe('HouseScene', () => {
  it('draws a button for every room, named for it, and a tap focuses it', () => {
    const house = sceneHouse({ parts: ['hut', 'cottage'] });
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
        house={sceneHouse()}
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
    page.draw(<HouseScene house={sceneHouse()} mode="visit" onRoom={() => undefined} />);
    expect(byClass(page.root, 'house-fixture')).toHaveLength(0);
    expect(byClass(page.root, 'house-view')[0]?.getAttribute('aria-label')).toBe("Aino's house");
  });

  it('pans with a mouse drag both ways, shows the pan hint, and keeps where it was left', () => {
    stubWindow();
    const memory = { current: null };
    page = createPage();
    page.draw(
      <HouseScene
        house={sceneHouse({ parts: MANSION })}
        mode="own"
        onRoom={() => undefined}
        memory={memory}
      />,
    );
    const [view] = byClass(page.root, 'house-view');
    if (view === undefined) throw new Error('no view');
    expect(byClass(page.root, 'pan-hint')).toHaveLength(1);
    Reflect.set(view, 'scrollLeft', 200);
    Reflect.set(view, 'scrollTop', 50);
    page.pointer(view, 'pointerdown', { x: 300, y: 200, kind: 'mouse' });
    page.pointer(view, 'pointermove', { x: 240, y: 230, kind: 'mouse' });
    // The content follows the pointer: 60 px left scrolls 60 right, 30 px down scrolls 30 up.
    expect(Reflect.get(view, 'scrollLeft')).toBe(260);
    expect(Reflect.get(view, 'scrollTop')).toBe(20);
    expect((view.getAttribute('class') ?? '').split(/\s+/)).toContain('dragging');
    page.pointer(view, 'pointerup', { x: 240, y: 230, kind: 'mouse' });
    expect((view.getAttribute('class') ?? '').split(/\s+/)).not.toContain('dragging');
    // The scroll is remembered for the way back from a room.
    page.event(view, 'scroll');
    expect(memory.current).toEqual({ left: 260, top: 20 });
  });

  it('a touch is left to the browser: it does not move the box', () => {
    page = createPage();
    page.draw(
      <HouseScene house={sceneHouse({ parts: MANSION })} mode="own" onRoom={() => undefined} />,
    );
    const [view] = byClass(page.root, 'house-view');
    if (view === undefined) throw new Error('no view');
    Reflect.set(view, 'scrollLeft', 200);
    page.pointer(view, 'pointerdown', { x: 300, y: 200, kind: 'touch' });
    page.pointer(view, 'pointermove', { x: 100, y: 200, kind: 'touch' });
    expect(Reflect.get(view, 'scrollLeft')).toBe(200);
  });

  it('says who is asleep in a room on its button, and the whole house as a postcard when the cutaway cannot show it', () => {
    stubWindow();
    page = createPage();
    page.draw(
      <HouseScene
        house={sceneHouse({ parts: MANSION, housemates: 1 })}
        mode="own"
        onRoom={() => undefined}
      />,
    );
    const names = byClass(page.root, 'house-room').map((r) => r.getAttribute('aria-label') ?? '');
    expect(names.some((n) => / asleep$/.test(n))).toBe(true);
    // The mansion is wider than a phone at any scale of 2 or 1: the postcard shows all of it above.
    expect(byClass(page.root, 'house-postcard-band')).toHaveLength(1);
    expect(roomLabel('Loft', [])).toBe('Loft');
  });

  it('shows no postcard when the cutaway shows the whole house', () => {
    stubWindow();
    page = createPage();
    page.draw(
      <HouseScene house={sceneHouse({ parts: HUT })} mode="own" onRoom={() => undefined} />,
    );
    expect(byClass(page.root, 'house-postcard-band')).toHaveLength(0);
  });

  it('uses whole scales only: 2 on a phone, 3 from 700 px', () => {
    expect(defaultHouseScale(390)).toBe(2);
    expect(defaultHouseScale(699)).toBe(2);
    expect(defaultHouseScale(700)).toBe(3);
    expect(defaultHouseScale(1100)).toBe(3);
  });
});

describe('RoomFocus', () => {
  const house = sceneHouse({ parts: ['hut', 'cottage'], housemates: 1 });

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
    // Layer chips say "look" so they never read like a spot ("Ceiling: Oak Lamp").
    expect(byName(page.root, 'button', /^Wallpaper look: /)).toHaveLength(1);
    expect(byName(page.root, 'button', /^Floor look: /)).toHaveLength(1);
    // The room's own layers (housing C5): a trim left off is none; a ceiling left as built is its starter.
    expect(first(byName(page.root, 'button', /^Trim look: /)).getAttribute('aria-label')).toBe(
      'Trim look: none',
    );
    expect(byName(page.root, 'button', 'Ceiling look: Plain Ceiling, White and oak')).toHaveLength(
      1,
    );
  });

  it('names a chosen pattern by its colour on the chip, and asks for the layer it shows', () => {
    page = createPage();
    const onSkin = vi.fn();
    const first0 = house.rooms[0];
    if (first0 === undefined) throw new Error('no room');
    const dressed = {
      ...house,
      rooms: [
        { ...first0, wall: 'paper-damask:rose', ceiling: 'ceiling-beamed:dark' },
        ...house.rooms.slice(1),
      ],
    };
    page.draw(<RoomFocus house={dressed} roomId={first0.id} mode="own" onSkin={onSkin} />);
    expect(byName(page.root, 'button', 'Wallpaper look: Damask Paper, Rose')).toHaveLength(1);
    const ceiling = first(byName(page.root, 'button', 'Ceiling look: Beamed Ceiling, Dark boards'));
    page.click(ceiling);
    expect(onSkin).toHaveBeenCalledWith('ceiling');
    expect(byClass(page.root, 'house-chips')[0]?.getAttribute('data-chips')).toBe('4');
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

  it('stacks the smaller spot above the bigger one, so a lamp cannot hide the shelf it hangs over', () => {
    const layers = spotLayers([
      { spotId: 'shelf', w: 80, h: 44 },
      { spotId: 'lamp', w: 40, h: 40 },
      { spotId: 'sofa', w: 128, h: 80 },
    ]);
    expect(layers.get('sofa')).toBe(0);
    expect(layers.get('shelf')).toBe(1);
    expect(layers.get('lamp')).toBe(2);
  });

  it('draws at the largest whole scale up to 4 that fits, never under 2', () => {
    expect(focusScale(390, 116)).toBe(3);
    expect(focusScale(1000, 116)).toBe(4);
    expect(focusScale(390, 228)).toBe(2);
    expect(focusScale(300, 228)).toBe(2);
  });
});

describe('where a piece stands', () => {
  const house = sceneHouse({ parts: ['hut', 'cottage'] });

  it('finds the spot a piece stands in, and the name of its room', () => {
    const at = standsAt(house, 'cosy-sofa');
    expect(at?.roomId).toBe('hut:hearth');
    expect(house.rooms.find((r) => r.id === at?.roomId)?.spots[at?.spotId ?? '']).toBe('cosy-sofa');
    expect(standsAt(house, 'no-such-piece')).toBeNull();
    expect(placedNames(house)['cosy-sofa']).toBe('Hearth');
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
  const house = sceneHouse({ parts: ['hut', 'cottage'] });
  const own = sceneOwn(house);

  it('say what is next at each place', () => {
    const lines = houseRowLines(house, own, 7);
    expect(lines.build).toBe('next: House');
    expect(lines.buildPips?.total).toBeGreaterThan(0);
    expect(lines.mailbox).toBe('2 gifts waiting');
    expect(lines.pip).toBe(true);
    expect(lines.visits).toBe('7 houses');
    expect(lines.catalogue).toMatch(/^\d+ \/ \d+ found$/);
    expect(
      houseRowLines(house, { ...own, mailbox: { gifts: 0, acorns: 0, from: [] } }, null).pip,
    ).toBe(false);
    expect(houseRowLines(sceneHouse({ parts: MANSION }), { ...own, buildable: [] }, 1).build).toBe(
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

describe('finds since the last look', () => {
  const own = sceneOwn(sceneHouse());
  it('says nothing on the first open, when every material is new', () => {
    expect(
      freshFinds(
        { ...own, materials: { oak: { have: 3, fresh: 3 }, glass: { have: 2, fresh: 2 } } },
        1,
      ),
    ).toEqual([]);
  });

  it('lists the materials that grew since the player last looked', () => {
    expect(
      freshFinds(
        { ...own, materials: { oak: { have: 9, fresh: 2 }, glass: { have: 4, fresh: 0 } } },
        1,
      ),
    ).toEqual([{ id: 'oak', n: 2 }]);
    // A player who has built something has looked before.
    expect(freshFinds({ ...own, materials: { oak: { have: 3, fresh: 3 } } }, 2)).toEqual([
      { id: 'oak', n: 3 },
    ]);
  });
});

describe('answers folded into the page', () => {
  const house = sceneHouse({ parts: ['hut', 'cottage'] });
  const own = sceneOwn(house);
  const state = { house, own };

  const purse = { ...own.purse, bait: 7 };

  it('a payment that is not the last updates the progress, the purse and the paid materials, and asks for nothing more', () => {
    const part = { partId: 'house', paid: [], remaining: [] };
    const half = afterBuild(state, {
      part,
      built: false,
      purse,
      materials: { oak: { have: 1, fresh: 0 }, gone: { have: 0, fresh: 0 } },
    });
    expect(half.own.progress.find((p) => p.partId === 'house')).toBeDefined();
    expect(half.own.purse).toEqual(purse);
    expect(half.own.materials['oak']).toEqual({ have: 1, fresh: 0 });
    expect(half.own.materials['gone']).toBeUndefined();
    expect(half.house).toBe(state.house);
  });

  it('the last payment brings the rooms, displays, blueprints and buildable list of the grown house', () => {
    const part = { partId: 'house', paid: [], remaining: [] };
    const bigger = sceneHouse({ parts: ['hut', 'cottage', 'house'] });
    const fresh = bigger.rooms.filter((r) => !house.rooms.some((o) => o.id === r.id));
    expect(fresh.length).toBeGreaterThan(0);
    const done = afterBuild(
      { house, own: { ...own, progress: [part] } },
      {
        part,
        built: true,
        purse,
        materials: {},
        grown: {
          parts: bigger.built,
          buildable: ['cellar'],
          learned: ['slate'],
          rooms: fresh,
          displays: bigger.displays,
        },
      },
    );
    expect(done.house.built).toEqual(bigger.built);
    expect(done.house.rooms.map((r) => r.id).sort()).toEqual(bigger.rooms.map((r) => r.id).sort());
    expect(done.own.progress).toEqual([]);
    expect(done.own.buildable).toEqual(['cellar']);
    expect(done.own.items.blueprints).toContain('slate');
    expect(done.own.purse).toEqual(purse);
  });

  it('a craft raises the count, the free copies and the purse; a skin joins the owned skins', () => {
    const fromScratch = { ...own, items: { ...own.items, pieces: {} }, free: {} };
    const piece = afterCraft(
      { house, own: fromScratch },
      { itemId: 'cosy-rug', kind: 'piece', count: 1, purse, materials: {} },
    );
    expect(piece.own.items.pieces['cosy-rug']).toBe(1);
    expect(piece.own.free['cosy-rug']).toBe(1);
    const second = afterCraft(piece, {
      itemId: 'cosy-rug',
      kind: 'piece',
      count: 2,
      purse,
      materials: {},
    });
    expect(second.own.items.pieces['cosy-rug']).toBe(2);
    expect(second.own.free['cosy-rug']).toBe(2);
    const skin = afterCraft(second, {
      itemId: 'slate',
      kind: 'skin',
      count: 1,
      purse,
      materials: {},
    });
    expect(skin.own.items.skins).toContain('slate');
    expect(skin.own.purse).toEqual(purse);
  });

  it('a skin answer replaces the one room, or the exterior, and nothing else', () => {
    const first = house.rooms[0];
    if (first === undefined) throw new Error('no room');
    const room = { ...first, wall: 'tidepool-wall' };
    const painted = afterSkin(state, { target: 'room', room });
    expect(painted.house.rooms[0]).toEqual(room);
    expect(painted.house.exterior).toEqual(house.exterior);
    const roofed = afterSkin(state, {
      target: 'exterior',
      exterior: { roof: 'slate', walls: 'timber', frame: 'frame-timber:dark' },
    });
    expect(roofed.house.exterior).toEqual({
      roof: 'slate',
      walls: 'timber',
      frame: 'frame-timber:dark',
    });
    expect(roofed.house.rooms).toEqual(house.rooms);
  });

  it('placing replaces the room and the free copies', () => {
    const room = { ...(house.rooms[0] as (typeof house.rooms)[number]), spots: { 'rug-a': null } };
    const next = afterPlace(state, {
      room,
      from: null,
      own: { free: { 'cosy-rug': 1 } },
      housemates: [],
    });
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
