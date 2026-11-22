/**
 * What a tap in the Fairground's canvas opens (`FairgroundCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s):
 *
 * - `StallPanel` (right drawer, a page on a phone): the event of the stall you tapped: its picture with your creatures in it, its
 *   favours and its story line, and your entry slots. A slot opens the creature list as a step of this panel (`PanelStep`, with
 *   Back); Clear is in that step. Entries closed: the slots are plain boxes.
 * - `PrizePanel` (right): the Prize Stall's offers, or, off Wednesday, the shutter and when it opens.
 * - `RulesPanel` (right): the Games' glossary text, the same words the favour icons and tags open.
 * - `ShowPanel` (right): the tent: when entries close, when the show plays and the day's events in order.
 * - `LastShowPanel`, `MedalsPanel` (left): last show's results and the medal cabinet.
 *
 * Nothing here decides anything: every move is the game's action and the server answers.
 */
import { glossary, type GlossaryEntry } from '@creatures/game';
import type { Creature } from '../api';
import { Alert } from '../ui/Alert';
import { DrillHead } from '../ui/DrillHead';
import { GameIcon } from '../ui/GameIcon';
import { GamesResults } from '../games/GamesResults';
import { EventCard } from '../games/GamesParts';
import { MedalCabinet } from '../games/MedalCabinet';
import { PrizeStall } from '../games/PrizeStall';
import { PickList } from '../games/EntryPicker';
import { Ticking } from '../games/GamesTab';
import type {
  BoardRow,
  GamesNext,
  GamesYou,
  LineupEvent,
  StallOffer,
  StallPurchase,
  StallView,
} from '../games-types';
import { formatZoned } from '../time-format';
import { StepBody, StepHold } from './PanelStep';
import { PanelBody } from './PlaceCanvas';
import { useState } from 'preact/hooks';

/** The error line of a panel: in the flow, never over the scene. */
function ErrorLine({ error, onDismiss }: { error: string | null; onDismiss: () => void }) {
  return error === null ? null : (
    <Alert key={error} level="alert" onDismiss={onDismiss}>
      {error}
    </Alert>
  );
}

export function StallPanel({
  event,
  next,
  creatures,
  busy,
  error,
  onDismissError,
  onSet,
  onClose,
}: {
  event: LineupEvent;
  next: GamesNext;
  creatures: readonly Creature[];
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
  /** Puts a creature in a slot of this event, or empties it (null). */
  onSet: (slot: number, creatureId: string | null) => void;
  /** Leaves the panel: the first step's Back (a drawer has its X instead, `canvas.css`; a phone's page keeps the Back). */
  onClose: () => void;
}) {
  const [slot, setSlot] = useState<number | null>(null);
  const filled = slot !== null && (next.entries[event.id] ?? [])[slot] !== undefined;
  const step =
    slot === null ? null : (
      <StepBody
        title={`Who enters ${event.name}?`}
        backLabel={`to ${event.name}`}
        onBack={() => {
          setSlot(null);
        }}
        focusBack
        footer={
          filled ? (
            <button
              type="button"
              class="ghost ge-clear"
              disabled={busy}
              onClick={() => {
                setSlot(null);
                onSet(slot, null);
              }}
            >
              Clear
            </button>
          ) : undefined
        }
      >
        <PickList
          event={event}
          slot={slot}
          next={next}
          creatures={creatures}
          onPick={(creatureId) => {
            setSlot(null);
            onSet(slot, creatureId);
          }}
        />
      </StepBody>
    );
  return (
    <StepHold
      step={step}
      list={
        <PanelBody>
          <div class="dr-stack fg-stall">
            <DrillHead title="Your entry" backLabel="to the fair" onBack={onClose} leaves />
            <ErrorLine error={error} onDismiss={onDismissError} />
            <ul class="ge-cards">
              <EventCard
                event={event}
                next={next}
                creatures={creatures}
                busy={busy}
                named={false}
                onSlot={
                  next.open
                    ? (index) => {
                        setSlot(index);
                      }
                    : undefined
                }
              >
                <p class="ge-line prose fg-line">{event.line}</p>
              </EventCard>
            </ul>
            {!next.open && <p class="muted">Entries are closed for this show.</p>}
          </div>
        </PanelBody>
      }
    />
  );
}

