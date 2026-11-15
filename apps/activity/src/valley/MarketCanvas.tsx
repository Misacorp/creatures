/**
 * The Market as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`): the shard stall in its meadow fills the view and
 * everything is done by clicking something in it. Nothing scrolls. The place opens straight on this scene (no page under it); the
 * HUD's back leaves for the valley.
 *
 * What the Market is for is trading shards, so the scene is the stall and the broker. The stall (plate "Exchange") opens the shard
 * exchange in the right drawer; the broker stands in front of it (a tap opens the broker: what it does, its rates, who trades and what
 * it trades toward) or, with nobody posted, its seat is a dashed outline that opens the creature list. Before the Market is built there
 * is no stall to use: the whole place is a building site, the stall's frame rising in scaffolding as the project fills, and the
 * builders' corner (`builders-corner.ts`) beside it. The table opens the project board (left drawer); the helper's seat beside it (a
 * dashed outline while empty) picks who helps build (right drawer). Once the stall is built the corner goes with the last level (it
 * stays while a project is still open and while a helper is posted, so that helper is never out of sight).
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked (the stall, the
 * broker, the helper's seat), the left for the collection that belongs to no one spot (the project board). A phone shows the open
 * panel as its own page. The scene keeps one size and place for the whole visit; drawers lie over its edges.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { sayText } from '../resource-count';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { Exchange } from './Exchange';
import {
  BrokerPanel,
  MarketHelperPanel,
  type BrokerStep,
  type MarketActions,
  type MarketHelperPost,
} from './MarketPanels';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { PLATES_Z } from './PlaceScene';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { At, CreatureSprite, Pic } from './parts';
import { FLAG_AT, HELPER_AT, TABLE_BOX, pileMaterial, pileSize } from './builders-corner';
import { cornerSprite } from './builders-corner-art';
import { commonsOf, percentFilled, placeOf } from './commons-view';
import {
  BROKER_AT,
  STALL_BOX,
  STALL_PLATE_AT,
  marketLayout,
  marketScale,
  marketSceneDraw,
} from './market-canvas';
import { brokerLine, brokerOf, marketState } from './market-view';
import { CREATURE_PX } from './place-cast';
import { SCAFFOLD_STEPS, scaffoldSteps } from './scaffold';
import { depthOf } from './valley-logic';

export type { MarketActions } from './MarketPanels';

/** What the canvas can open at the start (the workbench and the tests show each). */
export interface MarketStart {
  /** The broker's list of creatures. */
  picker?: boolean;
  /** The broker's choices of what to trade toward. */
  toward?: boolean;
  /** The broker's first step (its rates and next step). */
  detail?: boolean;
  /** The exchange starts open, on this element when given (a smith's wait leads here). */
  exchange?: boolean | string;
  /** The project board's step to open (the commons), the board in the left drawer. */
  commons?: CommonsStart;
}

/** The right drawer: the one thing that was clicked. */
type Right =
  | { kind: 'stall'; from: Opener | null }
  | { kind: 'broker'; from: Opener | null; step: BrokerStep }
  | { kind: 'helper'; from: Opener | null };

/** The left drawer: the project board. */
interface Left {
  from: Opener | null;
}

