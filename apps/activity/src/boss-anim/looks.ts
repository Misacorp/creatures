/**
 * What a boss move looks like: the weapon that is thrown and the burst where it lands. The motion belongs to the move's SHAPE
 * (`plan.ts`: a column strike is always a weapon coming down a lane); the look only chooses the art, so a boss's lance can be a
 * lightning-tipped spear and another boss's a trident without touching the timing or the path.
 *
 * Lookup, most specific first: the boss's look for the MOVE (by id), then the boss's look for the SHAPE, then the generic art of the
 * move's weapon form in the boss's element colours. Adding a boss's look is one entry in `BOSS_LOOKS` plus its art (`assets.ts`, or a
 * file of its own); a boss with no entry plays the generic art. How to: `docs/design/boss-animations.md`.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { swapPalette } from '../sprites/sprite-data';
import {
  BURST,
  GLINT,
  CHAIN,
  NOVA,
  ORB,
  SPEAR,
  STORM_BOLT,
  STORM_BURST,
  STORM_FORK,
  STORM_ORB,
  STORM_SPEAR,
  WAVE,
} from './assets';
import type { Form, Shape } from './plan';

/** A sprite and the whole screen pixels per sprite pixel it is drawn at. Weapons point up, gripped at the bottom centre. */
export interface Asset {
  sprite: SpriteDef;
  scale: number;
}

/** Part of a look: what a move may replace. */
export interface LookEntry {
  weapon?: Asset;
  impact?: Asset;
  /** The colour of the soft glow round the weapon. */
  glow?: string;
  /** A heavy move rattles the board as it lands (a one-shot). */
  heavy?: boolean;
}

/** One boss's look: art for single moves, and for whole shapes. */
export interface BossLook {
  moves?: Readonly<Record<string, LookEntry>>;
  shapes?: Readonly<Partial<Record<Shape, LookEntry>>>;
}

/** The art a move plays with. */
export interface ResolvedLook {
  weapon: Asset;
  impact: Asset;
  glint: Asset;
  glow: string;
  heavy: boolean;
}

/** The three colours the generic art takes from an element: main, dark and light. */
const TINTS: Readonly<Record<string, { a: string; b: string; c: string }>> = {
  tide: { a: '#4f8fe6', b: '#1f3f7a', c: '#cfe6ff' },
  ember: { a: '#ef6a3a', b: '#8a2a12', c: '#ffd25a' },
  grove: { a: '#5cbf5a', b: '#1f5a2a', c: '#d4f5a0' },
  spark: { a: '#f2d43d', b: '#7a5f10', c: '#ffffff' },
};
const NEUTRAL = { a: '#a69fc8', b: '#4a4170', c: '#f4eedc' };

const GENERIC: Readonly<Record<Form, Asset>> = {
  spear: { sprite: SPEAR, scale: 7 },
  wave: { sprite: WAVE, scale: 8 },
  orb: { sprite: ORB, scale: 9 },
  chain: { sprite: CHAIN, scale: 8 },
  nova: { sprite: NOVA, scale: 8 },
};
/** The sparks at the corners of a card that was hit: small, so the creature and its numbers stay readable. */
const GENERIC_IMPACT: Asset = { sprite: BURST, scale: 2 };
const GLINT_ASSET: Asset = { sprite: GLINT, scale: 4 };
const STORM_GLOW = '#f2d43d';
const STORM_IMPACT: Asset = { sprite: STORM_BURST, scale: 2 };

/** The Storm Sovereign: its Lightning Bolt a spear tipped with a lightning bolt, its single bolts big jagged bolts, its Storm Front a ball of storm. */
const STORM_SOVEREIGN: BossLook = {
  shapes: {
    column: { weapon: { sprite: STORM_SPEAR, scale: 6 }, impact: STORM_IMPACT, glow: STORM_GLOW },
    columns: { weapon: { sprite: STORM_SPEAR, scale: 6 }, impact: STORM_IMPACT, glow: STORM_GLOW },
    single: { weapon: { sprite: STORM_BOLT, scale: 8 }, impact: STORM_IMPACT, glow: STORM_GLOW },
    chain: { weapon: { sprite: STORM_BOLT, scale: 7 }, impact: STORM_IMPACT, glow: STORM_GLOW },
    scatter: { weapon: { sprite: STORM_FORK, scale: 8 }, impact: STORM_IMPACT, glow: STORM_GLOW },
    all: {
      weapon: { sprite: STORM_ORB, scale: 10 },
      impact: STORM_IMPACT,
      glow: STORM_GLOW,
      heavy: true,
    },
  },
  moves: {
    // A heavier bolt for the one-shot, which rattles the board.
    'judgement-bolt': { weapon: { sprite: STORM_BOLT, scale: 11 }, heavy: true },
    // Thunderclap and Static Strike are lines of three: the generic wave, in the look's own sparks.
    thunderclap: { impact: STORM_IMPACT, glow: STORM_GLOW },
    'static-strike': { impact: STORM_IMPACT, glow: STORM_GLOW },
  },
};

/** The looks by boss id (`content.bosses`). */
export const BOSS_LOOKS: Readonly<Record<string, BossLook>> = {
  'storm-sovereign': STORM_SOVEREIGN,
};

/** The art a boss's move plays with; `element` colours the generic art. */
export function resolveLook(
  bossId: string | null,
  element: string | null,
  move: { id: string; shape: Shape; form: Form },
): ResolvedLook {
  const look = bossId === null ? undefined : BOSS_LOOKS[bossId];
  const own = look?.moves?.[move.id];
  const shaped = look?.shapes?.[move.shape];
  const tint = TINTS[element ?? ''] ?? NEUTRAL;
  const generic = GENERIC[move.form];
  return {
    weapon: own?.weapon ??
      shaped?.weapon ?? { sprite: swapPalette(generic.sprite, tint), scale: generic.scale },
    impact: own?.impact ??
      shaped?.impact ?? {
        sprite: swapPalette(GENERIC_IMPACT.sprite, tint),
        scale: GENERIC_IMPACT.scale,
      },
    glint: GLINT_ASSET,
    glow: own?.glow ?? shaped?.glow ?? tint.a,
    heavy: own?.heavy ?? shaped?.heavy ?? false,
  };
}
