/**
 * The welcome-back popup, "The Valley Gazette" (Misa's pick, 2026-10-31): a small newspaper front page with a
 * masthead and the visit's date, one headline story with a pixel picture, and one or two small stories beside
 * it. A story is a headline of a few words, at most one short line, and what it found as small icons of the real
 * things (a piece or a blueprint opens its card, a newcomer its popover), then count badges for currencies, XP and
 * medals. The creatures in a picture open their popovers too. The biggest story is the headline. This is the one
 * Gazette (the prototype's, `proto/welcome/`, is the reference it was ported from).
 */
import { useState } from 'preact/hooks';
import { getSpecies, speciesName } from '../../game';
import { SmallCreature } from '../../SmallCreature';
import type { CreatureInfo } from '../../creature-info';
import { CountBadgeList } from '../../ui/CountBadge';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { CreatureSprite } from '../parts';
import { SceneCrop } from './SceneCrop';
import type { Find, Story } from './stories';

/** What a small row of finds holds before "+N more": a phone's width fits this many pictures. */
export const MAX_ROW = 4;

/** What a row shows and what waits behind "+N more" (shown once the player taps it). */
export function splitRow<T>(
  finds: readonly T[],
  expanded: boolean,
): { shown: T[]; hidden: number } {
  const shown = expanded ? [...finds] : finds.slice(0, MAX_ROW);
  return { shown, hidden: finds.length - shown.length };
}

const findKey = (f: Find): string => {
  switch (f.kind) {
    case 'item':
      return `item:${f.id}`;
    case 'blueprint':
      return `bp:${f.baseId}`;
    case 'newcomer':
      return `new:${f.id}`;
  }
};

/** A newcomer as a small find: its picture (a tap opens its creature popover), "New" said to screen readers. */
function NewcomerIcon({ id, species, shiny }: { id: string; species: string; shiny: boolean }) {
  const def = getSpecies(species);
  const info: CreatureInfo | null =
    def === undefined
      ? null
      : {
          name: speciesName(species),
          species,
          level: 1,
          element: def.element,
          role: def.role,
          ...(shiny ? { shiny: true } : {}),
        };
  const sprite = <CreatureSprite creature={{ species, shiny }} scale={2} />;
  return (
    <li class="find-row compact tappable">
      {info === null ? (
        sprite
      ) : (
        <SmallCreature
          id={`new:${id}`}
          info={info}
          class="find-row-button gz-newcomer"
          label={`New: ${info.name}`}
        >
          {sprite}
        </SmallCreature>
      )}
    </li>
  );
}

/** One row of small finds: pieces and blueprints as their picture (a tap opens the same card as a full find), a newcomer as its face. */
function FindsRow({ finds, label }: { finds: readonly Find[]; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = splitRow(finds, expanded);
  return (
    <FindList label={label} compact>
      {shown.map((f) => {
        switch (f.kind) {
          case 'item':
            return (
              <FindItem
                key={findKey(f)}
                id={f.id}
                baseId={f.baseId}
                rarity={f.rarity}
                level={f.level}
                scale={3}
                compact
              />
            );
          case 'blueprint':
            return <FindBlueprint key={findKey(f)} baseId={f.baseId} compact />;
          case 'newcomer':
            return <NewcomerIcon key={findKey(f)} id={f.id} species={f.species} shiny={f.shiny} />;
        }
      })}
      {hidden > 0 && (
        <li class="gz-more">
          <button
            type="button"
            class="gz-more-button pix"
            aria-expanded={false}
            onClick={() => {
              setExpanded(true);
            }}
          >{`+${String(hidden)} more`}</button>
        </li>
      )}
    </FindList>
  );
}

/** How the Gazette tells a story, picture aside: its headline, at most one short line, its finds and its badges. */
function StoryText({ story, size }: { story: Story; size: 'lead' | 'brief' }) {
  const Heading = size === 'lead' ? 'h3' : 'h4';
  const label = `Found: ${story.headline}`;
  return (
    <>
      <Heading class={size === 'lead' ? 'gz-headline pix' : 'gz-brief-headline pix'}>
        {story.headline}
      </Heading>
      {story.blurb !== '' && (
        <p class={size === 'lead' ? 'gz-blurb' : 'gz-brief-blurb'}>{story.blurb}</p>
      )}
      {(story.finds.length > 0 || story.badges.length > 0) && (
        <div class="gz-finds">
          {story.finds.length > 0 && <FindsRow finds={story.finds} label={label} />}
          {story.badges.length > 0 && <CountBadgeList items={story.badges} label={label} />}
        </div>
      )}
    </>
  );
}

export function Gazette({
  stories,
  date,
  note,
}: {
  stories: readonly Story[];
  date: string;
  /** The line under the date (`homeNote`). */
  note: string;
}) {
  const [lead, ...briefs] = stories;
  return (
    <article class="gz-paper" aria-label="The Valley Gazette">
      <header class="gz-masthead">
        <h2 class="gz-paper-title pix">The Valley Gazette</h2>
        <p class="gz-dateline pix">{date}</p>
        <p class="gz-home-note">{note}</p>
      </header>
      {lead !== undefined && (
        <section class="gz-lead">
          <SceneCrop scene={lead.scene} class="gz-lead-scene" />
          <StoryText story={lead} size="lead" />
        </section>
      )}
      {briefs.length > 0 && (
        <div class="gz-briefs">
          {briefs.map((story) => (
            <section key={story.id} class="gz-brief">
              <SceneCrop scene={story.scene} class="gz-brief-scene" />
              <StoryText story={story} size="brief" />
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
