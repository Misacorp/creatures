import { cssVars } from '../css-vars';
import { badgeSprite } from '../games/art/badge';
import { glyphOrUnknown } from '../glyphs';
import { CALM_LINE, type HomeInput } from '../home-view';
import { Sprite } from '../sprites/Sprite';
import { SKY_GLYPHS } from '../sprites/data/weather-sprites';
import type { Tab } from '../tabs';
import { PixelHeading } from '../ui/PixelHeading';
import { buildBoard, swayDelay, type BoardSettings } from './board';

/**
 * The Today board: a notice board of papers pinned on cork, under the living room (on a wide window under the
 * room band). "Needs you" has one big button per place with something waiting (its picture, the reason, a pip);
 * "Coming up" lists the next things on the clock with their real times; "The valley today" is one line (the
 * sky and the Games lineup). Nothing waiting: one calm line. With `settings.idle` `show`, places with nothing
 * going on get a slim one-line notice under "Quiet places" (with `hide`, the default, they get none).
 *
 * `settings.tilt` leans every paper a little (`still`, the default), rocks it slowly (`sway`, still under
 * reduced motion) or leaves it flush (`none`). The lean of each paper is a number from `board.ts`; the
 * stylesheet (`styles/views/home.css`) reads it from `--tilt` and `--sway-delay`. Player text never appears
 * here: every line is the game's own wording and every name is drawn as text.
 */
export function NoticeBoard({
  input,
  settings,
  onGo,
}: {
  input: HomeInput;
  settings: BoardSettings;
  onGo: (place: Tab) => void;
}) {
  const board = buildBoard(input, settings);
  /** The ref that gives a paper its lean (through the CSS object model: the Activity's CSP has no inline styles). */
  const lean = (id: string) =>
    cssVars({
      '--tilt': `${String(board.tilts[id] ?? 0)}deg`,
      '--sway-delay': `${String(swayDelay(id))}s`,
    });
  const { valley } = board;
  return (
    <section class="hb pix-panel" aria-label="Today board" data-tilt={settings.tilt}>
      <div class="hb-cork">
        <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
          Needs you
        </PixelHeading>
        {board.calm ? (
          <p class="hb-paper hb-calm" ref={lean('calm')}>
            <Sprite sprite={glyphOrUnknown('couch')} scale={3} />
            <span>{CALM_LINE}</span>
          </p>
        ) : (
          <ul class="hb-needs">
            {board.needs.map((row) => (
              <li key={row.place}>
                <button
                  type="button"
                  class="hb-paper hb-need"
                  data-place={row.place}
                  ref={lean(`need:${row.place}`)}
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

        <div class="hb-lower">
          {board.coming.length > 0 && (
            <>
              <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
                Coming up
              </PixelHeading>
              <ol class="hb-paper hb-coming" ref={lean('coming')}>
                {board.coming.map((row) => (
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

          <div class="hb-paper hb-valley" ref={lean('valley')}>
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

        {board.quiet.length > 0 && (
          <>
            <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
              Quiet places
            </PixelHeading>
            <ul class="hb-quiet-list">
              {board.quiet.map((row) => (
                <li key={row.place}>
                  <p class="hb-paper hb-quiet" ref={lean(`quiet:${row.place}`)}>
                    <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} class="hb-coming-icon" />
                    <b class="hb-quiet-place">{row.label}</b>
                    <span class="hb-quiet-text">{row.text}</span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
