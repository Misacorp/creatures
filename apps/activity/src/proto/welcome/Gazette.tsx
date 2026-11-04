/**
 * The welcome-back popup, "The Valley Gazette" (Misa's pick, 2026-10-31): a small newspaper front page with a
 * masthead and the visit's date, one headline story with a pixel picture, and one or two small stories beside
 * it. A story is a headline of a few words, at most one short line, and what it is about shown as itself with
 * the game's Find components (a piece, a blueprint, a newcomer, parts), so a tap (or hover with a mouse) opens
 * the full card in a popover; the creatures in a picture open theirs too. The biggest highlight is the headline.
 */
import { useState } from 'preact/hooks';
import type { PartKind } from '@creatures/game';
import { getSpecies, speciesName } from '../../game';
import { SmallCreature } from '../../SmallCreature';
import type { CreatureInfo } from '../../creature-info';
import { CountBadge } from '../../ui/CountBadge';
import { FindBlueprint } from '../../ui/FindBlueprint';
import { FindItem } from '../../ui/FindItem';
import { FindList } from '../../ui/FindRow';
import { partBadge } from '../../count-items';
import { CreatureSprite } from '../valley/parts';
import type { Cast, Find, Story } from './highlights';
import { SceneCrop } from './SceneCrop';

/** What a small row of finds holds before "+N more": a phone's width fits this many pictures and badges. */
export const MAX_ROW = 4;

/** One thing in a small row of finds: a piece, a blueprint, a newcomer, or one kind of part. */
export type RowEntry =
  Exclude<Find, { kind: 'parts' }> | { kind: 'part'; part: PartKind; amount: number };

/** The finds of a story as the entries of one row, parts one badge each. */
export function rowEntries(finds: readonly Find[]): RowEntry[] {
  return finds.flatMap((f): RowEntry[] =>
    f.kind === 'parts' ? f.parts.map((p) => ({ kind: 'part', ...p })) : [f],
  );
}

/**
 * What a row shows and what waits behind "+N more": the first `MAX_ROW` entries, and the rest (shown once the
 * player taps it). `unshown` counts things the story stands for that have no picture here (five pieces made,
 * three drawn): they only add to the written count.
 */
export function splitRow(
  entries: readonly RowEntry[],
  unshown: number,
  expanded: boolean,
): { shown: RowEntry[]; hidden: number; more: number } {
  const shown = expanded ? [...entries] : entries.slice(0, MAX_ROW);
  const hidden = entries.length - shown.length;
  return { shown, hidden, more: hidden + Math.max(0, unshown) };
}

const entryKey = (e: RowEntry): string => {
  switch (e.kind) {
    case 'item':
      return `item:${e.piece.id}`;
    case 'blueprint':
      return `bp:${e.baseId}`;
    case 'newcomer':
      return `new:${e.species}`;
    case 'part':
      return `part:${e.part}`;
  }
};

/** A newcomer as a small find: its picture (a tap opens its creature popover), "New" said to screen readers. */
function NewcomerIcon({ species }: { species: string }) {
  const def = getSpecies(species);
  const info: CreatureInfo | null =
    def === undefined
      ? null
      : { name: speciesName(species), species, level: 1, element: def.element, role: def.role };
  const sprite = <CreatureSprite creature={{ species, shiny: false }} scale={2} />;
  return (
    <li class="find-row compact tappable">
      {info === null ? (
        sprite
      ) : (
        <SmallCreature
          id={`new:${species}`}
          info={info}
          class="find-row-button wb-newcomer"
          label={`New: ${info.name}`}
        >
          {sprite}
        </SmallCreature>
      )}
    </li>
  );
}

/**
 * One row of small finds: pieces and blueprints as their picture (a tap opens the same
 * card as a full find), a newcomer as its face, parts as count badges, then, if more than fit, "+N more" as
 * text (a tap shows the rest).
 */
function FindsRow({
  finds,
  unshown,
  label,
}: {
  finds: readonly Find[];
  unshown: number;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden, more } = splitRow(rowEntries(finds), unshown, expanded);
  if (shown.length === 0 && more === 0) return null;
  return (
    <div class="wb-finds">
      <FindList label={label} compact>
        {shown.map((e) => {
          switch (e.kind) {
            case 'item':
              return (
                <FindItem
                  key={entryKey(e)}
                  id={e.piece.id}
                  baseId={e.piece.baseId}
                  rarity={e.piece.rarity}
                  level={e.piece.level}
                  scale={3}
                  compact
                />
              );
            case 'blueprint':
              return <FindBlueprint key={entryKey(e)} baseId={e.baseId} compact />;
            case 'newcomer':
              return <NewcomerIcon key={entryKey(e)} species={e.species} />;
            case 'part':
              return (
                <li key={entryKey(e)}>
                  <CountBadge {...partBadge(e.part, e.amount)} />
                </li>
              );
          }
        })}
        {more > 0 && (
          <li class="wb-more">
            {hidden > 0 ? (
              <button
                type="button"
                class="wb-more-button pix"
                aria-expanded={false}
                onClick={() => {
                  setExpanded(true);
                }}
              >{`+${String(more)} more`}</button>
            ) : (
              <span class="wb-more-note pix">{`+${String(more)} more`}</span>
            )}
          </li>
        )}
      </FindList>
    </div>
  );
}

/**
 * What a story found, in the shared Find components, as one row of small finds wherever a story is told (the
 * Gazette and a place's clipping; Misa 2026-11-04: "the same smaller icons").
 */
export function Finds({
  finds,
  label,
  unshown = 0,
}: {
  finds: readonly Find[];
  label: string;
  /** Things the story stands for that are not drawn (five pieces made, three shown). */
  unshown?: number;
}) {
  return <FindsRow finds={finds} unshown={unshown} label={label} />;
}

/**
 * How the Gazette tells a story, picture aside: its headline, at most one short line, and what it found as
 * itself. The headline is the paper's big one (`lead`) or a small story's (`brief`); `clip` is how a place tells
 * its waiting stories (the small headline). The finds are one small row in all three. Every place that tells a
 * story uses this, never a second card.
 */
export function StoryText({ story, size }: { story: Story; size: 'lead' | 'brief' | 'clip' }) {
  const label = `Found: ${story.headline}`;
  const Heading = size === 'lead' ? 'h3' : 'h4';
  return (
    <>
      <Heading class={size === 'lead' ? 'wb-headline pix' : 'wb-brief-headline pix'}>
        {story.headline}
      </Heading>
      {story.blurb !== '' && (
        <p class={size === 'lead' ? 'wb-blurb' : 'wb-brief-blurb'}>{story.blurb}</p>
      )}
      <Finds finds={story.finds} label={label} unshown={story.unshown ?? 0} />
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
          <StoryText story={lead} size="lead" />
        </section>
      )}
      {briefs.length > 0 && (
        <div class="wb-briefs">
          {briefs.map((story) => (
            <section key={story.id} class="wb-brief">
              <SceneCrop scene={story.scene} cast={cast} class="wb-brief-scene" />
              <StoryText story={story} size="brief" />
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
