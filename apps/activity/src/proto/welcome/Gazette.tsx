/**
 * The welcome-back popup as a small newspaper front page, "The Valley Gazette": a masthead with the visit's date,
 * one headline story with a pixel picture, and one or two small stories beside it, written as news about the
 * creatures and the valley. The biggest highlight is the headline.
 */
import type { Cast, Story } from './highlights';
import { SceneCrop } from './SceneCrop';

export function Gazette({
  stories,
  cast,
  date,
}: {
  /** The biggest first: the first is the headline story. */
  stories: readonly Story[];
  cast: Cast;
  date: string;
}) {
  const [lead, ...briefs] = stories;
  return (
    <article class="wb-paper" aria-label="The Valley Gazette">
      <header class="wb-masthead">
        <h2 class="wb-paper-title pix">The Valley Gazette</h2>
        <p class="wb-dateline pix">{date}</p>
      </header>
      {lead !== undefined && (
        <section class="wb-lead">
          <SceneCrop scene={lead.scene} cast={cast} class="wb-lead-scene" />
          <h3 class="wb-headline pix">{lead.headline}</h3>
          <p class="wb-blurb">{lead.blurb}</p>
        </section>
      )}
      {briefs.length > 0 && (
        <div class="wb-briefs">
          {briefs.map((story) => (
            <section key={story.id} class="wb-brief">
              <SceneCrop scene={story.scene} cast={cast} class="wb-brief-scene" />
              <h4 class="wb-brief-headline pix">{story.headline}</h4>
              <p class="wb-brief-blurb">{story.blurb}</p>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
