import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { HOME_PINS, type PinId, type Screen } from '../tabs';

/** The one-line teasers of the two pins (from the profile the page has loaded); null until it has. */
export interface PinTeasers {
  journal: string | null;
  stats: string | null;
}

const PIN_ART: Readonly<Record<PinId, { glyph: string; scale: number }>> = {
  journal: { glyph: 'journal', scale: 3 },
  stats: { glyph: 'stats', scale: 3 },
};

/**
 * The two things pinned to the Today board that open a page of their own: the Journal, a small booklet with a
 * ribbon, and the Stats, a ruled ledger card. Each is a button with its name and, once the profile has loaded,
 * a one-line teaser ("3 / 45 pages found", "48 trips, 9 dungeon clears"). They lean like the other papers
 * (`lean` hands back the ref that sets the lean). Which pins exist is `HOME_PINS` in `tabs.ts` (the Journal's opens its place, the Stats' a page of Home).
 */
export function BoardPins({
  teasers,
  onOpen,
  lean,
}: {
  teasers: PinTeasers;
  onOpen: (screen: Screen) => void;
  lean: (id: string) => (el: HTMLElement | null) => void;
}) {
  return (
    <ul class="hb-pins">
      {HOME_PINS.map((page) => {
        const art = PIN_ART[page.id];
        const teaser = teasers[page.id];
        return (
          <li key={page.id}>
            <button
              type="button"
              class={`hb-paper hb-pin hb-pin-${page.id}`}
              ref={lean(`pin:${page.id}`)}
              onClick={() => {
                onOpen(page.screen);
              }}
            >
              <span class="hb-pin-art">
                <Sprite sprite={glyphOrUnknown(art.glyph)} scale={art.scale} />
              </span>
              <span class="hb-pin-text">
                <b class="hb-pin-name pix">{page.label}</b>
                {teaser !== null && <span class="hb-pin-teaser">{teaser}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
