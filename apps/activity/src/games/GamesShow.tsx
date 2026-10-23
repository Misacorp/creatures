/**
 * The Valley Games show player (docs/design/valley-games.md): the day's events one after another, each
 * with its intro card, the event on its scene and a podium. Live, everyone sees the same moment (the
 * clock seeks to `now - startsAt` on the server's clock); a replay has play, pause, 2x and "next event".
 *
 * Layout at 390 px: the stands (the crowd, the players' creatures in the front row, cheering on the big
 * moments), the scene at 2x, one line of commentary, a compact leaderboard (top three and you), and the
 * event pips. Almost no words: who leads, what happened and where your creature is are shown.
 * Self-contained: give it the stored show (`GamesEventResult[]`) and it plays.
 */
import type { GamesEventResult } from '@creatures/engine';
import { gamesEventDef } from '@creatures/game';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { shinyPalette } from '../art';
import { cssVars } from '../css-vars';
import { usePrefersReducedMotion } from '../hooks';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { LiveRegion } from '../ui/LiveRegion';
import { PixelHeading } from '../ui/PixelHeading';
import { PlaybackControls } from '../ui/PlaybackControls';
import { TitlePlate } from '../ui/TitlePlate';
import { GamesActor, GamesScene, GamesSprite } from './art/GamesScene';
import { propSprite } from './art/props';
import { ACTOR_SIZE, standsSeats, type GamesSceneId } from './art/scenes';
import { PEPPER_TIERS, YOU_MARKER, YOU_MARKER_GAP, teamColour } from './show-art';
import { ShowStage, sceneOf } from './ShowStage';
import {
  FX_MS,
  announcementAt,
  announcements,
  buildShowTimeline,
  cursorAt,
  eventMs,
  finalBoard,
  frameAt,
  liveBoard,
  nextSpanStart,
  podiumOf,
  prepareEvent,
  sayParts,
  stillIn,
  type BoardRow,
  type EventFrame,
  type PreparedEvent,
  type SayFrame,
  type ShowCursor,
  type ShowTimeline,
} from './show-timeline';
import { useShowClock } from './use-show-clock';

export interface GamesShowProps {
  /** The day's events, in show order (the server's stored results). */
  events: readonly GamesEventResult[];
  /** Live: when the show starts (epoch ms, server clock). */
  startsAt?: number | undefined;
  /** The server's clock when these props were made (epoch ms), to correct the local clock. */
  serverNow?: number | undefined;
  mode: 'live' | 'replay';
  /** The viewer's player id: their creatures get a marker and their row on the board. */
  youId?: string | undefined;
  /** Player names by id (the podium's spoken line). */
  names?: Readonly<Record<string, string>> | undefined;
  /**
   * The day's event ids in show order, skipped ones included (the server's lineup); an event without a
   * result plays as its intro card only. Absent: the order of `events`.
   */
  lineup?: readonly string[] | undefined;
  /** Called once when the show reaches its end. */
  onDone?: (() => void) | undefined;
  /** A replay's start (ms into the show) and whether it plays at once (default true). */
  startMs?: number | undefined;
  autoplay?: boolean | undefined;
  /** A still picture: no idle animation (the workbench's fixed moments, tests). */
  still?: boolean | undefined;
}

const SEATS = 16;

function spanName(eventId: string): string {
  return gamesEventDef(eventId)?.name ?? eventId;
}

/** "2:05": minutes and seconds to go. */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Up to 16 teams for the front row of the stands; the viewer's always among them, in the middle. */
export function standsTeams(p: PreparedEvent, youId: string | undefined): PreparedEvent['teams'] {
  const mine = p.teams.find((t) => t.playerId === youId);
  const others = p.teams.filter((t) => t !== mine).slice(0, mine === undefined ? SEATS : SEATS - 1);
  if (mine === undefined) return others;
  const mid = Math.floor(others.length / 2);
  return [...others.slice(0, mid), mine, ...others.slice(mid)];
}

