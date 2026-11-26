/**
 * The Cave canvas's scene (`docs/design/dungeon-canvas.md`; concept C, "the map is the scene"): today's map drawn as the scene itself, every
 * room a button with a name plate under it, the run so far lit, the team standing on the room it is in with one gold plate. Before a run
 * the team stands at the cave mouth (a stand-in arch) with an "Enter" plate. The frame is the raid scene's (`SceneTop`: plates for the
 * left drawer, the now line as a caption). A room's fight takes the place of the map (`stage`), as a stage takes the raid's arena.
 *
 * The map keeps its proportions and is as big as the box allows. When that would be too small to read (the Undercroft's many floors)
 * it keeps a readable size and the box is dragged up and down (`useDragScroll`, a finger scrolls it natively, `PanHint` says so),
 * opening on the team (`map-size.ts`). The cave's rock is one class, `cave-rock`, so the art swaps in later.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { stackLayout, type MapRun } from '../dungeon-map';
import type { DungeonMapNode, DungeonMapView } from '../dungeon-types';
import { DungeonMap } from '../DungeonMap';
import { usePrefersReducedMotion } from '../hooks';
import { elementName } from '../game';
import { partnerWords } from '../reaction-partners';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { PartnerBadge, PartnerGlow } from '../ui/PartnerBadge';
import { partnerTouchProps } from '../ui/partner-touch';
import { partnerClasses } from '../ui/slot-cue';
import type { TrayPartner } from '../valley/Tray';
import { Sprite } from '../sprites/Sprite';
import { Nameplate } from '../ui/Nameplate';
import { PanHint } from '../ui/PanHint';
import { SegmentBar } from '../ui/SegmentBar';
import { useDragScroll } from '../ui/use-drag-scroll';
import { useWide } from '../ui/wide-layout';
import type { TrayDrag } from '../valley/Tray';
import { cssVars } from '../css-vars';
import { PlaceCanvas } from '../valley/PlaceCanvas';
import { SceneTop, type ScenePlate } from '../raid-canvas/RaidScene';
import { caveSize, caveSprite, caveVars } from './cave-art';
import { mapSize, startOffset, type MapSize } from './map-size';
import type { NowLine } from './now-line';

/** A creature as the scene draws it: a sprite with its name, level and (in a run) its HP. */
export interface SceneCreature {
  id: string;
  name: string;
  level: number;
  speciesId: string;
  hp?: { current: number; max: number };
}

/** The cave mouth before the first room: setup (three places, draggable, with Enter) or a run that has not gone in yet. */
export interface CaveMouth {
  /** `setup`: the team is being picked. `entrance`: the run's team stands outside the first room. */
  mode: 'setup' | 'entrance';
  /** Setup: the three places left to right (null: empty). Entrance: the team. */
  slots: readonly (SceneCreature | null)[];
  /** A hand carries a creature: the mouth is a place to drop it. */
  dragging: boolean;
  /** The creature carried is over the mouth. */
  over: boolean;
  /** The place under the carried creature, when it is over one. */
  overSlot: number | null;
  drag: TrayDrag | null;
  disabled: boolean;
  onCreature: (id: string, button: HTMLElement) => void;
  /** Setup: the Enter plate and arch (opens the depth, treats and Enter). */
  onEnter: ((button: HTMLElement) => void) | null;
  enterOpen: boolean;
}

export interface CaveSceneProps {
  /** `setup`, `run`, `playing` or `over`: a hook for the scene's look and for tests. */
  state: string;
  now: NowLine;
  onNow: (button: HTMLElement) => void;
  plates: readonly ScenePlate[];
  /** The day's map, or null when the server sent none. */
  map: DungeonMapView | null;
  undercroft: readonly DungeonMapView[];
  depth: number;
  landmark: boolean;
  /** The run on the map: lit rooms, the room it stands in. Null: the preview before a run. */
  run: MapRun | null;
  openId: string | null;
  onRoom: (nodeId: string, button: HTMLElement) => void;
  /** The team standing on the room the run is in (null: not on the map). */
  team: readonly SceneCreature[] | null;
  onTeamCreature: (id: string, button: HTMLElement) => void;
  mouth: CaveMouth | null;
  /** The reaction-partner highlight on the standers (the mouth's and the map's): what each is drawn with and where touch is reported. */
  partner?: TrayPartner | undefined;
  /** A room's fight takes the place of the map. */
  stage?: ComponentChildren;
  hint?: string | null;
}

