import { describeEvent } from '@creatures/engine';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bossArt, elementClass } from './art';
import { combatGlyph } from './combat-glyphs';
import { cssVars } from './css-vars';
import { DUNGEON_OWNER, roomFightV2 } from './dungeon-room-v2';
import { foldSetupOf, stageModelOf } from './fight-v2';
import { INTRO_REPLAY_MS as INTRO_V2_MS } from './playback-v2';
import { StageV2 } from './StageV2';
import { usePlaybackV2 } from './use-playback-v2';
import { elementName } from './game';
import { glyphOrUnknown } from './glyphs';
import {
  ROOM_CARD_MS,
  ROOM_END_MS,
  arenaOutOfView,
  atSpeed,
  fightScroll,
  mineIds,
  modifierGimmicks,
  nextRoom,
  placeTotal,
  roomBoss,
  roomIntroView,
  roomResultLine,
  roomStageRow,
  type PlaybackInput,
} from './dungeon-playback';
import { roomPlaceLine } from './dungeon-text';
import { usePrefersReducedMotion } from './hooks';
import type { DungeonReplayRoom, DungeonReplayRoomV1, DungeonReplayRoomV2 } from './dungeon-types';
import { INTRO_REPLAY_MS } from './stage-fx';
import { roomMaxRounds } from './stage-rounds';
import type { Speed } from './replay';
import { LogToggle, Stage } from './Stage';
import { Sprite } from './sprites/Sprite';
import { elementIcon } from './sprites/element-icons';
import { LiveRegion } from './ui/LiveRegion';
import { PixelHeading } from './ui/PixelHeading';
import { PlaybackControls } from './ui/PlaybackControls';
import { Tag } from './ui/Tag';
import { usePlayback } from './use-playback';

interface Props {
  /** The rooms to play (every room of a stored run, or the one fight an open run just played). */
  input: PlaybackInput;
  /** The playback is over (it ran to the end, or the player skipped it). */
  onDone: () => void;
  /**
   * Show Pause, 2x and Skip above the stage. Off by default (Misa, 2026-10-14: the dungeon plays by
   * itself); the controls and their state still work, for when they come back.
   */
  showControls?: boolean;
}

/**
 * Plays stored rooms one after the other on the fight stage, at the live finale's pace: every room
 * of a finished run ("Watch again"), or the single fight an open run just played. The stage is the
 * same size throughout: a room opens with a banner drawn OVER the stage ("Room 2", or "Fight" with
 * its place on a path, and the foe and the room's twist; an elite is "Fierce" and tagged), then the
 * room's fight plays under it (the engine's beats, the telegraphs, the lingering numbers), a short
 * rest on the result, then the next room. The room's place ("Room 1 / 3", "Room 3 / 7" on a path)
 * is at the top left of the stage's head and the round at the top right. Pause, 2x and Skip are
 * hidden unless `showControls` is set. The fight is already decided and stored; this only shows it,
 * so leaving at any time loses nothing. Each room's arena is brought into view when the room opens
 * and again when its fight begins (see `RoomFight`).
 */
export function DungeonPlayback({ input, onDone, showControls = false }: Props) {
  const [room, setRoom] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const current = input.rooms[room];
  // Each room's own row: a camp swap changes it part-way through a path run.
  const row = useMemo(
    () => (current === undefined ? [] : roomStageRow(input, current)),
    [input, current],
  );
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
    const next = nextRoom(input, room);
    if (next === null) {
      onDone();
      return;
    }
    setRoom(next);
  };

  return (
    <section class="raid-section dungeon-playback" aria-label="Dungeon playback">
      {showControls && (
        <PlaybackControls
          label="Playback controls"
          playing={!paused}
          speed={speed}
          onPlayPause={() => {
            setPaused(!paused);
          }}
          onSpeed={setSpeed}
          onSkip={onDone}
          skipLabel="Skip"
        />
      )}
      {current.rules === 2 ? (
        <RoomFightV2
          key={room}
          room={current}
          total={placeTotal(input, current)}
          landmark={input.landmark}
          row={row}
          speed={speed}
          paused={paused}
          onFinished={finishRoom}
        />
      ) : (
        <RoomFight
          key={room}
          room={current}
          total={placeTotal(input, current)}
          landmark={input.landmark}
          row={row}
          speed={speed}
          paused={paused}
          onFinished={finishRoom}
        />
      )}
    </section>
  );
}

