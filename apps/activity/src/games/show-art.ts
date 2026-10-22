/**
 * The show player's own small pieces of art and the mapping from the engine's words to the art kit:
 * the "you" arrow and the team dot (tintable, ramp keys a to d), each effect's prop and where it sits,
 * an engine state's drawn state, the pepper tiers' colours and a player's team colour.
 */
import type { GamesActorState, GamesFx } from '@creatures/engine';
import type { GamesKind } from '@creatures/game';
import type { SpriteDef } from '../sprites/sprite-data';
import type { ActorState } from './art/GamesScene';
import type { PropName } from './art/props';
import { RAMPS, TEAM_RAMPS, tintSprite, type RampName } from './art/tint';
import { hashString } from './show-timeline';

const INK = '#0d0a1a';
const GOLD = RAMPS.gold;

/** A small arrow pointing down at your creature (7x5). */
export const YOU_ARROW: SpriteDef = {
  rows: ['kkkkkkk', 'kabbbck', '.kbccdk', '..kdk..', '...k...'],
  palette: { k: INK, a: GOLD[0], b: GOLD[1], c: GOLD[2], d: GOLD[3] },
};

/** A coloured patch under a creature's feet in a team event, so a team reads as one (8x3). */
export const TEAM_DOT: SpriteDef = {
  rows: ['.bbbbbb.', 'bccccccb', '.dddddd.'],
  palette: { b: GOLD[1], c: GOLD[2], d: GOLD[3] },
};

/** A player's team colour: a stable pick from the bright ramps by their id. */
export function teamRamp(playerId: string): RampName {
  return TEAM_RAMPS[hashString(playerId) % TEAM_RAMPS.length] ?? 'red';
}

/** The CSS colour of a team's name in text (the ramp's light side, readable on the dark panels). */
export function teamColour(playerId: string): string {
  return RAMPS[teamRamp(playerId)][1];
}

export function youArrow(ramp: RampName): SpriteDef {
  return tintSprite(YOU_ARROW, ramp);
}

export function teamDot(ramp: RampName): SpriteDef {
  return tintSprite(TEAM_DOT, ramp);
}

/** A pepper's colour by heat tier: mild green, hot red, ghost purple. */
export const PEPPER_TIERS: readonly RampName[] = ['green', 'red', 'purple'];

/** The drawn state of an engine state (movement such as running is the CSS bob, not an overlay). */
export function drawnState(kind: GamesKind, s: GamesActorState): ActorState {
  switch (s) {
    case 'sweat':
      return 'sweat';
    case 'flame':
      return 'flame';
    case 'flat':
      return 'flat';
    case 'dizzy':
      return 'dizzy';
    case 'swim':
      return 'swim';
    case 'out':
      return kind === 'chase' ? 'flat' : kind === 'swim' ? 'none' : 'none';
    default:
      return kind === 'swim' ? 'swim' : 'none';
  }
}

/** How an effect is drawn: a prop, its tint, where it sits from the actor's feet (scene px). */
export interface FxArt {
  prop: PropName;
  tint?: RampName | undefined;
  dx: number;
  dy: number;
  /** A popping number over it ("+2"). */
  pop?: string | undefined;
}

