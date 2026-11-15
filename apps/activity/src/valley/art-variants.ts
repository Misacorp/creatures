/**
 * Variations of the valley's art scenes that Misa picks between (2026-11-15: "When in doubt, make variations (inc. screenshots) for me to
 * review and decide from"). Each one is a constant with a default (the pick), and a page address can choose another for a screenshot or a
 * look on staging: `?forge-fill=B` or `?click-cue=C`. A value that is not one of the choices is ignored. Display only; nothing is saved.
 *
 * - `forge-fill`, how the Forge's room fills the window. `A`: the largest whole pixel scale that shows the room's whole working height
 *   (the anvils' two rows and the front props), the edges tiled and dressed. `B`: one size step larger where the window allows, the top
 *   of the wall cropped so the cluster of clickable things reads bigger; the edges and the dressing at the bottom are cropped too.
 * - `click-cue`, how a clickable thing in the Forge and on the Signpost map shows that it is one (decoration shows nothing). `A`: a small
 *   name plate under each, always. `B`: the plate and a 1 px light outline only on hover, press or keyboard focus. `C`: a small
 *   persistent pip on each, and the plate on hover, press or keyboard focus.
 * - `crate-reveal`, how the sealed crate's reveal plays (`CrateReveal.tsx`). `A`: in the scene: the crate opens where it stands and the
 *   pieces rise from it over the room, which is dimmed. `B`: a full-screen moment over the place: a dark stage, the open crate at the
 *   bottom, the pieces popping up one by one, big. `C`: A with each piece flying to the bag, or onto the creature that wears it, after
 *   its card. `D`: B with the same flight.
 * - `crate-look`, the sealed crate's picture (the Art session's variants of `crate-sealed`). `A`: the iron-banded crate with a padlock.
 *   `B`: a treasure chest. `C`: a crate bound with glowing rune-bands. The shake and the open crate are drawn for A only, so B and C
 *   rattle by sliding the one picture and open into A's open crate.
 */
export type FillVariant = 'A' | 'B';
export type CueVariant = 'A' | 'B' | 'C';
export type RevealVariant = 'A' | 'B' | 'C' | 'D';
export type CrateLookVariant = 'A' | 'B' | 'C';

export const FORGE_FILL_DEFAULT: FillVariant = 'A';
export const CLICK_CUE_DEFAULT: CueVariant = 'A';
export const CRATE_REVEAL_DEFAULT: RevealVariant = 'B';
export const CRATE_LOOK_DEFAULT: CrateLookVariant = 'A';

function fromAddress<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof location === 'undefined') return fallback;
  const value = new URLSearchParams(location.search).get(key);
  return allowed.find((a) => a === value) ?? fallback;
}

export function forgeFill(): FillVariant {
  return fromAddress('forge-fill', ['A', 'B'], FORGE_FILL_DEFAULT);
}

export function clickCue(): CueVariant {
  return fromAddress('click-cue', ['A', 'B', 'C'], CLICK_CUE_DEFAULT);
}

export function crateReveal(): RevealVariant {
  return fromAddress('crate-reveal', ['A', 'B', 'C', 'D'], CRATE_REVEAL_DEFAULT);
}

export function crateLook(): CrateLookVariant {
  return fromAddress('crate-look', ['A', 'B', 'C'], CRATE_LOOK_DEFAULT);
}
