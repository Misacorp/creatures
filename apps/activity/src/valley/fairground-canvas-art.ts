/**
 * Every picture the Fairground's canvas draws, by name, in one file (`FairgroundCanvas.tsx` and `fairground-canvas.ts` read nothing
 * else). The real pieces come from the Art session's set (probably `valley-fairground`) and swap in here by name:
 *
 * | name              | size   | placeholder today                                                          |
 * | ----------------- | ------ | -------------------------------------------------------------------------- |
 * | `stall-open`      | 80x56  | the Market's stall (`valley-glow` market), one copy                        |
 * | `stall-locked`    | 80x56  | the same, dimmed                                                           |
 * | `stall-team-open` | 112x56 | two Market stalls side by side                                             |
 * | `stall-team-locked` | 112x56 | the same, dimmed                                                         |
 * | `grandstand`      | 128x48 | a 128 px cut of the Games' stands strip, empty bleachers                   |
 * | `grandstand-crowd`| 128x48 | the same with its crowd (entries are locked)                               |
 * | `tent`            | 64x54  | the camp's glow fairground tent (`valley-glow-camp`)                       |
 * | `prize-open`      | 64x48  | the visitor's open stall                                                   |
 * | `prize-shuttered` | 64x48  | the visitor's shuttered stall                                              |
 * | `rules-board`     | 24x32  | the Paddock's gate sign on a post                                          |
 * | `rosette-gold` (and silver, bronze) | 12x16 | the art kit's medal in its metal                          |
 *
 * Each stall has a poster slot (`POSTER`, 40x20, from the stall's top-left, centred) over its awning's back wall: the event's own
 * scene strip is drawn there (`posterArt`), and a counter ledge under it where the entered creatures stand (`COUNTER_FEET`, in
 * `fairground-canvas.ts`). Every function returns placements from the piece's own top-left, so a real sprite is one placement.
 */
import { GAMES_SCENES, SCENE_SIZE, STANDS_SIZE, type GamesSceneId } from '../games/art/scenes';
import type { Placement } from '../games/art/pixel';
import { PROP_TINTS, propTinted } from '../games/art/props';
import { thumbTop } from '../games/GamesParts';
import { propArt } from './place-prop-art';
import { glowSprite } from './valley-places';
import { spriteSize, type SpriteDef } from '../sprites/sprite-data';

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
export const POSTER = { w: 40, h: 20, y: 14 } as const;

/** The metals of the rosettes (a medal's name). */
export type RosetteMetal = 'gold' | 'silver' | 'bronze';

const METALS: readonly RosetteMetal[] = ['gold', 'silver', 'bronze'];

/** A `#rgb` or `#rrggbb` colour as its three channels (null for anything else). */
function parseColour(colour: string): [number, number, number] | null {
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(colour)?.[1];
  if (hex === undefined) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** A sprite with every colour scaled toward black (a locked stall). */
function dimmed(sprite: SpriteDef, by: number): SpriteDef {
  const palette: Record<string, string> = {};
  for (const [key, colour] of Object.entries(sprite.palette)) {
    const rgb = parseColour(colour);
    palette[key] =
      rgb === null
        ? colour
        : `#${rgb
            .map((c) =>
              Math.round(c * by)
                .toString(16)
                .padStart(2, '0'),
            )
            .join('')}`;
  }
  return { ...sprite, palette };
}

const cache = new Map<string, readonly Placement[]>();
function once(key: string, make: () => readonly Placement[]): readonly Placement[] {
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = make();
    cache.set(key, hit);
  }
  return hit;
}

/** The event stall, open or locked (entries closed), single or team. */
export function stallArt(team: boolean, locked: boolean): readonly Placement[] {
  return once(`stall:${String(team)}:${String(locked)}`, () => {
    const base = glowSprite('market');
    const sprite = locked ? dimmed(base, 0.6) : base;
    const { width } = spriteSize(sprite);
    const y = STALL_H - spriteSize(sprite).height;
    return team
      ? [
          { sprite, x: 0, y },
          { sprite, x: TEAM_W - width, y },
        ]
      : [{ sprite, x: Math.floor((SINGLE_W - width) / 2), y }];
  });
}

/** A cut of the Games' stands strip: the bleachers, the bunting and, when `crowd`, the fans on them. */
export function grandstandArt(crowd: boolean): readonly Placement[] {
  return once(`stand:${String(crowd)}`, () => {
    const strip = GAMES_SCENES['melon-hill'].stands({ frame: 0 });
    const rows = Math.min(STAND_H, STANDS_SIZE.height);
    return strip.back.filter((p) => {
      const size = spriteSize(p.sprite);
      // The fans are the small pieces on the back step (12x12, the strip draws them at rows 10 and 11).
      const fan = size.width <= 12 && size.height <= 12 && p.y >= 10 && p.y <= 11;
      return (
        p.x >= 0 && p.x + size.width <= STAND_W && p.y + size.height <= rows && (crowd || !fan)
      );
    });
  });
}

/** The tent with its flaps closed. */
export function tentArt(): readonly Placement[] {
  return once('tent', () => [{ sprite: glowSprite('fairground'), x: 0, y: 0 }]);
}

/** The Prize Stall, open (Wednesdays) or shuttered. */
export function prizeArt(open: boolean): readonly Placement[] {
  return once(`prize:${String(open)}`, () => {
    const sprite = glowSprite(open ? 'visitor' : 'visitor-away');
    return [{ sprite, x: Math.floor((PRIZE.w - spriteSize(sprite).width) / 2), y: 0 }];
  });
}

const POST: SpriteDef = {
  rows: Array.from({ length: 16 }, () => 'aa'),
  palette: { a: '#7a5230' },
};

/** The Rules board: a sign on a post. */
export function boardArt(): readonly Placement[] {
  return once('board', () => {
    const sign = propArt('paddockGateSign');
    const { width } = spriteSize(sign);
    return [
      { sprite: POST, x: Math.floor((BOARD.w - 2) / 2), y: 14 },
      { sprite: sign, x: Math.floor((BOARD.w - width) / 2), y: 0 },
    ];
  });
}

/** A rosette: the art kit's medal in its metal, centred in the box. */
export function rosetteArt(metal: RosetteMetal): readonly Placement[] {
  return once(`rosette:${metal}`, () => {
    const sprite = propTinted('medal', PROP_TINTS.medal?.[METALS.indexOf(metal)]);
    const size = spriteSize(sprite);
    return [
      {
        sprite,
        x: Math.floor((ROSETTE.w - size.width) / 2),
        y: Math.floor((ROSETTE.h - size.height) / 2),
      },
    ];
  });
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
