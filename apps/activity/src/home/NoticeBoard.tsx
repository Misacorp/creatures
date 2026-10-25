import type { RefObject } from 'preact';
import { cssVars } from '../css-vars';
import { ForecastCard } from '../ForecastCard';
import { badgeSprite } from '../games/art/badge';
import { glyphOrUnknown } from '../glyphs';
import { CALM_LINE, type HomeInput } from '../home-view';
import { usePopoverTrigger } from '../PopoverHost';
import { Sprite } from '../sprites/Sprite';
import { SKY_GLYPHS } from '../sprites/data/weather-sprites';
import type { Tab } from '../tabs';
import { CountBadgeList } from '../ui/CountBadge';
import { PixelHeading } from '../ui/PixelHeading';
import { AWAY_TITLE, awayRows, awayWaitingLine } from './away-notice';
import { buildBoard, type BoardSettings } from './board';
import { HowToPin } from './HowToPin';
import { starterLook } from './starter-creature';
import { StarterPin } from './StarterPin';

/**
 * The Today board: a notice board of papers pinned on cork, under the living room (on a wide window under the
 * room band). "Needs you" has one big button per place with something waiting (its picture, the reason, a pip);
 * "Coming up" lists the next things on the clock with their real times; "The valley today" is one line (the
 * sky and the Games lineup). Two round pins in the top right corner: the starter's (`StarterPin`) opens the Creatures view and the "?" (`HowToPin`, drawn when `onHowTo` is given) opens How to play. Nothing waiting: one calm line. With `settings.idle` `show`, places with nothing
 * going on get a slim one-line notice under "Quiet places" (with `hide`, the default, they get none).
 *
 * `settings.tilt` leaves every paper flush (`none`, the default) or leans it a little (`still`). The lean
 * of each paper is a number from `board.ts`; the stylesheet (`styles/views/home.css`) reads it from `--tilt`. Player text never appears
 * here: every line is the game's own wording and every name is drawn as text. Everything on the board that is about
 * another screen opens it (a Needs-you notice, a Coming up row, a Quiet places row, the Games medals; the sky
 * line opens the forecast card), through the one `onGo`.
 */
/** The sky line of "The valley today": a button that opens the forecast, the same card the room's calendar opens. */
function ValleySky({
  kind,
  sky,
  forecast,
}: {
  kind: ReturnType<typeof buildBoard>['valley']['kind'];
  sky: string | null;
  forecast: HomeInput['forecast'];
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      type="button"
      class="hb-valley-sky"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => {
        if (ref.current === null) return;
        host?.openCustom('room-calendar', ref.current, {
          label: 'Forecast',
          body: <ForecastCard forecast={forecast} />,
        });
      }}
    >
      {kind !== 'blank' && <Sprite sprite={SKY_GLYPHS[kind]} scale={2} />}
      <span>{sky ?? 'No forecast yet'}</span>
    </button>
  );
}

export function NoticeBoard({
  input,
  settings,
  onGo,
  onHowTo,
  howToRef,
  onDismissAway,
  awayBusy = false,
}: {
  input: HomeInput;
  settings: BoardSettings;
  /** Opens a place; `needsFilter` asks the Creatures view to start with its "Needs you" filter on. */
  onGo: (place: Tab, needsFilter?: boolean) => void;
  /** Opens How to play (the "?" pin); without it the pin is not drawn. */
  onHowTo?: () => void;
  /** The "?" pin, where the focus returns when How to play closes. */
  howToRef?: RefObject<HTMLButtonElement | null>;
  /** Clears the "While you were away" paper (`until` is its summary's last payout); without it the paper has no button. */
  onDismissAway?: (until: number) => void;
  /** An action is running: the paper's button waits. */
  awayBusy?: boolean;
}) {
  const board = buildBoard(input, settings);
  /** The ref that gives a paper its lean (through the CSS object model: the Activity's CSP has no inline styles). */
  const lean = (id: string) => cssVars({ '--tilt': `${String(board.tilts[id] ?? 0)}deg` });
  const { valley } = board;
  const starter = starterLook(input.creatures);
  return (
    <section class="hb pix-panel" aria-label="Today board" data-tilt={settings.tilt}>
      <div class="hb-cork">
        <StarterPin
          species={starter.species}
          shiny={starter.shiny}
          onOpen={() => {
            onGo('collection');
          }}
        />
        {onHowTo !== undefined && (
          <HowToPin onOpen={onHowTo} {...(howToRef === undefined ? {} : { pinRef: howToRef })} />
        )}
        {board.away !== null && (
          <>
            <PixelHeading as="h3" tone="gold" outline="ink" class="hb-title">
              {AWAY_TITLE}
            </PixelHeading>
            <div class="hb-paper hb-away" ref={lean('away')}>
              <ul class="hb-away-rows" aria-label={AWAY_TITLE}>
                {awayRows(board.away).map((row) => (
                  <li key={row.kind} class="hb-away-row" data-kind={row.kind}>
                    <b class="hb-away-source">{row.name}</b>
                    <CountBadgeList
                      items={row.badges}
                      label={`${row.name}, while you were away`}
                      class="hb-away-badges"
                    />
                  </li>
                ))}
              </ul>
              {awayWaitingLine(board.away) !== null && (
                <p class="hb-away-waiting">{awayWaitingLine(board.away)}</p>
              )}
              {onDismissAway !== undefined && (
                <button
                  type="button"
                  class="primary hb-away-ok"
                  disabled={awayBusy}
                  onClick={() => {
                    if (board.away !== null) onDismissAway(board.away.until);
                  }}
                >
                  Got it
                </button>
              )}
            </div>
          </>
        )}
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
                    if (row.needsFilter) onGo(row.place, true);
                    else onGo(row.place);
                  }}
                >
                  <span class="hb-tile">
                    <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} />
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
                    <button
                      type="button"
                      class="hb-coming-row"
                      data-place={row.place}
                      onClick={() => {
                        onGo(row.place);
                      }}
                    >
                      <span class="hb-when pix">{row.when}</span>
                      <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} class="hb-coming-icon" />
                      <span class="hb-coming-text">{row.text}</span>
                      <span class="hb-rel">{row.rel}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          <div class="hb-paper hb-valley" ref={lean('valley')}>
            <span class="hb-valley-label">The valley today</span>
            <ValleySky kind={valley.kind} sky={valley.sky} forecast={input.forecast} />
            {valley.lineup.length > 0 && (
              <button
                type="button"
                class="hb-valley-games"
                data-place="games"
                aria-label={`The Games today: ${valley.lineup.map((e) => e.name).join(', ')}`}
                onClick={() => {
                  onGo('games');
                }}
              >
                {valley.lineup.map((event) => (
                  <span key={event.id} class="hb-medal" aria-hidden="true">
                    <Sprite sprite={badgeSprite(event.scene, event.kind)} scale={2} />
                  </span>
                ))}
              </button>
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
                  <button
                    type="button"
                    class="hb-paper hb-quiet"
                    data-place={row.place}
                    ref={lean(`quiet:${row.place}`)}
                    onClick={() => {
                      onGo(row.place);
                    }}
                  >
                    <Sprite sprite={glyphOrUnknown(row.glyph)} scale={2} class="hb-coming-icon" />
                    <b class="hb-quiet-place">{row.label}</b>
                    <span class="hb-quiet-text">{row.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
