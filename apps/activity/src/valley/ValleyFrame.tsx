/**
 * The valley shell (`VALLEY` flag on): the game's frame in place of the dock and the tab pages. Under the HUD
 * (the game draws it) it shows one of three things: the map of the valley with the creature tray, a place's
 * page (one of today's pages, drawn by the game as before, under a "‹ Valley" way back), or a place that is not
 * open yet (its scene and one line of what it will be). Notices and the Settings page show over
 * it as they do over the tab pages; the welcome-back Gazette is a sheet the game draws beside it. It draws no navigation of its own beyond the map and the Places list; the
 * game owns the state (`view`) and every page component, so both shells share them.
 */
import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import type { TabAlerts } from '../tab-alerts';
import { scrollAndFocus } from '../scroll-to';
import { DrillHead } from '../ui/DrillHead';
import { PinnedAct } from './PinnedAct';
import { PlaceScene, SCENE_ART } from './PlaceScene';
import { PlaceRow, PlacesList } from './PlacesList';
import { SceneFrame } from './SceneFrame';
import { Tray } from './Tray';
import { ValleyMap } from './ValleyMap';
import { Glyph } from './parts';
import { placeBubbles, placeStates, type PlaceInput } from './place-state';
import { castFor, hasScene, type CastExtra } from './place-cast';
import { artSize, placeScale, placeSceneDraw } from './place-scene';
import type { TrayInput } from './tray-state';
import { trayFor, isAtHome } from './tray-state';
import { placeOf, type PlaceId } from './valley-art';
import { placeLabel } from './valley-logic';
import {
  PAGE_TITLES,
  isOpenPlace,
  soonLine,
  type SoonPlaceId,
  type ValleyView,
} from './valley-nav';
import type { GlowName } from './valley-places';

/** The sprite of a place that is not open yet. */
const SOON_ART: Readonly<Record<SoonPlaceId, GlowName>> = {
  bonfire: 'bonfire',
  school: 'school',
  visitor: 'visitor',
  market: 'market',
};

export function ValleyFrame({
  view,
  creatures,
  trayInput,
  alerts,
  placeInput,
  castExtra,
  focus,
  onOpen,
  onLeave,
  onBook,
  notices,
  away,
  settings,
  children,
}: {
  view: ValleyView;
  creatures: readonly Creature[];
  trayInput: TrayInput;
  /** Today's pips (`useTabPips`): the places' bubbles are made from them. */
  alerts: TabAlerts;
  /** What the places' bubbles and state lines read: the game screen's own state, no request of its own. */
  placeInput: PlaceInput;
  /** What the scenes read besides that: this session's dungeon row, the waiting catches. */
  castExtra: CastExtra;
  /** The place whose button takes the focus when the map comes back. */
  focus: PlaceId | null;
  /** Opens a place (from the map, the Places list or the tray). */
  onOpen: (id: PlaceId) => void;
  /** Leaves a place for the valley. */
  onLeave: () => void;
  /** Opens one of the House's two entries. */
  onBook: (book: 'journal' | 'stats') => void;
  /** Errors, notes, the wipe notice and the level-reset card, over the valley as over the tab pages. */
  notices: ComponentChildren;
  /** The "While you were away" paper, over the map: the game passes null (the welcome-back Gazette, `gazette/WelcomeBack`, is a sheet of its own); the workbench demo still shows the paper here. */
  away: ComponentChildren;
  /** The Settings page when it is open (it takes the screen; the rest stays mounted under it); else null. */
  settings: ComponentChildren;
  /** Today's pages, drawn by the game for the current tab. */
  children: ComponentChildren;
}) {
  const [places, setPlaces] = useState(false);
  const place = view.kind === 'valley' ? null : placeOf(view.place);
  const bubbles = placeBubbles(alerts, placeInput);
  const insideRef = useRef<HTMLDivElement>(null);
  // The five places with a scene (not while a book of the House is open): the scene above, today's page under it.
  const cast =
    view.kind === 'place' && view.book === null && hasScene(view.place)
      ? castFor(
          view.place,
          { ...placeInput, ...castExtra },
          artSize(SCENE_ART[view.place]),
          bubbles,
        )
      : null;
  // Today's page of the place: the House's two books, then the page the game drew.
  const inside = (
    <>
      {view.kind === 'place' && view.place === 'house' && view.book === null && (
        <div class="vy-house">
          <ul class="vy-rows" aria-label="In the house">
            <PlaceRow
              glyph="journal"
              name="Journal"
              line="your finds and firsts"
              onClick={() => {
                onBook('journal');
              }}
            />
            <PlaceRow
              glyph="stats"
              name="Stats"
              line="your numbers"
              onClick={() => {
                onBook('stats');
              }}
            />
          </ul>
        </div>
      )}
      {children}
    </>
  );
  const settingsOpen = settings !== null && settings !== false;
  return (
    <div class="vy-frame" data-view={view.kind} data-place={place?.id ?? 'valley'}>
      <div class="vy-notices">{notices}</div>
      {settingsOpen && <div class="vy-page">{settings}</div>}
      <div class="vy-body" hidden={settingsOpen}>
        {view.kind === 'valley' && (
          <>
            <div class="vy-map-view">
              <ValleyMap
                creatures={creatures.filter(isAtHome)}
                at="start"
                focus={focus}
                bubbles={bubbles}
                onPlace={onOpen}
              />
              <button
                type="button"
                class="vy-hatch"
                aria-label="Places"
                title="Places"
                aria-haspopup="dialog"
                onClick={() => {
                  setPlaces(true);
                }}
              >
                <Glyph id="flag" scale={3} />
              </button>
              {away !== null && away !== false && <div class="vy-away hb">{away}</div>}
            </div>
            <Tray
              creatures={trayFor(creatures, trayInput)}
              input={trayInput}
              label="Your creatures"
              onPick={() => {
                onOpen('paddock');
              }}
            />
          </>
        )}
        {view.kind === 'soon' && (
          <section class="vy-soon" aria-label={placeLabel(view.place)}>
            <DrillHead
              title="Not open yet"
              backLabel={`(leave the ${placeOf(view.place).name})`}
              word="Valley"
              onBack={onLeave}
              focus
            />
            <SceneFrame
              id={view.place}
              label={placeLabel(view.place)}
              draw={placeSceneDraw(SOON_ART[view.place])}
              scaleFor={(width, height) => placeScale(width, height, SOON_ART[view.place])}
              onLeave={onLeave}
              act={<PinnedAct calm={soonLine(view.place)} mark={false} />}
            />
          </section>
        )}
        {view.kind === 'place' && (
          <div class="vy-page">
            {view.book === null && isOpenPlace(view.place) && (
              <DrillHead
                title={PAGE_TITLES[view.place]}
                backLabel={`(leave the ${placeOf(view.place).name})`}
                word="Valley"
                onBack={onLeave}
                focus
              />
            )}
            {cast !== null && (
              <PlaceScene
                cast={cast}
                onAct={() => {
                  scrollAndFocus(insideRef.current);
                }}
              />
            )}
            {cast === null ? (
              inside
            ) : (
              <div class="vy-inside" ref={insideRef} tabIndex={-1}>
                {inside}
              </div>
            )}
          </div>
        )}
      </div>
      <PlacesList
        open={places}
        lines={placeStates(placeInput)}
        bubbles={bubbles}
        onClose={() => {
          setPlaces(false);
        }}
        onPlace={(id) => {
          setPlaces(false);
          onOpen(id);
        }}
      />
    </div>
  );
}