function Stands({
  p,
  frame,
  cursor,
  youId,
  still,
}: {
  p: PreparedEvent;
  frame: EventFrame | null;
  cursor: ShowCursor;
  youId: string | undefined;
  still: boolean;
}) {
  const teams = standsTeams(p, youId);
  const seats = standsSeats(teams.length);
  const podium = cursor.phase === 'podium' ? podiumOf(p).rows.map((r) => r.teamId) : [];
  const roar =
    !still &&
    ((frame?.fx.some((f) => f.big && f.age < 350) ?? false) ||
      (cursor.phase === 'podium' && cursor.ms < 1800));
  return (
    <div class={roar ? 'gs-stands is-roar' : 'gs-stands'} aria-hidden="true">
      <GamesScene
        scene={sceneOf(p.result.scene)}
        variant="stands"
        animate={!still}
        frame={still ? 0 : undefined}
      >
        {teams.map((team, i) => {
          const seat = seats[i];
          const actor = p.result.actors[team.actors[0] ?? 0];
          if (seat === undefined || actor === undefined) return null;
          const excited =
            podium.includes(team.teamId) ||
            (frame?.fx.some(
              (f) => f.big && f.a !== undefined && team.actors.includes(f.a) && f.age < FX_MS,
            ) ??
              false);
          const mine = team.playerId === youId;
          const palette = actor.shiny === true ? shinyPalette(actor.speciesId) : undefined;
          return (
            <div
              key={team.teamId}
              class={['gs-fan', excited ? 'is-cheer' : '', mine ? 'is-mine' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <GamesActor
                x={seat.x}
                y={seat.y}
                sprite={creatureSpriteOrFallback(actor.speciesId)}
                palette={palette}
                flip={i % 2 === 1}
              />
              {mine && (
                <div class="gs-you">
                  <GamesSprite
                    x={seat.x}
                    y={seat.y - ACTOR_SIZE - YOU_MARKER_GAP}
                    sprite={YOU_MARKER}
                    z={99}
                  />
                </div>
              )}
            </div>
          );
        })}
      </GamesScene>
    </div>
  );
}

function SayLine({
  p,
  frame,
  cursor,
  youId,
  names,
}: {
  p: PreparedEvent;
  frame: EventFrame | null;
  cursor: ShowCursor;
  youId: string | undefined;
  names: Readonly<Record<string, string>> | undefined;
}) {
  if (cursor.phase === 'podium') {
    const { rows } = podiumOf(p);
    return (
      <p class="gs-say is-podium" aria-hidden="true">
        {rows.map((r) => {
          const actor = p.result.actors[r.actor];
          // A team is its player: their name; a solo entrant is its creature.
          const label =
            p.result.team === 3 ? (names?.[r.playerId] ?? actor?.name ?? '') : (actor?.name ?? '');
          return (
            <span key={r.teamId} class={`gs-medal-name is-place-${String(r.place)}`}>
              <span class="gs-medal-dot" />
              <span class="gs-name" ref={cssVars({ '--team': teamColour(r.playerId) })}>
                {label}
              </span>
            </span>
          );
        })}
      </p>
    );
  }
  const say = cursor.phase === 'event' ? frame?.say : null;
  if (say === null || say === undefined) return <p class="gs-say is-empty" aria-hidden="true" />;
  // A new line is a new element (its pop-in and its own fitting).
  return <SayText key={say.id} p={p} say={say} youId={youId} names={names} />;
}

/**
 * One commentary line: every creature's name in its team's colour, then its owner, dimmed, in
 * parentheses ("Pepperwick (Misa)", "(you)"). It stays on one line: if it would overflow, it is drawn
 * again with each owner shortened to its first word (`shortOwner`), then with the names in the line's
 * own size, before anything shows; only a line that still does not fit ends in "…".
 */
function SayText({
  p,
  say,
  youId,
  names,
}: {
  p: PreparedEvent;
  say: Pick<SayFrame, 'line' | 'a' | 'b' | 'n'>;
  youId: string | undefined;
  names: Readonly<Record<string, string>> | undefined;
}) {
  // 0: as written; 1: owners shortened; 2: also the names in the line's size. Past that, "…".
  const [fit, setFit] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (fit >= 2 || el === null) return;
    if (el.scrollWidth > el.clientWidth + 1) setFit(fit + 1);
  }, [fit]);
  const parts = sayParts(p, say, { youId, names: names ?? {}, short: fit >= 1 });
  const classes = ['gs-say'];
  if (fit >= 1) classes.push('is-short');
  if (fit >= 2) classes.push('is-tight');
  return (
    <p ref={ref} class={classes.join(' ')} aria-hidden="true">
      <span class="prose">
        {parts.map((part, i) =>
          part.k === 'name' ? (
            <span
              key={i}
              class="gs-name pix"
              ref={cssVars({ '--team': teamColour(p.result.actors[part.a]?.playerId ?? '') })}
            >
              {part.text}
            </span>
          ) : part.k === 'owner' ? (
            <span
              key={i}
              class={p.result.actors[part.a]?.playerId === youId ? 'gs-owner is-you' : 'gs-owner'}
            >
              {part.text}
            </span>
          ) : part.k === 'num' ? (
            <span key={i} class="gs-num pix">
              {part.text}
            </span>
          ) : (
            part.text
          ),
        )}
      </span>
    </p>
  );
}

