import { glyphOrUnknown } from '../../glyphs';
import { placeCards, type HomeInput } from '../../home-view';
import { Sprite } from '../../sprites/Sprite';
import type { Tab } from '../../tabs';

/**
 * Variant B, "Place cards" (design round, dev only): a grid of six cards under the room, one per place (two
 * columns on a phone, three on a desktop). Each card is one button: the place's picture on a tinted tile, its
 * name, one line of status and, when the place needs the player, a pip and a gold lower edge.
 */
export function HomeCards({ input, onGo }: { input: HomeInput; onGo: (place: Tab) => void }) {
  const cards = placeCards(input);
  return (
    <ul class="hc-grid pix-panel" aria-label="Places">
      {cards.map((card) => (
        <li key={card.id}>
          <button
            type="button"
            class={card.pip === null ? 'hc-card' : 'hc-card waiting'}
            data-place={card.id}
            onClick={() => {
              onGo(card.id);
            }}
          >
            <span class={`hc-pic hc-tone-${card.id}`}>
              <Sprite sprite={glyphOrUnknown(card.glyph)} scale={5} />
            </span>
            <span class="hc-name">{card.label}</span>
            {card.status !== null && <span class="hc-status">{card.status}</span>}
            {card.pip !== null && (
              <>
                <span class="hc-pip" aria-hidden="true" />
                <span class="visually-hidden">, {card.pip}</span>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
