/**
 * The sealed crate's pictures, by name: the one place that reads the Art session's set `valley-forge-crate` (the concept set stays in the
 * library as it is, as `forge-interior-art.ts` does for the interior; Misa has not rated it). The crate pieces are drawn in the rare
 * palette with alts `epic`, `day` and `epic-day` (`crate-view.ts`, `crateAlt`); the bursts are one palette each.
 *
 * Sizes in pixels: crate-sealed and the three shakes 20x18 (base row 17), crate-open 20x27 (base row 26: it stands on the sealed crate's
 * base, 9 rows higher), the bursts 48x48 with an empty centre at x 16-31, y 16-31 for the item.
 */
import type { SpriteDef } from '../sprites/sprite-data';
import { swapPalette } from '../sprites/sprite-data';
import { VALLEY_FORGE_CRATE_CONCEPTS } from '../sprites/concepts/valley-forge-crate';
import { crateAlt, type CrateFrame } from './crate-view';

/** The crate pieces' size, and the row each stands on (the same for the sealed crate and its shakes; the open one is taller). */
export const CRATE_SEALED = { w: 20, h: 18, base: 17 } as const;
export const CRATE_OPEN = { w: 20, h: 27, base: 26 } as const;
/** A burst's size and where the item goes in it (its clear centre). */
export const BURST = { size: 48, centre: 16, centreSize: 16 } as const;

const PIECE: Readonly<Record<CrateFrame, string>> = {
  sealed: 'crate-sealed',
  'shake-1': 'crate-shake-1',
  'shake-2': 'crate-shake-2',
  'shake-3': 'crate-shake-3',
  open: 'crate-open',
};

const cache = new Map<string, SpriteDef>();

/**
 * A frame of the crate: its glow by `best`, its colours by `night`. The picture is the Art session's main one, the iron-banded crate
 * (Misa's pick, 2026-11-15); the chest and the rune-bound variants stay in the art library, unwired.
 */
export function crateSprite(
  frame: CrateFrame,
  opts: { best: 'rare' | 'epic' | null; night: boolean },
): SpriteDef {
  const alt = crateAlt(opts.best, opts.night);
  const key = `${frame}:${alt ?? 'main'}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const concept = VALLEY_FORGE_CRATE_CONCEPTS.sprites[PIECE[frame]];
  if (concept === undefined) throw new Error(`valley-forge-crate has no ${PIECE[frame]}`);
  const colours = alt === undefined ? undefined : concept.alts?.[alt];
  const sprite = colours === undefined ? concept.sprite : swapPalette(concept.sprite, colours);
  cache.set(key, sprite);
  return sprite;
}

/** A rarity's burst ring (48 x 48, its centre empty for the item). */
export function burstSprite(rarity: 'common' | 'rare' | 'epic'): SpriteDef {
  const concept = VALLEY_FORGE_CRATE_CONCEPTS.sprites[`burst-${rarity}`];
  if (concept === undefined) throw new Error(`valley-forge-crate has no burst-${rarity}`);
  return concept.sprite;
}
