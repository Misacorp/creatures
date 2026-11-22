/**
 * The House place: your house (`docs/design/housing.md` 4.5). The page is the scene, two small chips for the roof and the
 * walls, the rows (Build, Workbench, Catalogue, Mailbox, Visit) and the guestbook. A tap on a room focuses it (`RoomFocus`,
 * a page opened from this one: "‹ Back" and Escape); a tap on a spot opens its choices in a drawer on a phone and in the side
 * panel on a wide window, where the scene stays beside it. Build, workbench, catalogue, mailbox and the visit list are pages
 * opened from this one the same way (a side panel on a wide window); a tap on a house of the list opens `VisitHouse`.
 *
 * Every request goes through `useHouse` (the action runner, one idempotency key per spend); the panels are C2's and come
 * from `house-panels.tsx` with their callbacks only. The place has no Back of its own (the dock or the valley's HUD says
 * where you are); every page opened from it has one.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type HousePay, type HouseView } from '@creatures/game';
import { housing } from '@creatures/game/housing-content';
import type { Creature } from '../api';
import { useLoaded } from '../use-loaded';
import { resourceCount } from '../resource-count';
import { Alert } from '../ui/Alert';
import { Drawer } from '../ui/Drawer';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { CountBadgeList } from '../ui/CountBadge';
import { SidePanel } from '../ui/SidePanel';
import { useWide } from '../ui/wide-layout';
import { WideLayout } from '../ui/WideLayout';
import { Glyph } from '../valley/parts';
import {
  PanelBody,
  PlaceCanvas,
  ToolCue,
  openerOf,
  type CanvasPanel,
  type Opener,
} from '../valley/PlaceCanvas';
import { StepBody } from '../valley/PanelStep';
import {
  BuildPanel,
  CataloguePanel,
  Guestbook,
  MailboxPanel,
  SkinPicker,
  SpotPicker,
  VisitList,
  WorkbenchPanel,
} from './house-panels';
import { useHouseApi } from './house-api-context';
import { HouseRows, houseRowLines, type HouseDrill } from './HouseRows';
import { HouseScene, type ScrollMemory } from './HouseScene';
import { SPOT_NAMES } from './house-text';
import { HousePostcard } from './HousePostcard';
import { PartPreview } from './PartPreview';
import { RoomChips, RoomFocus } from './RoomFocus';
import { SKIN_KIND_NAMES } from './SkinPicker';
import { currentLook, skinBody, type SkinKind } from './spot-view';
import { SkinTrigger } from './SkinTrigger';
import { freshFinds, hasFresh, useHouse, type OwnHouse } from './use-house';
import { VisitHouse } from './VisitHouse';

type View =
  | { kind: 'home' }
  | { kind: 'room'; roomId: string }
  | { kind: 'drill'; drill: HouseDrill; focus?: string; from: View }
  | { kind: 'visit'; userId: string };

/** The choice a spot or a skin chip is offering (a drawer, or the side panel). */
type Picker =
  | { kind: 'spot'; roomId: string; spotId: string }
  | { kind: 'skin'; skin: SkinKind; roomId: string | null };

const DRILL_TITLES: Readonly<Record<HouseDrill, string>> = {
  build: 'Build',
  workbench: 'Workbench',
  catalogue: 'Catalogue',
  mailbox: 'Mailbox',
  visits: 'Visit',
};

/** A spot a piece stands in (the first found), or null when it stands nowhere. */
export function standsAt(
  house: Pick<HouseView, 'rooms'>,
  pieceId: string,
): { roomId: string; spotId: string } | null {
  for (const room of house.rooms) {
    for (const [spotId, id] of Object.entries(room.spots)) {
      if (id === pieceId) return { roomId: room.id, spotId };
    }
  }
  return null;
}

/** The name of the room each placed piece stands in, by piece id: "From the Loft" on a piece that moves. */
export function placedNames(house: Pick<HouseView, 'rooms'>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const room of house.rooms) {
    const name = housing.rooms.find((k) => k.id === room.kind)?.name ?? 'another room';
    for (const id of Object.values(room.spots)) {
      if (id !== null && names[id] === undefined) names[id] = name;
    }
  }
  return names;
}

