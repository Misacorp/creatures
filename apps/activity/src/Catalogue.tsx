import { turnCatalogue, type DestinationCard } from './destination-view';
import { glyphOrUnknown } from './glyphs';
import { PlaceCard } from './PlaceCard';
import { elementIcon } from './sprites/element-icons';
import { Sprite } from './sprites/Sprite';

/**
 * The destination catalogue: one banner card at a time with previous and next buttons, and a row of
 * small buttons, one per place, so any place is one tap away. The card shown is the place the trip goes
 * to. Left and Right arrows turn the page when focus is inside it. A closed place has a lock on its button.
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
      <div class="catalogue-bar">
        <button
          type="button"
          class="page-button"
          aria-label="Previous place"
          onClick={() => {
            turn(-1);
          }}
        >
          <Sprite sprite={glyphOrUnknown('right_to_left')} scale={2} />
        </button>
        <p class="catalogue-count pix" aria-live="polite">
          {card.name}
          <span class="muted">
            {' '}
            {index + 1} / {cards.length}
          </span>
        </p>
        <button
          type="button"
          class="page-button"
          aria-label="Next place"
          onClick={() => {
            turn(1);
          }}
        >
          <Sprite sprite={glyphOrUnknown('left_to_right')} scale={2} />
        </button>
      </div>
      <PlaceCard card={card} />
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
    </div>
  );
}