export function MarketCanvas({
  visit,
  creatures,
  acorns = 0,
  busy = false,
  error = null,
  actions,
  commons,
  start = {},
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  /** The player's Acorns (the `bait` balance). */
  acorns?: number;
  busy?: boolean;
  /** The server's last error: the notice line is behind a drawer, so the exchange shows it itself. */
  error?: string | null;
  actions: MarketActions;
  /** The Market's project board while it is built (and its helper seat); absent leaves the stall with no project. */
  commons?: CommonsActions | undefined;
  start?: MarketStart;
}) {
  const state = marketState(visit);
  const built = state === 'built';
  const seat = brokerOf(visit);
  // The shard an anvil waits for: the exchange starts on it (the one-tap fix).
  const wanted =
    visit.anvils.find((anvil) => anvil.tinkering?.reason === 'shard')?.tinkering?.shardElement ??
    null;
  const [right, setRight] = useState<Right | null>(() => {
    if (start.exchange !== undefined && start.exchange !== false && built) {
      return { kind: 'stall', from: null };
    }
    if (built && seat !== null) {
      if (start.picker === true) return { kind: 'broker', from: null, step: 'who' };
      if (start.toward === true) return { kind: 'broker', from: null, step: 'toward' };
      if (start.detail === true) return { kind: 'broker', from: null, step: 'broker' };
    }
    return null;
  });
  const [left, setLeft] = useState<Left | null>(() =>
    start.commons?.view !== undefined ? { from: null } : null,
  );

  const block = commonsOf(visit);
  const place = placeOf(block, 'market');
  // The scaffolding rises on the stall as the project fills (V-COM-6); while the server builds it (its days run) the frame stands whole.
  const steps =
    place?.state === 'open' && place.level < place.max
      ? scaffoldSteps(percentFilled(place) / 100)
      : !built && place?.state === 'building'
        ? Math.min(SCAFFOLD_STEPS - 1, scaffoldSteps(1))
        : 0;
  const helperId = block?.communal.find((c) => c.place === 'market')?.creatureId ?? null;
  const helper = helperId === null ? undefined : creatures.find((c) => c.id === helperId);
  const post: MarketHelperPost | undefined =
    commons === undefined || place === undefined
      ? undefined
      : { creatureId: helper?.id ?? null, actions: commons };
  // The builders' corner stands while a project is being built (open for gifts, or building its days) below the top level, and while
  // a helper is posted whatever the level, so that helper is never out of sight.
  const building =
    place !== undefined &&
    (((place.state === 'open' || place.state === 'building') && place.level < place.max) ||
      helperId !== null);
  const corner = post !== undefined && building;
  const material = pileMaterial(place?.level ?? 1);
  const size = pileSize(place === undefined ? 0 : percentFilled(place));
  const draw = useMemo(
    () => marketSceneDraw(steps, corner ? { material, size } : null),
    [steps, corner, material, size],
  );
  const broker = creatures.find((c) => c.id === seat?.creatureId);

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (left !== null) setLeft(null);
  };

  // --- The drawers' panels ---

  const closeRight = (): void => {
    setRight(null);
  };
  let rightPanel: CanvasPanel | null = null;
  if (right?.kind === 'stall' && built) {
    rightPanel = {
      title: 'The shard stall',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the Market',
      onClose: closeRight,
      children: (
        <Exchange
          visit={visit}
          busy={busy}
          error={error}
          initial={typeof start.exchange === 'string' ? start.exchange : wanted}
          onClose={closeRight}
          onTrade={(request) => {
            void actions.exchange(request).then((ok) => {
              if (ok) setRight(null);
            });
          }}
        />
      ),
    };
  } else if (right?.kind === 'broker' && seat !== null) {
    rightPanel = {
      title: 'The broker',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the Market',
      onClose: closeRight,
      children: (
        <BrokerPanel
          key={seat.creatureId ?? 'free'}
          visit={visit}
          creatures={creatures}
          seat={seat}
          busy={busy}
          actions={actions}
          initial={right.step}
          onClose={closeRight}
        />
      ),
    };
  } else if (right?.kind === 'helper' && post !== undefined) {
    rightPanel = {
      title: 'The Market',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the Market',
      onClose: closeRight,
      children: (
        <MarketHelperPanel visit={visit} creatures={creatures} helper={post} onClose={closeRight} />
      ),
    };
  }

  let leftPanel: CanvasPanel | null = null;
  if (left !== null && commons !== undefined) {
    leftPanel = {
      title: 'Project board',
      returnFocusTo: left.from,
      onClose: () => {
        setLeft(null);
      },
      children: (
        <PanelBody>
          <div class="fc-hub">
            <CommonsBoard
              place="market"
              host="panel"
              visit={visit}
              creatures={creatures}
              acorns={acorns}
              busy={busy}
              actions={commons}
              {...(start.commons?.view === undefined
                ? {}
                : {
                    start: {
                      view: start.commons.view,
                      ...(start.commons.row === undefined ? {} : { row: start.commons.row }),
                    },
                  })}
            />
          </div>
        </PanelBody>
      ),
    };
  }

  // --- The scene ---

  const scene = (
    <SceneFrame
      key="market"
      id="market"
      label="Market"
      draw={draw}
      onLeave={closeTop}
      scaleFor={(width, height) => marketScale(width, height, corner)}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, marketScale(390, 640, corner));
        const lay = marketLayout(g, corner);
        return (
          <MarketInside
            g={g}
            built={built}
            stall={{ x: lay.box.x, y: lay.box.y }}
            broker={broker}
            seat={seat}
            helper={helper}
            corner={lay.corner}
            open={{
              board: left !== null,
              stall: right?.kind === 'stall',
              broker: right?.kind === 'broker',
              helper: right?.kind === 'helper',
            }}
            busy={busy}
            onStall={(opener) => {
              setRight({ kind: 'stall', from: opener });
            }}
            onBroker={(opener) => {
              setRight({ kind: 'broker', from: opener, step: 'broker' });
            }}
            onHelper={(opener) => {
              setRight({ kind: 'helper', from: opener });
            }}
            onBoard={(opener) => {
              setLeft({ from: opener });
            }}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <div class="mc-root">
      <PlaceCanvas label="Market" scene={scene} left={leftPanel} right={rightPanel} />
      {broker !== undefined && seat !== null && (
        <p class="visually-hidden" role="status">
          {sayText(brokerLine(seat))}
        </p>
      )}
    </div>
  );
}

