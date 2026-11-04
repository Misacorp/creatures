/**
 * A place's waiting stories (prototype, dev only; `systems/return.md`, V-RET-0): what the welcome-back
 * popup did not tell, told where it happened. The stories are a slim clipping of the Gazette's paper pinned
 * above the place's main action (`StoryPlate`): each one a headline, at most one line that the finds do not
 * already say, and its finds as one row of small finds, told by the same `StoryText` as the Gazette. The
 * creatures that act show as small faces in the clipping (`Faces`), so the place's own residents keep their spots
 * and their plates clear. The Signpost's road map is the exception: its scouts stand on the map itself (`MapStage`, drawn
 * by the map's `overlay`). Nothing needs a tap; leaving counts it as seen.
 */
import { useState } from 'preact/hooks';
import { GearItemsContext } from '../../gear-items-context';
import type { GearItem } from '../../gear-types';
import { MAP_SPOTS } from '../../sprites/world-map-art';
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
 * The places whose clipping the player folded this visit (the page's session; nothing is saved). A folded
 * clipping stays a small chip in that place until the page reloads: it never opens itself again.
 */
const foldedPlaces = new Set<string>();

/** Forget every fold (tests, and a new session's start). */
export function resetFolds(): void {
  foldedPlaces.clear();
}

/** What the folded chip says: "1 story", "3 stories". */
export function storyChipText(count: number): string {
  return `${String(count)} ${count === 1 ? 'story' : 'stories'}`;
}

/**
 * The creatures of the stories as small faces at the right of the clipping (a place's floor stays clear for its
 * own residents and their plates: nothing stands on the clipping's edge any more).
 */
function Faces({ waiting }: { waiting: Waiting }) {
  const stage = stageOf(waiting.stories);
  if (stage.actors.length === 0) return null;
  return (
    <span class="wb-clip-faces" aria-hidden="true">
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
 * The waiting stories as a slim clipping: a short list in the order given (the biggest first), scrolling inside
 * itself when a place has more than fit. `stage` shows the story's creatures as small faces in it (the Signpost has
 * none: its scouts stand on the map).
 */
export function StoryPlate({
  waiting,
  stage = true,
  place = 'place',
}: {
  waiting: Waiting;
  /** Which place this is: a fold is kept per place. */
  place?: string;
  stage?: boolean;
}) {
  const [folded, setFolded] = useState(foldedPlaces.has(place));
  if (waiting.stories.length === 0) return null;
  const fold = (value: boolean): void => {
    if (value) foldedPlaces.add(place);
    else foldedPlaces.delete(place);
    setFolded(value);
  };
  if (folded) {
    return (
      <div class="wb-clip-wrap folded">
        <button
          type="button"
          class="wb-clip-chip pix"
          aria-expanded={false}
          onClick={() => {
            fold(false);
          }}
        >
          {storyChipText(waiting.stories.length)}
        </button>
      </div>
    );
  }
  return (
    <GearItemsContext.Provider value={waiting.items}>
      <div class="wb-clip-wrap">
        <section
          class={`wb-clip${stage && stageOf(waiting.stories).actors.length > 0 ? ' faces' : ''}`}
          aria-label="Waiting here"
        >
          <button
            type="button"
            class="wb-clip-fold pix"
            aria-expanded={true}
            aria-label="Fold the stories"
            onClick={() => {
              fold(true);
            }}
          >
            Hide
          </button>
          {stage && <Faces waiting={waiting} />}
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
