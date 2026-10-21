import { Tag } from './ui/Tag';
import { silhouettePalette } from './art';
import type { DestinationCard, Resident } from './destination-view';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** What the deeper area says once it is open to the explorer: no chances, only the promise. */
const DEEP_OPEN_TEXT = 'Deeper area open: its rarer creatures can turn up.';

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

const TIME_GLYPH = { night: 'moon', festival: 'flag' } as const;

/**
 * The information under a place's title plate: its element, the italic flavour line, the plain facts
 * (only Moonlit Reef has one), this week's twist when it is the special place, who lives there
 * (silhouettes until found), the deeper area (a single line once it is open to the explorer that would
 * go) and, when the clock shuts it (night, Festival), one line saying when it opens. Familiarity is not here: it belongs to the creature (see
 * `ExplorerPicker`). Text only apart from the pictures. The banner and the title plate are in
 * `Catalogue`.
 */
export function PlaceInfo({ card }: { card: DestinationCard }) {
  const normal = card.residents.filter((r) => !r.deep);
  const deep = card.residents.filter((r) => r.deep);
  return (
    <div class="place-body">
      <p class="tags place-tags">
        {card.element === null ? (
          <Tag entry="destination">Mixed place</Tag>
        ) : (
          <ElementChip element={card.element} context="place" />
        )}
        {card.minRank > 1 && <Tag entry="explorer-rank">{`Rank ${String(card.minRank)}`}</Tag>}
      </p>
      <p class="place-flavor">{card.flavor}</p>
      {card.facts.map((fact) => (
        <p key={fact} class="place-fact">
          {fact}
        </p>
      ))}
      {card.twist !== null && (
        <p class="twist">
          <Tag kind="badge" tone="shiny" entry="weekly-special">
            This week
          </Tag>{' '}
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
            {card.deepOpen && <p class="place-deep-open">{DEEP_OPEN_TEXT}</p>}
            <ul class="residents" aria-label="Creatures of the deeper area">
              {deep.map((r) => (
                <ResidentView key={r.species} resident={r} />
              ))}
            </ul>
          </>
        )}
      </div>
      {card.timeRule !== null && (
        <p class="locks time-rule">
          <Sprite sprite={glyphOrUnknown(TIME_GLYPH[card.timeRule.kind])} scale={2} />
          <span>{card.timeRule.text}</span>
        </p>
      )}
    </div>
  );
}
