/**
 * A place's waiting stories (prototype, dev only; `systems/return.md`, V-RET-0): what the welcome-back
 * popup did not tell, told where it happened. The stories are a slim clipping of the Gazette's paper pinned
 * above the place's main action (`StoryPlate`): each one a headline, at most one line that the finds do not
 * already say, and its finds as one row of small finds, told by the same `StoryText` as the Gazette. The
 * creatures that act show as small faces in the clipping (`Faces`), so the place's own residents keep their spots
 * and their plates clear. The Signpost's road map is the exception: its scouts stand on the map itself (`MapStage`, drawn
 * by the map's `overlay`). Nothing needs a tap; leaving counts it as seen, and the alert's X closes it for the visit.
 */
import { useState } from 'preact/hooks';
import { GearItemsContext } from '../../gear-items-context';
import type { GearItem } from '../../gear-types';
import { MAP_SPOTS } from '../../sprites/world-map-art';
import { Alert } from '../../ui/Alert';
import { ScrollHint } from '../../ui/ScrollHint';
import { CreatureSprite } from '../valley/parts';
import type { Cast, Story } from './highlights';
import { StoryText } from './Gazette';
import { stageOf } from './place-stories';
import { SceneActors, whoLooks } from './SceneCrop';

/** The stories waiting at the place being visited, with who and what they name. */
export interface Waiting {
  stories: readonly Story[];
  cast: Cast;
  /** The sample bag: what a piece's tap opens. */
  items: readonly GearItem[];
}

/**
 * The places whose stories the player closed with the X this visit (the page's session; nothing is saved): they
 * do not come back until the page reloads.
 */
const closedPlaces = new Set<string>();

/** Forget every close (tests, and a new session's start). */
export function resetClosed(): void {
  closedPlaces.clear();
}

/**
 * The creatures of the stories as small faces at the left of the clipping, before the headline that names them
 * (a place's floor stays clear for its own residents and their plates). It stands where an alert's icon does.
 */
function Faces({ waiting }: { waiting: Waiting }) {
  const stage = stageOf(waiting.stories);
  if (stage.actors.length === 0) return null;
  return (
    <span class="wb-clip-faces">
      {stage.actors.map((a, i) => {
        const look = whoLooks(a.who, waiting.cast);
        return (
          <CreatureSprite
            key={`${look.species}:${String(i)}`}
            creature={{ species: look.species, shiny: look.shiny }}
            scale={2}
          />
        );
      })}
    </span>
  );
}

/**
 * The waiting stories as an `ui/Alert` in the Gazette's paper look (`wb-clip`): a short list in the order given
 * (the biggest first), scrolling inside itself when a place has more than fit. The creatures show as small faces
 * where the alert's icon is (`stage`; the Signpost has none: its scouts stand on the map). The alert's X closes
 * the stories for this visit.
 */
export function StoryPlate({
  waiting,
  stage = true,
  place = 'place',
}: {
  waiting: Waiting;
  /** Which place this is: a close is kept per place. */
  place?: string;
  stage?: boolean;
}) {
  const [closed, setClosed] = useState(closedPlaces.has(place));
  if (waiting.stories.length === 0 || closed) return null;
  const faces = stage && stageOf(waiting.stories).actors.length > 0;
  return (
    <GearItemsContext.Provider value={waiting.items}>
      <Alert
        level="info"
        class="wb-clip"
        icon={faces ? <Faces waiting={waiting} /> : null}
        dismissLabel="Close the stories"
        onDismiss={() => {
          closedPlaces.add(place);
          setClosed(true);
        }}
      >
        <ScrollHint contentKey={waiting.stories.map((s) => s.id).join()} class="wb-clip-scroll">
          <ul class="wb-clip-list" aria-label="Waiting here">
            {waiting.stories.map((story) => (
              <li key={story.id} class="wb-clip-story">
                <StoryText story={story} size="clip" />
              </li>
            ))}
          </ul>
        </ScrollHint>
      </Alert>
    </GearItemsContext.Provider>
  );
}

/** East of the crossroads' signpost and level with its foot, in map pixels: where the scouts stand. */
const BESIDE_SIGN = { dx: 44, dy: -2 };

/**
 * Where the Signpost's scouts stand on the map, in its pixels (the feet row): on the road beside the Old
 * Crossroads, the hub where the signpost is, clear of its pin and above the clipping. The scene scrolls the map
 * so this is in view.
 */
export function crossroadsSpot(): { x: number; y: number } {
  const spot = MAP_SPOTS['old-crossroads'] ?? { x: 176, y: 168 };
  return { x: spot.x + BESIDE_SIGN.dx, y: spot.y + BESIDE_SIGN.dy };
}

/** The scouts and their sack standing on the road map (the map's `overlay`, at the map's scale). */
export function MapStage({ waiting, scale }: { waiting: Waiting; scale: number }) {
  const stage = stageOf(waiting.stories);
  if (stage.actors.length === 0) return null;
  const spot = crossroadsSpot();
  return (
    <SceneActors
      scene={stage}
      cast={waiting.cast}
      cx={spot.x * scale}
      // The feet (8 valley pixels below the spot) stand on the spot's row.
      cy={spot.y * scale - 8 * scale}
      s={scale}
    />
  );
}