/** A creature standing in the scene: its sprite, with a thin HP bar under it when it has any. */
function Figure({
  c,
  scale,
  partner,
}: {
  c: SceneCreature;
  scale: number;
  partner?: TrayPartner | undefined;
}) {
  const out = c.hp !== undefined && c.hp.current <= 0;
  const paint = partner?.paint(c.id);
  const cue = paint?.partner;
  const classes = ['cave-fig'];
  if (out) classes.push('ko');
  if (cue !== undefined) classes.push(...partnerClasses(cue));
  if (paint?.dim === true) classes.push('partner-dim');
  return (
    <span class={classes.join(' ')}>
      {cue !== undefined && <PartnerGlow cue={cue} />}
      {cue !== undefined && <PartnerBadge cue={cue} />}
      <Sprite sprite={creatureSpriteOrFallback(c.speciesId)} scale={scale} />
      {c.hp !== undefined && (
        <SegmentBar
          size="unit"
          current={c.hp.current}
          max={Math.max(1, c.hp.max)}
          label={c.name}
          text=""
        />
      )}
    </span>
  );
}

/** What a creature button says: text only (a reaction partner says so). */
const figureLabel = (c: SceneCreature, partner?: TrayPartner): string => {
  const cue = partner?.paint(c.id)?.partner;
  return `${c.name}, level ${String(c.level)}${
    c.hp === undefined
      ? ''
      : c.hp.current <= 0
        ? ', knocked out'
        : `, ${String(c.hp.current)} / ${String(c.hp.max)} HP`
  }. Opens it.${cue === undefined ? '' : ` ${partnerWords(cue, elementName)}`}`;
};

/** The team on the room it stands in: a button per creature, one gold plate for all. */
function TeamOnMap({
  team,
  onCreature,
  partner,
}: {
  team: readonly SceneCreature[];
  onCreature: (id: string, button: HTMLElement) => void;
  partner?: TrayPartner | undefined;
}) {
  return (
    <span class="cave-team" role="group" aria-label="Your team, standing here">
      {team.map((c) => (
        <button
          key={c.id}
          type="button"
          class="cave-creature vy-stand-btn"
          aria-label={figureLabel(c, partner)}
          {...partnerTouchProps(partner?.touch, c.id)}
          onClick={(event) => {
            onCreature(c.id, event.currentTarget);
          }}
        >
          <Figure c={c} scale={2} partner={partner} />
        </button>
      ))}
      <span class="dmap-plate cave-team-plate" aria-hidden="true">
        <Nameplate size="sm" tone="gold">
          Your team
        </Nameplate>
      </span>
    </span>
  );
}

/**
 * The cave mouth (the art's variant C) with the team standing on its ground strip, feet on row 41, and the Enter plate under row 44.
 * The picture is drawn at a whole-number scale; the art's anchors (opening x 15 to 49, strip rows 38 to 43) are the stylesheet's.
 */