export interface HousePlaceProps {
  /** The player's creatures (a bed's housemate is chosen from them). */
  creatures: readonly Creature[];
  /** The server's clock in ms (guestbook times). */
  now: number;
  /** Runs after a payment, a craft or a collect: the game screen reloads its balances. */
  onSpent?: () => void;
  /**
   * The place is the valley's House with housing on: it is drawn as a canvas ("A place is a canvas", `docs/design/ux-patterns.md`):
   * the house is the scene and every panel is a drawer over its edge. Absent (the tab page of the Collection group, with `VALLEY`
   * off): the page as before. `book` draws the Journal or the Stats page for a left drawer; `keepsakes` is the shelf of the valley's
   * keepsakes (null when the player holds none).
   */
  canvas?: {
    book: (page: 'journal' | 'stats') => ComponentChildren;
    keepsakes?: ComponentChildren;
  };
}

/** The left drawer of the canvas: the house's collections and overviews, which belong to no one spot. */
type LeftPanel = {
  kind: 'build' | 'catalogue' | 'visits' | 'journal' | 'stats' | 'keepsakes';
  /** The part whose page is open in Build (a step of the drawer). */
  focus?: string;
  from: Opener | null;
};

/** The right drawer's other contents (a spot's or a skin's choices are the `picker`): a thing of the yard, which opens its own page. */
type SidePanelState = {
  kind: 'mailbox' | 'workbench';
  focus?: string;
  /** The picker this workbench was opened from (a "Make" on a spot): Back goes there. */
  backTo: Picker | null;
  from: Opener | null;
};

/** The catalogue page loads its own view when it opens (about 300 rows, never on the page itself). */
function CatalogueScreen() {
  const api = useHouseApi();
  const loaded = useLoaded(api.fetchCatalogue, []);
  return <CataloguePanel catalogue={loaded.value} failed={loaded.failed} onRetry={loaded.reload} />;
}

