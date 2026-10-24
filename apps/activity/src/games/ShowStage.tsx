/**
 * One event of the show on its scene: the entrants (dropping in during the intro), the props and effects
 * of the kind (the melon, the sharks, the plates and peppers, the floe, the heat), the marker over each
 * of your creatures (above everything, following it) and the podium card at the end. Purely a view of
 * a frame from `show-timeline`; the clock is the caller's.
 */
import { Fragment } from 'preact';
import { shinyPalette } from '../art';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { cssVars } from '../css-vars';
import { GamesActor, GamesScene, GamesSprite } from './art/GamesScene';
import { LOG_BODY, PODIUM_HEIGHTS, PUMPKIN_FRAMES_COUNT } from './art/drawn';
import {
  BARREL_HEIGHT,
  CRATE_HEIGHT,
  KITE_HEIGHT,
  KITE_TIE,
  barrelFrameOf,
  kiteString,
} from './art/drawn-team';
import { propSprite, propTinted } from './art/props';
import { SMALL_SCALE } from './show-layout';
import { ACTOR_SIZE, PEPPER_TABLE_TOP, type GamesSceneId, GAMES_SCENE_IDS } from './art/scenes';
import type { RampName } from './art/tint';
import {
  PEPPER_TIERS,
  drawnState,
  fxArt,
  fxMotion,
  meterTint,
  numberSprite,
  teamDot,
  teamRamp,
  YOU_MARKER,
  YOU_MARKER_GAP,
  YOU_MARKER_METER_GAP,
} from './show-art';
import {
  FX_MS,
  SHOW_PODIUM_MS,
  dropAt,
  podiumOf,
  type ActorFrame,
  type EventFrame,
  type PreparedEvent,
  type ShowPhase,
  type TeamObjectFrame,
} from './show-timeline';

/** More entrants than this and the meters crowd each other out. */
const CROWDED = 16;
/** Your markers are drawn over everything in the scene (effects are 500, numbers 501). */
const YOU_Z = 600;
const MEDAL_RAMPS: readonly RampName[] = ['gold', 'silver', 'bronze'];
const MEDAL_SECOND: readonly RampName[] = ['blue', 'red', 'green'];
/** Where the podium's steps stand (their bottom-centre), in the order of the standings. */
const PODIUM_X = [96, 68, 124] as const;
const PODIUM_FLOOR = 102;
/** Confetti pieces of the podium: where each falls and how fast (scene px, px a second). */
const CONFETTI = [
  { x: 24, speed: 30, phase: 0 },
  { x: 58, speed: 38, phase: 40 },
  { x: 88, speed: 26, phase: 75 },
  { x: 112, speed: 34, phase: 20 },
  { x: 140, speed: 29, phase: 60 },
  { x: 168, speed: 36, phase: 90 },
  { x: 40, speed: 33, phase: 100 },
  { x: 152, speed: 27, phase: 5 },
] as const;
const CONFETTI_TINTS: readonly (readonly [RampName, RampName])[] = [
  ['pink', 'teal'],
  ['yellow', 'blue'],
  ['red', 'green'],
];

/** A crate's step in a tower (the engine's `STACK_CRATE_STEP`: the outlines overlap by a pixel). */
const CRATE_STEP = CRATE_HEIGHT - 1;

/** The at-once team events: one object per team (a barrel, a tower, a kite), a fixed camera. */
export function isTeamObjectKind(kind: PreparedEvent['kind']): boolean {
  return kind === 'fill' || kind === 'stack' || kind === 'kite';
}

export function sceneOf(id: string): GamesSceneId {
  return (GAMES_SCENE_IDS as readonly string[]).includes(id) ? (id as GamesSceneId) : 'sauna';
}

/** How an actor is shown now: hidden (gone through the door, under the splash), greyed or as itself. */
export function actorLook(kind: PreparedEvent['kind'], f: ActorFrame): 'hidden' | 'grey' | 'in' {
  if (!f.out) return 'in';
  const ms = f.outMs ?? 0;
  switch (kind) {
    case 'endure':
      return f.state === 'out' ? 'hidden' : 'in';
    case 'shove':
      return ms < 450 ? 'hidden' : 'grey';
    case 'chase':
      return ms > 900 ? 'grey' : 'in';
    default:
      return f.state === 'out' ? 'grey' : 'in';
  }
}

