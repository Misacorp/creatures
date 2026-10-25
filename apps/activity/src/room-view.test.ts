import { describe, expect, it } from 'vitest';
import type { Resident } from './room-data';
import { ROOM_SIZE, ROOM_SPOTS, roomScene } from './sprites/room-art';
import {
  allBusyLabel,
  edgePlacements,
  layerPlacements,
  moveHereLabel,
  occupiedSpots,
  residentInfo,
  seatResidents,
  spotName,
} from './room-view';

const creature = {
  id: 'c1',
  species: 'splashet',
  shiny: false,
  level: 12,
  nickname: null,
  quirk: null,
  craftingLevel: 3,
  explorerRank: 2,
  firstOnServer: false,
  gear: [],
};

const resident = (
  userId: string,
  name: string,
  busy = false,
  spot: Resident['spot'] = null,
): Resident => ({
  userId,
  name,
  spot,
  creature: busy ? null : { ...creature, id: `c-${userId}` },
});

describe('residentInfo', () => {
  it('has the owner, name, level, element and the new facts', () => {
    const info = residentInfo('Misa', creature);
    expect(info).toMatchObject({
      name: 'Splashet',
      species: 'splashet',
      level: 12,
      element: 'tide',
      ownerName: 'Misa',
      shiny: false,
      craftingLevel: 3,
      explorerRank: 2,
    });
  });

  it('carries "First on server" into the popover info only when the creature has it', () => {
    expect(residentInfo('Misa', { ...creature, firstOnServer: true }).firstOnServer).toBe(true);
    expect(residentInfo('Misa', creature)).not.toHaveProperty('firstOnServer');
  });

  it('carries the worn items for the popover, or none when nothing is worn', () => {
    expect(residentInfo('Misa', creature).gear).toEqual([]);
    const worn = [
      {
        baseId: 'kelp-cap',
        slot: 'hat' as const,
        rarity: 'rare' as const,
        itemLevel: 3,
        lines: ['Attack +4%'],
      },
    ];
    expect(residentInfo('Misa', { ...creature, gear: worn }).gear).toEqual(worn);
  });

  it('uses the nickname as the name, and leaves an unknown Crafting level out', () => {
    const info = residentInfo('Misa', { ...creature, nickname: 'Bubbles', craftingLevel: null });
    expect(info.name).toBe('Bubbles');
    expect(info).not.toHaveProperty('craftingLevel');
  });
});

describe('seatResidents', () => {
  it('gives everyone their own spot, with an accessible label', () => {
    const seated = seatResidents(
      'i1',
      [resident('1', 'Misa'), resident('2', 'Aino'), resident('3', 'Bo', true)],
      ROOM_SPOTS,
    );
    expect(seated).toHaveLength(3);
    expect(new Set(seated.map((s) => s.spot.id)).size).toBe(3);
    const misa = seated.find((s) => s.resident.userId === '1');
    expect(misa?.label).toBe("Misa's Splashet, level 12");
    const busy = seated.find((s) => s.resident.userId === '3');
    expect(busy?.info).toBeNull();
    expect(busy?.label).toBe("Bo's creatures are all out working");
  });

  it('is sorted by the draw order of the spots', () => {
    const people = Array.from({ length: 10 }, (_, i) => resident(String(i + 1), `P${String(i)}`));
    const zs = seatResidents('i1', people, ROOM_SPOTS).map((s) => s.spot.z);
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
  });

  it('shows only 16 when 20 are present', () => {
    const people = Array.from({ length: 20 }, (_, i) => resident(String(i + 1), `P${String(i)}`));
    expect(seatResidents('i1', people, ROOM_SPOTS)).toHaveLength(ROOM_SPOTS.length);
  });

  it('is the same whatever order the residents come in', () => {
    const people = ['1', '2', '3', '4'].map((id) => resident(id, id));
    const a = seatResidents('i1', people, ROOM_SPOTS);
    const b = seatResidents('i1', [...people].reverse(), ROOM_SPOTS);
    const spotOf = (list: typeof a, id: string) =>
      list.find((s) => s.resident.userId === id)?.spot.id;
    for (const id of ['1', '2', '3', '4']) expect(spotOf(a, id)).toBe(spotOf(b, id));
  });
});

