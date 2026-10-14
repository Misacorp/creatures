import { Banner } from './Banner';
import { turnCatalogue, type DestinationCard } from './destination-view';
import { glyphOrUnknown } from './glyphs';
import { PlaceInfo } from './PlaceCard';
import { elementIcon } from './sprites/element-icons';
import { Sprite } from './sprites/Sprite';
import { TitlePlate } from './ui/TitlePlate';

/**
 * The destination catalogue, top to bottom: the strip of places (one small button each, with the element
 * and a lock when closed, so any place is one tap away), the banner as a hero with the previous and next
 * arrows over its left and right edges, the place's name on a title plate like a playing card's with
 * `1 / 7`, and the place's information. Left and Right arrows turn the page when focus is inside it.
 */
export function Catalogue({
  cards,
  index,
  onIndex,
}: {
  cards: readonly DestinationCard[];
  index: number;
  onIndex: (index: number) => void;
}) {
  const card = cards[index];
  if (card === undefined) return <p class="muted">No places to show.</p>;
  const turn = (step: number): void => {
    onIndex(turnCatalogue(index, step, cards.length));
  };
  return (
    <div
      class="catalogue"
      role="group"
      aria-roledescription="carousel"
      aria-label="Places to explore"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          turn(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          turn(-1);
        }
      }}
    >
      <ul class="catalogue-dots" aria-label="Choose a place">
        {cards.map((other, i) => {
          const icon = other.element === null ? undefined : elementIcon(other.element);
          return (
            <li key={other.id}>
              <button
                type="button"
                class={`dot-button${i === index ? ' on' : ''}${other.locked.length > 0 ? ' locked' : ''}`}
                aria-label={`${other.name}${other.locked.length > 0 ? ' (closed)' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => {
                  onIndex(i);
                }}
              >
                <Sprite
                  sprite={
                    other.locked.length > 0
                      ? glyphOrUnknown('lock')
                      : (icon ?? glyphOrUnknown('compass'))
                  }
                  scale={2}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <div class={`catalogue-hero${card.locked.length > 0 ? ' locked' : ''}`}>
        <Banner destination={card.id}>
          <button
            type="button"
            class="hero-arrow left"
            aria-label="Previous place"
            onClick={() => {
              turn(-1);
            }}
          >
            <Sprite sprite={glyphOrUnknown('right_to_left')} scale={3} />
          </button>
          <button
            type="button"
            class="hero-arrow right"
            aria-label="Next place"
            onClick={() => {
              turn(1);
            }}
          >
            <Sprite sprite={glyphOrUnknown('left_to_right')} scale={3} />
          </button>
        </Banner>
      </div>
      <TitlePlate
        title={card.name}
        count={
          <>
            {index + 1} / {cards.length}
          </>
        }
        live
      />
      <PlaceInfo card={card} />
    </div>
  );
}