/**
 * The banner over the stage when a room opens: the room number in big pixel letters (or "Fight" and
 * its place on a path, with an Elite tag for a fierce foe), the foe's sprite and name, its element,
 * and the room's twist. It is drawn inside the stage's own box, so the
 * stage does not change size, and it lets taps through (the intro cannot be skipped). A screen reader
 * gets one status sentence. `ms` is how long it stays: a yellow outline round the stage drains over
 * exactly that time.
 */
function RoomBanner({
  room,
  total,
  landmark,
  ms,
  paused,
}: {
  room: DungeonReplayRoom;
  total: number;
  /** The run was at a landmark depth: the boss room's banner names the signature move. */
  landmark: boolean;
  ms: number;
  paused: boolean;
}) {
  const view = roomIntroView(room, total, landmark);
  const art = bossArt(view.foeId);
  const icon = elementIcon(view.element);
  return (
    <div
      class={`room-banner${view.boss ? ' boss' : ''}${paused ? ' paused' : ''}`}
      aria-hidden="true"
      ref={cssVars({ '--fx-ms': `${String(ms)}ms` })}
    >
      {/* The countdown: a yellow outline round the whole stage that is whole at the start and drains toward the bottom (see dungeon-banner-motion.css). */}
      <span class="rb-timer" />
      <PixelHeading tone={view.boss ? 'bad' : 'gold'} outline="ink" size="l" class="rb-heading">
        {view.heading}
      </PixelHeading>
      <p class="rb-place pix">
        {view.place}
        {view.elite && (
          <>
            {' '}
            <Tag tone="bad" class="rb-elite">
              Elite
            </Tag>
          </>
        )}
        {view.epic && (
          <>
            {' '}
            <Tag tone="bad" class="rb-elite">
              Epic
            </Tag>
          </>
        )}
      </p>
      <Sprite sprite={art.sprite} scale={art.scale} class="rb-foe" />
      <p class={`rb-name pix ${elementClass(view.element)}`}>
        {icon !== undefined && <Sprite sprite={icon} scale={2} />}
        <span>{view.foeName}</span>
        <span class="rb-element">{elementName(view.element)}</span>
      </p>
      {view.trick !== null && (
        <p class="rb-trick">
          <Sprite sprite={combatGlyph(view.trick.glyph) ?? glyphOrUnknown('unknown')} scale={2} />
          <strong class="pix">{view.trick.name}</strong>
          <span>{view.trick.line}</span>
        </p>
      )}
      {view.modifierShown && (
        <p class="rb-twist">
          <strong class="pix">{view.modifierName}</strong>
          <span>{view.modifierDescription}</span>
        </p>
      )}
    </div>
  );
}

/**
 * What a room of either rules does around its fight: the banner stands over the stage for a moment (the wait and the outline that drains
 * share one time), then the fight starts; the arena is brought into view when the room opens and again when its fight begins; pausing
 * stops the beats; and once the last beat has played the final state rests a moment and the run moves on.
 */
function useRoomRhythm({
  room,
  total,
  landmark,
  speed,
  paused,
  finished,
  setPlaying,
  onFinished,
}: {
  room: DungeonReplayRoom;
  total: number;
  landmark: boolean;
  speed: Speed;
  paused: boolean;
  finished: boolean;
  setPlaying: (playing: boolean) => void;
  onFinished: () => void;
}) {
  // The banner shows for a moment with the room standing behind it, then the fight starts. While paused it waits.
  const [banner, setBanner] = useState(true);
  const arena = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

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

  // The run's own screen (the map, or the results) is taller than the screen and was scrolled: when a
  // room opens, bring its arena to the top once the page has laid out the new screen.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      arena.current?.scrollIntoView(fightScroll(reduced));
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  // When the banner goes and the fight starts, the arena must be in view: if the page was scrolled
  // away (or moved) meanwhile, bring it back.
  useEffect(() => {
    if (banner) return;
    const el = arena.current;
    if (el !== null && arenaOutOfView(el.getBoundingClientRect(), window.innerHeight)) {
      el.scrollIntoView(fightScroll(reduced));
    }
  }, [banner]);

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

  const overlay = banner ? (
    <RoomBanner
      // A new banner when playback resumes, so the outline starts again together with the wait.
      key={paused ? 'paused' : 'playing'}
      room={room}
      total={total}
      landmark={landmark}
      ms={atSpeed(ROOM_CARD_MS, speed)}
      paused={paused}
    />
  ) : null;
  return { arena, overlay, banner };
}