function Mouth({
  mouth,
  scale,
  partner,
}: {
  mouth: CaveMouth;
  scale: number;
  partner?: TrayPartner | undefined;
}) {
  const setup = mouth.mode === 'setup';
  const size = caveSize('cave-mouth');
  return (
    <div
      class="cave-mouth"
      data-drop-id="cave-mouth"
      data-over={mouth.over ? 'yes' : undefined}
      data-mode={mouth.mode}
      ref={cssVars({
        '--mouth-w': `${String(size.width * scale)}px`,
        '--mouth-h': `${String(size.height * scale)}px`,
        '--mouth-s': String(scale),
      })}
    >
      <span class="cave-mouth-art" aria-hidden="true">
        <Sprite sprite={caveSprite('cave-mouth')} scale={scale} />
      </span>
      <ul class="cave-places" aria-label="Your team, left to right">
        {mouth.slots.map((c, i) => (
          <li
            key={c === null ? `empty-${String(i)}` : c.id}
            class="cave-place"
            data-slot={String(i)}
            data-over={mouth.overSlot === i ? 'yes' : undefined}
          >
            {c === null ? (
              <span class="cave-empty" aria-hidden="true" />
            ) : (
              <button
                type="button"
                class="cave-creature vy-stand-btn"
                data-creature={c.id}
                aria-label={figureLabel(c, partner)}
                {...partnerTouchProps(partner?.touch, c.id)}
                disabled={mouth.disabled && setup}
                onClick={(event) => {
                  if (mouth.drag?.consumeClick() === true) {
                    event.preventDefault();
                    return;
                  }
                  mouth.onCreature(c.id, event.currentTarget);
                }}
                {...(mouth.drag === null || !setup
                  ? {}
                  : {
                      onPointerDown: (event: PointerEvent) => {
                        mouth.drag?.startDrag(c.id, event);
                      },
                    })}
              >
                <Figure c={c} scale={scale} partner={partner} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {setup && mouth.onEnter !== null ? (
        <button
          type="button"
          class="cave-enter"
          aria-expanded={mouth.enterOpen}
          aria-label="The cave mouth. Opens the depth, the treats and Enter."
          onClick={(event) => {
            mouth.onEnter?.(event.currentTarget);
          }}
        >
          <Nameplate size="md" tone="gold">
            Enter
          </Nameplate>
        </button>
      ) : (
        <span class="cave-enter cave-enter-still" aria-hidden="true">
          {!setup && (
            <Nameplate size="sm" tone="gold">
              Your team
            </Nameplate>
          )}
        </span>
      )}
    </div>
  );
}

/** The box the map sits in, dragged up and down when the map is taller than it. */
function MapBox({
  map,
  undercroft,
  depth,
  landmark,
  run,
  openId,
  onRoom,
  team,
  onTeamCreature,
  partner,
}: Pick<
  CaveSceneProps,
  | 'map'
  | 'undercroft'
  | 'depth'
  | 'landmark'
  | 'run'
  | 'openId'
  | 'onRoom'
  | 'team'
  | 'onTeamCreature'
  | 'partner'
> & { map: DungeonMapView }) {
  const wide = useWide();
  const reduced = usePrefersReducedMotion();
  // The outer box is the room the scene leaves (it never depends on what is in it); the scroller inside it is dragged when the map is taller.
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const layoutWidth = wide ? 520 : 320;
  const layout = useMemo(
    () => stackLayout(map, undercroft, { width: layoutWidth }),
    [map, undercroft, layoutWidth],
  );
  const deep = undercroft.length > 0;
  const [sized, setSized] = useState<MapSize | null>(null);
  useLayoutEffect(() => {
    const el = outer.current;
    if (el === null) return undefined;
    let frame = 0;
    const measure = (): void => {
      setSized(
        mapSize({ width: el.clientWidth, height: el.clientHeight - PLATE_ROOM }, layout, deep),
      );
    };
    measure();
    // Measured in a frame of its own: the size changes what the box holds, which must not feed back into the same observation.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [layout.width, layout.height, deep]);
  useDragScroll(box);
  const tall = sized?.tall === true;
  const at = run?.at ?? null;
  const shown = useRef(false);
  // A dragged map opens on the team (or the last room walked, for a finished run), and follows it as it moves.
  useEffect(() => {
    const el = box.current;
    if (el === null || !tall) return;
    const board = el.querySelector<HTMLElement>('.dmap-board');
    if (board === null) return;
    const rooms = [...board.querySelectorAll<HTMLElement>('.dmap-slot')];
    const here =
      rooms.find((r) => r.dataset['status'] === 'current') ??
      [...rooms].reverse().find((r) => r.dataset['status'] === 'visited');
    const top = (n: HTMLElement): number =>
      n.getBoundingClientRect().top - board.getBoundingClientRect().top;
    const to =
      here === undefined
        ? 0
        : startOffset(top(here), here.offsetHeight, board.offsetHeight, el.clientHeight);
    el.scrollTo({ top: to, behavior: shown.current && !reduced ? 'smooth' : 'auto' });
    shown.current = true;
  }, [tall, sized?.size, at, run?.status]);
  const band = layout.bands[0];
  return (
    <>
      <div class="cave-fit" ref={outer}>
        <div class="cave-scroll" data-tall={tall ? 'yes' : undefined} ref={box}>
          <div class="cave-sheet">
            {band !== undefined && (
              <div
                class="cave-under"
                aria-hidden="true"
                ref={cssVars({ '--under-top': `${String((band.y / layout.height) * 100)}%` })}
              />
            )}
            <div
              class="cave-map"
              style={sized === null ? undefined : { width: `${String(sized.size)}px` }}
            >
              <DungeonMap
                map={map}
                undercroft={undercroft}
                depth={depth}
                state={run}
                landmark={landmark}
                canvas={{
                  openId,
                  onRoom,
                  layoutWidth,
                  dense: sized?.dense === true,
                  decor: decorOf,
                  ...(team === null
                    ? {}
                    : {
                        team: (
                          <TeamOnMap team={team} onCreature={onTeamCreature} partner={partner} />
                        ),
                      }),
                }}
              />
            </div>
          </div>
        </div>
        <PanHint target={box} id="cave-canvas-map" axis="y" />
      </div>
    </>
  );
}

/** Room kept under the map for the last room's name plate (px). */
const PLATE_ROOM = 28;

/** Scale of the tiles and props: whole pixels per art pixel. */
const ART_SCALE = 2;

/** Scenery on a room: the fire beside the camp, the stair beside the way down. */
function decorOf(node: DungeonMapNode, descent: boolean): ComponentChildren {
  if (node.kind === 'camp' && node.id.startsWith('f')) {
    return (
      <span class="cave-prop cave-prop-fire" aria-hidden="true">
        <Sprite sprite={caveSprite('campfire-prop')} scale={ART_SCALE} />
      </span>
    );
  }
  if (descent) {
    return (
      <span class="cave-prop cave-prop-stair" aria-hidden="true">
        <Sprite sprite={caveSprite('cracked-stair')} scale={ART_SCALE} />
      </span>
    );
  }
  return null;
}

export function CaveScene(p: CaveSceneProps) {
  return (
    <div
      class="rc-scene cave-scene cave-rock"
      data-state={p.state}
      ref={cssVars(caveVars(ART_SCALE))}
    >
      <span class="cave-wall cave-wall-top" aria-hidden="true" />
      <span class="cave-wall cave-wall-left" aria-hidden="true" />
      <span class="cave-wall cave-wall-right" aria-hidden="true" />
      <SceneTop label="Cave overviews" plates={p.plates} now={p.now} onNow={p.onNow} />
      {p.stage !== undefined && p.stage !== null ? (
        <div class="rc-stage">{p.stage}</div>
      ) : (
        <>
          {p.mouth !== null && <Mouth mouth={p.mouth} scale={2} partner={p.partner} />}
          {p.map === null ? (
            <p class="muted cave-nomap">The map is not here yet.</p>
          ) : (
            <MapBox
              map={p.map}
              undercroft={p.undercroft}
              depth={p.depth}
              landmark={p.landmark}
              run={p.run}
              openId={p.openId}
              onRoom={p.onRoom}
              team={p.team}
              onTeamCreature={p.onTeamCreature}
              partner={p.partner}
            />
          )}
          {p.hint !== undefined && p.hint !== null && (
            <p class="rc-hint muted small" role="status">
              {p.hint}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The Cave's rock and now line before today has loaded, so the canvas place does not jump when the map arrives. */
export function CaveLoading() {
  return (
    <PlaceCanvas
      label="Cave"
      left={null}
      right={null}
      scene={
        <div
          class="rc-scene cave-scene cave-rock"
          data-state="loading"
          ref={cssVars(caveVars(ART_SCALE))}
        >
          <span class="cave-wall cave-wall-top" aria-hidden="true" />
          <span class="cave-wall cave-wall-left" aria-hidden="true" />
          <span class="cave-wall cave-wall-right" aria-hidden="true" />
          <SceneTop
            label="Cave overviews"
            plates={[]}
            now={{ id: 'loading', text: 'Loading the cave...', tap: null }}
            onNow={() => undefined}
          />
        </div>
      }
    />
  );
}
