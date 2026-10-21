import { useState } from 'preact/hooks';
import type { Creature, GameState } from './api';
import { CreaturePage, type CardActions } from './CreaturePage';
import { EvolveDrawer } from './EvolveDrawer';
import { creatureName } from './game';
import type { GearState } from './gear-types';
import { flipOver } from './ui/flip-logic';

/** What a team screen's configurator and the creature page need from the game (the dungeon, the raid). */
export interface TeamConfigure {
  state: GameState;
  /** The gear view; null until it has loaded. */
  gear: GearState | null;
  /** One of their actions is running. */
  busy: boolean;
  actions: CardActions;
  /** The page's waiting catch: those are answered on the Creatures tab. */
  onAnswerCatch: () => void;
  /** Opens the Workshop (from the full bag's warning). */
  onOpenWorkshop?: (() => void) | undefined;
}

/**
 * A team creature's own page, opened from a team screen in that screen's place: the arrows flip through the
 * team only, Back names the screen it returns to, and `remove` (when the team can still change) closes the
 * page with the red button at its end. Every evolve opens the evolve screen here, as on the Creatures tab.
 */
export function TeamCreaturePage({
  creature,
  team,
  configure,
  backLabel,
  remove,
  onFlip,
  onBack,
}: {
  creature: Creature;
  /** The team, in its order: what the arrows flip through. */
  team: readonly Creature[];
  configure: TeamConfigure;
  /** The screen Back returns to ("Dungeon", "Raid"). */
  backLabel: string;
  /** Takes the creature off the team (its label, "Remove from team"); absent: the team is fixed now. */
  remove?: { label: string; onAct: () => void } | undefined;
  onFlip: (target: Creature) => void;
  onBack: () => void;
}) {
  const [evolvingId, setEvolvingId] = useState<string | null>(null);
  const evolving = evolvingId === null ? undefined : team.find((c) => c.id === evolvingId);
  return (
    <>
      <CreaturePage
        key={creature.id}
        creature={creature}
        state={configure.state}
        gear={configure.gear}
        busy={configure.busy}
        actions={{
          ...configure.actions,
          onEvolve: (c) => {
            setEvolvingId(c.id);
          },
        }}
        focus={null}
        backLabel={backLabel}
        flip={flipOver({
          list: team,
          at: team.indexOf(creature),
          noun: 'creature',
          nameOf: creatureName,
          pick: onFlip,
        })}
        teamAction={remove}
        onBack={onBack}
        onAnswerCatch={configure.onAnswerCatch}
      />
      {evolving !== undefined && (
        <EvolveDrawer
          open
          creature={evolving}
          busy={configure.busy}
          onClose={() => {
            setEvolvingId(null);
          }}
          onEvolve={(c, species) => {
            setEvolvingId(null);
            configure.actions.onEvolve(c, species);
          }}
        />
      )}
    </>
  );
}