describe('seatResidents with claims', () => {
  const spotOf = (list: ReturnType<typeof seatResidents>, id: string) =>
    list.find((s) => s.resident.userId === id)?.spot.id;

  it('seats a resident on the spot they chose', () => {
    const seated = seatResidents(
      'i1',
      [resident('1', 'Misa', false, { id: 'couch-middle', at: 5 }), resident('2', 'Aino')],
      ROOM_SPOTS,
    );
    expect(spotOf(seated, '1')).toBe('couch-middle');
    expect(spotOf(seated, '2')).not.toBe('couch-middle');
  });

  it('shows older-wins: the later claim on the same spot moves to a fallback', () => {
    const people = [
      resident('1', 'Misa', false, { id: 'fire-pouf', at: 3000 }),
      resident('2', 'Aino', false, { id: 'fire-pouf', at: 1000 }),
      resident('3', 'Bo', false, { id: 'fire-pouf', at: 2000 }),
    ];
    const seated = seatResidents('i1', people, ROOM_SPOTS);
    expect(spotOf(seated, '2')).toBe('fire-pouf');
    expect(spotOf(seated, '1')).not.toBe('fire-pouf');
    expect(spotOf(seated, '3')).not.toBe('fire-pouf');
    expect(seated).toHaveLength(3);
    expect(new Set(seated.map((s) => s.spot.id)).size).toBe(3);
    // Same room whatever order the residents come in.
    const reversed = seatResidents('i1', [...people].reverse(), ROOM_SPOTS);
    for (const id of ['1', '2', '3']) expect(spotOf(reversed, id)).toBe(spotOf(seated, id));
  });

  it('seats a busy resident (a note) on their claim too', () => {
    const seated = seatResidents(
      'i1',
      [resident('1', 'Misa', true, { id: 'table-stool', at: 5 })],
      ROOM_SPOTS,
    );
    expect(spotOf(seated, '1')).toBe('table-stool');
  });

  it('maps spots to who sits there', () => {
    const seated = seatResidents(
      'i1',
      [resident('1', 'Misa', false, { id: 'couch-left', at: 5 })],
      ROOM_SPOTS,
    );
    expect(occupiedSpots(seated)).toEqual(new Map([['couch-left', '1']]));
  });
});

describe('spot names', () => {
  it('has a name for every spot of the room', () => {
    for (const spot of ROOM_SPOTS) expect(spotName(spot.id)).not.toBe(spot.id);
  });

  it('labels the move button with the spot', () => {
    expect(moveHereLabel('couch-left')).toBe('Move here: couch, left seat');
    expect(moveHereLabel('unknown')).toBe('Move here: unknown');
  });
});

describe('placements', () => {
  const { props: ROOM_PROPS, edgeTile: EDGE_TILE } = roomScene('night');

  it('splits the scene into back and front, keeping the draw order', () => {
    const back = layerPlacements(ROOM_PROPS, 'back');
    const front = layerPlacements(ROOM_PROPS, 'front');
    expect(back.length + front.length).toBe(ROOM_PROPS.length);
    expect(back[0]?.sprite).toBe(ROOM_PROPS[0]?.sprite);
  });

  it('fills the sides with tiles next to the room, nearest first', () => {
    const placements = edgePlacements(EDGE_TILE, { left: 2, right: 1 });
    expect(placements.map((p) => p.x)).toEqual([-16, -32, ROOM_SIZE.width]);
    expect(placements.every((p) => p.y === 0 && p.sprite === EDGE_TILE)).toBe(true);
    expect(edgePlacements(EDGE_TILE, { left: 0, right: 0 })).toEqual([]);
  });

  it('has the busy label in one place', () => {
    expect(allBusyLabel('Misa')).toBe("Misa's creatures are all out working");
  });
});
