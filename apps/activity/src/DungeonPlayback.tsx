import { describeEvent } from '@creatures/engine';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bossArt, elementClass } from './art';
import { cssVars } from './css-vars';
import { elementName } from './game';
import {
  ROOM_CARD_MS,
  ROOM_END_MS,
  atSpeed,
  mineIds,
  nextRoom,
  roomBoss,
  roomIntroView,
  roomResultLine,
  stageRow,
} from './dungeon-playback';
import { roomLine } from './dungeon-text';
import type { DungeonReplay, DungeonReplayRoom } from './dungeon-types';
import { INTRO_REPLAY_MS } from './stage-fx';
import type { Speed } from './replay';
import { LogToggle, Stage } from './Stage';
import { Sprite } from './sprites/Sprite';
import { elementIcon } from './sprites/element-icons';
import { usePlayback } from './use-playback';

interface Props {
  replay: DungeonReplay;
  /** The playback is over (it ran to the end, or the player skipped it). */
  onDone: () => void;
}

/**
 * Plays a stored run room by room on the fight stage, at the live finale's pace. The stage is the
 * same size for the whole run: a room opens with a banner drawn OVER the stage ("Room 2" with the
 * foe and the room's twist), then the room's fight plays under it (the engine's beats, the
 * telegraphs, the lingering numbers), a short rest on the result, then the next room. Pause, 2x and
 * Skip are always in the same place. The run is already decided and stored; this only shows it, so
 * leaving at any time loses nothing.
 */
export function DungeonPlayback({ replay, onDone }: Props) {
  const [room, setRoom] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const current = replay.rooms[room];
  const row = useMemo(() => stageRow(replay), [replay]);

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
      <RoomFight
        key={room}
        room={current}
        total={replay.rooms.length}
        row={row}
        speed={speed}
        paused={paused}
        onFinished={finishRoom}
      />
    </section>
  );
}

/**
 * The banner over the stage when a room opens: the room number in big pixel letters, the foe's
 * sprite and name, its element, and the room's twist. It is drawn inside the stage's own box, so the
 * stage does not change size, and it lets taps through. A screen reader gets one status sentence.
 */
function RoomBanner({ room, total, ms }: { room: DungeonReplayRoom; total: number; ms: number }) {
  const view = roomIntroView(room, total);
  const art = bossArt(view.foeId);
  const icon = elementIcon(view.element);
  return (
    <div
      class={`room-banner${view.boss ? ' boss' : ''}`}
      aria-hidden="true"
      ref={cssVars({ '--fx-ms': `${String(ms)}ms` })}
    >
      <p class="rb-heading pix">{view.heading}</p>
      <p class="rb-place pix">{view.place}</p>
      <Sprite sprite={art.sprite} scale={art.scale} class="rb-foe" />
      <p class={`rb-name pix ${elementClass(view.element)}`}>
        {icon !== undefined && <Sprite sprite={icon} scale={2} />}
        <span>{view.foeName}</span>
        <span class="rb-element">{elementName(view.element)}</span>
      </p>
      <p class="rb-twist">
        <strong class="pix">{view.modifierName}</strong>
        <span>{view.modifierDescription}</span>
      </p>
    </div>
  );
}

function RoomFight({
  room,
  total,
  row,
  speed,
  paused,
  onFinished,
}: {
  room: DungeonReplayRoom;
  total: number;
  row: ReturnType<typeof stageRow>;
  speed: Speed;
  paused: boolean;
  onFinished: () => void;
}) {
  const rowIds = row.map((r) => r.id);
  const none = useMemo(() => mineIds([]), []);
  // The banner shows for a moment with the room standing behind it, then the fight starts. While
  // paused it waits.
  const [banner, setBanner] = useState(true);
  const pb = usePlayback({
    events: room.events,
    rowIds,
    bossId: room.foe.id,
    rounds: room.rounds,
    introMs: INTRO_REPLAY_MS,
    speed,
    autoplay: false,
  });
  const { setPlaying, finished } = pb;

  useEffect(() => {
    if (!banner || paused) return undefined;
    const timer = setTimeout(
      () => {
        setBanner(false);
      },
      atSpeed(ROOM_CARD_MS, speed),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [banner, speed, paused]);

  // Pausing stops the beats where they are; playing again continues from the same step.
  useEffect(() => {
    if (finished) return;
    setPlaying(!paused && !banner);
  }, [paused, banner, finished]);

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

  const view = roomIntroView(room, total);
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
        layout="row"
        overlay={
          banner ? <RoomBanner room={room} total={total} ms={atSpeed(ROOM_CARD_MS, speed)} /> : null
        }
      />
      <p class="visually-hidden" role="status">
        {banner ? view.spoken : ''}
      </p>
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
