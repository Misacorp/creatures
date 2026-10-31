/**
 * The welcome-back popup as a comic strip: two or three panels, one under the other, the small ones first and
 * the biggest last. Each panel is a cropped pixel picture of the place with the creature doing the thing, a
 * yellow caption box in the corner ("Meanwhile, at the Forge..."), a sound word ("CLANG!") and, where it fits,
 * a speech bubble from the creature. The panels appear one after another (all at once with reduced motion).
 */
import type { Cast, Story } from './highlights';
import { SceneCrop } from './SceneCrop';

/** How each panel's caption begins: the strip reads as a sequence. */
const LEADS = ['Meanwhile,', 'Later,', 'Then,'] as const;

/** The caption of the panel at `index` of `total`: "Meanwhile, at the Forge...". */
export function captionOf(story: Story, index: number): string {
  return `${LEADS[Math.min(index, LEADS.length - 1)] ?? LEADS[0]} ${story.where}...`;
}

export function ComicStrip({
  stories,
  cast,
  shown,
}: {
  /** In the order they are told: the small ones first, the biggest last. */
  stories: readonly Story[];
  cast: Cast;
  /** How many panels have appeared. */
  shown: number;
}) {
  return (
    <ol class="wb-strip" aria-label="While you were away">
      {stories.slice(0, shown).map((story, i) => (
        <li key={story.id} class="wb-panel">
          <figure class="wb-figure">
            <SceneCrop
              scene={story.scene}
              cast={cast}
              speech={story.speech}
              class="wb-panel-scene"
            />
            <figcaption class="wb-caption pix">{captionOf(story, i)}</figcaption>
            <span class="wb-sfx pix" aria-hidden="true">
              {story.sfx}
            </span>
            <p class="visually-hidden">{story.blurb}</p>
          </figure>
        </li>
      ))}
    </ol>
  );
}