function BoardSlot({
  p,
  row,
  youId,
  live,
}: {
  p: PreparedEvent;
  row: BoardRow;
  youId: string | undefined;
  live: boolean;
}) {
  const actor = p.result.actors[row.actor];
  if (actor === undefined) return null;
  const mine = row.playerId === youId;
  const medal = !live && row.place <= 3;
  const classes = ['gs-slot', `is-place-${String(Math.min(4, row.place))}`];
  if (mine) classes.push('is-mine');
  if (row.out && live) classes.push('is-out');
  if (medal) classes.push('is-medal');
  const palette = actor.shiny === true ? shinyPalette(actor.speciesId) : undefined;
  return (
    <li class={classes.join(' ')} ref={cssVars({ '--team': teamColour(row.playerId) })}>
      <span class="gs-place">{String(row.place)}</span>
      <Sprite
        sprite={creatureSpriteOrFallback(actor.speciesId)}
        scale={2}
        class="gs-icon"
        {...(palette === undefined ? {} : { palette })}
      />
      {row.bar !== undefined ? (
        <span
          class={p.result.scene === 'frost-bath' ? 'gs-bar is-cold' : 'gs-bar'}
          ref={cssVars({ '--pct': `${String(Math.round(row.bar))}%` })}
        >
          <span class="gs-bar-fill" />
        </span>
      ) : (
        row.text !== '' && (
          <span class="gs-score">
            {p.kind === 'feast' && (
              <Sprite sprite={propSprite('pepper', 0, PEPPER_TIERS[1])} scale={1} />
            )}
            {row.text}
          </span>
        )
      )}
      {mine && <Sprite sprite={YOU_MARKER} scale={1} class="gs-slot-you" />}
    </li>
  );
}

function Board({
  p,
  frame,
  cursor,
  youId,
}: {
  p: PreparedEvent;
  frame: EventFrame | null;
  cursor: ShowCursor;
  youId: string | undefined;
}) {
  if (cursor.phase === 'intro' || frame === null) {
    // The intro shows who you sent.
    const mine = p.result.actors.filter((a) => a.playerId === youId);
    return (
      <ol class="gs-board is-intro" aria-hidden="true">
        {mine.map((a) => {
          const palette = a.shiny === true ? shinyPalette(a.speciesId) : undefined;
          return (
            <li
              key={a.a}
              class="gs-slot is-mine is-entrant"
              ref={cssVars({ '--team': teamColour(a.playerId) })}
            >
              <Sprite
                sprite={creatureSpriteOrFallback(a.speciesId)}
                scale={2}
                class="gs-icon"
                {...(palette === undefined ? {} : { palette })}
              />
              <span class="gs-entrant-name">{a.name}</span>
              <Sprite sprite={YOU_MARKER} scale={1} class="gs-slot-you" />
            </li>
          );
        })}
      </ol>
    );
  }
  const live = cursor.phase === 'event';
  const rows = live ? liveBoard(p, frame) : finalBoard(p);
  const top = rows.slice(0, 3);
  const mine = rows.find((r) => r.playerId === youId);
  const shown = mine !== undefined && !top.includes(mine) ? [...top, mine] : top;
  return (
    <ol class="gs-board" aria-hidden="true">
      {shown.map((row) => (
        <BoardSlot key={row.teamId} p={p} row={row} youId={youId} live={live} />
      ))}
    </ol>
  );
}

