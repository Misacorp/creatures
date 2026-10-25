/**
 * What the living room draws, worked out from the residents (pure, no DOM): who sits in which spot,
 * the creature popover info and spoken label of each, and the sprite placements of the two prop
 * layers (wall and floor tiles included, so a wide screen has no letterbox). `LivingRoom.tsx` only
 * turns this into canvases and buttons.
 */
import type { CreatureInfo } from './creature-info';
import { ownedCreatureLabel } from './creature-info';
import { creatureName, getSpecies } from './game';
import { assignSpots, type SpotClaim } from './room-layout';
import type { Resident, ResidentCreature } from './room-data';
import {
  EDGE_TILE_WIDTH,
  ROOM_SIZE,
  type RoomLayer,
  type RoomProp,
  type RoomSpot,
} from './sprites/room-art';
import type { SpriteDef } from './sprites/sprite-data';

/** A sprite and where it goes, in room pixels (the room's top-left is 0,0; the sides go negative). */
export interface Placement {
  sprite: SpriteDef;
  x: number;
  y: number;
}

/** A resident in a spot, ready to draw. */
export interface Seated {
  resident: Resident;
  spot: RoomSpot;
  /** Set for a creature; null for the "all out working" note. */
  info: CreatureInfo | null;
  /** What assistive technology says for the button. */
  label: string;
}

/** The creature popover info of a resident's creature: whose it is, what it is called, and how it is doing. */
export function residentInfo(owner: string, creature: ResidentCreature): CreatureInfo {
  const species = getSpecies(creature.species);
  return {
    name: creatureName(creature),
    species: creature.species,
    level: creature.level,
    element: species?.element ?? 'tide',
    role: species?.role ?? 'setter',
    ownerName: owner,
    shiny: creature.shiny,
    explorerRank: creature.explorerRank,
    ...(creature.firstOnServer ? { firstOnServer: true } : {}),
    ...(creature.craftingLevel === null ? {} : { craftingLevel: creature.craftingLevel }),
    gear: creature.gear,
  };
}

/** The spoken label of the "all out working" note. */
export function allBusyLabel(name: string): string {
  return `${name}'s creatures are all out working`;
}

/** Short plain names of the room's spots, for the spoken labels of the keyboard way to move. */
export const SPOT_NAMES: Readonly<Record<string, string>> = {
  'window-sill': 'window sill',
  'window-floor': 'floor by the window',
  'window-cushion': 'floor cushion',
  'couch-left': 'couch, left seat',
  'couch-middle': 'couch, middle seat',
  'couch-right': 'couch, right seat',
  'table-chair-left': 'left chair at the table',
  'table-chair-right': 'right chair at the table',
  'table-stool': 'stool',
  'fire-mantel': 'fireplace mantel',
  'fire-rug-left': 'rug, left side',
  'fire-rug-right': 'rug, right side',
  'fire-pouf': 'pouf',
  'shelf-top': 'top of the bookshelf',
  'shelf-floor': 'floor by the bookshelf',
  'shelf-beanbag': 'beanbag',
};

/** What a spot is called out loud: its name, or the id itself for a spot that has no name yet. */
export function spotName(spotId: string): string {
  return SPOT_NAMES[spotId] ?? spotId;
}

/** The spoken label of the button that moves your creature to an empty spot. */
export function moveHereLabel(spotId: string): string {
  return `Move here: ${spotName(spotId)}`;
}

/** Spot id to the user sitting there. */
export function occupiedSpots(seated: readonly Seated[]): Map<string, string> {
  return new Map(seated.map((s) => [s.spot.id, s.resident.userId]));
}

/**
 * Seats everyone: the spot each resident gets from `assignSpots` (so everyone with the same instance,
 * the same people and the same claims sees the same room). A resident's claim is the spot they chose
 * (`resident.spot`); claims are seated first, oldest first, and a claim on a taken spot falls back.
 * Residents without a spot (more people than spots) are left out. Sorted by the spot's `z`, which is
 * the draw order.
 */
export function seatResidents(
  instanceId: string,
  residents: readonly Resident[],
  spots: readonly RoomSpot[],
): Seated[] {
  const claims = new Map<string, SpotClaim | null>(residents.map((r) => [r.userId, r.spot]));
  const assigned = assignSpots(
    instanceId,
    residents.map((r) => r.userId),
    spots,
    claims,
  );
  const seated: Seated[] = [];
  for (const resident of residents) {
    const spotId = assigned.get(resident.userId);
    const spot = spots.find((s) => s.id === spotId);
    if (spot === undefined) continue;
    const info = resident.creature === null ? null : residentInfo(resident.name, resident.creature);
    seated.push({
      resident,
      spot,
      info,
      label: info === null ? allBusyLabel(resident.name) : ownedCreatureLabel(info),
    });
  }
  return seated.sort((a, b) => a.spot.z - b.spot.z || a.spot.x - b.spot.x);
}

/** The props of one layer as placements, in draw order. */
export function layerPlacements(props: readonly RoomProp[], layer: RoomLayer): Placement[] {
  return props.filter((p) => p.layer === layer).map((p) => ({ sprite: p.sprite, x: p.x, y: p.y }));
}

/** The plain edge tiles to the left and right of the room, nearest first, for a wide screen. */
export function edgePlacements(
  tile: SpriteDef,
  fill: { left: number; right: number },
): Placement[] {
  const placements: Placement[] = [];
  for (let i = 1; i <= fill.left; i++) {
    placements.push({ sprite: tile, x: -i * EDGE_TILE_WIDTH, y: 0 });
  }
  for (let i = 0; i < fill.right; i++) {
    placements.push({ sprite: tile, x: ROOM_SIZE.width + i * EDGE_TILE_WIDTH, y: 0 });
  }
  return placements;
}
