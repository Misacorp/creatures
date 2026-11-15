/**
 * The visitor's stall as a canvas (the rule is "A place is a canvas" in `ux-patterns.md`): his stall in its meadow fills the view and
 * everything is done by clicking something in it. Nothing scrolls. The place opens straight on this scene (no page under it); the HUD's
 * back leaves for the valley. He has no building project, so there is no builders' corner: the scene is what the place is for.
 *
 * While he is here (Thursday to the end of Sunday) there are two things to click, each with its plate: the visitor himself, who opens the
 * reroll in the right drawer (pick a piece, the odds and one confirm, then the card before and after), and the week's blueprint on his
 * counter, which opens its purchase in the right drawer. The item picker is the reroll's first step; the item card is a step of the same
 * panel, or in the left drawer on a wide window (as the Forge's bag card). While he is away
 * the shuttered stall shows, and its sign (the one thing to click, plate "Back Thursday") says he is back Thursday; there is no timer.
 *
 * What a click opens follows the side rule (`PlaceCanvas`): the right drawer is for the one thing that was clicked; the left holds the
 * item card of the reroll only on a wide window. A phone shows the open panel as its own page. The creature tray stays under the scene,
 * as at the other places. Every spend is the game's, and the server decides.
 */
import { useMemo, useState } from 'preact/hooks';
import type { Creature } from '../api';
import type { GearItem } from '../gear-types';
import { gearName } from '../gear-view';
import { useWide } from '../ui/wide-layout';
import { CanvasTarget, PanelBody, PlaceCanvas, type CanvasPanel, type Opener } from './PlaceCanvas';
import { SceneFrame, sceneGeometry, type SceneGeometry } from './SceneFrame';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import {
  BlueprintPanel,
  RerollPanel,
  SignPanel,
  type BlueprintDone,
  type PieceCard,
  type VisitorActions,
  type VisitorStart,
} from './VisitorPanels';
import {
  BLUEPRINT_BOX,
  SIGN_BOX,
  VISITOR_BOX,
  visitorBox,
  visitorScale,
  visitorSceneDraw,
} from './visitor-canvas';
import { AWAY_LINE, isHere, type Purse } from './visitor-view';
import type { VisitorState } from '../api';

/** The art row (scene pixels from the stall's top) the plates sit on: just under the stall's feet. */
const PLATE_ROW = 42;

/** The right drawer: the one thing that was clicked. */
type Right = { kind: 'reroll' | 'blueprint' | 'sign'; piece?: string; from: Opener | null };

