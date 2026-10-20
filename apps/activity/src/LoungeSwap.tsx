import { RULES } from '@creatures/game';
import type { GameState } from './api';
import { SWAP_TITLE, swapOptions } from './lounge-swap';
import { RosterPicker } from './ui/RosterPicker';

/**
 * The lounge swap: a bottom sheet listing the player's creatures (level, experience, Rested) to choose
 * who lounges. Opened by "Swap" in the popover of the player's own creature in the living room. A pick
 * closes the sheet; the server checks it.
 */
export function LoungeSwap({
  state,
  onPick,
  onClose,
}: {
  state: Pick<GameState, 'creatures' | 'loungerId' | 'loungeXp'>;
  onPick: (creatureId: string) => void;
  onClose: () => void;
}) {
  const { msPerXp, dailyCap } = RULES.experience.lounge;
  return (
    <RosterPicker
      title={SWAP_TITLE}
      status={`With company, the lounger earns 1 XP every ${String(msPerXp / 60_000)} minutes, up to ${String(dailyCap)} a day each.`}
      options={swapOptions(state)}
      placedNote=""
      showEffects={false}
      reasonSide
      anchor={() => null}
      onPick={onPick}
      onClose={onClose}
    />
  );
}
