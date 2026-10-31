/**
 * A place's waiting stories (prototype, dev only; `systems/return.md`, V-RET-0): what the welcome-back
 * popup did not tell, told where it happened. The creatures that act stand on the place's own floor at a
 * natural spot (`StageAt`, the spot from `scene-art.ts`), and the stories are a short list on a clipping of the
 * Gazette's paper (`StoryPlate`) pinned above the place's main action: each one a headline, at most one line and
 * its finds as the shared Find components, told by the same `StoryText` as the Gazette. The Signpost's road map
 * has no floor, so its creatures stand on the clipping itself. Nothing needs a tap; leaving counts it as seen.
 */
import { useRef } from 'preact/hooks';
import { GearItemsContext } from '../../gear-items-context';
import type { GearItem } from '../../gear-types';
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

/** The stage's pictures are drawn at this whole scale on a clipping (the road map has no floor of its own). */
const STRIP_SCALE = 2;

/** The creatures of the stories standing round `spot` (CSS px) on a place's floor, at its world scale. */
export function StageAt({
  waiting,
  x,
  y,
  s,
}: {
  waiting: Waiting;
  x: number;
  y: number;
  s: number;
}) {
  const stage = stageOf(waiting.stories);
  return (
    <SceneActors scene={stage} cast={waiting.cast} cx={Math.round(x)} cy={Math.round(y)} s={s} />
  );
}

/** The creatures on the clipping itself, in a strip above the stories (a place with no floor to stand on). */
function Strip({ waiting }: { waiting: Waiting }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const stage = stageOf(waiting.stories);
  if (stage.actors.length === 0) return null;
  return (
    <div ref={ref} class="wb-clip-strip">
      <SceneActors
        scene={stage}
        cast={waiting.cast}
        cx={Math.round(size.width / 2)}
        cy={Math.round(size.height - 10 * STRIP_SCALE)}
        s={STRIP_SCALE}
      />
    </div>
  );
}

/**
 * The waiting stories as a clipping: a short list in the order given (the biggest first), scrolling inside
 * itself when a place has more than fit. `strip` stands the creatures on the clipping (no floor in the place).
 */
export function StoryPlate({ waiting, strip = false }: { waiting: Waiting; strip?: boolean }) {
  if (waiting.stories.length === 0) return null;
  return (
    <GearItemsContext.Provider value={waiting.items}>
      <section class="wb-clip" aria-label="Waiting here">
        {strip && <Strip waiting={waiting} />}
        <ScrollHint contentKey={waiting.stories.map((s) => s.id).join()} class="wb-clip-scroll">
          <ul class="wb-clip-list">
            {waiting.stories.map((story) => (
              <li key={story.id} class="wb-clip-story">
                <StoryText story={story} size="brief" />
              </li>
            ))}
          </ul>
        </ScrollHint>
      </section>
    </GearItemsContext.Provider>
  );
}
