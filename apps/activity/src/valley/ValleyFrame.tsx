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
import type { Creature, ValleyVisit } from '../api';
import type { TabAlerts } from '../tab-alerts';
import { scrollAndFocus } from '../scroll-to';
import { BonfireScene } from './BonfireScene';
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
import { trayFor, isAtHome, isScouting, trayStates } from './tray-state';
import { placeOf, type PlaceId } from './valley-art';
import { placeLabel } from './valley-logic';
import { soonLine, type SoonPlaceId, type ValleyView } from './valley-nav';
import type { GlowName } from './valley-places';

/** The sprite of a place that is not open yet. */
const SOON_ART: Readonly<Record<SoonPlaceId, GlowName>> = {
  bonfire: 'bonfire',
  school: 'school',
  visitor: 'visitor',
  market: 'market',
};

/** The Places button's spoken name: how many places have something waiting ("Places, 2 waiting"). */
export function placesLabel(waiting: number): string {
  return waiting === 0 ? 'Places' : `Places, ${String(waiting)} waiting`;
}

export function ValleyFrame({
  view,
  creatures,
  trayInput,
  alerts,
  placeInput,
  castExtra,
  visit = null,
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
  /** The valley's resting creatures and allowance (`VALLEY_SYSTEMS` on): the Bonfire opens with it; null (flag off, or not heard yet) leaves it "not open yet". */
  visit?: ValleyVisit | null;
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
  // The commons do not exist yet (phase 5 step 6): the fire is the plain one.
  const bonfireLevel = 1;
  const place = view.kind === 'valley' ? null : placeOf(view.place);
  const bubbles = placeBubbles(alerts, { ...placeInput, visit });
  // With the valley's systems on, a free creature rests at the fire and a posted one scouts: the tray says so.
  const tray: TrayInput = visit === null ? trayInput : { ...trayInput, ...trayStates(visit) };
  const insideRef = useRef<HTMLDivElement>(null);
  // The five places with a scene (not while a book of the House is open): the scene above, today's page under it.
  const cast =
    view.kind === 'place' &&
    view.book === null &&
    hasScene(view.place) &&
    (view.place !== 'signpost' || visit !== null)
      ? castFor(
          view.place,
          { ...placeInput, ...castExtra, visit },
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
                creatures={creatures.filter((c) => isAtHome(c) && !isScouting(c, visit))}
                at="start"
                focus={focus}
                bubbles={bubbles}
                onPlace={onOpen}
              />
              <button
                type="button"
                class="vy-hatch"
                aria-label={placesLabel(bubbles.length)}
                title="Places"
                aria-haspopup="dialog"
                onClick={() => {
                  setPlaces(true);
                }}
              >
                <Glyph id="flag" scale={3} />
                {bubbles.length > 0 && (
                  <span class="vy-hatch-count pix" aria-hidden="true">
                    {bubbles.length}
                  </span>
                )}
              </button>
              {away !== null && away !== false && <div class="vy-away hb">{away}</div>}
            </div>
            <Tray
              creatures={trayFor(creatures, tray)}
              input={tray}
              label="Your creatures"
              onPick={() => {
                onOpen('paddock');
              }}
            />
          </>
        )}
        {view.kind === 'soon' && view.place === 'bonfire' && visit !== null && (
          <section class="vy-soon" aria-label={placeLabel(view.place)}>
            <BonfireScene
              creatures={creatures}
              visit={visit}
              level={bonfireLevel}
              onLeave={onLeave}
            />
          </section>
        )}
        {view.kind === 'soon' && !(view.place === 'bonfire' && visit !== null) && (
          <section class="vy-soon" aria-label={placeLabel(view.place)}>
            <SceneFrame
              id={view.place}
              label={placeLabel(view.place)}
              draw={placeSceneDraw(SOON_ART[view.place])}
              scaleFor={(width, height) => placeScale(width, height, SOON_ART[view.place])}
              onLeave={onLeave}
              act={<PinnedAct calm={soonLine(view.place)} />}
            />
          </section>
        )}
        {view.kind === 'place' && (
          <div class="vy-page">
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
        lines={placeStates({ ...placeInput, visit })}
        bubbles={bubbles}
        opened={visit === null ? [] : ['bonfire']}
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
