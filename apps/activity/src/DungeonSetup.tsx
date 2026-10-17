import { useEffect, useMemo, useState } from 'preact/hooks';
import { TreatBox } from './TreatBox';
import type { Creature } from './api';
import { DungeonPrerun } from './DungeonPrerun';
import { DungeonTeam } from './DungeonTeam';
import {
  isComplete,
  placedCount,
  pruneSlots,
  sameSlots,
  setupTeam,
  type Slots,
} from './dungeon-team';
import { blockedText, isRetryOffer, RETRY_TEXT } from './dungeon-text';
import type { DungeonToday } from './dungeon-types';
import { GlossaryTag } from './Glossary';
import { creatureName } from './game';
import { toPickerCreature } from './roster-picker';
import { useDungeonDraft } from './use-dungeon-draft';
import type { Forecast } from './weather-types';

interface Props {
  today: DungeonToday;
  /** The valley's sky, for the one line on the card (absent or null: none). */
  forecast?: Forecast | null;
  creatures: readonly Creature[];
  /** The player's Bait: a treat costs some of it. */
  bait: number;
  /** True while the run is being sent. */
  busy: boolean;
  error: string | null;
  /** The row of this session, kept by the game while the player was on another tab (null: none yet). */
  draft: Slots | null;
  /** Every change of the row, so the game can keep it for the next visit. */
  onDraftChange: (slots: Slots) => void;
  /** Saves the row on the server (`PUT /api/dungeon/team`), debounced; leave out to save nothing. */
  saveDraft?: (team: Slots) => Promise<unknown>;
  /** The player pressed Enter with a complete team, and the creatures they packed a treat for. */
  onEnter: (slots: Slots, treats: ReadonlySet<string>) => void;
  /** Opens the summary of today's earlier run (the first-day retry offer). */
  onSeeLast: () => void;
}

/**
 * The pre-run screen: one card (`DungeonPrerun`) with the title and streak, the three rooms and the
 * day's modifiers, the depth track, then the team on the Raid Roster's board and the Enter button
 * (or, instead of the card's team, the reason a run is not possible). The
 * team starts as the row of this session if there is one (`draft`), else the row saved on the
 * server (`today.draftTeam`), else the player's last team, each creature in the slot it stood in, or
 * on the first run their strongest three in the order that sets off the most reactions (`setupTeam`).
 * Every change is reported up and saved a moment later, so leaving the screen (or the page) keeps
 * the row; a run deletes the draft and the next row starts from that run's team. The choice is who
 * stands where; the server checks it and decides the run. Streak and reset time are in the end
 * report, not here.
 */
export function DungeonSetup({
  today,
  forecast = null,
  creatures,
  bait,
  busy,
  error,
  draft,
  onDraftChange,
  saveDraft,
  onEnter,
  onSeeLast,
}: Props) {
  const pickable = useMemo(() => creatures.map(toPickerCreature), [creatures]);
  const saver = useDungeonDraft(saveDraft);
  // The creatures that get a treat on this run (not kept for the next one: each run pays for its own).
  const [treats, setTreats] = useState<ReadonlySet<string>>(new Set());
  const [slots, setSlots] = useState<Slots>(() =>
    setupTeam({
      memory: draft,
      saved: today.draftTeam,
      lastTeam: today.lastTeam,
      creatures: pickable,
    }),
  );

  /** A change of the row by the player (or by the collection): keep it, report it and save it soon. */
  function change(next: Slots): void {
    setSlots(next);
    onDraftChange(next);
    saver.change(next);
  }

  // The collection can change under the screen (a refresh after another tab): drop creatures that are gone.
  const owned = creatures.map((c) => c.id);
  useEffect(() => {
    const pruned = pruneSlots(slots, owned);
    if (!sameSlots(pruned, slots)) change(pruned);
  }, [owned.join(',')]);

  const blocked =
    blockedText(today) ??
    (creatures.length < 3 ? blockedText({ blocked: 'need_creatures', canRun: false }) : null);
  if (blocked !== null) {
    return (
      <>
        <DungeonPrerun today={today} forecast={forecast} />
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
      <DungeonPrerun today={today} forecast={forecast}>
        <DungeonTeam creatures={pickable} slots={slots} disabled={busy} onChange={change}>
          <div class="dungeon-treats">
            {slots.flatMap((id) => {
              const creature = creatures.find((c) => c.id === id);
              if (creature === undefined) return [];
              // A treat is paid up front: the boxes cannot add up to more Bait than the player has.
              const others = [...treats]
                .filter((t) => t !== creature.id)
                .reduce((n, t) => n + (creatures.find((c) => c.id === t)?.treatCost ?? 0), 0);
              return [
                <TreatBox
                  key={creature.id}
                  cost={creature.treatCost}
                  bait={bait - others}
                  checked={treats.has(creature.id)}
                  disabled={busy}
                  who={creatureName(creature)}
                  onChange={(on) => {
                    setTreats((now) => {
                      const next = new Set(now);
                      if (on) next.add(creature.id);
                      else next.delete(creature.id);
                      return next;
                    });
                  }}
                />,
              ];
            })}
          </div>
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
                  // The run deletes the draft on the server, so a save still waiting is not sent.
                  saver.cancel();
                  onEnter(slots, new Set([...treats].filter((id) => slots.includes(id))));
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
