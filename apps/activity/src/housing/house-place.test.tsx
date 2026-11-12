import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type OwnHouseView, type RoomView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import { ApiError } from '../api';
import { SAMPLE_STATE } from '../creature-card-sample';
import { byClass, byName, createPage, visibleText, type FakeElement, type Page } from '../test-dom';
import { SAMPLE_NOW, sampleHouse, sampleList, sampleOwn } from './house-sample';

/** The House place on the panels' sample data: the network is a stand-in, everything else is the real page. */

const placeCalls: [
  string,
  string,
  string | null,
  { roomId: string; spotId: string } | undefined,
][] = [];
let failBuild = false;
let own: OwnHouseView = sampleOwn('rich');

vi.mock('./housing-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./housing-api')>()),
  fetchOwnHouse: () => Promise.resolve({ house: sampleHouse(), own }),
  fetchHouses: () => Promise.resolve(sampleList()),
  fetchCatalogue: () => Promise.reject(new Error('not needed here')),
  markSeen: () => Promise.resolve(),
  buildPart: (partId: string) => {
    if (failBuild) return Promise.reject(new ApiError(409, 'insufficient_funds'));
    const kind = housing.rooms.find((k) => k.id === 'cellar');
    return Promise.resolve({
      part: { partId, paid: [], remaining: [] },
      built: true,
      purse: own.purse,
      materials: {},
      grown: {
        parts: [...sampleHouse().built, partId],
        buildable: [],
        learned: [],
        rooms: [
          {
            id: `${partId}:cellar`,
            kind: 'cellar',
            wall: kind?.wall ?? '',
            floor: kind?.floor ?? '',
            trim: null,
            ceiling: null,
            spots: {},
          },
        ],
        displays: [],
      },
    });
  },
  placePiece: (
    roomId: string,
    spotId: string,
    pieceId: string | null,
    from?: { roomId: string; spotId: string },
  ) => {
    placeCalls.push([roomId, spotId, pieceId, from]);
    const room: RoomView = {
      ...(sampleHouse().rooms.find((r) => r.id === roomId) as RoomView),
    };
    room.spots = { ...room.spots, [spotId]: pieceId };
    if (from !== undefined && from.roomId === roomId) room.spots[from.spotId] = null;
    return Promise.resolve({ room, from: null, own: { free: own.free }, housemates: [] });
  },
}));

const { HousePlace } = await import('./HousePlace');

let page: Page | null = null;

beforeEach(() => {
  placeCalls.length = 0;
  failBuild = false;
  own = sampleOwn('rich');
  Reflect.set(globalThis, 'window', {
    innerHeight: 800,
    innerWidth: 390,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    scrollTo: () => undefined,
  });
});

afterEach(() => {
  page?.unmount();
  page = null;
  Reflect.deleteProperty(globalThis, 'window');
});

async function settle(p: Page): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  p.update(() => undefined);
}

async function open(): Promise<Page> {
  page = createPage();
  page.draw(<HousePlace creatures={SAMPLE_STATE.creatures} now={SAMPLE_NOW} />);
  await settle(page);
  return page;
}

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

