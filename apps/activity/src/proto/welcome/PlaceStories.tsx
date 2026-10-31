/**
 * A place's waiting stories (prototype, dev only; `systems/return.md`, V-RET-0): what the welcome-back
 * popup did not tell, told where it happened. The stories are a slim clipping of the Gazette's paper pinned
 * above the place's main action (`StoryPlate`): each one a headline, at most one line that the finds do not
 * already say, and its finds as one row of small finds, told by the same `StoryText` as the Gazette. The
 * creatures that act stand on the clipping's top edge (`Stage`), apart from the place's own residents, who keep
 * their spots. The Signpost's road map is the exception: its scouts stand on the map itself (`MapStage`, drawn
 * by the map's `overlay`). Nothing needs a tap; leaving counts it as seen.
 */
import { useRef } from 'preact/hooks';
import { GearItemsContext } from '../../gear-items-context';
import type { GearItem } from '../../gear-types';
import { MAP_SPOTS } from '../../sprites/world-map-art';
import { ScrollHint } from '../../ui/ScrollHint';
import { useSize } from '../valley/parts';
import type { Cast, Story } from './highlights';
import { StoryText } from './Gazette';
import { stageOf } from './place-stories';
import { SceneActors } from './SceneCrop';

/** The stories waiting at the place being visited, with who and what they name. */
export interface Waiting {
  stories: readonly Story[];
  cast: Cast;
  /** The sample bag: what a piece's tap opens. */
  items: readonly GearItem[];
}

/** The scale of the stage on a phone (3) and on a wide window (4), as a place's own sprites. */
export const stageScale = (width: number): number => (width >= 400 ? 4 : 3);

/** The creatures of the stories, standing on the top edge of the clipping, centred. */
function Stage({ waiting }: { waiting: Waiting }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const stage = stageOf(waiting.stories);
  const s = stageScale(size.width);
  if (stage.actors.length === 0) return null;
  return (
    <div ref={ref} class="wb-clip-stage">
      <SceneActors
        scene={stage}
        cast={waiting.cast}
        cx={Math.round(size.width / 2)}
        // The feet (8 valley pixels below the spot) are on the clipping's edge.
        cy={Math.round(size.height - 8 * s)}
        s={s}
      />
    </div>
  );
}

/**
 * The waiting stories as a slim clipping: a short list in the order given (the biggest first), scrolling inside
 * itself when a place has more than fit. `stage` stands the creatures on its top edge (the Signpost has none:
 * its scouts stand on the map).
 */
export function StoryPlate({ waiting, stage = true }: { waiting: Waiting; stage?: boolean }) {
  if (waiting.stories.length === 0) return null;
  return (
    <GearItemsContext.Provider value={waiting.items}>
      <div class="wb-clip-wrap">
        {stage && <Stage waiting={waiting} />}
        <section class="wb-clip" aria-label="Waiting here">
          <ScrollHint contentKey={waiting.stories.map((s) => s.id).join()} class="wb-clip-scroll">
            <ul class="wb-clip-list">
              {waiting.stories.map((story) => (
                <li key={story.id} class="wb-clip-story">
                  <StoryText story={story} size="clip" />
                </li>
              ))}
            </ul>
          </ScrollHint>
        </section>
      </div>
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