function Pips({
  prepared,
  timeline,
  cursor,
  youId,
  left,
}: {
  prepared: readonly PreparedEvent[];
  timeline: ShowTimeline;
  cursor: ShowCursor;
  youId: string | undefined;
  /** Creatures still in, shown at the end of the row. */
  left?: { in: number; of: number } | null | undefined;
}) {
  return (
    <div class="gs-foot" aria-hidden="true">
      {left !== null && left !== undefined && (
        <span class="gs-left">
          <Sprite sprite={propSprite('fan', 0, 'ghost')} scale={1} />
          {`${String(left.in)} / ${String(left.of)}`}
        </span>
      )}
      <ol class="gs-pips">
        {timeline.spans.map((span, i) => {
          const p = span.event === null ? undefined : prepared[span.event];
          const done = i < cursor.index || (i === cursor.index && cursor.phase === 'podium');
          const place =
            done && p !== undefined
              ? (finalBoard(p).find((r) => r.playerId === youId)?.place ?? null)
              : null;
          const classes = ['gs-pip'];
          if (done) classes.push('is-done');
          if (i === cursor.index && !cursor.before) classes.push('is-now');
          if (place !== null && place <= 3) classes.push(`is-place-${String(place)}`);
          return <li key={i} class={classes.join(' ')} />;
        })}
      </ol>
    </div>
  );
}

