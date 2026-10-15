import { describeEvent } from '@creatures/engine';
import { useEffect, useRef, useState } from 'preact/hooks';
import { errorText } from './game';
import { fetchReplay, type RaidPhaseId, type ReplayView } from './raid-api';
import { phaseLine, phaseName } from './raid-text';
import { raidMaxRounds } from './stage-rounds';
import { keyMoments, mineInRow, personalRecap, type Speed } from './replay';
import { INTRO_REPLAY_MS } from './stage-fx';
import { LogToggle, Stage } from './Stage';
import { PlaybackControls } from './ui/PlaybackControls';
import { usePlayback } from './use-playback';

export function Replay({
  weekId,
  party,
  phase,
  onClose,
  showControls = false,
}: {
  weekId: string;
  party: number;
  phase: RaidPhaseId;
  onClose: () => void;
  /**
   * Show Play or Pause, 2x and Skip above the stage. Off by default (Misa, 2026-10-14: the replay
   * plays by itself, like the dungeon); the controls and their state still work, for when they come
   * back.
   */
  showControls?: boolean;
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
      {data !== null && <Player data={data} showControls={showControls} />}
    </section>
  );
}

function Player({ data, showControls }: { data: ReplayView; showControls: boolean }) {
  const rowIds = data.row.map((r) => r.id);
  // The phase's limit from the rules and content, not how long this stored fight lasted (that would spoil it).
  const maxRounds = raidMaxRounds(data.phase, data.boss.id);
  const [speed, setSpeed] = useState<Speed>(1);
  // The same pacing as the live finale (the engine's), with a 1 second intro; 2x halves all of it.
  const { pos, total, index, finished, playing, setPlaying, move, anim, fx, intro } = usePlayback({
    events: data.events,
    rowIds,
    bossId: data.boss.id,
    rounds: maxRounds,
    introMs: INTRO_REPLAY_MS,
    speed,
    // With no controls the replay has to start by itself.
    autoplay: true,
  });
  const logRef = useRef<HTMLOListElement>(null);
  const { beat } = pos;

  // Keep the newest log line in view (when the log is open).
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [beat]);

  const mineIds = new Set(mineInRow(data.row, data.you));
  const moments = keyMoments(data.events, data.names);
  const recap = personalRecap(data.events, data.row, [...mineIds]);

  return (
    <>
      <p>
        {data.boss.name}: {data.cleared ? 'cleared' : 'not cleared'} after {data.rounds} rounds.
      </p>

      {showControls && (
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
      )}

      <Stage
        boss={data.boss}
        hpMax={data.bossHpMax}
        hpStart={data.bossHpStart}
        rounds={maxRounds}
        row={data.row}
        mineIds={mineIds}
        names={data.names}
        events={data.events}
        index={index}
        anim={anim}
        fx={fx}
        intro={intro}
        place={phaseLine(data.phase)}
      />

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
