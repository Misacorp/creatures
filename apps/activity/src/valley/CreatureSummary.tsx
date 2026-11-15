/**
 * One creature, summed up in a place's drawer (the Bonfire's resting creature, the Paddock's roamer): the drawer's title already says its
 * name, so this is the portrait (large) with its tags (element, role, what it does now) beside it, the experience row, and one or two
 * lines for what it does here and what it gains. It reuses the creature card's own pieces (`CreatureHead` without its name, and the
 * page's `ExperienceRow`), so it starts the way the Creatures page does. What goes under it (the place's actions) is the caller's.
 */
import type { ComponentChildren } from 'preact';
import type { Creature, GameState } from '../api';
import { CreatureHead } from '../CreatureHead';
import { ExperienceRow } from '../creature-page/PageHeader';

/** The portrait's scale in a drawer: larger than the card's, as the drawer has the room. */
export const SUMMARY_SCALE = 6;

/** What the tags of a creature read when the place does not hold the game's state (no lounger, no server firsts). */
export const NO_TAG_STATE: Pick<GameState, 'loungerId' | 'loungeXp' | 'serverFirsts'> = {
  loungerId: null,
  loungeXp: {},
  serverFirsts: [],
};

export function CreatureSummary({
  creature,
  state,
  doing,
  gain,
  children,
}: {
  creature: Creature;
  /** What the tags read (lounging, first on server). */
  state: Pick<GameState, 'loungerId' | 'loungeXp' | 'serverFirsts'>;
  /** What it is doing, in a few words ("Resting at the fire", "At home in the Paddock"). */
  doing: string;
  /** What it gains here, when the place gives something ("+25 XP this visit"). */
  gain?: string | undefined;
  /** The place's own note and actions under the summary. */
  children?: ComponentChildren;
}) {
  return (
    <div class="dr-stack cs-summary">
      <CreatureHead creature={creature} state={state} nameless scale={SUMMARY_SCALE} />
      <ExperienceRow creature={creature} />
      <p class="sp-line cs-doing">{doing}</p>
      {gain !== undefined && <p class="sp-line cs-gain">{gain}</p>}
      {children}
    </div>
  );
}
