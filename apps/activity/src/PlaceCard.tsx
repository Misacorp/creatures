import { silhouettePalette } from './art';
import type { DestinationCard, Resident } from './destination-view';
import { GlossaryTag } from './Glossary';
import { glyphOrUnknown } from './glyphs';
import { ElementChip } from './sprites/ElementChip';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** What the deeper area says once it is open to the explorer: no chances, only the promise. */
export const DEEP_OPEN_TEXT = 'Deeper area open: its rarer creatures can turn up.';

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
 * The information under a place's title plate: its element, the italic flavour line, the plain facts
 * (only Moonlit Reef has one), this week's twist when it is the special place, who lives there
 * (silhouettes until found), the deeper area (a single line once it is open to the explorer that would
 * go) and, when it is closed, why. Familiarity is not here: it belongs to the creature (see
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
      <p class="place-flavor">{card.flavor}</p>
      {card.facts.map((fact) => (
        <p key={fact} class="place-fact">
          {fact}
        </p>
      ))}
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
            {card.deepOpen && <p class="place-deep-open">{DEEP_OPEN_TEXT}</p>}
            <ul class="residents" aria-label="Creatures of the deeper area">
              {deep.map((r) => (
                <ResidentView key={r.species} resident={r} />
              ))}
            </ul>
          </>
        )}
      </div>
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
  );
}
