import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { elementClass } from './art';
import { cssVars } from './css-vars';
import {
  EDGE_ORDER,
  descentRooms,
  edgePath,
  edgeStatus,
  nodeAriaLabel,
  nodeElement,
  nodeGlyphOf,
  lostAt,
  nodeLevel,
  nodeStatus,
  reachableAheadAcross,
  roomPlate,
  stackLayout,
  startLevel,
  startMarkers,
  type LaidNode,
  type MapRun,
} from './dungeon-map';
import type { DungeonMapView } from './dungeon-types';
import { DungeonNodeDrawer } from './DungeonNodeDrawer';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import { Nameplate } from './ui/Nameplate';
import { RoomMarks } from './ui/RoomMark';

interface Props {
  /** The day's map. */
  map: DungeonMapView;
  /**
   * The Undercroft levels drawn so far, in order (`state.undercroft.maps`): stacked below the floor boss in a
   * darker palette, each under a band with its label. Absent or empty: the day's map alone.
   */
  undercroft?: readonly DungeonMapView[] | undefined;
  /**
   * The player's depth. From the depth that opens the Undercroft the floor boss wears a small down-arrow badge
   * (beating it lets the player descend). Absent: no badge on the floor boss.
   */
  depth?: number | undefined;
  /**
   * The run on this map, or null for the preview before the player enters (no room is lit, none can be gone
   * to). A finished run's route is a run too (`routeRun`): its rooms are visited or not, with no Go.
   */
  state: MapRun | null;
  /** The player chose Go on a room the run can reach. Without it the map only shows (the preview). */
  onGo?: ((nodeId: string) => void) | undefined;
  /** An act is on its way: Go waits. */
  busy?: boolean | undefined;
  /** The depth is a landmark: the boss's drawer names the signature move too (the run's own flag wins). */
  landmark?: boolean | undefined;
  /** A room whose drawer is open from the start (the workbench shows it so). */
  initialOpen?: string | undefined;
  /**
   * The map as the Cave canvas's scene (`cave-canvas/`): a tap on a room is the canvas's to answer (`onRoom`; there is no sheet of its
   * own), every room has its short name under it (`roomPlate`) and the team (`team`) stands on the room the run is in.
   */
  canvas?: CanvasMap | undefined;
}

/** What the map needs to be a scene: see `Props.canvas`. */
export interface CanvasMap {
  /** The room whose panel is open (its button says so). */
  openId: string | null;
  onRoom: (nodeId: string, button: HTMLElement) => void;
  /** Stands on the room the run is in; absent: nothing stands on the map (before a run, or at the entrance). */
  team?: ComponentChildren;
  /** The coordinate space's width (wide for a wide window: the rooms sit further apart); default the map's own. */
  layoutWidth?: number;
  /** The map is drawn small: a plain fight keeps its icon only (its name is in its panel). */
  dense?: boolean;
}

const PERCENT = (n: number, of: number): string =>
  `${String(Math.round((n / of) * 10_000) / 100)}%`;

/**
 * The day's map: a vertical picture with the entrance at the top and the floor boss at the bottom. Once
 * the run has gone down, the Undercroft levels it drew stand below the boss (the map grows downward), each in a
 * darker band with its label, its floor boss with a pale crown (and a crack mark on a cracked floor); the floor
 * boss (from the depth that opens the Undercroft) and a cracked-floor boss wear a down-arrow badge; a run in
 * the Undercroft is lit across the levels by the server's own list of rooms it may go to.
 * One SVG layer draws the paths (gold where the run walked, bright where it may go next, dim elsewhere);
 * every room is a real round button on top of it (so it takes the focus and has a label), with the icon
 * of its kind (crossed blades, a horned skull, a "?", a chest, a campfire, a crown), tinted by the foe's
 * element. Rooms the run can reach glow (a still ring with reduced motion), the room it stands in is
 * outlined, visited rooms are filled and the rest are dimmed; in an open run a room no path leads to any
 * more is greyed out, with its paths. The camp's row and the boss are drawn a
 * little bigger. The picture scales to the width of its box (no sideways scroll at 320 px). Tapping any
 * room opens its drawer, which has Go when the run can go there and, for a room the run has been through,
 * what happened there.
 */