describe('the House place on sample data', () => {
  it('shows the scene, the two skin chips, the five rows and the guestbook', async () => {
    const p = await open();
    expect(byClass(p.root, 'house-room').length).toBeGreaterThanOrEqual(4);
    // The roof and the walls are dropdown triggers, not chips.
    const roof = first(byName(p.root, 'button', /^Roof: /));
    expect(roof.getAttribute('class')).toContain('equip-trigger');
    expect(byName(p.root, 'button', /^Walls: /)).toHaveLength(1);
    // The house frame (housing C5) beside them, as built until chosen.
    expect(byName(p.root, 'button', 'Frame: As built')).toHaveLength(1);
    const rows = byClass(p.root, 'vy-row');
    expect(
      rows
        .map((r) => r.getAttribute('aria-label') ?? '')
        .filter((l) => /^(Build|Workbench|Catalogue|Mailbox|Visit)/.test(l)),
    ).toHaveLength(5);
    expect(visibleText(p.root)).toContain('Juno');
    // The place has no Back of its own.
    expect(byName(p.root, 'button', /Back/)).toHaveLength(0);
  });

  it('opens Build as a list of parts and a part as its own page, with Back to the list and then the house', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Build, /)));
    await settle(p);
    expect(visibleText(p.root)).toContain('Build');
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    const part = first(byName(p.root, 'button', /^Cellar, /));
    p.click(part);
    await settle(p);
    // The part's page: its name is the title, "Pay in" is there, Back goes to the parts.
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(1);
    expect(first(byName(p.root, 'button', /Back/)).getAttribute('class')).toContain('drill-back');
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain('Cellar');
    p.click(first(byName(p.root, 'button', /Back/)));
    await settle(p);
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    expect(visibleText(first(byClass(p.root, 'drill-head')))).toContain('Build');
    p.click(first(byName(p.root, 'button', /Back/)));
    await settle(p);
    expect(byClass(p.root, 'house-room').length).toBeGreaterThan(0);
  });

  it('focuses a room, opens a spot in a drawer, and moves a piece with no free copy: one request names the old spot and the new one', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', 'Hearth')));
    await settle(p);
    const spots = byClass(p.root, 'house-spot');
    expect(spots.length).toBeGreaterThanOrEqual(8);
    // Every copy of the cosy plant stands in its spot; the chair's spot asks for it.
    const chair = first(byName(p.root, 'button', /^Small floor: Cosy Chair/));
    p.click(chair);
    await settle(p);
    const plant = first(byName(p.root, 'button', /^Cosy Plant, placed elsewhere/));
    p.click(plant);
    await settle(p);
    expect(visibleText(p.root)).toContain('From the Hearth');
    p.click(first(byName(p.root, 'button', /^Move here/)));
    await settle(p);
    // One request (a bed would take its sleeper along): the piece, where it goes and where it stood.
    expect(placeCalls).toHaveLength(1);
    const [roomId, spotId, pieceId, from] = placeCalls[0] ?? [];
    expect(pieceId).toBe('cosy-plant');
    expect(from?.roomId).toBe(roomId);
    expect(from?.spotId).not.toBe(spotId);
  });

  it('shows a refusal once on the Build page, not twice', async () => {
    failBuild = true;
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Build, /)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Cellar, /)));
    await settle(p);
    p.click(first(byName(p.root, 'button', 'Pay in')));
    await settle(p);
    const shown = byClass(p.root, 'alert').filter((a) =>
      visibleText(a).includes('Not enough Acorns'),
    );
    expect(shown).toHaveLength(1);
  });

  it('finishing a part goes back to the house with a success note and the new room, not to the build list', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', /^Build, /)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Cellar, /)));
    await settle(p);
    p.click(first(byName(p.root, 'button', 'Pay in')));
    await settle(p);
    // The page of the part and the build list are gone: the house shows, with the note.
    expect(byName(p.root, 'button', 'Pay in')).toHaveLength(0);
    expect(byClass(p.root, 'house-room').length).toBeGreaterThan(0);
    expect(visibleText(p.root)).toContain('The Cellar is built');
    expect(byClass(p.root, 'alert').some((a) => a.getAttribute('class')?.includes('success'))).toBe(
      true,
    );
    // The new room is a button in the scene, and is revealed.
    expect(byName(p.root, 'button', 'Cellar').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'house-reveal').length).toBeGreaterThan(0);
    // The note goes when the player goes on.
    p.click(first(byName(p.root, 'button', /^Build, /)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /Back/)));
    await settle(p);
    expect(visibleText(p.root)).not.toContain('The Cellar is built');
  });

  it('places a piece that has a free copy with one request', async () => {
    const p = await open();
    p.click(first(byName(p.root, 'button', 'Hearth')));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Small floor: Cosy Chair/)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Empty/)));
    await settle(p);
    p.click(first(byName(p.root, 'button', /^Empty the spot/)));
    await settle(p);
    expect(placeCalls).toHaveLength(1);
    expect(placeCalls[0]?.[2]).toBeNull();
  });
});