/** Facing: runners face right; swimmers the way they swim; sitters and sumo face the middle. */
function flipOf(p: PreparedEvent, f: ActorFrame): boolean {
  switch (p.kind) {
    case 'chase':
    case 'haul':
    case 'fill':
    case 'stack':
    case 'kite':
      return false;
    case 'swim':
      return f.out ? false : f.y > 62;
    case 'feast':
      return false;
    default:
      return f.x > 104;
  }
}

function moveClass(state: string): string {
  switch (state) {
    case 'run':
      return 'is-run';
    case 'swim':
      return 'is-swim';
    case 'eat':
      return 'is-eat';
    case 'cheer':
      return 'is-cheer';
    case 'sweat':
    case 'flame':
      return 'is-shiver';
    default:
      return '';
  }
}

/**
 * How high an actor is lifted now (scene px): its own lift, plus the drop of the intro (`introMs`, null
 * during the event; under reduced motion everyone has landed) or a hop effect during the event. The
 * creature and your marker over it both read this, so the marker follows every move.
 */
export function liftOf(
  frame: EventFrame,
  f: ActorFrame,
  introMs: number | null,
  reduced: boolean,
): number {
  let lift = f.lift;
  if (introMs !== null) {
    lift += dropAt(f.a, frame.actors.length, reduced ? Number.POSITIVE_INFINITY : introMs).lift;
    return lift;
  }
  for (const fx of frame.fx) {
    if (fx.a !== f.a || fxMotion(fx.fx) !== 'hop') continue;
    lift += 7 * Math.sin((Math.PI * fx.age) / FX_MS);
  }
  return lift;
}

/** How tall a creature stands on this field (a crowded field draws them a step smaller). */
export function actorHeight(p: Pick<PreparedEvent, 'small'>): number {
  return p.small ? Math.round(ACTOR_SIZE * SMALL_SCALE) : ACTOR_SIZE;
}

/** Whether an actor's meter shows over its head (a packed room shows only your creatures' meters). */
export function meterShown(
  p: PreparedEvent,
  f: ActorFrame,
  youId: string | undefined,
  count: number,
): boolean {
  const actor = p.result.actors[f.a];
  return (
    actor !== undefined &&
    meterTint(p.kind, p.result.scene) !== undefined &&
    actorLook(p.kind, f) === 'in' &&
    !f.out &&
    f.meter !== undefined &&
    // A swimmer's stamina shows once a shark has had a go at it.
    !(p.kind === 'swim' && f.meter >= 100) &&
    (count <= CROWDED || actor.playerId === youId)
  );
}

interface ActorsProps {
  p: PreparedEvent;
  frame: EventFrame;
  youId: string | undefined;
  /** The intro: ms into it (actors drop in); null during the event. */
  introMs: number | null;
  reduced: boolean;
}

