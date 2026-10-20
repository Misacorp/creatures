/**
 * The lounge swap (`LoungeSwap.tsx`), as plain data: which creature can take the lounger's place on the
 * couch, and what each row says. Pure; the server checks the choice (`PUT /api/lounger`).
 */
import { isRested } from '@creatures/game';
import type { Creature, GameState } from './api';
import { xpWords } from './creature-card-view';
import { experienceLabel } from './CreatureProgress';
import { creatureName, getSpecies } from './game';
import type { PickerOption } from './roster-picker';

/** The swap sheet's title. */
export const SWAP_TITLE = 'Who lounges?';

/** What the current lounger's row says (it cannot be picked: it is there already). */
export const LOUNGING_NOW = 'Lounging now';

/** Why a busy creature cannot lounge. */
function busyReason(creature: Creature): string | null {
  if (creature.away) return 'Away';
  if (creature.busy?.kind === 'job') return 'On a job';
  return creature.busy === null ? null : 'Busy';
}

/**
 * Every creature of the player, as rows of the swap: the free ones that still earn today first, lowest
 * level first (lounging is worth most to a young creature), then the Rested ones (they can lounge, they
 * just earn nothing more today), then the lounger and the busy ones, which cannot be picked.
 */
export function swapOptions(
  state: Pick<GameState, 'creatures' | 'loungerId' | 'loungeXp'>,
): PickerOption[] {
  const rows = state.creatures.map((c) => {
    const species = getSpecies(c.species);
    const rested = isRested(state.loungeXp[c.id] ?? 0);
    const disabled = c.id === state.loungerId ? LOUNGING_NOW : busyReason(c);
    const option: PickerOption = {
      id: c.id,
      name: creatureName(c),
      species: c.species,
      level: c.level,
      element: species?.element ?? 'unknown',
      role: species?.role ?? '',
      onBoard: false,
      disabled,
      effect: null,
      recommended: false,
      xpBar: {
        value: c.exp,
        max: c.expNeeded ?? 1,
        top: c.expNeeded === null,
        label: experienceLabel(c),
        text: xpWords(c),
      },
      rested,
    };
    const rank = disabled === LOUNGING_NOW ? 2 : disabled !== null ? 3 : rested ? 1 : 0;
    return { option, rank, caughtAt: c.caughtAt };
  });
  return rows
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.option.level - b.option.level ||
        a.caughtAt - b.caughtAt ||
        (a.option.id < b.option.id ? -1 : 1),
    )
    .map((r) => r.option);
}
