/**
 * The welcome-back popup, "The Valley Gazette" (Misa's pick, 2026-10-31): a small newspaper front page with a
 * masthead and the visit's date, one headline story with a pixel picture, and one or two small stories beside
 * it. A story is a headline of a few words, at most one short line, and what it found in a small row of the game's
 * count badges; the creatures in a picture open their popovers when tapped. The biggest story is the headline.
 * This is the one Gazette (the prototype's, `proto/welcome/`, is the reference it was ported from).
 */
import { CountBadgeList } from '../../ui/CountBadge';
import { SceneCrop } from './SceneCrop';
import type { CastMember, Story } from './stories';

/** How the Gazette tells a story, picture aside: its headline, at most one short line, and its finds in a small row. */
function StoryText({ story, size }: { story: Story; size: 'lead' | 'brief' }) {
  const Heading = size === 'lead' ? 'h3' : 'h4';
  return (
    <>
      <Heading class={size === 'lead' ? 'gz-headline pix' : 'gz-brief-headline pix'}>
        {story.headline}
      </Heading>
      {story.blurb !== '' && (
        <p class={size === 'lead' ? 'gz-blurb' : 'gz-brief-blurb'}>{story.blurb}</p>
      )}
      {story.finds.length > 0 && (
        <div class="gz-finds">
          <CountBadgeList items={story.finds} label={`Found: ${story.headline}`} />
        </div>
      )}
    </>
  );
}

export function Gazette({
  stories,
  cast,
  date,
}: {
  /** The biggest first: the first is the headline story. */
  stories: readonly Story[];
  cast: readonly CastMember[];
  date: string;
}) {
  const [lead, ...briefs] = stories;
  return (
    <article class="gz-paper" aria-label="The Valley Gazette">
      <header class="gz-masthead">
        <h2 class="gz-paper-title pix">The Valley Gazette</h2>
        <p class="gz-dateline pix">{date}</p>
        <p class="gz-home-note">Everything your creatures found is already home.</p>
      </header>
      {lead !== undefined && (
        <section class="gz-lead">
          <SceneCrop scene={lead.scene} cast={cast} class="gz-lead-scene" />
          <StoryText story={lead} size="lead" />
        </section>
      )}
      {briefs.length > 0 && (
        <div class="gz-briefs">
          {briefs.map((story) => (
            <section key={story.id} class="gz-brief">
              <SceneCrop scene={story.scene} cast={cast} class="gz-brief-scene" />
              <StoryText story={story} size="brief" />
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
