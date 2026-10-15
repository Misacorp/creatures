import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Creature } from './api';
import { DungeonPrerun } from './DungeonPrerun';
import { DungeonTeam } from './DungeonTeam';
import { isComplete, placedCount, pruneSlots, startingTeam, type Slots } from './dungeon-team';
import { blockedText, isRetryOffer, RETRY_TEXT } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { GlossaryTag } from './Glossary';
import { toPickerCreature } from './roster-picker';

interface Props {
  today: DungeonToday;
  creatures: readonly Creature[];
  /** True while the run is being sent. */
  busy: boolean;
  error: string | null;
  /** The player pressed Enter with a complete team. */
  onEnter: (slots: Slots) => void;
  /** Opens the summary of today's earlier run (the first-day retry offer). */
  onSeeLast: () => void;
}

/**
 * The pre-run screen: one card (`DungeonPrerun`) with the title and streak, the three rooms and the
 * day's modifiers, the depth track, then the team on the Raid Roster's board and the Enter button
 * (or, instead of the card's team, the reason a run is not possible). The
 * team starts as the player's last team, each creature in the slot it stood in (`startingTeam`; a
 * creature that is gone leaves its slot empty), or on the first run as their strongest three in the
 * order that sets off the most reactions. Changes are kept only on this screen; the next last team
 * is whatever the server stores when a run starts (the whole ordered team). The choice is who
 * stands where; the server checks it and decides the run. Streak and reset time are in the end
 * report, not here.
 */
export function DungeonSetup({ today, creatures, busy, error, onEnter, onSeeLast }: Props) {
  const pickable = useMemo(() => creatures.map(toPickerCreature), [creatures]);
  const [slots, setSlots] = useState<Slots>(() => startingTeam(today.lastTeam, pickable));

  // The collection can change under the screen (a refresh after another tab): drop creatures that are gone.
  const owned = creatures.map((c) => c.id);
  useEffect(() => {
    setSlots((current) => pruneSlots(current, owned));
  }, [owned.join(',')]);

  const blocked =
    blockedText(today) ??
    (creatures.length < 3 ? blockedText({ blocked: 'need_creatures', canRun: false }) : null);
  if (blocked !== null) {
    return (
      <>
        <DungeonPrerun today={today} />
        <section class="raid-section" aria-labelledby="dungeon-blocked-heading">
          <h3 id="dungeon-blocked-heading">Not today</h3>
          <p role="status">{blocked}</p>
        </section>
      </>
    );
  }

  const complete = isComplete(slots);
  return (
    <>
      {isRetryOffer(today) && (
        <section class="raid-section dungeon-retry" aria-labelledby="dungeon-retry-heading">
          <h3 id="dungeon-retry-heading">
            <GlossaryTag entry="dungeon">One more try</GlossaryTag>
          </h3>
          <p>{RETRY_TEXT}</p>
          <p>
            <button type="button" onClick={onSeeLast}>
              See your last run
            </button>
          </p>
        </section>
      )}
      <DungeonPrerun today={today}>
        <DungeonTeam creatures={pickable} slots={slots} disabled={busy} onChange={setSlots}>
          <div class="dungeon-enter">
            {error !== null && (
              <p class="error" role="alert">
                {error}
              </p>
            )}
            <p>
              <button
                type="button"
                class="primary"
                disabled={busy || !complete}
                aria-describedby={complete ? undefined : 'dungeon-enter-note'}
                onClick={() => {
                  onEnter(slots);
                }}
              >
                {busy ? 'Entering...' : 'Enter the dungeon'}
              </button>
            </p>
            {!complete && (
              <p id="dungeon-enter-note" class="muted">
                Place 3 creatures to enter ({String(placedCount(slots))} / 3 placed). Tap an empty
                slot to choose one.
              </p>
            )}
          </div>
        </DungeonTeam>
      </DungeonPrerun>
    </>
  );
}