function RoomFight({
  room,
  total,
  landmark,
  row,
  speed,
  paused,
  onFinished,
}: {
  room: DungeonReplayRoomV1;
  total: number;
  landmark: boolean;
  row: ReturnType<typeof roomStageRow>;
  speed: Speed;
  paused: boolean;
  onFinished: () => void;
}) {
  const rowIds = row.map((r) => r.id);
  // The room's limit from the content, not how long this stored fight lasted (that would spoil it).
  const maxRounds = roomMaxRounds(room.foe.id);
  const none = useMemo(() => mineIds([]), []);
  const pb = usePlayback({
    events: room.events,
    rowIds,
    bossId: room.foe.id,
    rounds: maxRounds,
    introMs: INTRO_REPLAY_MS,
    speed,
    autoplay: false,
  });
  const { finished } = pb;
  const { arena, overlay, banner } = useRoomRhythm({
    room,
    total,
    landmark,
    speed,
    paused,
    finished,
    setPlaying: pb.setPlaying,
    onFinished,
  });

  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [pb.index]);

  const view = roomIntroView(room, total, landmark);
  return (
    <>
      <div ref={arena} class="dungeon-arena">
        <Stage
          boss={roomBoss(room)}
          hpMax={room.foe.hpMax}
          hpStart={room.foe.hpMax}
          rounds={maxRounds}
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
          place={roomPlaceLine(room, total)}
          modifiers={[room.modifier]}
          addedGimmicks={modifierGimmicks(room, landmark)}
          overlay={overlay}
        />
      </div>
      <LiveRegion>{banner ? view.spoken : ''}</LiveRegion>
      <p class="muted dungeon-room-result" role="status">
        {finished ? roomResultLine(room) : ''}
      </p>
      <LogToggle id={`dungeon-log-${String(room.index)}`}>
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {room.events.slice(0, pb.index).map((event, i) => {
            // An event this client does not know describes as nothing: it gets no line.
            const line = describeEvent(event, room.names);
            return line === '' ? null : <li key={i}>{line}</li>;
          })}
        </ol>
      </LogToggle>
    </>
  );
}

/**
 * A room of a run on combat v2: the stored board events played beat by beat on `StageV2` in its single-row mode (the line acts, then the
 * foe takes one turn, R8.7), under the same banner and with the same rests as a v1 room. The room's foe card names its moves; the fold
 * (`fight-v2.ts`) and the playback (`use-playback-v2.ts`) are the raid replay's. The fight is already decided and stored.
 */
function RoomFightV2({
  room,
  total,
  landmark,
  row,
  speed,
  paused,
  onFinished,
}: {
  room: DungeonReplayRoomV2;
  total: number;
  landmark: boolean;
  row: ReturnType<typeof roomStageRow>;
  speed: Speed;
  paused: boolean;
  onFinished: () => void;
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
    speed,
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
    speed,
    paused,
    finished,
    setPlaying: playback.setPlaying,
    onFinished,
  });

  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [playback.beat]);

  const view = roomIntroView(room, total, landmark);
  const shown = playback.beat === 0 ? 0 : (model.beats[playback.beat - 1]?.to ?? 0);
  return (
    <>
      <div ref={arena} class="dungeon-arena">
        <StageV2
          boss={fight.boss}
          card={fight.card}
          fighters={fight.fighters}
          names={fight.names}
          you={DUNGEON_OWNER}
          model={model}
          playback={playback}
          place={roomPlaceLine(room, total)}
          hpMax={fight.hpMax}
          rounds={fight.rounds}
          single
          ticks={[]}
          overlay={overlay}
        />
      </div>
      <LiveRegion>{banner ? view.spoken : ''}</LiveRegion>
      <p class="muted dungeon-room-result" role="status">
        {finished ? roomResultLine(room) : ''}
      </p>
      <LogToggle id={`dungeon-log-${String(room.index)}`}>
        <ol class="replay-log" ref={logRef} tabIndex={0} aria-label="Fight log">
          {room.events
            .slice(0, shown)
            .map((event, i) => (event.text === '' ? null : <li key={i}>{event.text}</li>))}
        </ol>
      </LogToggle>
    </>
  );
}