export function DungeonMap({
  map,
  undercroft,
  depth,
  state,
  onGo,
  busy = false,
  landmark,
  initialOpen,
  canvas,
}: Props) {
  const levels = useMemo(() => [map, ...(undercroft ?? [])], [map, undercroft]);
  const layout = useMemo(
    () =>
      stackLayout(
        map,
        undercroft ?? [],
        canvas?.layoutWidth === undefined ? {} : { width: canvas.layoutWidth },
      ),
    [map, undercroft, canvas?.layoutWidth],
  );
  // The way down: the floor boss at a depth that opens the Undercroft, and every cracked-floor boss.
  const descent = useMemo(() => descentRooms(levels, depth), [levels, depth]);
  // Before the first move (the preview, or a run at an entrance) a green triangle under each entrance room.
  const entrance = startLevel(state);
  const starts = useMemo(
    () => (entrance === null ? [] : startMarkers(layout, entrance)),
    [layout, entrance],
  );
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const allNodes = useMemo(() => levels.flatMap((m) => m.nodes), [levels]);
  const opened = openId === null ? null : (allNodes.find((n) => n.id === openId) ?? null);
  const nodes = [...allNodes].sort(
    (a, b) => nodeLevel(a.id) - nodeLevel(b.id) || a.floor - b.floor || a.lane - b.lane,
  );
  const placed = new Map<string, LaidNode>(layout.nodes.map((n) => [n.id, n]));
  const camp = layout.nodes.find((n) => n.kind === 'camp' && n.level === 0);
  // The floor bosses on a cracked floor.
  const cracked = useMemo(
    () =>
      new Set(
        levels.flatMap((m) =>
          m.crack === true ? m.nodes.filter((n) => n.kind === 'boss').map((n) => n.id) : [],
        ),
      ),
    [levels],
  );
  // Which rooms an open run can still get to; a finished run or the preview has no room out of reach.
  const ahead = useMemo(
    () =>
      state !== null && state.status === 'active'
        ? reachableAheadAcross(levels, state.at, state.level ?? 0)
        : null,
    [levels, state?.status, state?.at, state?.level],
  );
  const deeper = levels.length > 1;
  const edges = EDGE_ORDER.flatMap((status) =>
    layout.edges
      .filter((e) => edgeStatus(e, state, ahead) === status)
      .map((e) => ({ edge: e, status })),
  );

  return (
    <div class={canvas === undefined ? 'dmap' : 'dmap dmap-canvas'}>
      <div
        class="dmap-board"
        role="group"
        aria-label={
          deeper
            ? "Dungeon map. The entrance is at the top, the floor boss below it, then the Undercroft's floors going down."
            : 'Dungeon map. The entrance is at the top, the floor boss at the bottom.'
        }
        ref={cssVars({ '--dm-ratio': `${String(layout.width)} / ${String(layout.height)}` })}
      >
        <svg
          class="dmap-svg"
          viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
          aria-hidden="true"
          focusable="false"
        >
          {camp !== undefined && (
            <rect
              class="dmap-band"
              x="0"
              y={camp.y - camp.size / 2 - 10}
              width={layout.width}
              height={camp.size + 20}
            />
          )}
          {layout.bands.map((band) => (
            <g key={`${band.kind}-${String(band.level)}`}>
              <rect class="dmap-uband" x="0" y={band.y} width={layout.width} height={band.height} />
              <line class="dmap-useam" x1="0" x2={layout.width} y1={band.y} y2={band.y} />
            </g>
          ))}
          {edges.map(({ edge, status }) => (
            <path
              key={`${edge.from}-${edge.to}`}
              class={`dmap-edge ${status}${nodeLevel(edge.from) > 0 ? ' u' : ''}`}
              d={edgePath(edge)}
            />
          ))}
          {starts.map((marker) => (
            <polygon key={marker.id} class="dmap-start" points={marker.points} />
          ))}
        </svg>
        {layout.bands.map((band) => (
          <p
            key={`${band.kind}-${String(band.level)}`}
            class="dmap-label pix"
            ref={cssVars({ '--y': PERCENT(band.labelY, layout.height) })}
          >
            {band.label}
            {band.crack && (
              <span class="visually-hidden">. The floor boss stands on a cracked floor.</span>
            )}
          </p>
        ))}
        <ol class="dmap-nodes">
          {nodes.map((node) => {
            const at = placed.get(node.id);
            if (at === undefined) return null;
            const status = nodeStatus(node, state, ahead);
            const element = nodeElement(node);
            const crack = cracked.has(node.id);
            const down = descent.has(node.id);
            const lost = lostAt(state?.history, node.id);
            const classes = [
              'dmap-node',
              `k-${node.kind}`,
              `s-${status}`,
              nodeLevel(node.id) > 0 ? 'u' : '',
              crack ? 'cracked' : '',
              lost ? 'lost' : '',
              element === null ? '' : elementClass(element),
            ]
              .filter(Boolean)
              .join(' ');
            const here = canvas !== undefined && status === 'current' && canvas.team !== undefined;
            return (
              <li
                key={node.id}
                class={here ? 'dmap-slot dmap-here' : 'dmap-slot'}
                data-node={node.id}
                data-status={status}
                ref={cssVars({
                  '--x': PERCENT(at.x, layout.width),
                  '--y': PERCENT(at.y, layout.height),
                  '--s': PERCENT(at.size, layout.width),
                })}
              >
                <button
                  type="button"
                  class={classes}
                  aria-label={nodeAriaLabel(node, status, { crack, descent: down, lost })}
                  {...(canvas === undefined
                    ? { 'aria-haspopup': 'dialog' as const }
                    : { 'aria-expanded': canvas.openId === node.id })}
                  {...(status === 'current' ? { 'aria-current': 'step' as const } : {})}
                  onClick={(event) => {
                    if (canvas !== undefined) {
                      canvas.onRoom(node.id, event.currentTarget);
                      return;
                    }
                    setOpener(event.currentTarget);
                    setOpenId(node.id);
                  }}
                >
                  <span class="dmap-disc" aria-hidden="true" />
                  <Sprite
                    sprite={glyphOrUnknown(nodeGlyphOf(node))}
                    scale={node.kind === 'boss' ? 4 : 3}
                  />
                  {crack && (
                    <span class="dmap-crack" aria-hidden="true">
                      <Sprite sprite={glyphOrUnknown('map-crack')} scale={2} />
                    </span>
                  )}
                  <RoomMarks marks={node.marks} />
                  {down && (
                    <span class="dmap-descend" aria-hidden="true">
                      <Sprite sprite={glyphOrUnknown('map-descend')} scale={2} />
                    </span>
                  )}
                  {lost ? (
                    <span class="dmap-lost" aria-hidden="true">
                      <Sprite sprite={glyphOrUnknown('map-lost')} scale={2} />
                    </span>
                  ) : (
                    status === 'visited' && (
                      <span class="dmap-check" aria-hidden="true">
                        <Sprite sprite={glyphOrUnknown('check')} scale={2} />
                      </span>
                    )
                  )}
                </button>
                {canvas !== undefined &&
                  !here &&
                  !(canvas.dense === true && node.kind === 'fight') && (
                    <span class="dmap-plate" aria-hidden="true">
                      <Nameplate size="sm" tone={status === 'reachable' ? 'gold' : 'bone'}>
                        {roomPlate(node)}
                      </Nameplate>
                    </span>
                  )}
                {here && canvas?.team}
              </li>
            );
          })}
        </ol>
      </div>
      {canvas === undefined && (
        <DungeonNodeDrawer
          node={opened}
          state={state}
          ahead={ahead}
          crack={opened !== null && cracked.has(opened.id)}
          descent={opened !== null && descent.has(opened.id)}
          {...(landmark === undefined ? {} : { landmark })}
          {...(onGo === undefined ? {} : { onGo })}
          busy={busy}
          returnFocusTo={opener}
          onClose={() => {
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}
