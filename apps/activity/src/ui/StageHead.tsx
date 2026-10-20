import { GLOSSARY_IDS } from '@creatures/game';
import type { ComponentChildren } from 'preact';
import { modifierIcon } from '../dungeon-rooms';
import { GlossaryTag } from '../Glossary';
import { GameIcon } from './GameIcon';

/** A room modifier as the head shows it: its content id and the words the server sent for it. */
export interface StageModifier {
  id: string;
  name: string;
  description: string;
}

interface StageHeadProps {
  /**
   * Where in the run the fight is, top left: "Room 1 / 3" in the dungeon, "Phase 1 / 3" or "Finale"
   * in the raid. Without it the left side holds only `modifiers` and `children`.
   */
  place?: string;
  /**
   * The room's modifiers (Flooded, Scorched...), each a small tag right after the place that opens
   * its glossary entry. There can be several; none in the raid.
   */
  modifiers?: readonly StageModifier[];
  /** The round, top right: "Round 2 / 12", or "Round 2" when the fight has no known limit. */
  round: string;
  /** Extra controls after the place on the left (the live finale's "?" button). */
  children?: ComponentChildren;
}

/**
 * The head of the fight stage, one piece for the dungeon and the raid: the room or phase at the top
 * left, then the room's modifiers as small tags, and the round at the top right (Misa, 2026-10-14
 * and 2026-10-15). Everything is plain text; each count is written "1 / 3".
 */
export function StageHead({ place, modifiers = [], round, children }: StageHeadProps) {
  return (
    <div class="stage-head">
      <span class="stage-head-left">
        {place !== undefined && <span class="pix stage-place">{place}</span>}
        {modifiers.map((m) => (
          <GlossaryTag
            key={m.id}
            entry={GLOSSARY_IDS.modifier(m.id)}
            look="chip"
            class="chip stage-mod"
            label={`${m.name}: ${m.description}`}
          >
            <GameIcon icon={modifierIcon(m.id)} scale={2} />
            <span class="chip-text">{m.name}</span>
          </GlossaryTag>
        ))}
        {children}
      </span>
      <span class="pix stage-round">{round}</span>
    </div>
  );
}