export function VisitorCanvas({
  view,
  creatures,
  trayInput,
  items,
  blueprints,
  purse,
  busy = false,
  error = null,
  actions,
  start = {},
  onOpenPaddock,
}: {
  /** What the server said of him: here (his stock is shown) or away. */
  view: VisitorState;
  /** The player's creatures, for the tray under the scene. */
  creatures: readonly Creature[];
  trayInput: TrayInput;
  /** The bag, worn pieces included; null while the gear view loads. */
  items: readonly GearItem[] | null;
  /** The blueprints the player knows, with their marks (null while the gear view loads). */
  blueprints: readonly { baseId: string; marks: number }[] | null;
  /** What the player holds: Acorns, scrap and shards of every element together. */
  purse: Purse;
  busy?: boolean;
  /** The server's last error, shown inside a drawer (the notice line is behind it). */
  error?: string | null;
  actions: VisitorActions;
  /** What is open at the start (the workbench and the tests show each). */
  start?: VisitorStart;
  /** The tray's creatures open the Paddock. */
  onOpenPaddock: () => void;
}) {
  const here = isHere(view);
  const wide = useWide();
  // Misa's pick (2026-11-15), as the Forge's bag card: on a wide window the card opens in the OTHER drawer; a phone shows one page.
  const beside = wide;
  const [right, setRight] = useState<Right | null>(() =>
    !here
      ? null
      : start.reroll !== undefined && start.reroll !== false
        ? {
            kind: 'reroll',
            ...(typeof start.reroll === 'string' ? { piece: start.reroll } : {}),
            from: null,
          }
        : start.blueprint === true
          ? { kind: 'blueprint', from: null }
          : null,
  );
  // The reroll's item card, when it opens in the left drawer (the panel says which; null: none open).
  const [card, setCard] = useState<PieceCard | null>(null);
  const [bought, setBought] = useState<BlueprintDone | null>(null);

  // The blueprint lies on the counter only while it is for sale: not once bought (here or on the server), not while he is away.
  const forSale = here && !view.blueprint.bought && bought === null;
  const draw = useMemo(() => visitorSceneDraw(here, forSale), [here, forSale]);
  const ordered = trayFor(creatures, trayInput);

  const closeTop = (): void => {
    if (right !== null) setRight(null);
    else if (card !== null) setCard(null);
  };

  // --- The drawers' panels ---

  const leave = (): void => {
    setRight(null);
  };
  let rightPanel: CanvasPanel | null = null;
  if (right !== null && here && right.kind === 'reroll') {
    rightPanel = {
      title: 'Reroll a piece',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the stall',
      onClose: leave,
      children: (
        <RerollPanel
          items={items}
          purse={purse}
          busy={busy}
          error={error}
          actions={actions}
          initial={right.piece}
          beside={beside}
          onCard={setCard}
          onClose={leave}
        />
      ),
    };
  } else if (right !== null && here && right.kind === 'blueprint') {
    rightPanel = {
      title: 'The visitor',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the stall',
      onClose: leave,
      children: (
        <BlueprintPanel
          view={view}
          blueprints={blueprints}
          purse={purse}
          bought={bought}
          busy={busy}
          error={error}
          actions={actions}
          onBought={setBought}
          onClose={leave}
        />
      ),
    };
  } else if (right !== null && !here && right.kind === 'sign') {
    rightPanel = {
      title: 'The stall',
      wizard: true,
      returnFocusTo: right.from,
      backLabel: 'to the stall',
      onClose: leave,
      children: <SignPanel onClose={leave} />,
    };
  }

  // The item card in the left drawer: only while the reroll's panel is open and asks for it (a wide window).
  const leftPanel: CanvasPanel | null =
    card === null || rightPanel === null || !beside
      ? null
      : {
          title: card.title,
          returnFocusTo: null,
          onClose: () => {
            setCard(null);
          },
          children: <PanelBody>{card.node}</PanelBody>,
        };

  // --- The scene ---

  const open = (kind: Right['kind']) => (opener: Opener) => {
    setRight({ kind, from: opener });
  };
  const scene = (
    <SceneFrame
      key="stall"
      id="visitor"
      label="Visitor"
      draw={draw}
      onLeave={closeTop}
      scaleFor={visitorScale}
    >
      {(measured) => {
        // A scene not measured yet (no size) is laid out as a phone's, so the targets are there from the first draw.
        const g =
          measured.W > 0 && measured.H > 0
            ? measured
            : sceneGeometry(390, 640, visitorScale(390, 640));
        return (
          <StallInside
            g={g}
            view={view}
            blueprintForSale={forSale}
            open={right?.kind ?? null}
            onVisitor={open('reroll')}
            onBlueprint={open('blueprint')}
            onSign={open('sign')}
          />
        );
      }}
    </SceneFrame>
  );

  return (
    <PlaceCanvas
      label="Visitor"
      scene={scene}
      left={leftPanel}
      right={rightPanel}
      below={
        <Tray creatures={ordered} input={trayInput} label="Your creatures" onPick={onOpenPaddock} />
      }
    />
  );
}

/** What stands in the scene over its canvas: each real button a `CanvasTarget` with its plate. */
function StallInside({
  g,
  view,
  blueprintForSale,
  open,
  onVisitor,
  onBlueprint,
  onSign,
}: {
  g: SceneGeometry;
  view: VisitorState;
  blueprintForSale: boolean;
  open: Right['kind'] | null;
  onVisitor: (opener: Opener) => void;
  onBlueprint: (opener: Opener) => void;
  onSign: (opener: Opener) => void;
}) {
  const box = visitorBox(g);
  if (!isHere(view)) {
    return (
      <CanvasTarget
        g={g}
        x={box.x + SIGN_BOX.x}
        y={box.y + SIGN_BOX.y}
        w={SIGN_BOX.w}
        h={SIGN_BOX.h}
        label={`The sign: ${AWAY_LINE} Read it`}
        plate="Back Thursday"
        plateAt={PLATE_ROW - SIGN_BOX.y}
        expanded={open === 'sign'}
        onClick={onSign}
      />
    );
  }
  return (
    <>
      <CanvasTarget
        g={g}
        x={box.x + VISITOR_BOX.x}
        y={box.y + VISITOR_BOX.y}
        w={VISITOR_BOX.w}
        h={VISITOR_BOX.h}
        label="The visitor. Hand him a piece of your gear to reroll"
        plate="Visitor"
        plateAt={PLATE_ROW - VISITOR_BOX.y}
        expanded={open === 'reroll'}
        onClick={onVisitor}
      />
      {blueprintForSale && (
        <CanvasTarget
          g={g}
          x={box.x + BLUEPRINT_BOX.x}
          y={box.y + BLUEPRINT_BOX.y}
          w={BLUEPRINT_BOX.w}
          h={BLUEPRINT_BOX.h}
          label={`This week's blueprint on the counter, ${gearName(view.blueprint.baseId)}, for sale. Open it`}
          plate="Blueprint"
          plateAt={PLATE_ROW - BLUEPRINT_BOX.y}
          expanded={open === 'blueprint'}
          onClick={onBlueprint}
        />
      )}
    </>
  );
}