/** Each effect's art (null: shown another way, by a state, a lift or the crowd). */
export function fxArt(kind: GamesKind, fx: GamesFx | 'out'): FxArt | null {
  switch (fx) {
    case 'steam':
    case 'burp':
      return { prop: 'steam', dx: 0, dy: -22 };
    case 'splash':
      return { prop: 'splash', dx: 0, dy: kind === 'endure' ? -4 : 2 };
    case 'flame':
      return { prop: 'flame', dx: 0, dy: -16 };
    case 'spark':
    case 'zap':
      return { prop: 'zap', dx: 0, dy: -10 };
    case 'squash':
      return { prop: 'dust', dx: 0, dy: 2 };
    case 'shove':
      return { prop: 'dust', dx: 0, dy: 2 };
    case 'gulp':
      // The gulp bubble has its own "+2".
      return { prop: 'gulp', dx: 0, dy: -18 };
    case 'stumble':
    case 'ko':
      return { prop: 'dizzy', dx: 0, dy: -14 };
    case 'heal':
      return { prop: 'heal', dx: 6, dy: -16 };
    case 'shield':
      return { prop: 'shield', dx: 8, dy: -6 };
    case 'sweat':
      return { prop: 'sweat', dx: 6, dy: -12 };
    case 'chill':
      return { prop: 'sweat', tint: 'ice', dx: 6, dy: -12 };
    case 'bonk':
      return kind === 'swim'
        ? { prop: 'sharkLeap', dx: -4, dy: -8 }
        : { prop: 'dizzy', dx: 0, dy: -14 };
    case 'star':
      return { prop: 'heart', tint: 'pink', dx: 0, dy: -20 };
    case 'cheer':
      return { prop: 'confetti', dx: 0, dy: -22 };
    case 'hop':
    case 'duck':
    case 'out':
      return null;
  }
}

/** Effects that move the actor itself: a hop (up), a duck (squashed down), a jolt (a shake). */
export function fxMotion(fx: GamesFx | 'out'): 'hop' | 'duck' | 'jolt' | null {
  switch (fx) {
    case 'hop':
      return 'hop';
    case 'duck':
      return 'duck';
    case 'shove':
    case 'bonk':
    case 'zap':
      return 'jolt';
    default:
      return null;
  }
}

/** The meter's colour by kind (heat red, cold blue, fullness orange, stamina green). */
export function meterTint(kind: GamesKind, scene: string): RampName | undefined {
  switch (kind) {
    case 'endure':
      return scene === 'frost-bath' ? 'tide' : 'red';
    case 'feast':
      return 'orange';
    case 'swim':
      return 'green';
    default:
      return undefined;
  }
}

/** 3x5 glyphs for the popping numbers ("+2"). */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '+': ['...', '.x.', 'xxx', '.x.', '...'],
  '0': ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'],
  '1': ['.x.', 'xx.', '.x.', '.x.', 'xxx'],
  '2': ['xxx', '..x', 'xxx', 'x..', 'xxx'],
  '3': ['xxx', '..x', '.xx', '..x', 'xxx'],
  '4': ['x.x', 'x.x', 'xxx', '..x', '..x'],
  '5': ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  '6': ['xxx', 'x..', 'xxx', 'x.x', 'xxx'],
  '7': ['xxx', '..x', '.x.', '.x.', '.x.'],
  '8': ['xxx', 'x.x', 'xxx', 'x.x', 'xxx'],
  '9': ['xxx', 'x.x', 'xxx', '..x', 'xxx'],
};

const numberCache = new Map<string, SpriteDef>();

/**
 * A short number ("+2") as a pixel sprite: 3x5 glyphs a pixel apart, in the ramp's light colour with an
 * ink outline all round. Characters without a glyph are left out. Memoised by text and ramp.
 */
export function numberSprite(text: string, ramp: RampName = 'gold'): SpriteDef {
  const key = `${text}|${ramp}`;
  const hit = numberCache.get(key);
  if (hit !== undefined) return hit;
  const glyphs = [...text].flatMap((ch) => {
    const g = GLYPHS[ch];
    return g === undefined ? [] : [g];
  });
  const width = Math.max(1, glyphs.length * 4 - 1) + 2;
  const height = 7;
  const grid: string[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => '.'),
  );
  glyphs.forEach((g, i) => {
    g.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'x') {
          const line = grid[y + 1];
          if (line !== undefined) line[1 + i * 4 + x] = 'b';
        }
      });
    });
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y]?.[x] !== '.') continue;
      const near = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => grid[y + dy]?.[x + dx] === 'b'));
      const line = grid[y];
      if (near && line !== undefined) line[x] = 'k';
    }
  }
  const sprite: SpriteDef = {
    rows: grid.map((r) => r.join('')),
    palette: { k: INK, b: RAMPS[ramp][1] },
  };
  numberCache.set(key, sprite);
  return sprite;
}
