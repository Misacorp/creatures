import { describeEvent } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import { errorText } from './game';
import { fetchReplay, type RaidPhaseId, type ReplayView } from './raid-api';
import { phaseName } from './raid-text';
import {
  keyMoments,
  mineInRow,
  personalRecap,
  stateAt,
  turnOrderOfRound,
  type Speed,
} from './replay';
import { INTRO_REPLAY_MS } from './stage-fx';
import { LogToggle, Stage } from './Stage';
import { PlaybackControls } from './ui/PlaybackControls';
import { usePlayback } from './use-playback';

export function Replay({
  weekId,
  party,
  phase,
  onClose,
}: {
  weekId: string;
  party: number;
  phase: RaidPhaseId;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReplayView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReplay(weekId, party, phase).then(
      (next) => {
        if (!cancelled) setData(next);
      },
      (err: unknown) => {
        if (!cancelled) setError(errorText(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [weekId, party, phase]);

  return (
    <section class="raid-section" aria-labelledby="replay-heading">
      <h3 id="replay-heading">Replay: {phaseName(phase)}</h3>
      <p>
        <button type="button" onClick={onClose}>
          Back to the raid
        </button>
      </p>
      {error !== null && (
        <p class="error" role="alert">
          {error}
        </p>
      )}
      {data === null && error === null && <p class="muted">Loading the replay...</p>}
      {data !== null && <Player data={data} />}
    </section>
  );
}

function Player({ data }: { data: ReplayView }) {
  const rowIds = data.row.map((r) => r.id);
  const [speed, setSpeed] = useState<Speed>(1);
  // The same pacing as the live finale (the engine's), with a 1 second intro; 2x halves all of it.
  const { pos, total, index, finished, playing, setPlaying, move, anim, fx, intro } = usePlayback({
    events: data.events,
    rowIds,
    bossId: data.boss.id,
    rounds: data.rounds,
    introMs: INTRO_REPLAY_MS,
    speed,
  });
  const logRef = useRef<HTMLOListElement>(null);
  const { beat } = pos;

  // Keep the newest log line in view (when the log is open).
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [beat]);

  const step = stateAt(data.events, index, data.bossHpStart);
  const rowById = new Map(data.row.map((r) => [r.id, r]));
  const mineIds = new Set(mineInRow(data.row, data.you));
  const order = turnOrderOfRound(data.events, Math.max(1, step.round));
  const moments = keyMoments(data.events, data.names);
  const recap = personalRecap(data.events, data.row, [...mineIds]);

  return (
    <>
      <p>
        {data.boss.name}: {data.cleared ? 'cleared' : 'not cleared'} after {data.rounds} rounds.
        {step.round > 0 && (
          <>
            {' '}
            Round {step.round} of {data.rounds}.
          </>
        )}
      </p>

      <PlaybackControls
        label="Replay controls"
        playing={playing}
        finished={finished}
        speed={speed}
        onPlayPause={() => {
          if (finished) move(0);
          setPlaying(!playing);
        }}
        onSpeed={setSpeed}
        onSkip={() => {
          setPlaying(false);
          move(total);
        }}
        skipLabel="Skip to end"
        skipDisabled={finished}
      />

      <Stage
        boss={data.boss}
        hpMax={data.bossHpMax}
        hpStart={data.bossHpStart}
        rounds={data.rounds}
        row={data.row}
        mineIds={mineIds}
        names={data.names}
        events={data.events}
        index={index}
        anim={anim}
        fx={fx}
        intro={intro}
      />

      <h4>Turn order {step.bossActing && <span class="muted">(the boss is acting)</span>}</h4>
      <ol class="turn-strip" aria-label="Turn order this round">
        {order.map((id) => {
          const c = rowById.get(id);
          const classes = ['turn-chip'];
          if (step.actor === id) classes.push('current');
          else if (step.acted.includes(id)) classes.push('done');
          if (step.knockedOut.includes(id)) classes.push('ko');
          return (
            <li
              key={id}
              class={classes.join(' ')}
              aria-current={step.actor === id ? 'step' : undefined}
            >
              {c?.name ?? id}
            </li>
          );
        })}
      </ol>

      <LogToggle id="replay-log">
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {data.events.slice(0, index).map((event, i) => (
            <li key={i}>{describeEvent(event, data.names)}</li>
          ))}
        </ol>
      </LogToggle>

      <h4>Key moments</h4>
      {moments.length === 0 ? (
        <p class="muted">Nothing stood out.</p>
      ) : (
        <ol class="plain-list">
          {moments.map((m, i) => (
            <li key={i}>
              <strong>{m.title}</strong> (round {m.round}): {m.text}
            </li>
          ))}
        </ol>
      )}

      <h4>Your recap</h4>
      {recap.creatures.length > 0 && (
        <ul class="plain-list">
          {recap.creatures.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>: {c.damage} damage, {c.setupCredit} setup credit, {c.setups}{' '}
              reaction{c.setups === 1 ? '' : 's'} set up
            </li>
          ))}
        </ul>
      )}
      {recap.notes.map((note, i) => (
        <p key={i}>{note}</p>
      ))}
    </>
  );
}
