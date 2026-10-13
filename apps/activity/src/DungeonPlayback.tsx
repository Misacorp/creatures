import { describeEvent } from '@creatures/engine';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ElementChip } from './sprites/ElementChip';
import {
  ROOM_CARD_MS,
  ROOM_END_MS,
  atSpeed,
  mineIds,
  nextRoom,
  roomBoss,
  roomResultLine,
  stageRow,
} from './dungeon-playback';
import { roomCardTitle, roomLine } from './dungeon-text';
import type { DungeonReplay, DungeonReplayRoom } from './dungeon-types';
import { INTRO_REPLAY_MS } from './stage-fx';
import type { Speed } from './replay';
import { LogToggle, Stage } from './Stage';
import { usePlayback } from './use-playback';

interface Props {
  replay: DungeonReplay;
  /** The playback is over (it ran to the end, or the player skipped it). */
  onDone: () => void;
}

/**
 * Plays a stored run room by room on the fight stage, at the live finale's pace: a card for the
 * room ("Room 2 · Flooded"), then its fight (the engine's beats, the telegraphs, the lingering
 * numbers), a short rest on the result, then the next room. Pause, 2x and Skip are always there.
 * The run is already decided and stored; this only shows it, so leaving at any time loses nothing.
 */
export function DungeonPlayback({ replay, onDone }: Props) {
  const [room, setRoom] = useState(0);
  const [phase, setPhase] = useState<'card' | 'fight'>('card');
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const current = replay.rooms[room];
  const row = useMemo(() => stageRow(replay), [replay]);

  // The card for a room shows for a moment, then the fight starts. While paused it waits.
  useEffect(() => {
    if (phase !== 'card' || paused) return undefined;
    const timer = setTimeout(
      () => {
        setPhase('fight');
      },
      atSpeed(ROOM_CARD_MS, speed),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [phase, room, speed, paused]);

  if (current === undefined) {
    // A run with no room played cannot be shown: go straight to the results.
    return (
      <section class="raid-section" aria-label="Dungeon playback">
        <p class="muted">There is nothing to play for this run.</p>
        <p>
          <button type="button" class="primary" onClick={onDone}>
            Show the results
          </button>
        </p>
      </section>
    );
  }

  const finishRoom = (): void => {
    const next = nextRoom(replay, room);
    if (next === null) {
      onDone();
      return;
    }
    setRoom(next);
    setPhase('card');
  };

  return (
    <section class="raid-section dungeon-playback" aria-label="Dungeon playback">
      <div class="controls button-row" role="group" aria-label="Playback controls">
        <button
          type="button"
          aria-pressed={paused}
          class={paused ? 'toggle on' : 'toggle'}
          onClick={() => {
            setPaused(!paused);
          }}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          aria-pressed={speed === 2}
          class={speed === 2 ? 'toggle on' : 'toggle'}
          onClick={() => {
            setSpeed(speed === 2 ? 1 : 2);
          }}
        >
          2×
        </button>
        <button type="button" onClick={onDone}>
          Skip
        </button>
      </div>
      <p class="muted dungeon-room-line">
        {roomLine(current.index, replay.rooms.length, current.kind)}
      </p>
      {phase === 'card' ? (
        <RoomCard room={current} />
      ) : (
        <RoomFight
          key={room}
          room={current}
          row={row}
          speed={speed}
          paused={paused}
          onFinished={finishRoom}
        />
      )}
    </section>
  );
}

/** "Room 2 · Flooded": who waits in the room and what the room does. A status, so it is read out. */
function RoomCard({ room }: { room: DungeonReplayRoom }) {
  return (
    <div class="room-card" role="status">
      <p class="room-card-title pix">{roomCardTitle(room.index, room.modifier.name)}</p>
      <p class="room-card-foe">
        {room.kind === 'boss' ? 'Room boss: ' : ''}
        <strong>{room.foe.name}</strong>
      </p>
      <p class="tags room-card-tags">
        <ElementChip element={room.foe.element} />
      </p>
      <p class="muted">{room.modifier.description}</p>
    </div>
  );
}

function RoomFight({
  room,
  row,
  speed,
  paused,
  onFinished,
}: {
  room: DungeonReplayRoom;
  row: ReturnType<typeof stageRow>;
  speed: Speed;
  paused: boolean;
  onFinished: () => void;
}) {
  const rowIds = row.map((r) => r.id);
  const none = useMemo(() => mineIds([]), []);
  const pb = usePlayback({
    events: room.events,
    rowIds,
    bossId: room.foe.id,
    rounds: room.rounds,
    introMs: INTRO_REPLAY_MS,
    speed,
    autoplay: true,
  });
  const { setPlaying, finished } = pb;

  // Pausing stops the beats where they are; playing again continues from the same step.
  useEffect(() => {
    if (finished) return;
    setPlaying(!paused);
  }, [paused, finished]);

  // Once the last beat has played, the final state rests for a moment and the run moves on.
  useEffect(() => {
    if (!finished || paused) return undefined;
    const timer = setTimeout(onFinished, atSpeed(ROOM_END_MS, speed));
    return () => {
      clearTimeout(timer);
    };
  }, [finished, paused, speed]);

  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [pb.index]);

  return (
    <>
      <Stage
        boss={roomBoss(room)}
        hpMax={room.foe.hpMax}
        hpStart={room.foe.hpMax}
        rounds={room.rounds}
        row={row}
        mineIds={none}
        names={room.names}
        events={room.events}
        index={pb.index}
        anim={pb.anim}
        fx={pb.fx}
        intro={pb.intro}
        creatureHp={{ start: room.hpStart, max: room.hpMax }}
      />
      <p class="muted dungeon-room-result" role="status">
        {finished ? roomResultLine(room) : ''}
      </p>
      <LogToggle id={`dungeon-log-${String(room.index)}`}>
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {room.events.slice(0, pb.index).map((event, i) => (
            <li key={i}>{describeEvent(event, room.names)}</li>
          ))}
        </ol>
      </LogToggle>
    </>
  );
}
