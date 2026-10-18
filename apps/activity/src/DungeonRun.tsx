import { useEffect, useRef } from 'preact/hooks';
import type { Creature } from './api';
import { DungeonCamp } from './DungeonCamp';
import { DungeonDescend } from './DungeonDescend';
import { DungeonEvent } from './DungeonEvent';
import { DungeonMap } from './DungeonMap';
import { DungeonRunStrip } from './DungeonRunStrip';
import { runScreenOf } from './dungeon-flow';
import type { DungeonAct, DungeonRunState } from './dungeon-types';
import { usePrefersReducedMotion } from './hooks';
import { arriveScroll, shouldScrollToCard } from './reveal-arrive';

/**
 * An open run: the strip (the row with its HP, the keepsakes, the pack), then what the run stands at:
 * a mystery room's card, the camp's card, the descent card (the boss fell) or the map with its rooms to go to. Every choice is an act
 * the screen above sends; nothing here changes the run. Coming back to the map (after a fight, an
 * event or the camp) brings the top of the run into view when it is not.
 */
export function DungeonRun({
  state,
  creatures,
  busy,
  error,
  onAct,
}: {
  state: DungeonRunState;
  /** Everything the player owns: the camp's Swap brings one in. */
  creatures: readonly Creature[];
  /** An act is on its way. */
  busy: boolean;
  error: string | null;
  onAct: (act: DungeonAct) => void;
}) {
  const screen = runScreenOf(state);
  const top = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = top.current;
    if (el === null) return;
    if (shouldScrollToCard(el.getBoundingClientRect().top, window.innerHeight)) {
      el.scrollIntoView(arriveScroll(reduced));
    }
  }, [state.step]);

  return (
    <div ref={top} class="dungeon-run">
      <DungeonRunStrip state={state} />
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {state.pending?.kind === 'event' && (
        <DungeonEvent
          key={state.step}
          event={state.pending.event}
          busy={busy}
          onPick={(option) => {
            onAct({ type: 'event', option });
          }}
        />
      )}
      {state.pending?.kind === 'camp' && (
        <DungeonCamp
          key={state.step}
          team={state.team}
          pack={state.pack}
          camp={state.pending}
          creatures={creatures}
          busy={busy}
          onAct={onAct}
        />
      )}
      {state.pending?.kind === 'descend' && (
        <DungeonDescend
          key={state.step}
          descent={state.pending}
          pack={state.pack}
          busy={busy}
          onAct={onAct}
        />
      )}
      {screen === 'run' && (
        <section class="raid-section dungeon-run-map" aria-label="The map">
          <DungeonMap
            map={state.map}
            undercroft={state.undercroft?.maps}
            depth={state.depth}
            state={state}
            busy={busy}
            landmark={state.landmark}
            onGo={(node) => {
              onAct({ type: 'move', node });
            }}
          />
        </section>
      )}
    </div>
  );
}