function BeforeShow({
  prepared,
  timeline,
  ms,
  youId,
  still,
}: {
  prepared: readonly PreparedEvent[];
  timeline: ShowTimeline;
  ms: number;
  youId: string | undefined;
  still: boolean;
}) {
  const first = prepared[0];
  const cursor: ShowCursor = { index: 0, phase: 'intro', ms: 0, at: 0, before: true, done: false };
  return (
    <div class="gs-before">
      {first === undefined ? (
        <EmptyStands
          scene={sceneOf(gamesEventDef(timeline.spans[0]?.eventId ?? '')?.scene ?? '')}
          still={still}
        />
      ) : (
        <Stands p={first} frame={null} cursor={cursor} youId={youId} still={still} />
      )}
      <div class="gs-countdown">
        <PixelHeading outline="ink-drop" size="l">
          {clockText(-ms)}
        </PixelHeading>
      </div>
      <ol class="gs-lineup">
        {timeline.spans.map((span, i) => (
          <li key={i} class="gs-lineup-item">
            <span class="gs-lineup-n">{String(i + 1)}</span>
            {spanName(span.eventId)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyStands({ scene, still }: { scene: GamesSceneId; still: boolean }) {
  return (
    <div class="gs-stands" aria-hidden="true">
      <GamesScene scene={scene} variant="stands" animate={!still} frame={still ? 0 : undefined} />
    </div>
  );
}

/** The Valley Games show: live (synced) or a replay. */
export function GamesShow(props: GamesShowProps) {
  const { events, mode, youId, names, still = false } = props;
  const prepared = useMemo(() => events.map(prepareEvent), [events]);
  const timeline = useMemo(() => buildShowTimeline(events, props.lineup), [events, props.lineup]);
  const spoken = useMemo(
    () => announcements(prepared, timeline, youId, names ?? {}),
    [prepared, timeline, youId, names],
  );
  const clock = useShowClock({
    mode,
    total: timeline.total,
    startsAt: props.startsAt,
    serverNow: props.serverNow,
    startMs: props.startMs,
    autoplay: props.autoplay,
  });
  const reduced = usePrefersReducedMotion();
  const cursor = cursorAt(timeline, clock.ms);
  const done = cursor?.done === true;
  const doneCalled = useRef(false);
  const onDone = props.onDone;
  useEffect(() => {
    if (done && !doneCalled.current) {
      doneCalled.current = true;
      onDone?.();
    }
    if (!done) doneCalled.current = false;
  }, [done, onDone]);

  if (cursor === null) return <section class="games-show pix-panel" aria-label="Valley Games" />;
  const span = timeline.spans[cursor.index];
  const p = span?.event === null || span === undefined ? undefined : prepared[span.event];
  const quiet = still || reduced;
  const next = nextSpanStart(timeline, cursor.at);
  const spokenNow = announcementAt(spoken, cursor.at);
  const name = spanName(span?.eventId ?? '');
  const count = `${String(cursor.index + 1)} / ${String(timeline.spans.length)}`;
  const controls =
    mode === 'replay' ? (
      <PlaybackControls
        label="Show controls"
        playing={clock.playing}
        finished={done}
        speed={clock.speed}
        onPlayPause={() => {
          clock.setPlaying(!clock.playing);
        }}
        onSpeed={clock.setSpeed}
        onSkip={() => {
          if (next !== null) clock.seek(next);
        }}
        skipLabel="Next event"
        skipDisabled={next === null}
      />
    ) : null;
  const liveBadge =
    mode === 'live' ? (
      <p class="gs-live">
        <span class="gs-live-dot" aria-hidden="true">
          ▶
        </span>
        Watching live
      </p>
    ) : null;

  if (cursor.before && mode === 'live') {
    return (
      <section class="games-show pix-panel" aria-label="Valley Games">
        <BeforeShow
          prepared={prepared}
          timeline={timeline}
          ms={clock.ms}
          youId={youId}
          still={quiet}
        />
        <Pips prepared={prepared} timeline={timeline} cursor={cursor} youId={youId} />
      </section>
    );
  }

  if (p === undefined) {
    // Nobody entered this event: its intro card over an empty scene, then the next event.
    const scene = sceneOf(gamesEventDef(span?.eventId ?? '')?.scene ?? '');
    return (
      <section class="games-show pix-panel" aria-label="Valley Games">
        <EmptyStands scene={scene} still={quiet} />
        <div class="gs-screen">
          <div class="gs-stage is-empty">
            <GamesScene scene={scene} animate={!quiet} frame={still ? 0 : undefined} label={name} />
          </div>
          <div key={cursor.index} class="gs-title">
            <TitlePlate as="h3" title={name} count={count} />
          </div>
          {liveBadge}
        </div>
        <p class="gs-say is-empty" aria-hidden="true" />
        <ol class="gs-board is-empty" aria-hidden="true" />
        <Pips prepared={prepared} timeline={timeline} cursor={cursor} youId={youId} />
        {controls}
        <LiveRegion>{spokenNow?.text ?? ''}</LiveRegion>
      </section>
    );
  }

  const frame =
    cursor.phase === 'intro'
      ? frameAt(p, 0)
      : cursor.phase === 'event'
        ? frameAt(p, cursor.ms)
        : frameAt(p, eventMs(p.result));
  return (
    <section class="games-show pix-panel" aria-label="Valley Games">
      <Stands
        p={p}
        frame={cursor.phase === 'event' ? frame : null}
        cursor={cursor}
        youId={youId}
        still={quiet}
      />
      <div class="gs-screen">
        <ShowStage
          p={p}
          phase={cursor.phase}
          phaseMs={cursor.ms}
          frame={frame}
          youId={youId}
          reduced={reduced}
          still={still}
          label={name}
        />
        {cursor.phase === 'intro' && (
          <div key={cursor.index} class="gs-title">
            <TitlePlate as="h3" title={name} count={count} />
          </div>
        )}
        {liveBadge}
      </div>
      <SayLine p={p} frame={frame} cursor={cursor} youId={youId} names={names} />
      <Board p={p} frame={frame} cursor={cursor} youId={youId} />
      <Pips
        prepared={prepared}
        timeline={timeline}
        cursor={cursor}
        youId={youId}
        left={cursor.phase === 'event' ? stillIn(p, frame) : null}
      />
      {controls}
      <LiveRegion>{spokenNow?.text ?? ''}</LiveRegion>
    </section>
  );
}
