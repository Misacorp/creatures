/**
 * The welcome-back popup, "The Valley Gazette" (Misa's pick, 2026-10-31): a small newspaper front page with a
 * masthead and the visit's date, one headline story with a pixel picture, and one or two small stories beside
 * it. A story is a headline of a few words, at most one short line, and what it is about shown as itself with
 * the game's Find components (a piece, a blueprint, a newcomer, parts), so a tap (or hover with a mouse) opens
 * the full card in a popover; the creatures in a picture open theirs too. The biggest highlight is the headline.
 */
import { CountBadgeList, type CountItem } from '../../ui/CountBadge';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindCreature } from '../../ui/FindCreature';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { partBadge } from '../../count-items';
import type { Cast, Find, Story } from './highlights';
import { SceneCrop } from './SceneCrop';

/** What a story found, in the shared Find components: boxes in one `FindList`, parts as count badges. */
export function Finds({ finds, label }: { finds: readonly Find[]; label: string }) {
  const rows = finds.filter((f): f is Exclude<Find, { kind: 'parts' }> => f.kind !== 'parts');
  const counts: CountItem[] = finds.flatMap((f) =>
    f.kind === 'parts' ? f.parts.map((p) => ({ key: p.part, ...partBadge(p.part, p.amount) })) : [],
  );
  if (rows.length === 0 && counts.length === 0) return null;
  return (
    <div class="wb-finds">
      {rows.length > 0 && (
        <FindList label={label}>
          {rows.map((f) => {
            switch (f.kind) {
              case 'item':
                return (
                  <FindItem
                    key={f.piece.id}
                    id={f.piece.id}
                    baseId={f.piece.baseId}
                    rarity={f.piece.rarity}
                    level={f.piece.level}
                  />
                );
              case 'blueprint':
                return <FindBlueprint key={f.baseId} baseId={f.baseId} />;
              case 'newcomer':
                return (
                  <FindCreature
                    key={f.species}
                    creature={{
                      species: f.species,
                      shiny: false,
                      talent: null,
                      talentNew: false,
                      badges: [{ text: 'New!', entry: null }],
                    }}
                  />
                );
            }
          })}
        </FindList>
      )}
      {counts.length > 0 && <CountBadgeList items={counts} label={label} class="reward-badges" />}
    </div>
  );
}

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
          {lead.blurb !== '' && <p class="wb-blurb">{lead.blurb}</p>}
          <Finds finds={lead.finds} label={`Found: ${lead.headline}`} />
        </section>
      )}
      {briefs.length > 0 && (
        <div class="wb-briefs">
          {briefs.map((story) => (
            <section key={story.id} class="wb-brief">
              <SceneCrop scene={story.scene} cast={cast} class="wb-brief-scene" />
              <h4 class="wb-brief-headline pix">{story.headline}</h4>
              {story.blurb !== '' && <p class="wb-brief-blurb">{story.blurb}</p>}
              <Finds finds={story.finds} label={`Found: ${story.headline}`} />
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