export function PrizePanel({
  stall,
  pocket,
  timezone,
  offset,
  busy,
  error,
  onDismissError,
  purchase,
  onDismissPurchase,
  onBuy,
}: {
  stall: StallView;
  pocket: number;
  timezone: string;
  /** Server clock minus local clock. */
  offset: number;
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
  purchase: StallPurchase['purchase'] | null;
  onDismissPurchase: () => void;
  onBuy: (offer: StallOffer) => void;
}) {
  return (
    <PanelBody>
      <div class="dr-stack">
        <ErrorLine error={error} onDismiss={onDismissError} />
        <Ticking offset={offset}>
          {(now) => (
            <PrizeStall
              stall={stall}
              pocket={pocket}
              serverNow={now}
              timezone={timezone}
              busy={busy}
              purchase={purchase}
              onDismissPurchase={onDismissPurchase}
              onBuy={onBuy}
            />
          )}
        </Ticking>
      </div>
    </PanelBody>
  );
}

/**
 * The glossary entries the Rules board shows: the Games section of the glossary (the words the tags and icons open), without the
 * favours (each has its own line on the event's icon). Nothing is listed twice: new entries of the section appear here.
 */
export const rulesEntries = (): GlossaryEntry[] =>
  glossary.filter((e) => e.section === 'games' && !e.id.startsWith('games-favour-'));

export function RulesPanel() {
  const entries = rulesEntries();
  return (
    <PanelBody>
      <ul class="fg-rules" aria-label="The rules of the Valley Games">
        {entries.map((entry) => (
          <li key={entry.id} class="fg-rule">
            {entry.visual?.kind === 'glyph' && (
              <span class="fg-rule-art" aria-hidden="true">
                <GameIcon icon={{ kind: 'glyph', id: entry.visual.id }} scale={3} />
              </span>
            )}
            <div class="fg-rule-text">
              <h3 class="fg-rule-title">{entry.title}</h3>
              <p class="prose">{entry.short}</p>
              {entry.lines.map((line) => (
                <p key={line} class="prose muted">
                  {line}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </PanelBody>
  );
}

export function ShowPanel({
  next,
  timezone,
}: {
  next: Pick<GamesNext, 'lockAt' | 'showAt' | 'lineup'>;
  timezone: string;
}) {
  return (
    <PanelBody>
      <div class="dr-stack">
        <dl class="fg-times">
          <div>
            <dt>Entries close</dt>
            <dd>{formatZoned(next.lockAt, timezone, 'short')}</dd>
          </div>
          <div>
            <dt>The show</dt>
            <dd>{formatZoned(next.showAt, timezone, 'short')}</dd>
          </div>
        </dl>
        <ol class="fg-lineup" aria-label="The events, in order">
          {next.lineup.map((event) => (
            <li key={event.id}>{event.name}</li>
          ))}
        </ol>
        <p class="muted">Only the creatures you enter play.</p>
      </div>
    </PanelBody>
  );
}

export function LastShowPanel({
  you,
  lineup,
  creatures,
  onReplay,
}: {
  you: GamesYou;
  lineup: readonly Pick<LineupEvent, 'id' | 'name'>[];
  creatures: readonly Creature[];
  /** Plays the show on the stage from an event (or from the start, null); absent: no show stored to watch. */
  onReplay: ((eventId: string | null) => void) | undefined;
}) {
  const results = you.lastResults;
  return (
    <PanelBody>
      {results === undefined ? (
        <p class="muted">There is no show to look back on yet.</p>
      ) : (
        <GamesResults
          bare
          results={results.results}
          lineup={lineup}
          creatures={creatures}
          onReplay={onReplay}
        />
      )}
    </PanelBody>
  );
}

export function MedalsPanel({
  you,
  board,
  selfId,
}: {
  you: GamesYou;
  board: readonly BoardRow[];
  selfId: string;
}) {
  return (
    <PanelBody>
      <MedalCabinet bare you={you} board={board} selfId={selfId} />
    </PanelBody>
  );
}