export function HousePlace({ creatures, now, onSpent, canvas }: HousePlaceProps) {
  const house = useHouse(true, onSpent);
  const wide = useWide();
  const [view, setView] = useState<View>({ kind: 'home' });
  const [picker, setPicker] = useState<Picker | null>(null);
  // The canvas's drawers (the valley's House): the left holds the collections, the right the thing that was clicked (the picker above,
  // or the yard's mailbox and workbench); each remembers the button that opened it.
  const [left, setLeft] = useState<LeftPanel | null>(null);
  const [side, setSide] = useState<SidePanelState | null>(null);
  const [pickerFrom, setPickerFrom] = useState<Opener | null>(null);
  const memory = useRef<ScrollMemory['current']>(null) as ScrollMemory;
  const api = useHouseApi();
  const list = useLoaded(api.fetchHouses, []);
  // What grew since the player last looked, shown once.
  const [finds, setFinds] = useState<{ id: string; n: number }[] | null>(null);
  const announced = useRef(false);
  // The part that was just built: the house shows it, with its name and a picture, until the player goes on.
  const [moment, setMoment] = useState<string | null>(null);
  const state: OwnHouse | null = house.state;
  useEffect(() => {
    if (state === null || announced.current) return;
    announced.current = true;
    if (!hasFresh(state.own)) return;
    // Only what grew since the last look; the first open says nothing (and still marks everything seen).
    const grown = freshFinds(state.own, state.house.built.length);
    if (grown.length > 0) setFinds(grown);
    house.actions.seen();
  }, [state === null]);

  if (state === null) {
    return house.failed ? (
      <Alert level="alert">
        Could not open your house.{' '}
        <button type="button" onClick={house.reload}>
          Try again
        </button>
      </Alert>
    ) : (
      <p class="muted">Opening the house...</p>
    );
  }
  const { house: view_, own } = state;

  // The part whose page is open in Build: one to build, or one that waits for another (a goal to look at). A part that has just
  // been built has no page: the list shows.
  const buildFocus =
    canvas !== undefined
      ? left?.kind === 'build'
        ? left.focus
        : undefined
      : view.kind === 'drill' && view.drill === 'build'
        ? view.focus
        : undefined;
  const buildOpen =
    housing.parts.some((p) => p.id === buildFocus) && !view_.built.includes(buildFocus ?? '')
      ? buildFocus
      : undefined;
  const drillTitle = (drill: HouseDrill): string =>
    drill === 'build' && buildOpen !== undefined
      ? (housing.parts.find((p) => p.id === buildOpen)?.name ?? DRILL_TITLES.build)
      : DRILL_TITLES[drill];

  const home = (): void => {
    setView({ kind: 'home' });
    setPicker(null);
    // What was opened from the room (a recipe asked for by one of its spots) goes with it; the mailbox and the workbench of the yard stay.
    setSide((now) => (now !== null && now.backTo !== null ? null : now));
  };
  const back = (): void => {
    if (picker !== null) {
      setPicker(null);
      return;
    }
    if (view.kind === 'drill' && view.drill === 'build' && buildOpen !== undefined) {
      setView({ kind: 'drill', drill: 'build', from: view.from });
    } else if (view.kind === 'drill') setView(view.from);
    else if (view.kind === 'visit') {
      list.reload();
      setView({ kind: 'drill', drill: 'visits', from: { kind: 'home' } });
    } else home();
  };
  const open = (drill: HouseDrill): void => {
    setMoment(null);
    if (drill === 'visits') list.reload();
    setView({ kind: 'drill', drill, from: view });
  };
  const make = (itemId: string): void => {
    if (canvas !== undefined) {
      // The recipe opens in the same drawer, a step whose Back returns to the spot or the look that asked for it.
      setSide({ kind: 'workbench', focus: itemId, backTo: picker, from: pickerFrom });
      setPicker(null);
      return;
    }
    setPicker(null);
    setView({ kind: 'drill', drill: 'workbench', focus: itemId, from: view });
  };

  const pay = (partId: string, offer: HousePay): void => {
    void house.actions.build(partId, offer).then((done) => {
      if (done === false || !done.built) return;
      // The part is built: leave its page, go back to the house and show the new rooms.
      setPicker(null);
      setLeft(null);
      setView({ kind: 'home' });
      setMoment(partId);
    });
  };
  const mailLabel =
    own.mailbox.gifts === 0
      ? 'Mailbox'
      : `Mailbox, ${String(own.mailbox.gifts)} ${own.mailbox.gifts === 1 ? 'gift' : 'gifts'} waiting`;

  // The panel of a drill-in page.
  const drillBody = (drill: HouseDrill, focus: string | undefined): ComponentChildren => {
    switch (drill) {
      case 'build':
        return (
          <BuildPanel
            house={view_}
            own={own}
            busy={house.busy}
            error={house.error}
            onPay={pay}
            open={buildOpen ?? null}
            onOpen={(partId) => {
              if (canvas !== undefined) {
                setLeft((now) =>
                  now?.kind !== 'build'
                    ? now
                    : partId === null
                      ? { kind: 'build', from: now.from }
                      : { kind: 'build', focus: partId, from: now.from },
                );
                return;
              }
              if (view.kind !== 'drill' || view.drill !== 'build') return;
              setView(
                partId === null
                  ? { kind: 'drill', drill: 'build', from: view.from }
                  : { kind: 'drill', drill: 'build', focus: partId, from: view.from },
              );
            }}
            renderPreview={(partId, size) => (
              <PartPreview house={view_} partId={partId} size={size} />
            )}
          />
        );
      case 'workbench':
        return (
          <WorkbenchPanel
            own={own}
            busy={house.busy}
            error={house.error}
            {...(focus === undefined ? {} : { focus })}
            onCraft={(id) => {
              void house.actions.craft(id);
            }}
          />
        );
      case 'catalogue':
        return <CatalogueScreen />;
      case 'mailbox':
        return (
          <MailboxPanel
            mailbox={own.mailbox}
            busy={house.busy}
            onCollect={() => house.actions.collect()}
          />
        );
      case 'visits':
        return (
          <VisitList
            list={list.value}
            failed={list.failed}
            onRetry={list.reload}
            onOpen={(userId) => {
              setView({ kind: 'visit', userId });
            }}
          />
        );
    }
  };

  // The picker of a spot or a skin.
  const pickerBody = (
    p: Picker,
  ): { title: string; hidden: boolean; body: ComponentChildren } | null => {
    if (p.kind === 'spot') {
      const room = view_.rooms.find((r) => r.id === p.roomId);
      if (room === undefined) return null;
      const spot = housing.rooms
        .find((k) => k.id === room.kind)
        ?.spots.find((s) => s.id === p.spotId);
      return {
        // The spot's name is spoken, not shown: the tiles under it say what goes there.
        title: spot === undefined ? 'Spot' : SPOT_NAMES[spot.type],
        hidden: true,
        body: (
          <SpotPicker
            room={room}
            spotId={p.spotId}
            own={own}
            housemates={view_.housemates}
            creatures={creatures}
            placedIn={placedNames(view_)}
            busy={house.busy}
            onPlace={(pieceId) => {
              // A piece with no free copy is taken from the spot it stands in, then placed here: one action.
              const from =
                pieceId === null || (own.free[pieceId] ?? 0) > 0 ? null : standsAt(view_, pieceId);
              const done =
                pieceId !== null && from !== null
                  ? house.actions.move(from, { roomId: p.roomId, spotId: p.spotId }, pieceId)
                  : house.actions.place(p.roomId, p.spotId, pieceId);
              void done.then((ok) => {
                if (ok) setPicker(null);
              });
            }}
            onHousemate={(creatureId) => {
              void house.actions.housemate(p.roomId, p.spotId, creatureId);
            }}
            onMake={make}
          />
        ),
      };
    }
    const room = p.roomId === null ? undefined : view_.rooms.find((r) => r.id === p.roomId);
    const current = currentLook(view_, room, p.skin);
    if (current === undefined) return null;
    return {
      title: SKIN_KIND_NAMES[p.skin],
      hidden: false,
      body: (
        <SkinPicker
          kind={p.skin}
          current={current}
          room={room === undefined ? null : { kind: room.kind, built: view_.built }}
          own={own}
          busy={house.busy}
          onPick={(value) => {
            const body = skinBody(p.skin, p.roomId, value);
            if (body === null) return;
            void house.actions.skin(body).then((ok) => {
              if (ok) setPicker(null);
            });
          }}
          onMake={make}
        />
      ),
    };
  };

  if (view.kind === 'visit') {
    const entry = list.value?.houses.find((h) => h.userId === view.userId);
    return (
      <VisitHouse
        userId={view.userId}
        name={entry?.name ?? 'A friend'}
        today={entry?.today ?? { gifted: false, stamped: false }}
        giftLeft={list.value?.me.giftLeft ?? true}
        ownedStamps={own.items.stamps}
        now={now}
        onBack={back}
        onToday={() => {
          list.reload();
        }}
        {...(canvas === undefined ? {} : { canvas: true })}
      />
    );
  }

  const drillView = view.kind === 'drill' ? view : null;
  // The room on screen: the focused one, or the one a page opened from it (the workbench from a spot) came from.
  const roomId =
    view.kind === 'room'
      ? view.roomId
      : drillView !== null && drillView.from.kind === 'room'
        ? drillView.from.roomId
        : null;
  const pickerPage = picker === null ? null : pickerBody(picker);
  // The Build and Workbench panels show the error themselves, next to what was tapped: one alert, not two.
  const panelShowsError =
    drillView !== null && (drillView.drill === 'build' || drillView.drill === 'workbench');
  const alert = house.error !== null && !panelShowsError && (
    <Alert level="alert" onDismiss={house.clearError}>
      {house.error}
    </Alert>
  );

  // The rooms of the part that was just built.
  const builtRooms =
    moment === null
      ? []
      : (housing.parts.find((p) => p.id === moment)?.rooms ?? []).map((r) => `${moment}:${r.key}`);
  const scene = (
    <>
      <HouseScene
        house={view_}
        mode="own"
        mailboxLabel={mailLabel}
        mailWaiting={own.mailbox.gifts > 0}
        memory={memory}
        focusRoom={builtRooms[0] ?? null}
        reveal={builtRooms}
        onRoom={(id) => {
          setMoment(null);
          setView({ kind: 'room', roomId: id });
        }}
        onFixture={(kind) => {
          open(kind === 'mailbox' ? 'mailbox' : 'workbench');
        }}
      />
      <div class="house-chips" data-chips="3">
        {(['roof', 'walls', 'frame'] as const).map((layer) => (
          <SkinTrigger
            key={layer}
            kind={layer}
            id={view_.exterior[layer]}
            onOpen={() => {
              setPicker({ kind: 'skin', skin: layer, roomId: null });
            }}
          />
        ))}
      </div>
    </>
  );

  const houseHome = (
    <div class="house-home">
      {moment !== null && (
        <Alert
          level="success"
          layout="stacked"
          title={`The ${housing.parts.find((p) => p.id === moment)?.name ?? 'part'} is built`}
          onDismiss={() => {
            setMoment(null);
          }}
        >
          <HousePostcard house={view_} maxWidth={180} label="Your house" />
        </Alert>
      )}
      {scene}
      {finds !== null && (
        <CountBadgeList
          class="house-finds"
          label="Since you last looked"
          items={finds.map((f) => ({
            ...resourceCount(f.id, f.n),
            amount: `+${String(f.n)}`,
            spokenAmount: `${String(f.n)} new`,
          }))}
        />
      )}
      <HouseRows
        house={view_}
        own={own}
        houses={list.value === null ? null : list.value.houses.length}
        onOpen={open}
      />
      {view_.guestbook.length > 0 && <Guestbook entries={view_.guestbook} now={now} />}
    </div>
  );
  const focus =
    roomId === null ? null : (
      <RoomFocus
        house={view_}
        roomId={roomId}
        mode="own"
        selectedSpot={picker?.kind === 'spot' ? picker.spotId : null}
        onSpot={(spotId) => {
          setPicker({ kind: 'spot', roomId, spotId });
        }}
        onSkin={(skin) => {
          setPicker({ kind: 'skin', skin, roomId });
        }}
      />
    );

  const roomTitle =
    roomId === null
      ? ''
      : (housing.rooms.find((k) => k.id === view_.rooms.find((r) => r.id === roomId)?.kind)?.name ??
        'Room');
  const roomHead =
    roomId !== null && view.kind === 'room' ? (
      <DrillHead title={roomTitle} backLabel="to your house" onBack={home} scroll focus />
    ) : null;

  // The valley's House with housing on: the house is the scene, every panel a drawer over its edge (`valley/PlaceCanvas`).
  if (canvas !== undefined) {
    const lines = houseRowLines(view_, own, list.value === null ? null : list.value.houses.length);
    const askPicker = (p: Picker, opener: Opener | null): void => {
      setSide(null);
      setPickerFrom(opener);
      setPicker(p);
    };
    const openSide = (kind: SidePanelState['kind'], opener: Opener): void => {
      setMoment(null);
      setPicker(null);
      setSide({ kind, backTo: null, from: opener });
    };
    const openLeft = (kind: LeftPanel['kind'], opener: Opener): void => {
      setMoment(null);
      if (kind === 'visits') list.reload();
      setLeft({ kind, from: opener });
    };
    const closeLeft = (): void => {
      setLeft(null);
    };

    // The left drawer: the house's collections and overviews, which belong to no one spot.
    let leftPanel: CanvasPanel | null = null;
    if (left !== null) {
      const base = { returnFocusTo: left.from, onClose: closeLeft };
      if (left.kind === 'build') {
        const part = buildOpen === undefined ? null : housing.parts.find((p) => p.id === buildOpen);
        const body = drillBody('build', left.focus);
        leftPanel = {
          ...base,
          title: DRILL_TITLES.build,
          ...(part === null || part === undefined
            ? { children: <PanelBody>{body}</PanelBody> }
            : {
                wizard: true,
                backLabel: 'to the parts',
                children: (
                  <StepBody
                    title={part.name}
                    backLabel="to the parts"
                    onBack={() => {
                      setLeft({ kind: 'build', from: left.from });
                    }}
                    focusBack
                  >
                    {body}
                  </StepBody>
                ),
              }),
        };
      } else if (left.kind === 'catalogue' || left.kind === 'visits') {
        leftPanel = {
          ...base,
          title: DRILL_TITLES[left.kind],
          children: <PanelBody>{drillBody(left.kind, undefined)}</PanelBody>,
        };
      } else if (left.kind === 'keepsakes') {
        leftPanel = {
          ...base,
          title: 'Keepsakes',
          children: <PanelBody>{canvas.keepsakes}</PanelBody>,
        };
      } else {
        leftPanel = {
          ...base,
          title: left.kind === 'journal' ? 'Journal' : 'Stats',
          children: <PanelBody>{canvas.book(left.kind)}</PanelBody>,
        };
      }
    }

    // The right drawer: the one thing that was clicked (a spot or a look, the mailbox, the workbench).
    let rightPanel: CanvasPanel | null = null;
    if (side !== null) {
      const closeSide = (): void => {
        setSide(null);
      };
      if (side.kind === 'mailbox') {
        rightPanel = {
          title: 'Mailbox',
          returnFocusTo: side.from,
          onClose: closeSide,
          children: (
            <PanelBody>
              {drillBody('mailbox', undefined)}
              {view_.guestbook.length > 0 && <Guestbook entries={view_.guestbook} now={now} />}
            </PanelBody>
          ),
        };
      } else {
        const bench = drillBody('workbench', side.focus);
        rightPanel = {
          title: 'Workbench',
          returnFocusTo: side.from,
          onClose: closeSide,
          ...(side.backTo === null
            ? { children: <PanelBody>{bench}</PanelBody> }
            : {
                wizard: true,
                backLabel: 'to the choices',
                keepBack: true,
                children: (
                  <StepBody
                    title="Workbench"
                    backLabel="to the choices"
                    onBack={() => {
                      setPicker(side.backTo);
                      setPickerFrom(side.from);
                      setSide(null);
                    }}
                    focusBack
                  >
                    {bench}
                  </StepBody>
                ),
              }),
        };
      }
    } else if (pickerPage !== null) {
      rightPanel = {
        title: pickerPage.title,
        returnFocusTo: pickerFrom,
        onClose: () => {
          setPicker(null);
        },
        children: <PanelBody>{pickerPage.body}</PanelBody>,
      };
    }

    const tools: {
      kind: LeftPanel['kind'];
      name: string;
      glyph: string;
      line: string;
    }[] = [
      { kind: 'build', name: 'Build', glyph: 'home', line: lines.build },
      { kind: 'catalogue', name: 'Catalogue', glyph: 'gem', line: lines.catalogue },
      { kind: 'visits', name: 'Visit', glyph: 'door', line: lines.visits },
      { kind: 'journal', name: 'Journal', glyph: 'journal', line: 'your finds and firsts' },
      { kind: 'stats', name: 'Stats', glyph: 'stats', line: 'your numbers' },
      ...(canvas.keepsakes === undefined || canvas.keepsakes === null
        ? []
        : [{ kind: 'keepsakes' as const, name: 'Keepsakes', glyph: 'gift', line: 'thanks kept' }]),
    ];
    // Build and Workbench show a refusal themselves, next to what was tapped: one alert, not two.
    const showError = house.error !== null && left?.kind !== 'build' && side?.kind !== 'workbench';
    const inRoom = view.kind === 'room' && roomId !== null;
    // In the flow under the scene, never over it (a room's head must stay readable). What a part just built or what grew is for the
    // cutaway only.
    const showMoment = moment !== null && !inRoom;
    const showFinds = finds !== null && !inRoom;
    const notes = (showMoment || showFinds || showError) && (
      <div class="hc-notes">
        {showMoment && (
          <Alert
            level="success"
            onDismiss={() => {
              setMoment(null);
            }}
          >
            {`The ${housing.parts.find((p) => p.id === moment)?.name ?? 'part'} is built`}
          </Alert>
        )}
        {showError && (
          <Alert level="alert" onDismiss={house.clearError}>
            {house.error}
          </Alert>
        )}
        {showFinds && (
          <CountBadgeList
            class="house-finds"
            label="Since you last looked"
            items={finds.map((f) => ({
              ...resourceCount(f.id, f.n),
              amount: `+${String(f.n)}`,
              spokenAmount: `${String(f.n)} new`,
            }))}
          />
        )}
      </div>
    );
    const toolsOverlay = (
      <div class="pc-tools" role="group" aria-label="The house" data-no-pan="yes">
        {tools.map((t) => (
          <button
            key={t.kind}
            type="button"
            class="vy-hatch pc-tool"
            aria-label={`${t.name}, ${t.line}`}
            aria-expanded={left?.kind === t.kind}
            onClick={(event) => {
              openLeft(t.kind, openerOf(event.currentTarget));
            }}
          >
            <Glyph id={t.glyph} scale={2} />
            <ToolCue name={t.name} />
          </button>
        ))}
      </div>
    );
    const stage = (
      <div class="hc-stage" {...(inRoom ? { onKeyDown: onDrillKey(home) } : {})}>
        {inRoom ? (
          <>
            <DrillHead title={roomTitle} backLabel="to your house" onBack={home} scroll focus />
            <RoomFocus
              house={view_}
              roomId={roomId}
              mode="own"
              canvas
              selectedSpot={picker?.kind === 'spot' ? picker.spotId : null}
              onSpot={(spotId, opener) => {
                askPicker({ kind: 'spot', roomId, spotId }, opener);
              }}
              onSkin={(skin, opener) => {
                askPicker({ kind: 'skin', skin, roomId }, opener);
              }}
            />
          </>
        ) : (
          <>
            <HouseScene
              house={view_}
              mode="own"
              canvas
              mailboxLabel={mailLabel}
              mailWaiting={own.mailbox.gifts > 0}
              memory={memory}
              focusRoom={builtRooms[0] ?? null}
              reveal={builtRooms}
              onRoom={(id) => {
                setMoment(null);
                setView({ kind: 'room', roomId: id });
              }}
              onFixture={(kind, opener) => {
                openSide(kind === 'mailbox' ? 'mailbox' : 'workbench', opener);
              }}
            />
          </>
        )}
      </div>
    );
    return (
      <section class="house-place hc-root" aria-label="Your house">
        <PlaceCanvas
          label="Your house"
          scene={stage}
          below={
            <>
              {notes}
              {inRoom ? (
                <div class="hc-chips">
                  <RoomChips
                    house={view_}
                    roomId={roomId}
                    onSkin={(skin, opener) => {
                      askPicker({ kind: 'skin', skin, roomId }, opener);
                    }}
                  />
                </div>
              ) : (
                <div class="house-chips hc-chips" data-chips="3">
                  {(['roof', 'walls', 'frame'] as const).map((layer) => (
                    <SkinTrigger
                      key={layer}
                      kind={layer}
                      id={view_.exterior[layer]}
                      onOpen={(opener) => {
                        askPicker({ kind: 'skin', skin: layer, roomId: null }, opener);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          }
          overlay={inRoom ? null : toolsOverlay}
          left={leftPanel}
          right={rightPanel}
        />
      </section>
    );
  }

  // A wide window: the scene (or the room) stays in the main area, the panel of the page or the picker beside it.
  if (wide) {
    const side =
      pickerPage !== null ? (
        <SidePanel
          title={pickerPage.title}
          titleId="house-panel-title"
          titleHidden={pickerPage.hidden}
          onClose={() => {
            setPicker(null);
          }}
        >
          {pickerPage.body}
        </SidePanel>
      ) : drillView !== null ? (
        <SidePanel title={drillTitle(drillView.drill)} titleId="house-panel-title" onClose={back}>
          {drillBody(drillView.drill, drillView.focus)}
        </SidePanel>
      ) : null;
    return (
      <section class="house-place" aria-label="Your house" onKeyDown={onDrillKey(back)}>
        <WideLayout
          wide
          main={
            <>
              {roomHead}
              {alert}
              {focus ?? houseHome}
            </>
          }
          panel={side}
        />
      </section>
    );
  }

  // A phone: a page opened from the house, or the house; a spot's choices in a drawer.
  return (
    <section
      class="house-place"
      aria-label="Your house"
      {...(view.kind === 'home' ? {} : { onKeyDown: onDrillKey(back) })}
    >
      {drillView !== null ? (
        <>
          <DrillHead
            title={drillTitle(drillView.drill)}
            backLabel={buildOpen === undefined ? 'to your house' : 'to the parts'}
            onBack={back}
            scroll
            focus
          />
          {alert}
          {drillBody(drillView.drill, drillView.focus)}
        </>
      ) : (
        <>
          {roomHead}
          {alert}
          {focus ?? houseHome}
        </>
      )}
      <Drawer
        open={pickerPage !== null}
        title={pickerPage?.title ?? 'Choose'}
        titleHidden={pickerPage?.hidden}
        onClose={() => {
          setPicker(null);
        }}
      >
        {pickerPage?.body}
      </Drawer>
    </section>
  );
}
