/**
 * The honours of the player's creatures where the screens can read them (phase 5 step 9b, `systems/trials.md` V-TRIAL-1 to 3): the game
 * provides what the server says (`valley.creatures[].trial`, by creature id) once, and the creature's card and page read their creature's
 * honour and next trial from it, so no page between the game and the card has to carry it. Empty with the valley's systems off, where no
 * creature has an honour and nothing changes. `HonourRibbon` is the ribbon on the sprite.
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ValleyTrialView } from '@creatures/game';
import { VALLEY_HONOURS_CONCEPTS } from '../sprites/concepts/valley-honours';
import { Sprite } from '../sprites/Sprite';
import { honourName } from './honours-view';

const NONE: ReadonlyMap<string, ValleyTrialView> = new Map();

/** The trials of the player's creatures by id (`Game` provides them from the valley's state; empty with the systems off). */
export const HonoursContext = createContext<ReadonlyMap<string, ValleyTrialView>>(NONE);

/** A creature's trial view, or undefined (the systems are off, or the server has not said). */
export function useTrial(creatureId: string): ValleyTrialView | undefined {
  return useContext(HonoursContext).get(creatureId);
}

/** The honours held: 0 none, 1 Bronze, 2 Silver, 3 Gold. */
export function useHonour(creatureId: string): number {
  return useTrial(creatureId)?.honour ?? 0;
}

/** The trials by creature id, from the valley's creatures (what `Game` provides). */
export function honoursOf(
  creatures: readonly { id: string; trial?: ValleyTrialView | undefined }[] | undefined,
): ReadonlyMap<string, ValleyTrialView> {
  if (creatures === undefined) return NONE;
  return new Map(creatures.flatMap((c) => (c.trial === undefined ? [] : [[c.id, c.trial] as const])));
}

const RIBBON = VALLEY_HONOURS_CONCEPTS.sprites['honour-ribbon'];

/** The palette of each honour's metal over the Bronze drawing. */
const METAL: Readonly<Record<number, Readonly<Record<string, string>> | undefined>> = {
  1: undefined,
  2: RIBBON?.alts?.['silver'],
  3: RIBBON?.alts?.['gold'],
};

/**
 * The ribbon worn on a creature's sprite (V-TRIAL-1), at the sprite's lower right, in the metal of its highest honour; nothing for a
 * creature with none. Decoration: the honour is said in words by the title and the badge. The parent is the sprite's box
 * (`position: relative`, or an absolutely placed scene stand); `scale` is the sprite's own pixel scale or a little under it.
 */
export function HonourRibbon({ honour, scale }: { honour: number; scale: number }) {
  if (RIBBON === undefined || honourName(honour) === null) return null;
  const metal = METAL[honour];
  return (
    <span class="honour-ribbon" aria-hidden="true">
      <Sprite sprite={RIBBON.sprite} scale={scale} {...(metal === undefined ? {} : { palette: metal })} />
    </span>
  );
}
