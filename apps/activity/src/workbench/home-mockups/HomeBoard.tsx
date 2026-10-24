import { badgeSprite } from '../../games/art/badge';
import { glyphOrUnknown } from '../../glyphs';
import { CALM_LINE, comingUp, needsYou, valleyToday, type HomeInput } from '../../home-view';
import { Sprite } from '../../sprites/Sprite';
import { SKY_GLYPHS } from '../../sprites/data/weather-sprites';
import type { Tab } from '../../tabs';
import { PixelHeading } from '../../ui/PixelHeading';

/**
 * Variant A, "Today board" (design round, dev only): a notice board under the room. A wood frame round a cork
 * ground, with three pinned papers: "Needs you" (one big button per place that has something waiting, with
 * its picture, the reason and the pip), "Coming up" (the next things on the clock with their real times) and a
 * one-line "The valley today" (the sky and the Games lineup in icons). Nothing waiting: one calm line.
 */
export function HomeBoard({ input, onGo }: { input: HomeInput; onGo: (place: Tab) => void }) {
  const needs = needsYou(input);
  const coming = comingUp(input);
  const valley = valleyToday(input);
  return (
    <section class="hb pix-panel" aria-label="Today board">
      <div class="hb-cork">
        <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
          Needs you
        </PixelHeading>
        {needs.length === 0 ? (
          <p class="hb-paper hb-calm">
            <Sprite sprite={glyphOrUnknown('couch')} scale={3} />
            <span>{CALM_LINE}</span>
          </p>
        ) : (
          <ul class="hb-needs">
            {needs.map((row) => (
              <li key={row.place}>
                <button
                  type="button"
                  class="hb-paper hb-need"
                  data-place={row.place}
                  onClick={() => {
                    onGo(row.place);
                  }}
                >
                  <span class="hb-tile">
                    <Sprite sprite={glyphOrUnknown(row.glyph)} scale={3} />
                  </span>
                  <span class="hb-need-text">
                    <b class="hb-need-place">{row.label}</b>
                    <span class="hb-need-reason">
                      {row.reason}
                      {row.until !== null && <span class="hb-until"> {row.until}</span>}
                    </span>
                  </span>
                  <span class="hb-pip" aria-hidden="true" />
                  <span class="visually-hidden">, needs you</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {coming.length > 0 && (
          <>
            <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
              Coming up
            </PixelHeading>
            <ol class="hb-paper hb-coming">
              {coming.map((row) => (
                <li key={`${row.place}-${String(row.at)}`}>
                  <span class="hb-when pix">{row.when}</span>
                  <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} class="hb-coming-icon" />
                  <span class="hb-coming-text">{row.text}</span>
                  <span class="hb-rel">{row.rel}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <div class="hb-paper hb-valley">
          <span class="hb-valley-label">The valley today</span>
          <span class="hb-valley-sky">
            {valley.kind !== 'blank' && <Sprite sprite={SKY_GLYPHS[valley.kind]} scale={2} />}
            <span>{valley.sky ?? 'No forecast yet'}</span>
          </span>
          {valley.lineup.length > 0 && (
            <span class="hb-valley-games" role="list" aria-label="The Games today">
              {valley.lineup.map((event) => (
                <span key={event.id} role="listitem" class="hb-medal">
                  <Sprite
                    sprite={badgeSprite(event.scene, event.kind)}
                    scale={2}
                    alt={event.name}
                  />
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