/** What stands in the scene over its canvas: the stall, the broker, the corner, each real button a `CanvasTarget`. */
function MarketInside({
  g,
  built,
  stall,
  broker,
  seat,
  helper,
  corner,
  open,
  busy,
  onStall,
  onBroker,
  onHelper,
  onBoard,
}: {
  g: SceneGeometry;
  /** The stall is built (its exchange and its broker's seat are there). */
  built: boolean;
  /** The stall's art top-left in scene pixels. */
  stall: { x: number; y: number };
  broker: Creature | undefined;
  /** The broker's seat once the Market is built (null before). */
  seat: ReturnType<typeof brokerOf>;
  helper: Creature | undefined;
  /** The builders' corner's top-left (scene pixels), or null when the Market has no project being built. */
  corner: { x: number; y: number } | null;
  open: { board: boolean; stall: boolean; broker: boolean; helper: boolean };
  busy: boolean;
  onStall: (opener: Opener) => void;
  onBroker: (opener: Opener) => void;
  onHelper: (opener: Opener) => void;
  onBoard: (opener: Opener) => void;
}) {
  const brokerAt = { x: stall.x + BROKER_AT.x, y: stall.y + BROKER_AT.y };
  const helperAt =
    corner === null ? null : { x: corner.x + HELPER_AT.x, y: corner.y + HELPER_AT.y };
  const showSeat = built && seat !== null;
  return (
    <>
      {/* The people, then the targets over them: a plate is the one cue that a thing can be clicked. */}
      {broker !== undefined && showSeat && (
        <At
          x={g.X(brokerAt.x)}
          y={g.Y(brokerAt.y)}
          class="vy-stand"
          z={depthOf(brokerAt.x, brokerAt.y)}
        >
          <CreatureSprite creature={broker} scale={g.s} idle={broker.id} />
        </At>
      )}
      {/* The helper works at the table, facing it: the Forge's hammer-fall. */}
      {helper !== undefined && helperAt !== null && (
        <At
          x={g.X(helperAt.x)}
          y={g.Y(helperAt.y)}
          class="vy-stand"
          z={depthOf(helperAt.x, helperAt.y)}
        >
          <CreatureSprite creature={helper} scale={g.s} flip class="fi-hammer fi-d1" />
        </At>
      )}
      {/* The empty spot's flag: a piece of the scene's art, no tap of its own (the dashed outline over it is the target). */}
      {corner !== null && helper === undefined && (
        <At x={g.X(corner.x + FLAG_AT.x)} y={g.Y(corner.y + FLAG_AT.y)}>
          <Pic sprite={cornerSprite('help-flag')} scale={g.s} />
        </At>
      )}
      {built && (
        <CanvasTarget
          g={g}
          x={stall.x + STALL_BOX.x}
          y={stall.y + STALL_BOX.y}
          w={STALL_BOX.w}
          h={STALL_BOX.h}
          label="The shard stall. Open the exchange"
          plate="Exchange"
          plateAt={STALL_PLATE_AT}
          expanded={open.stall}
          onClick={onStall}
        />
      )}
      {corner !== null && (
        <CanvasTarget
          g={g}
          x={corner.x + TABLE_BOX.x}
          y={corner.y + TABLE_BOX.y}
          w={TABLE_BOX.w}
          h={TABLE_BOX.h}
          label={`The builders' table, ${built ? 'the Market is being added to' : 'the Market is being built'}. Open the project board`}
          plate="Project"
          plateAt={TABLE_BOX.h + 1}
          expanded={open.board}
          onClick={onBoard}
        />
      )}
      {showSeat && (
        <CanvasTarget
          g={g}
          x={brokerAt.x}
          y={brokerAt.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(brokerAt.x, brokerAt.y)}
          slot={broker === undefined}
          label={
            broker === undefined
              ? 'The broker seat: nobody trades here. Choose a creature'
              : `${creatureName(broker)}, level ${String(broker.level)}, the broker. ${sayText(brokerLine(seat))} Open the broker`
          }
          plate={broker === undefined ? 'Broker' : creatureName(broker)}
          {...(broker === undefined ? {} : { plateMeta: { level: broker.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.broker}
          disabled={busy}
          onClick={onBroker}
        />
      )}
      {helperAt !== null && (
        <CanvasTarget
          g={g}
          x={helperAt.x}
          y={helperAt.y}
          w={CREATURE_PX}
          h={CREATURE_PX}
          z={PLATES_Z + depthOf(helperAt.x, helperAt.y)}
          slot={helper === undefined}
          label={
            helper === undefined
              ? "The helper spot at the builders' table: nobody helps build. Choose a creature"
              : `${creatureName(helper)}, level ${String(helper.level)}, helping build the Market at the builders' table. Change`
          }
          plate={helper === undefined ? 'Helper' : creatureName(helper)}
          {...(helper === undefined ? {} : { plateMeta: { level: helper.level } })}
          plateAt={CREATURE_PX + 1}
          expanded={open.helper}
          disabled={busy}
          onClick={onHelper}
        />
      )}
    </>
  );
}
