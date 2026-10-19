import type { Creature, GameState } from '../api';
import { xpWords } from '../creature-card-view';
import { CreatureHead } from '../CreatureHead';
import { experienceLabel } from '../CreatureProgress';
import { XpTrack } from '../ui/XpTrack';

/**
 * The creature page's head: the card's own top (`CreatureHead`: the portrait at the top left, the name, the
 * tags in words under it, in the card's order) and then the card's experience row (`XpTrack`: the level tag
 * at the left, the bar with its numbers inside), so a player who taps a card lands on a page that starts the
 * same way. The page differs only where it must: the name is the page's heading (it may wrap to two lines;
 * a hidden word says the rarity aloud), the tags open their glossary entries, and the level tag opens the
 * level's explanation (no "?" drawn). There is no "Next: ..." line.
 */
export function PageHeader({
  creature,
  state,
  nameId,
}: {
  creature: Creature;
  state: Pick<GameState, 'loungerId' | 'serverFirsts'>;
  nameId: string;
}) {
  return (
    <div class="cp-head">
      <CreatureHead creature={creature} state={state} nameId={nameId} />
      <XpTrack
        level={creature.level}
        value={creature.exp}
        max={creature.expNeeded ?? 1}
        top={creature.expNeeded === null}
        label={experienceLabel(creature)}
        text={xpWords(creature)}
        levelEntry="level"
      />
    </div>
  );
}
