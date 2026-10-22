/**
 * Every Valley Games prop by name, as its frames, with the ramps it is meant to be tinted in. Hand-drawn
 * props come from `data/games-props.ts`, code-drawn ones from `drawn.ts`. Use `propSprite` to get a
 * frame, tinted and memoised.
 */
import type { SpriteDef } from '../../sprites/sprite-data';
import { GAMES_PROP_DATA } from './data/games-props';
import {
  DOOR,
  FROSTY_WINDOW,
  HOST_DESK,
  ICE_BLOCK,
  WINDOW,
  MELON_FRAMES,
  PODIUM_BLOCKS,
  SCOREBOARD_FRAMES,
} from './drawn';
import { TEAM_RAMPS, maybeTint, type RampName } from './tint';

const P = GAMES_PROP_DATA;

export const GAMES_PROPS = {
  ...P,
  melon: MELON_FRAMES,
  podium1: [PODIUM_BLOCKS[1]],
  podium2: [PODIUM_BLOCKS[2]],
  podium3: [PODIUM_BLOCKS[3]],
  scoreboard: SCOREBOARD_FRAMES,
  door: [DOOR],
  hostDesk: [HOST_DESK],
  frostyWindow: [FROSTY_WINDOW],
  window: [WINDOW],
  iceBlock: [ICE_BLOCK],
} as const satisfies Readonly<Record<string, readonly SpriteDef[]>>;

export type PropName = keyof typeof GAMES_PROPS;
export const PROP_NAMES = Object.keys(GAMES_PROPS) as PropName[];

/**
 * The tints each prop is drawn in (the first is its own colour). A prop with one entry is not meant to
 * be tinted; `[primary, secondary]` pairs tint both ramps.
 */
export type PropTint = RampName | readonly [RampName, RampName];

const MEDALS: readonly PropTint[] = ['gold', 'silver', 'bronze'];

export const PROP_TINTS: Readonly<Partial<Record<PropName, readonly PropTint[]>>> = {
  pepper: ['red', 'green', 'ghost', 'orange', 'yellow'],
  medal: [
    ['gold', 'blue'],
    ['silver', 'red'],
    ['bronze', 'green'],
  ],
  pin: ['purple', 'teal', 'pink'],
  trophy: MEDALS,
  podium1: MEDALS,
  podium2: MEDALS,
  podium3: MEDALS,
  shield: [
    ['tide', 'gold'],
    ['ember', 'silver'],
    ['grove', 'gold'],
    ['mire', 'bronze'],
  ],
  pennant: TEAM_RAMPS,
  fan: TEAM_RAMPS,
  buoy: ['red', 'orange', 'yellow'],
  confetti: [
    ['pink', 'teal'],
    ['yellow', 'blue'],
    ['red', 'green'],
  ],
  flame: ['ember', 'tide', 'purple'],
  zap: ['spark', 'tide'],
  heart: ['red', 'pink'],
  heal: ['green', 'grove'],
  sweat: ['water', 'ice'],
  thermometer: [
    ['pine', 'red'],
    ['frost', 'tide'],
  ],
  door: ['wood', 'frost', 'pine'],
  bucket: ['wood', 'frost'],
  crate: [
    ['wood', 'red'],
    ['pine', 'green'],
  ],
  scoreboard: [
    ['purple', 'wood'],
    ['red', 'wood'],
    ['tide', 'iron'],
  ],
  hostDesk: [
    ['purple', 'wood'],
    ['red', 'pine'],
    ['teal', 'wood'],
  ],
  frostyWindow: ['frost', 'pine'],
  stove: ['iron', 'stone'],
  stovePipe: ['iron', 'stone'],
  pole: ['wood', 'silver'],
  duck: ['yellow', 'pink'],
};

/** A frame of a prop (frames loop), tinted when asked. */
export function propSprite(
  name: PropName,
  frame = 0,
  tint?: RampName,
  tint2?: RampName,
): SpriteDef {
  const frames: readonly SpriteDef[] = GAMES_PROPS[name];
  const sprite = frames[((frame % frames.length) + frames.length) % frames.length];
  if (sprite === undefined) throw new Error(`Prop ${name} has no frames.`);
  return maybeTint(sprite, tint, tint2);
}

/** A prop with a `PropTint` (one ramp or a pair). */
export function propTinted(name: PropName, tint: PropTint | undefined, frame = 0): SpriteDef {
  if (tint === undefined) return propSprite(name, frame);
  if (typeof tint === 'string') return propSprite(name, frame, tint);
  return propSprite(name, frame, tint[0], tint[1]);
}
