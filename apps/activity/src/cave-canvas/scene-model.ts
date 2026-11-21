/**
 * What the scene draws and what the room panels read, from the view and today: the day's map (or the run's own, or a finished run's
 * route), the Undercroft levels so far and the run on the map. While a fight plays the run is the one before it (`hold.ts`). Pure.
 */
import { routeRun } from '../dungeon-history';
import { descentRooms, reachableAheadAcross, type MapRun } from '../dungeon-map';
import type {
  DungeonMapNode,
  DungeonMapView,
  DungeonRunCreature,
  DungeonToday,
} from '../dungeon-types';
import { shownRun, type CaveView } from './hold';
import type { SceneCreature } from './CaveScene';

export interface SceneMap {
  map: DungeonMapView | null;
  undercroft: readonly DungeonMapView[];
  /** The run on the map (lit rooms, where it stands); null before a run. */
  run: MapRun | null;
  depth: number;
  landmark: boolean;
}

/** `shown` is today with the picked depth's map before a run (`useDungeonSetup`'s `shownToday`). */
export function sceneMapOf(view: CaveView, shown: DungeonToday): SceneMap {
  const run = shownRun(view);
  if (run !== null) {
    return {
      map: run.map,
      undercroft: run.undercroft?.maps ?? [],
      run,
      depth: run.depth,
      landmark: run.landmark,
    };
  }
  if (view.kind === 'results' || view.kind === 'playback') {
    const route = routeRun(view.run);
    return route === null
      ? { map: null, undercroft: [], run: null, depth: view.run.depth, landmark: view.run.landmark }
      : {
          map: route.map,
          undercroft: route.undercroft,
          run: route.run,
          depth: view.run.depth,
          landmark: view.run.landmark,
        };
  }
  return {
    map: shown.map ?? null,
    undercroft: [],
    run: null,
    depth: shown.depth,
    landmark: shown.landmark,
  };
}

/** Every room of the scene's map, the Undercroft's included. */
export function allNodes(scene: Pick<SceneMap, 'map' | 'undercroft'>): DungeonMapNode[] {
  return [...(scene.map === null ? [] : [scene.map]), ...scene.undercroft].flatMap((m) => m.nodes);
}

/** What a room's panel needs besides the room: the rooms the run may still go to, the way-down and cracked-floor marks. */
export function roomContext(scene: SceneMap): {
  ahead: ReadonlySet<string> | null;
  descent: ReadonlySet<string>;
  cracked: ReadonlySet<string>;
} {
  const levels = [...(scene.map === null ? [] : [scene.map]), ...scene.undercroft];
  const run = scene.run;
  return {
    ahead:
      run !== null && run.status === 'active'
        ? reachableAheadAcross(levels, run.at, run.level ?? 0)
        : null,
    descent: descentRooms(levels, scene.depth),
    cracked: new Set(
      levels.flatMap((m) =>
        m.crack === true ? m.nodes.filter((n) => n.kind === 'boss').map((n) => n.id) : [],
      ),
    ),
  };
}

/** A creature of the run as the scene draws it: with the HP it has now. */
export const sceneCreatureOf = (c: DungeonRunCreature): SceneCreature => ({
  id: c.id,
  name: c.name,
  level: c.level,
  speciesId: c.speciesId,
  hp: { current: c.hp, max: c.hpMax },
});