/** The entrants, drawn between the scene's back and front layers. */
function Actors({ p, frame, youId, introMs, reduced }: ActorsProps) {
  const team = p.result.team === 3;
  const tint = meterTint(p.kind, p.result.scene);
  const count = frame.actors.length;
  return (
    <>
      {frame.actors.map((f) => {
        const actor = p.result.actors[f.a];
        if (actor === undefined) return null;
        const look = actorLook(p.kind, f);
        if (look === 'hidden') return null;
        const lift = liftOf(frame, f, introMs, reduced);
        const classes = ['gs-act'];
        if (introMs !== null) {
          const drop = dropAt(f.a, count, reduced ? Number.POSITIVE_INFINITY : introMs);
          if (drop.landedMs !== null && drop.landedMs < 160) classes.push('is-land');
        } else {
          for (const fx of frame.fx) {
            if (fx.a !== f.a) continue;
            const motion = fxMotion(fx.fx);
            if (motion !== null && motion !== 'hop') classes.push(`is-${motion}`);
          }
          const move = moveClass(f.state);
          if (move !== '' && look === 'in') classes.push(move);
        }
        if (look === 'grey') classes.push('is-out');
        if (actor.playerId === youId) classes.push('is-mine');
        const engineState = look === 'grey' && p.kind === 'shove' ? 'swim' : f.state;
        const x = Math.round(f.x);
        const y = Math.round(f.y);
        const showMeter = meterShown(p, f, youId, count);
        const palette = actor.shiny === true ? shinyPalette(actor.speciesId) : undefined;
        return (
          <Fragment key={f.a}>
            {team && look === 'in' && p.kind !== 'haul' && (
              <GamesSprite x={x} y={y + 1} sprite={teamDot(teamRamp(actor.playerId))} z={y - 1} />
            )}
            <div class={classes.join(' ')}>
              <GamesActor
                x={x}
                y={Math.round(y - lift)}
                sprite={creatureSpriteOrFallback(actor.speciesId)}
                palette={palette}
                state={drawnState(p.kind, engineState)}
                flip={flipOf(p, f)}
                small={p.small}
                meter={showMeter ? (f.meter ?? 0) / 100 : undefined}
                meterTint={tint}
                z={y}
              />
            </div>
            {p.kind === 'fill' && look === 'in' && introMs === null && (
              // The pail in its paws: full on the way up, empty on the way down.
              <GamesSprite
                x={x + 6}
                y={Math.round(y - lift) - 3}
                sprite={propSprite('pail', (f.meter ?? 0) >= 50 ? 1 : 0)}
                z={y + 1}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/** A carried log's bottom sits this far over the lane's feet: on the carriers' heads. */
const LOG_ON_HEADS = 12;
/** Where the haul's "you" marker points: over the log, or over the middle pusher. */
const PUSH_MIDDLE = -19;

/**
 * Where a team's load is drawn: a log on the carriers' heads (on the ground in front of them when it
 * dropped; tilted when it wobbles), a pumpkin rolling on the path ahead of its pushers.
 */
export function loadPlacement(
  load: EventFrame['props']['loads'][number],
  still: boolean,
): { x: number; y: number; frame: number; z: number } {
  const x = Math.round(load.x);
  const y = Math.round(load.y);
  if (load.kind === 'log') {
    if (load.f === 2) return { x, y: y + 3, frame: 0, z: y + 1 };
    return {
      x,
      y: y - LOG_ON_HEADS + 2,
      frame: load.f === 1 ? 1 + (load.i % 2) : 0,
      // Over its own carriers (z is a whole number: the creatures' is their feet's y).
      z: y + 1,
    };
  }
  const roll = still ? 0 : Math.floor(load.roll / 8);
  return {
    x,
    y: y + 1,
    frame: ((roll % PUMPKIN_FRAMES_COUNT) + PUMPKIN_FRAMES_COUNT) % PUMPKIN_FRAMES_COUNT,
    z: y,
  };
}

/** The lift of a team's load during the intro: it lands with the team's last creature. */
function loadLift(
  p: PreparedEvent,
  frame: EventFrame,
  i: number,
  introMs: number | null,
  reduced: boolean,
): number {
  const team = p.teams[i];
  const last = team?.actors[team.actors.length - 1];
  const f = last === undefined ? undefined : frame.actors[last];
  return f === undefined ? 0 : liftOf(frame, f, introMs, reduced);
}

/** Props that live between the layers: the melon (it rolls over the runners), the shark fins, the loads. */
function BackProps({
  p,
  frame,
  still,
  introMs,
  reduced,
}: {
  p: PreparedEvent;
  frame: EventFrame;
  still: boolean;
  introMs: number | null;
  reduced: boolean;
}) {
  const { melon, sharks, loads } = frame.props;
  return (
    <>
      {frame.props.objects.map((o) => (
        <TeamObject key={`obj-${String(o.i)}`} p={p} frame={frame} o={o} still={still} />
      ))}
      {p.finishes.map((mark) => (
        // Each lane's finish: a short chequered strip across the lane (the starts are staggered).
        <GamesSprite
          key={`finish-${String(mark.i)}`}
          x={mark.x}
          y={mark.y + 2}
          sprite={propSprite('finishBand')}
          z={mark.y - 6}
        />
      ))}
      {loads.map((load) => {
        const at = loadPlacement(load, still);
        const lift = Math.round(loadLift(p, frame, load.i, introMs, reduced));
        return (
          <GamesSprite
            key={`load-${String(load.i)}`}
            x={at.x}
            y={at.y - lift}
            sprite={propSprite(load.kind, at.frame)}
            z={at.z}
          />
        );
      })}
      {melon !== null && (
        <>
          <GamesSprite
            x={Math.round(melon.x - 14)}
            y={Math.round(melon.y + melon.size / 2 + 2)}
            sprite={propSprite('dust', still ? 0 : Math.floor(melon.roll / 4))}
            z={melon.y + melon.size / 2 - 1}
          />
          <GamesSprite
            x={Math.round(melon.x)}
            y={Math.round(melon.y)}
            anchor="centre"
            sprite={propSprite('melon', still ? 0 : Math.floor(melon.roll / 5))}
            z={melon.y + melon.size / 2}
          />
        </>
      )}
      {p.kind === 'swim' &&
        sharks.map((s) => (
          <GamesSprite
            key={s.i}
            x={Math.round(s.x)}
            y={Math.round(s.y + 4)}
            sprite={propSprite('sharkFin', still ? 0 : Math.floor(frame.ms / 300) + s.i)}
            flip={s.flip}
            z={s.y + 4}
          />
        ))}
    </>
  );
}

/** The top of a team's object (scene px): where its "you" marker points. */
export function objectTop(o: TeamObjectFrame, height = ACTOR_SIZE): number {
  switch (o.kind) {
    case 'barrel':
      return o.y - BARREL_HEIGHT;
    case 'tower':
      // Over the climber standing on the top crate.
      return o.y - o.f * CRATE_STEP - height;
    case 'kite':
      return o.y - Math.ceil(KITE_HEIGHT / 2);
  }
}

/**
 * One team's object in the at-once team events, in the team's colour: a barrel with its gauge, a
 * tower of crates (toppled crates tumble off for a moment), or a kite on its string from the holder.
 */
function TeamObject({
  p,
  frame,
  o,
  still,
}: {
  p: PreparedEvent;
  frame: EventFrame;
  o: TeamObjectFrame;
  still: boolean;
}) {
  const team = p.teams[o.i];
  if (team === undefined) return null;
  const ramp = teamRamp(team.playerId);
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  if (o.kind === 'barrel') {
    return (
      <GamesSprite
        x={x}
        y={y}
        sprite={propSprite('barrel', barrelFrameOf(o.f), undefined, ramp)}
        z={y - 1}
      />
    );
  }
  if (o.kind === 'tower') {
    const height = Math.max(0, Math.round(o.f));
    // Behind the climber on top, in front of nothing else.
    const z = y - height * CRATE_STEP - 1;
    const fell = Math.max(0, Math.round(o.was) - height);
    const tumbling = !still && fell > 0 && o.since < 2;
    return (
      <>
        {Array.from({ length: height }, (_, k) => (
          <GamesSprite
            key={k}
            x={x}
            y={y - k * CRATE_STEP}
            sprite={propSprite('teamCrate', 0, undefined, ramp)}
            z={z}
          />
        ))}
        {tumbling &&
          Array.from({ length: fell }, (_, j) => {
            const u = o.since;
            const side = (o.i + j) % 2 === 0 ? 1 : -1;
            return (
              <GamesSprite
                key={`fall-${String(j)}`}
                x={Math.round(x + side * (u * 7 + j * 4))}
                y={Math.round(y - (height + j) * CRATE_STEP + u * u * 9)}
                sprite={propSprite('teamCrate', 0, undefined, ramp)}
                z={499}
              />
            );
          })}
      </>
    );
  }
  // A kite: its string from the holder's paws (the team's first creature), then the kite.
  const holder = team.actors[0];
  const h = holder === undefined ? undefined : frame.actors[holder];
  const handX = Math.round(h?.x ?? x) + 3;
  const handY = Math.round(h?.y ?? y + 20) - 9;
  const top = Math.round(y - KITE_HEIGHT / 2);
  const tieX = x - 4 + KITE_TIE.x;
  const tieY = top + KITE_TIE.y;
  const tumbling = o.f === 1;
  const kiteFrame = tumbling ? 2 : still ? 0 : Math.floor(frame.ms / 300 + o.i) % 2;
  return (
    <>
      {kiteString(tieX - handX, tieY - handY).map((piece, k) => (
        <GamesSprite
          key={k}
          x={handX + piece.x}
          y={handY + piece.y}
          anchor="top-left"
          sprite={piece.sprite}
          z={20}
        />
      ))}
      <GamesSprite
        x={x}
        y={y}
        anchor="centre"
        sprite={propSprite('kite', kiteFrame, undefined, ramp)}
        flip={tumbling && !still && Math.floor(frame.ms / 150) % 2 === 0}
        z={21}
      />
    </>
  );
}

/** Over the front layer: plates and peppers, effects, popping numbers and your markers. */
function FrontProps({
  p,
  frame,
  youId,
  still,
  introMs,
  reduced,
}: {
  p: PreparedEvent;
  frame: EventFrame;
  youId: string | undefined;
  still: boolean;
  introMs: number | null;
  reduced: boolean;
}) {
  const plates =
    p.kind === 'feast'
      ? p.result.actors.map((a) => ({
          a: a.a,
          x: a.x,
          y: (a.y <= 60 ? PEPPER_TABLE_TOP.back : PEPPER_TABLE_TOP.front) + 3,
        }))
      : [];
  const pepperOf = new Map(frame.props.peppers.map((pp) => [pp.a, pp.tier]));
  const count = frame.actors.length;
  return (
    <>
      {plates.map((plate) => {
        const tier = pepperOf.get(plate.a);
        return (
          <Fragment key={plate.a}>
            <GamesSprite x={plate.x} y={plate.y} sprite={propTinted('plate', undefined)} z={1} />
            {tier !== undefined && introMs === null && (
              <GamesSprite
                x={plate.x}
                y={plate.y - 2}
                sprite={propSprite('pepper', 0, PEPPER_TIERS[tier] ?? 'green')}
                flip={plate.a % 2 === 1}
                z={2}
              />
            )}
          </Fragment>
        );
      })}
      {introMs === null &&
        frame.fx.map((fx) => {
          const art = fxArt(p.kind, fx.fx);
          if (art === null) return null;
          const f = fx.a === undefined ? undefined : frame.actors[fx.a];
          if (f !== undefined && actorLook(p.kind, f) === 'hidden' && fx.fx !== 'splash')
            return null;
          const x = Math.round(fx.x + art.dx);
          const y = Math.round(fx.y + art.dy - (f?.lift ?? 0));
          const rise = Math.round((fx.age / FX_MS) * 6);
          return (
            <Fragment key={fx.id}>
              <GamesSprite
                x={x}
                y={y - (art.prop === 'steam' ? rise : 0)}
                anchor="centre"
                sprite={propSprite(art.prop, still ? 0 : Math.floor(fx.age / 150), art.tint)}
                z={500}
              />
              {art.pop !== undefined && (
                <GamesSprite
                  x={x + 9}
                  y={y - 6 - rise}
                  anchor="centre"
                  sprite={numberSprite(art.pop, 'gold')}
                  z={501}
                />
              )}
            </Fragment>
          );
        })}
      {p.kind === 'haul' &&
        frame.props.loads.map((load) => {
          // One marker per team in a haul: over the log, or over the pushers.
          const team = p.teams[load.i];
          if (team === undefined || team.playerId !== youId) return null;
          const lift = Math.round(loadLift(p, frame, load.i, introMs, reduced));
          const y = Math.round(load.y) - lift;
          const top =
            load.kind === 'log' && load.f !== 2 ? y - LOG_ON_HEADS - LOG_BODY : y - actorHeight(p);
          return (
            <div key={`you-${String(load.i)}`} class="gs-you">
              <GamesSprite
                x={Math.round(load.x) + (load.kind === 'pumpkin' ? PUSH_MIDDLE : 0)}
                y={top - YOU_MARKER_GAP}
                sprite={YOU_MARKER}
                z={YOU_Z}
              />
            </div>
          );
        })}
      {isTeamObjectKind(p.kind) &&
        frame.props.objects.map((o) => {
          // One marker per team: over its barrel, its tower's climber or its kite.
          const team = p.teams[o.i];
          if (team === undefined || team.playerId !== youId) return null;
          return (
            <div key={`you-${String(o.i)}`} class="gs-you">
              <GamesSprite
                x={Math.round(o.x)}
                y={Math.round(objectTop(o, actorHeight(p))) - YOU_MARKER_GAP}
                sprite={YOU_MARKER}
                z={YOU_Z}
              />
            </div>
          );
        })}
      {frame.actors.map((f) => {
        const actor = p.result.actors[f.a];
        if (
          actor === undefined ||
          actor.playerId !== youId ||
          p.kind === 'haul' ||
          isTeamObjectKind(p.kind)
        )
          return null;
        if (actorLook(p.kind, f) === 'hidden') return null;
        const lift = liftOf(frame, f, introMs, reduced);
        const gap = meterShown(p, f, youId, count) ? YOU_MARKER_METER_GAP : YOU_MARKER_GAP;
        return (
          <div key={f.a} class="gs-you">
            <GamesSprite
              x={Math.round(f.x)}
              y={Math.round(Math.round(f.y) - lift) - actorHeight(p) - gap}
              sprite={YOU_MARKER}
              z={YOU_Z}
            />
          </div>
        );
      })}
    </>
  );
}

/** The podium card: the scene dimmed, the top three on their steps with medals, confetti falling. */
function Podium({
  p,
  ms,
  youId,
  still,
  cameraX,
}: {
  p: PreparedEvent;
  ms: number;
  youId: string | undefined;
  still: boolean;
  /** The scene's camera: the podium stands in the middle of the view, wherever it is. */
  cameraX: number;
}) {
  const { rows, more } = podiumOf(p);
  // The steps rise in one after another: bronze, silver, gold.
  const order = rows.map((_, i) => i).reverse();
  return (
    <>
      <div class="gs-dim" />
      {rows.map((row, i) => {
        const actor = p.result.actors[row.actor];
        if (actor === undefined) return null;
        const place = Math.max(1, Math.min(3, row.place)) as 1 | 2 | 3;
        const x = cameraX + (PODIUM_X[i] ?? 96);
        const shownAt = 250 + order.indexOf(i) * 350;
        const u = still ? 1 : Math.max(0, Math.min(1, (ms - shownAt) / 300));
        if (u <= 0) return null;
        const height = Math.round(PODIUM_HEIGHTS[place] * u);
        const top = PODIUM_FLOOR - height;
        const ramp = MEDAL_RAMPS[place - 1] ?? 'gold';
        const palette = actor.shiny === true ? shinyPalette(actor.speciesId) : undefined;
        const landed = u >= 1;
        const cheer = landed && !still && Math.floor((ms - shownAt) / 220) % 2 === 0;
        return (
          <Fragment key={row.teamId}>
            <GamesSprite
              x={x}
              y={PODIUM_FLOOR}
              sprite={propSprite(`podium${String(place)}` as 'podium1', 0, ramp)}
              z={700}
            />
            {landed && (
              <GamesSprite
                x={x}
                y={top + 15}
                sprite={propSprite('medal', 0, ramp, MEDAL_SECOND[place - 1])}
                z={702}
              />
            )}
            <div class={actor.playerId === youId ? 'gs-podium-actor is-mine' : 'gs-podium-actor'}>
              <GamesActor
                x={x}
                y={top - (cheer ? 2 : 0)}
                sprite={creatureSpriteOrFallback(actor.speciesId)}
                palette={palette}
                z={701}
              />
            </div>
            {actor.playerId === youId && (
              <div class="gs-you">
                <GamesSprite
                  x={x}
                  y={top - (cheer ? 2 : 0) - ACTOR_SIZE - YOU_MARKER_GAP}
                  sprite={YOU_MARKER}
                  z={706}
                />
              </div>
            )}
          </Fragment>
        );
      })}
      {more > 0 && (
        <GamesSprite
          x={cameraX + 150}
          y={PODIUM_FLOOR - 4}
          sprite={numberSprite(`+${String(more)}`, 'gold')}
          z={704}
        />
      )}
      {CONFETTI.map((c, i) => {
        const fall = still ? c.phase : (c.phase + (ms / 1000) * c.speed) % 120;
        return (
          <GamesSprite
            key={i}
            x={cameraX + c.x + (still ? 0 : Math.round(Math.sin(ms / 400 + i) * 3))}
            y={Math.round(fall) - 8}
            anchor="centre"
            sprite={propTinted(
              'confetti',
              CONFETTI_TINTS[i % CONFETTI_TINTS.length],
              still ? 0 : Math.floor(ms / 200) + i,
            )}
            z={705}
          />
        );
      })}
    </>
  );
}

export interface ShowStageProps {
  p: PreparedEvent;
  phase: ShowPhase;
  /** Ms into the phase. */
  phaseMs: number;
  frame: EventFrame;
  youId?: string | undefined;
  reduced: boolean;
  /** A still frame (tests and the workbench's fixed moments): no idle animation. */
  still?: boolean | undefined;
  label: string;
}

/** The scene of one event at one moment of its intro, its run or its podium. */
export function ShowStage({
  p,
  phase,
  phaseMs,
  frame,
  youId,
  reduced,
  still,
  label,
}: ShowStageProps) {
  const quiet = reduced || still === true;
  const scene = sceneOf(p.result.scene);
  const heat = frame.props.heat;
  const steaming = p.kind === 'endure' && frame.fx.some((f) => f.fx === 'steam' && f.age < FX_MS);
  const shaking =
    !quiet &&
    phase === 'event' &&
    frame.fx.some((f) => (f.fx === 'squash' || f.fx === 'bonk' || f.fx === 'out') && f.age < 220);
  const introMs = phase === 'intro' ? phaseMs : null;
  const heatShare = heat === null ? 0 : Math.max(0, Math.min(1, (heat - 20) / 80));
  return (
    <div
      class={[
        'gs-stage',
        `gs-kind-${p.kind}`,
        scene === 'frost-bath' ? 'is-cold' : '',
        shaking ? 'is-shake' : '',
        steaming ? 'is-steam' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={cssVars({ '--heat': heatShare.toFixed(3) })}
    >
      <GamesScene
        scene={scene}
        cameraX={Math.round(frame.cameraX)}
        worldWidth={p.worldWidth}
        heat={heat === null ? undefined : Math.round(heat)}
        floeRadius={frame.props.floe === null ? undefined : Math.round(frame.props.floe)}
        animate={!quiet}
        frame={still === true ? 0 : undefined}
        label={label}
        overlay={
          <>
            {p.kind === 'endure' && <div class="gs-heat" />}
            {p.kind === 'endure' && <div class="gs-mist" />}
            <FrontProps
              p={p}
              frame={frame}
              youId={phase === 'podium' ? undefined : youId}
              still={quiet}
              introMs={introMs}
              reduced={reduced}
            />
            {phase === 'podium' && (
              <Podium
                p={p}
                ms={phaseMs}
                youId={youId}
                still={quiet || phaseMs >= SHOW_PODIUM_MS}
                cameraX={Math.round(frame.cameraX)}
              />
            )}
          </>
        }
      >
        <BackProps p={p} frame={frame} still={quiet} introMs={introMs} reduced={reduced} />
        <Actors p={p} frame={frame} youId={youId} introMs={introMs} reduced={reduced} />
      </GamesScene>
    </div>
  );
}
