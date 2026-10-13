import { GLOSSARY_IDS } from '@creatures/game';
import { silhouettePalette } from './art';
import { Banner } from './Banner';
import type { DestinationCard, Resident } from './destination-view';
import { Stars } from './ExpeditionIcons';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** One creature that lives at a place: its colours and name once found, a silhouette and "???" before. */
function ResidentView({ resident }: { resident: Resident }) {
  const sprite = creatureSpriteOrFallback(resident.species);
  return (
    <li class={`resident${resident.known ? ' known' : ' unknown'}${resident.deep ? ' deep' : ''}`}>
      <Sprite
        sprite={sprite}
        scale={2}
        {...(resident.known ? {} : { palette: silhouettePalette(sprite) })}
        {...(resident.known ? { alt: resident.name } : {})}
      />
      <span class="resident-name">
        {resident.known ? (
          resident.name
        ) : (
          <>
            ???<span class="visually-hidden"> (not found yet)</span>
          </>
        )}
      </span>
    </li>
  );
}

const LOCK_GLYPH: Record<string, string> = { rank: 'rank', night: 'moon', festival: 'flag' };

/**
 * A destination as a banner card: the pixel banner, the place's name and element, who lives there
 * (silhouettes until found), the stars of the creature that would go, this week's twist when it is the
 * special place, and, when it is closed, why. Text only apart from the pictures.
 */
export function PlaceCard({
  card,
  walker,
  headingLevel = 4,
}: {
  card: DestinationCard;
  walker?: Parameters<typeof Banner>[0]['walker'];
  headingLevel?: 3 | 4;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const normal = card.residents.filter((r) => !r.deep);
  const deep = card.residents.filter((r) => r.deep);
  return (
    <article class={`place-card${card.locked.length > 0 ? ' locked' : ''}`}>
      <Banner destination={card.id} {...(walker === undefined ? {} : { walker })} />
      <div class="place-body">
        <Heading class="place-name">
          {card.name} <GlossaryTag entry={GLOSSARY_IDS.destination(card.id)} look="help" />
        </Heading>
        <p class="tags place-tags">
          {card.element === null ? (
            <GlossaryTag entry="destination" look="chip" class="tag">
              Mixed place
            </GlossaryTag>
          ) : (
            <ElementChip element={card.element} />
          )}
          {card.minRank > 1 && (
            <GlossaryTag entry="explorer-rank" look="chip" class="tag">
              {`Rank ${String(card.minRank)}`}
            </GlossaryTag>
          )}
        </p>
        <p class="muted place-flavor">{card.flavor}</p>
        {card.twist !== null && (
          <p class="twist">
            <GlossaryTag entry="weekly-special" look="chip" class="badge shiny">
              This week
            </GlossaryTag>{' '}
            <strong>{card.twist.name}:</strong> {card.twist.description}
          </p>
        )}
        <div class="place-lives">
          <p class="label">Lives here</p>
          <ul class="residents" aria-label="Creatures that live here">
            {normal.map((r) => (
              <ResidentView key={r.species} resident={r} />
            ))}
          </ul>
          {deep.length > 0 && (
            <>
              <p class="label">
                <GlossaryTag entry="deep-area" look="text">
                  Deeper area
                </GlossaryTag>
              </p>
              <ul class="residents" aria-label="Creatures of the deeper area">
                {deep.map((r) => (
                  <ResidentView key={r.species} resident={r} />
                ))}
              </ul>
            </>
          )}
        </div>
        <p class="place-stars">
          <GlossaryTag entry="familiarity" look="text">
            Familiarity
          </GlossaryTag>{' '}
          <Stars stars={card.stars} />{' '}
          <span class="muted">
            {card.trips === 0
              ? 'No trips here yet'
              : `${String(card.trips)} ${card.trips === 1 ? 'trip' : 'trips'} here`}
          </span>
        </p>
        {card.locked.length > 0 && (
          <ul class="locks" aria-label="Why it is closed">
            {card.locked.map((lock) => (
              <li key={lock.kind}>
                <Sprite sprite={glyphOrUnknown('lock')} scale={2} />
                <Sprite sprite={glyphOrUnknown(LOCK_GLYPH[lock.kind] ?? 'lock')} scale={2} />
                <span>{lock.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
