import { useMemo, useState } from 'preact/hooks';
import { elementClass } from './art';
import { cssVars } from './css-vars';
import {
  EDGE_ORDER,
  edgePath,
  edgeStatus,
  mapLayout,
  nodeAriaLabel,
  nodeElement,
  nodeGlyph,
  nodeStatus,
  reachableAhead,
  type LaidNode,
  type MapRun,
} from './dungeon-map';
import type { DungeonMapView } from './dungeon-types';
import { DungeonNodeDrawer } from './DungeonNodeDrawer';
import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';

interface Props {
  map: DungeonMapView;
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
}

const PERCENT = (n: number, of: number): string =>
  `${String(Math.round((n / of) * 10_000) / 100)}%`;

/**
 * The day's map: a vertical picture with the room boss at the top and the entrance floor at the bottom.
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
export function DungeonMap({ map, state, onGo, busy = false, landmark, initialOpen }: Props) {
  const layout = useMemo(() => mapLayout(map), [map]);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const opened = openId === null ? null : (map.nodes.find((n) => n.id === openId) ?? null);
  const nodes = [...map.nodes].sort((a, b) => a.floor - b.floor || a.lane - b.lane);
  const placed = new Map<string, LaidNode>(layout.nodes.map((n) => [n.id, n]));
  const camp = layout.nodes.find((n) => n.kind === 'camp');
  // Which rooms an open run can still get to; a finished run or the preview has no room out of reach.
  const ahead = useMemo(
    () => (state !== null && state.status === 'active' ? reachableAhead(map, state.at) : null),
    [map, state?.status, state?.at],
  );
  const edges = EDGE_ORDER.flatMap((status) =>
    layout.edges
      .filter((e) => edgeStatus(e, state, ahead) === status)
      .map((e) => ({ edge: e, status })),
  );

  return (
    <div class="dmap">
      <div
        class="dmap-board"
        role="group"
        aria-label="Dungeon map. The entrance is at the bottom, the room boss at the top."
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
          {edges.map(({ edge, status }) => (
            <path
              key={`${edge.from}-${edge.to}`}
              class={`dmap-edge ${status}`}
              d={edgePath(edge)}
            />
          ))}
        </svg>
        <ol class="dmap-nodes">
          {nodes.map((node) => {
            const at = placed.get(node.id);
            if (at === undefined) return null;
            const status = nodeStatus(node, state, ahead);
            const element = nodeElement(node);
            const classes = [
              'dmap-node',
              `k-${node.kind}`,
              `s-${status}`,
              element === null ? '' : elementClass(element),
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={node.id}
                class="dmap-slot"
                ref={cssVars({
                  '--x': PERCENT(at.x, layout.width),
                  '--y': PERCENT(at.y, layout.height),
                  '--s': PERCENT(at.size, layout.width),
                })}
              >
                <button
                  type="button"
                  class={classes}
                  aria-label={nodeAriaLabel(node, status)}
                  aria-haspopup="dialog"
                  {...(status === 'current' ? { 'aria-current': 'step' as const } : {})}
                  onClick={(event) => {
                    setOpener(event.currentTarget);
                    setOpenId(node.id);
                  }}
                >
                  <Sprite
                    sprite={glyphOrUnknown(nodeGlyph(node.kind))}
                    scale={node.kind === 'boss' ? 4 : 3}
                  />
                  {status === 'visited' && (
                    <span class="dmap-check" aria-hidden="true">
                      <Sprite sprite={glyphOrUnknown('check')} scale={2} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <DungeonNodeDrawer
        node={opened}
        state={state}
        ahead={ahead}
        {...(landmark === undefined ? {} : { landmark })}
        {...(onGo === undefined ? {} : { onGo })}
        busy={busy}
        returnFocusTo={opener}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </div>
  );
}
