/**
 * A room's fight on the Cave canvas's scene (`docs/design/dungeon-canvas.md`): it takes the scene's place, as a stage takes the raid's arena
 * (`StageV2` in `canvas` and `single` mode: the foe on top, your row below), under the room banner and with the rests the page's
 * playback has (`useRoomRhythm`, without its scrolling: nothing here scrolls). It plays the one room an open run just played, or every
 * room of a finished run ("Watch again"), one after the other, then calls `onDone`. The fight is already decided and stored; this only
 * shows it. The room's place and foe go to the now line (`onRoom`) and the fight's text so far to the Log drawer (`onLog`).
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoomRhythm } from '../DungeonPlayback';
import {
  nextRoom,
  placeTotal,
  roomIntroView,
  roomResultLine,
  roomStageRow,
  type PlaybackInput,
} from '../dungeon-playback';
import { DUNGEON_OWNER, roomFightV2 } from '../dungeon-room-v2';
import type { DungeonReplayRoomV2 } from '../dungeon-types';
import { foldSetupOf, stageModelOf } from '../fight-v2';
import { INTRO_REPLAY_MS as INTRO_V2_MS } from '../playback-v2';
import { StageV2 } from '../StageV2';
import { LiveRegion } from '../ui/LiveRegion';
import { usePlaybackV2 } from '../use-playback-v2';
import { playingRoom, type PlayingRoom } from './now-line';

export function CavePlayback({
  input,
  onDone,
  onRoom,
  onLog,
}: {
  input: PlaybackInput;
  /** The last room has played and rested. */
  onDone: () => void;
  /** The room that plays now (null: none). */
  onRoom: (room: PlayingRoom | null) => void;
  /** The fight's text so far. */
  onLog: (lines: string[]) => void;
}) {
  const [room, setRoom] = useState(0);
  const current = input.rooms[room];
  const row = useMemo(
    () => (current === undefined ? [] : roomStageRow(input, current)),
    [input, current],
  );
  // The now line names the room that plays.
  useEffect(() => {
    onRoom(current === undefined ? null : playingRoom(current, placeTotal(input, current)));
  }, [room]);
  const finishRoom = (): void => {
    const next = nextRoom(input, room);
    if (next === null) onDone();
    else setRoom(next);
  };
  // Only a room of combat v2 can be drawn on this stage; the canvas is only used for runs of it. Anything else is passed over.
  const playable = current !== undefined && current.rules === 2;
  const skip = useRef(finishRoom);
  skip.current = finishRoom;
  const nothing = current === undefined;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    // A run with no room to show goes straight on (never an empty scene).
    if (nothing) done.current();
    else if (!playable) skip.current();
  }, [playable, room, nothing]);
  if (current === undefined || current.rules !== 2) return null;
  return (
    <CaveRoom
      key={room}
      room={current}
      total={placeTotal(input, current)}
      landmark={input.landmark}
      row={row}
      onFinished={finishRoom}
      onLog={onLog}
    />
  );
}

function CaveRoom({
  room,
  total,
  landmark,
  row,
  onFinished,
  onLog,
}: {
  room: DungeonReplayRoomV2;
  total: number;
  landmark: boolean;
  row: ReturnType<typeof roomStageRow>;
  onFinished: () => void;
  onLog: (lines: string[]) => void;
}) {
  const fight = useMemo(() => roomFightV2(room, row), [room, row]);
  const model = useMemo(
    () =>
      stageModelOf(
        foldSetupOf({ fighters: fight.fighters, card: fight.card, bossHpStart: fight.hpMax }),
        room.events,
      ),
    [fight, room.events],
  );
  const playback = usePlaybackV2({
    model,
    events: room.events,
    rounds: fight.rounds,
    speed: 1,
    introMs: INTRO_V2_MS,
    budgetMs: Number.POSITIVE_INFINITY,
    mode: 'replay',
    autoplay: false,
  });
  const { finished } = playback;
  const { arena, overlay, banner } = useRoomRhythm({
    room,
    total,
    landmark,
    speed: 1,
    paused: false,
    finished,
    setPlaying: playback.setPlaying,
    onFinished,
    scroll: false,
  });
  const shown = playback.beat === 0 ? 0 : (model.beats[playback.beat - 1]?.to ?? 0);
  useEffect(() => {
    onLog(room.events.slice(0, shown).flatMap((event) => (event.text === '' ? [] : [event.text])));
  }, [shown, room.events]);
  const view = roomIntroView(room, total, landmark);
  return (
    <div ref={arena} class="dungeon-arena cave-arena">
      <StageV2
        canvas
        single
        boss={fight.boss}
        card={fight.card}
        fighters={fight.fighters}
        names={fight.names}
        you={DUNGEON_OWNER}
        model={model}
        playback={playback}
        place={view.place}
        hpMax={fight.hpMax}
        rounds={fight.rounds}
        ticks={[]}
        overlay={overlay}
      />
      <LiveRegion>{banner ? view.spoken : ''}</LiveRegion>
      <p class="muted dungeon-room-result" role="status">
        {finished ? roomResultLine(room) : ''}
      </p>
    </div>
  );
}
