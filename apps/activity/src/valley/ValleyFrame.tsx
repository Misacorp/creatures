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
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { Keepsakes } from './Keepsakes';
import { MarketPage, type MarketActions, type MarketStart } from './MarketPage';
import { marketState } from './market-view';
import { VisitorPage, type VisitorFeed } from './VisitorPage';
import { AWAY_LINE, isHere } from './visitor-view';
import { commonsOf, levelOf } from './commons-view';
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
import {
  trayFor,
  isAtHome,
  isHelping,
  isScouting,
  isSmithing,
  isTrading,
  trayStates,
} from './tray-state';
import { placeOf, type PlaceId } from './valley-art';
import { placeLabel } from './valley-logic';
import { soonLine, type SoonPlaceId, type ValleyView } from './valley-nav';
import { DEFAULT_LOOK, visitorName, type GlowName } from './valley-places';

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
  commons,
  market,
  visitor,
  acorns = 0,
  commonsStart,
  marketStart,
  busy = false,
  error = null,
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
  /** The commons' gifts and communal seats (`VALLEY_SYSTEMS` on): the Bonfire's and the Paddock's project boards; absent shows none. */
  commons?: CommonsActions;
  /** The Market's broker seat (`VALLEY_SYSTEMS` on): its page opens once the Market's project is under way; absent leaves the Market "not open yet". */
  market?: MarketActions;
  /** The weekly visitor (`VALLEY_SYSTEMS` on): what the server said of him and what his page reads and asks; absent leaves his place "not open yet". */
  visitor?: VisitorFeed;
  /** The player's Acorns, for a gift. */
  acorns?: number;
  /** The board's sheet or drawer to open at the start (the workbench shows each); the game leaves it out. */
  commonsStart?: CommonsStart & { sheet?: boolean };
  /** The broker's picker or drawer to open at the start (the workbench shows each); the game leaves it out. */
  marketStart?: MarketStart;
  /** An action is under way: the boards' buttons wait. */
  busy?: boolean;
  /** The server's last error, for the Market's exchange drawer (the notice line is behind it). */
  error?: string | null;
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
  // The bonfire's place level grows its art (V-BON-7); the plain fire until the commons say more.
  const bonfireLevel = levelOf(commonsOf(visit), 'bonfire');
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
    ((view.place !== 'signpost' && view.place !== 'forge') || visit !== null)
      ? castFor(
          view.place,
          { ...placeInput, ...castExtra, visit },
          artSize(SCENE_ART[view.place]),
          bubbles,
        )
      : null;
  // The Market has a page once its project is under way (the server's commons say so); until then it stays "not open yet".
  const marketAt = marketState(visit);
  const marketPage =
    view.kind === 'soon' &&
    view.place === 'market' &&
    visit !== null &&
    market !== undefined &&
    marketAt !== null &&
    marketAt !== 'waiting';
  const marketCast = marketPage
    ? castFor('market', { ...placeInput, ...castExtra, visit }, artSize(SCENE_ART.market), bubbles)
    : null;
  // The visitor has a page while the server says he is here; away it is his shuttered spot and one line; before the server has said, "not open yet".
  const visitorView = visit !== null && visitor !== undefined ? visitor.view : null;
  const visitorPage =
    view.kind === 'soon' &&
    view.place === 'visitor' &&
    visitor !== undefined &&
    isHere(visitorView);
  const visitorCast = visitorPage
    ? castFor(
        'visitor',
        { ...placeInput, ...castExtra, visit },
        artSize(SCENE_ART.visitor),
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
          <Keepsakes visit={visit} />
        </div>
      )}
      {view.kind === 'place' &&
        view.place === 'paddock' &&
        view.book === null &&
        visit !== null &&
        commons !== undefined && (
          <CommonsBoard
            place="paddock"
            visit={visit}
            creatures={creatures}
            acorns={acorns}
            busy={busy}
            actions={commons}
            {...(commonsStart?.view === undefined ? {} : { start: { view: commonsStart.view } })}
          />
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
                creatures={creatures.filter(
                  (c) =>
                    isAtHome(c) &&
                    !isScouting(c, visit) &&
                    !isSmithing(c, visit) &&
                    !isHelping(c, visit) &&
                    !isTrading(c, visit),
                )}
                look={{
                  ...DEFAULT_LOOK,
                  bonfireLevel,
                  // His stall follows the server (open while he is here, shuttered while he is away); the default until it has said.
                  visitorHere: visitorView === null ? DEFAULT_LOOK.visitorHere : visitorView.here,
                }}
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
              {...(commons === undefined ? {} : { commons, acorns, busy })}
              {...(commonsStart === undefined ? {} : { start: commonsStart })}
            />
          </section>
        )}
        {marketPage && marketCast !== null && visit !== null && market !== undefined && (
          <div class="vy-page">
            <PlaceScene
              cast={marketCast}
              onAct={() => {
                scrollAndFocus(insideRef.current);
              }}
            />
            <div class="vy-inside" ref={insideRef} tabIndex={-1}>
              <MarketPage
                visit={visit}
                creatures={creatures}
                trayInput={tray}
                acorns={acorns}
                busy={busy}
                error={error}
                actions={market}
                {...(commons === undefined ? {} : { commons })}
                onOpenPaddock={() => {
                  onOpen('paddock');
                }}
                start={{
                  ...marketStart,
                  ...(commonsStart === undefined ? {} : { commons: commonsStart }),
                }}
              />
            </div>
          </div>
        )}
        {visitorPage && visitorCast !== null && visitor !== undefined && isHere(visitorView) && (
          <div class="vy-page">
            <PlaceScene
              cast={visitorCast}
              onAct={() => {
                scrollAndFocus(insideRef.current);
              }}
            />
            <div class="vy-inside" ref={insideRef} tabIndex={-1}>
              <VisitorPage
                view={visitorView}
                items={visitor.items}
                blueprints={visitor.blueprints}
                purse={visitor.purse}
                busy={busy}
                error={error}
                actions={visitor.actions}
                {...(visitor.start === undefined ? {} : { start: visitor.start })}
              />
            </div>
          </div>
        )}
        {view.kind === 'soon' &&
          !(view.place === 'bonfire' && visit !== null) &&
          !marketPage &&
          !visitorPage && (
            <section class="vy-soon" aria-label={placeLabel(view.place)}>
              {(() => {
                // His shuttered spot once the server has said he is away (a place not open yet keeps its own art).
                const away = view.place === 'visitor' && visitorView !== null && !visitorView.here;
                const art = away ? visitorName(false) : SOON_ART[view.place];
                return (
                  <SceneFrame
                    id={view.place}
                    label={placeLabel(view.place)}
                    draw={placeSceneDraw(art)}
                    scaleFor={(width, height) => placeScale(width, height, art)}
                    onLeave={onLeave}
                    act={<PinnedAct calm={away ? AWAY_LINE : soonLine(view.place)} />}
                  />
                );
              })()}
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
        lines={placeStates({ ...placeInput, visit, visitor: visitorView })}
        bubbles={bubbles}
        opened={
          visit === null
            ? []
            : [
                'bonfire',
                ...(marketAt === null || marketAt === 'waiting' ? [] : (['market'] as const)),
                ...(visitorView === null ? [] : (['visitor'] as const)),
              ]
        }
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
