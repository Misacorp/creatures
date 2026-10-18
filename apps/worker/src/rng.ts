import { createCryptoRng, type Rng } from '@creatures/game';

/**
 * A live random source: draws come from `crypto.getRandomValues` at the moment they are needed
 * (never a seed a player could compute). Tests inject seeded streams instead.
 */
export function liveRng(): Rng {
  return createCryptoRng((array) => crypto.getRandomValues(array));
}
