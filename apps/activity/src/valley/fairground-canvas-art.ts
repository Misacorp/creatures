/**
 * Every picture the Fairground's canvas draws, by name, in one file (`FairgroundCanvas.tsx` and `fairground-canvas.ts` read nothing
 * else). The pieces are the Art session's `valley-fairground-stalls` and `valley-fairground-props` sets (main A of each, drawn by day
 * through its `alts.day`; both are sets of 'free' sprites), the camp's fairground tent for the open state:
 *
 * | name                     | size   | art                                                        |
 * | ------------------------ | ------ | ---------------------------------------------------------- |
 * | stall, stall-locked      | 80x56  | `valley-fairground-stalls` `stall`, `stall-locked`         |
 * | team-stall (-locked)     | 112x56 | `team-stall`, `team-stall-locked`                          |
 * | prize-stall (-shuttered) | 64x48  | `prize-stall`, `prize-stall-shuttered`                     |
 * | grandstand               | 128x48 | `valley-fairground-props` `grandstand` (tiles sideways)    |
 * | tent (open)              | 64x54  | `valley-glow-camp` `fairground`                            |
 * | tent-closed (locked)     | 64x54  | `valley-fairground-props` `tent-closed`                    |
 * | rules-board              | 24x32  | `rules-board`                                              |
 * | rosette-gold/silver/bronze | 12x16 | `rosette-gold`, `rosette-silver`, `rosette-bronze`        |
 *
 * An open stall has a poster slot (`POSTER`, 40x20, flat colour `f` in the art) that the event's own scene strip is painted over
 * (`posterArt`); a locked stall's shutters cover it, so nothing is painted there. The counter ledge is row 44 and a creature's feet go
 * on row 43 (`COUNTER_FEET` in `fairground-canvas.ts`). Every function returns placements from the piece's own top-left.
 */
import { GAMES_SCENES, SCENE_SIZE, type GamesSceneId } from '../games/art/scenes';
import type { Placement } from '../games/art/pixel';
import { thumbTop } from '../games/GamesParts';
import { swapPalette, type SpriteDef } from '../sprites/sprite-data';
import { VALLEY_FAIRGROUND_PROPS_CONCEPTS } from '../sprites/concepts/valley-fairground-props';
import { VALLEY_FAIRGROUND_STALLS_CONCEPTS } from '../sprites/concepts/valley-fairground-stalls';
import { glowSprite } from './valley-places';

/** A box in scene pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The pieces' sizes in art pixels: the real art takes these. */
export const SINGLE_W = 80;
export const TEAM_W = 112;
export const STALL_H = 56;
export const STAND_W = 128;
export const STAND_H = 48;
export const TENT = { w: 64, h: 54 } as const;
export const PRIZE = { w: 64, h: 48 } as const;
export const BOARD = { w: 24, h: 32 } as const;
export const ROSETTE = { w: 12, h: 16 } as const;
/** The poster slot: 40x20, its top at this row of the stall (its left is centred). */
export const POSTER = { w: 40, h: 20, y: 16 } as const;

/** The metals of the rosettes (a medal's name). */
export type RosetteMetal = 'gold' | 'silver' | 'bronze';

const cache = new Map<string, readonly Placement[]>();
function once(key: string, make: () => readonly Placement[]): readonly Placement[] {
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = make();
    cache.set(key, hit);
  }
  return hit;
}

type ConceptSetLike = typeof VALLEY_FAIRGROUND_STALLS_CONCEPTS;

/** A piece of a set by day (its main palette is night; `alts.day` recolours the same pixels). */
function byDay(set: ConceptSetLike, name: string): SpriteDef {
  const concept = set.sprites[name];
  if (concept === undefined) throw new Error(`${set.id} has no ${name}`);
  const day = concept.alts?.['day'];
  return day === undefined ? concept.sprite : swapPalette(concept.sprite, day);
}

const stalls = (name: string): readonly Placement[] =>
  once(`stalls:${name}`, () => [
    { sprite: byDay(VALLEY_FAIRGROUND_STALLS_CONCEPTS, name), x: 0, y: 0 },
  ]);
const props = (name: string): readonly Placement[] =>
  once(`props:${name}`, () => [
    { sprite: byDay(VALLEY_FAIRGROUND_PROPS_CONCEPTS, name), x: 0, y: 0 },
  ]);

/** The event stall, open or locked (entries closed), single or team. */
export function stallArt(team: boolean, locked: boolean): readonly Placement[] {
  return stalls(`${team ? 'team-stall' : 'stall'}${locked ? '-locked' : ''}`);
}

/** The grandstand strip, 128 wide, which tiles sideways (its crowd is drawn in it). */
export function grandstandArt(): readonly Placement[] {
  return props('grandstand');
}

/** The tent: open (a lit doorway) while entries are open, with its flaps closed once they lock. */
export function tentArt(closed: boolean): readonly Placement[] {
  return closed
    ? props('tent-closed')
    : once('tent', () => [{ sprite: glowSprite('fairground'), x: 0, y: 0 }]);
}

/** The Prize Stall, open (Wednesdays) or shuttered. */
export function prizeArt(open: boolean): readonly Placement[] {
  return stalls(open ? 'prize-stall' : 'prize-stall-shuttered');
}

/** The Rules board. */
export function boardArt(): readonly Placement[] {
  return props('rules-board');
}

/** A rosette in its metal. */
export function rosetteArt(metal: RosetteMetal): readonly Placement[] {
  return props(`rosette-${metal}`);
}

/**
 * The event's own scene as a poster: the scene's still frame shifted so the `POSTER` window (the poster canvas clips to it) shows
 * the scene's middle at the height its entrants stand at. Drawn on a canvas of its own over the stall.
 */
export function posterArt(scene: GamesSceneId): readonly Placement[] {
  return once(`poster:${scene}`, () => {
    const layers = GAMES_SCENES[scene].layers({ frame: 0 });
    const dx = -Math.floor((SCENE_SIZE.width - POSTER.w) / 2);
    // The window shows the top of the strip the event's card crops (the scene's backdrop, its fence or water line, some ground).
    const dy = -(thumbTop(scene) + 2);
    return [...layers.back, ...layers.front].map((p) => ({
      sprite: p.sprite,
      x: p.x + dx,
      y: p.y + dy,
    }));
  });
}
