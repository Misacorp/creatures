/**
 * The Cave as a place (`docs/design/dungeon-canvas.md`; `ux-patterns.md`, "A place is a canvas"), behind the valley AND combat v2 (`flag.ts`).
 * Today's map is the scene (`CaveScene`), a now line is its caption, the creature tray sits under it before a run, a left drawer holds
 * the Pack, the Route and the fight Log, and a right drawer holds the one thing tapped (a room, the cave mouth, a creature, a
 * mystery room, the camp, the way down, the result). Drawers lie over the scene on a wide window and are full pages on a phone
 * (`PlaceCanvas`). A room's fight takes the scene over (`CavePlayback`) and nothing of its answer shows until it has played (`hold.ts`).
 *
 * The screen above (`Dungeon.tsx`) owns the data and every act that goes to the server; this component draws, opens and asks.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { creatureName } from '../game';
import { DragGhost } from '../ui/DragGhost';
import { LiveRegion } from '../ui/LiveRegion';
import { glyphOrUnknown } from '../glyphs';
import { TOUCH_HOLD_MS } from '../dnd-core';
import type { DropTarget } from '../slot-outcome';
import { placeTotal } from '../dungeon-playback';
import { placedCount, slotIndexOf, unplace, type Slots } from '../dungeon-team';
import { blockedText, isRetryOffer } from '../dungeon-text';
import type { DungeonAct, DungeonPreview, DungeonRunSummary, DungeonToday } from '../dungeon-types';
import { Sprite } from '../sprites/Sprite';
import { TeamCreaturePage, type TeamConfigure } from '../TeamCreaturePage';
import { PlaceCanvas, openerOf, type CanvasPanel, type Opener } from '../valley/PlaceCanvas';
import { Tray, type TrayMark } from '../valley/Tray';
import type { TrayInput } from '../valley/tray-state';
import { useDragDrop } from '../use-drag-drop';
import { kitsOf } from '../reaction-partner-kits';
import type { PartnerLook } from '../reaction-partners';
import { useReactionPartners } from '../use-reaction-partners';
import { useDungeonSetup } from '../use-dungeon-setup';
import type { ScenePlate } from '../raid-canvas/RaidScene';
import { CavePlayback } from './CavePlayback';
import { CaveScene, type CaveMouth, type SceneCreature } from './CaveScene';
import { shownRun, type CaveView } from './hold';
import { nowLine, playingRoom, type NowLine, type PlayingRoom } from './now-line';
import {
  LeftPanelBody,
  RightPanelBody,
  leftTitle,
  rightTitle,
  type PanelCtx,
  type SetupModel,
} from './panels';
import { sceneCreatureOf, sceneMapOf } from './scene-model';
import {
  MOUTH_SLOT,
  MOUTH_TARGET,
  TRAY_SLOT,
  TRAY_TARGET,
  autoKey,
  autoPanel,
  nowTapPanel,
  resolveCaveDrop,
  type LeftPanel,
  type RightPanel,
} from './taps';

export interface CaveCanvasProps {
  today: DungeonToday;
  offset: number;
  /** What the canvas may show: while a fight plays it carries the run as it was BEFORE the room (`hold.ts`). */
  view: CaveView;
  creatures: readonly Creature[];
  busy: boolean;
  error: string | null;
  bait: number;
  /** The server refuses treats with the valley's systems on (`treats_off`): the treat boxes are not offered. */
  treatsOff: boolean;
  draft: Slots | null;
  onDraftChange: (slots: Slots) => void;
  saveDraft?: ((team: Slots) => Promise<unknown>) | undefined;
  loadPreview?: ((depth: number) => Promise<DungeonPreview>) | undefined;
  initialDepth?: number | undefined;
  onEnter: (slots: Slots, treats: ReadonlySet<string>, depth?: number) => void;
  onAct: (act: DungeonAct) => void;
  /** The fight of an open run has played out. */
  onFightDone: () => void;
  /** A watched run has played out. */
  onPlaybackDone: () => void;
  onWatch: (run: DungeonRunSummary) => void;
  onRetry: () => void;
  onSeeLast: () => void;
  configure?: TeamConfigure | undefined;
  trayInput: TrayInput;
  /** Starts with these drawers open (the workbench shows each). */
  start?: { right?: RightPanel; left?: LeftPanel; closed?: true; touch?: string } | undefined;
  /** How the reaction partners of a touched creature are lit (the pick is `badge`; the workbench shows the others). */
  partnerLook?: PartnerLook | undefined;
}

const TRAY_ID = 'cave-tray';

/** The mark of a tray creature: on the team, away, or none. */
function trayMark(c: Creature, onTeam: boolean): TrayMark {
  const base = `${creatureName(c)}, level ${String(c.level)}.`;
  if (onTeam) {
    return {
      state: 'raid-board',
      label: `${base} On the team. Opens it.`,
      mark: (
        <span class="rc-tray-mark" aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('check')} scale={2} />
        </span>
      ),
    };
  }
  return { state: 'free', label: `${base} Opens it. Drag it to the cave mouth.`, mark: null };
}

export function CaveCanvas(props: CaveCanvasProps) {
  const { today, view, creatures, busy } = props;
  const setupState = useDungeonSetup({
    today,
    creatures,
    draft: props.draft,
    onDraftChange: props.onDraftChange,
    saveDraft: props.saveDraft,
    loadPreview: props.loadPreview,
    initialDepth: props.initialDepth,
  });
  const [treats, setTreats] = useState<ReadonlySet<string>>(new Set());
  const run = shownRun(view);
  const scene = sceneMapOf(view, setupState.shownToday);
  const blocked =
    blockedText(today) ??
    (creatures.length < 3 ? blockedText({ blocked: 'need_creatures', canRun: false }) : null);
  const isSetup = view.kind === 'setup';
  const retry = isRetryOffer(today);
  const auto = { view, blocked: isSetup && blocked !== null, retry };

  const [right, setRight] = useState<{ panel: RightPanel; from: Opener | null } | null>(() => {
    if (props.start?.closed === true) return null;
    const first = props.start?.right ?? autoPanel(auto);
    return first === null ? null : { panel: first, from: null };
  });
  const [left, setLeft] = useState<{ panel: LeftPanel; from: Opener | null } | null>(
    props.start?.left === undefined || props.start.closed === true
      ? null
      : { panel: props.start.left, from: null },
  );
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [playing, setPlaying] = useState<PlayingRoom | null>(null);
  const [page, setPage] = useState<string | null>(null);

  // What stands open by itself follows the screen: a choice the run waits on, the result, the reason of a blocked day.
  const key = autoKey(auto);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const next = autoPanel(auto);
    setRight(next === null ? null : { panel: next, from: null });
  }, [key]);
  // A fight (or a watched run) takes the scene: no drawer stands over it, and the log of the last one is gone.
  const fighting = view.kind === 'fight' || view.kind === 'playback';
  useEffect(() => {
    if (!fighting) {
      setLog([]);
      setPlaying(null);
      return;
    }
    setRight(null);
    setLeft(null);
  }, [fighting]);

  const setup: SetupModel = {
    slots: setupState.slots,
    change: setupState.change,
    own: setupState.own,
    pickDepth: setupState.pickDepth,
    depth: setupState.depth,
    setPick: setupState.setPick,
    previewStatus: setupState.previewStatus,
    shownToday: setupState.shownToday,
    treats,
    setTreat: (id, on) => {
      setTreats((now) => {
        const next = new Set(now);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    complete: setupState.slots.every((s) => s !== null),
    enter: () => {
      // The run deletes the draft on the server, so a save still waiting is not sent.
      setupState.saver.cancel();
      const going = new Set([...treats].filter((id) => setupState.slots.includes(id)));
      const { pickDepth, depth, own } = setupState;
      if (pickDepth && depth < own) props.onEnter(setupState.slots, going, depth);
      else props.onEnter(setupState.slots, going);
    },
  };

  const closeRight = (): void => {
    setRight(null);
  };
  const openRight = (panel: RightPanel, from: Opener | null): void => {
    setRight({ panel, from });
  };
  const openLeft = (panel: LeftPanel, from: Opener | null): void => {
    setLeft((now) => (now?.panel === panel ? null : { panel, from }));
  };

  const ctx: PanelCtx = {
    today,
    offset: props.offset,
    view,
    run,
    scene,
    creatures,
    configure: props.configure,
    busy,
    error: props.error,
    bait: props.bait,
    treatsOff: props.treatsOff,
    setup: isSetup ? setup : null,
    blocked,
    log,
    onAct: props.onAct,
    onWatch: props.onWatch,
    onRetry: props.onRetry,
    onSeeLast: props.onSeeLast,
    openPage: setPage,
    closeRight,
    openRight: (panel) => {
      openRight(panel, null);
    },
  };

  // --- The now line ---
  const firstRoom =
    view.kind === 'fight' || view.kind === 'playback' ? view.input.rooms[0] : undefined;
  const now: NowLine =
    view.kind === 'setup'
      ? nowLine({
          screen: 'setup',
          blocked: blocked !== null,
          placed: placedCount(setupState.slots),
        })
      : view.kind === 'results'
        ? nowLine({ screen: 'results' })
        : fighting
          ? nowLine({
              screen: 'playing',
              room:
                playing ??
                (firstRoom === undefined
                  ? null
                  : playingRoom(firstRoom, placeTotal(view.input, firstRoom))),
            })
          : run === null
            ? nowLine({ screen: 'results' })
            : nowLine({ screen: 'run', state: run });
  const onNow = (button: HTMLElement): void => {
    const panel = nowTapPanel(now.tap, run);
    if (panel !== null) openRight(panel, openerOf(button));
  };

  // --- The team at the cave mouth, and the hand that moves creatures ---
  const nameOf = (id: string): string => {
    const c = creatures.find((x) => x.id === id);
    return c === undefined ? 'Creature' : creatureName(c);
  };
  const sceneCreatureOfOwned = (id: string | null): SceneCreature | null => {
    const c = id === null ? undefined : creatures.find((x) => x.id === id);
    return c === undefined
      ? null
      : { id: c.id, name: creatureName(c), level: c.level, speciesId: c.species };
  };
  const mouthRef = useRef<HTMLDivElement>(null);
  const canMove = isSetup && blocked === null && !busy;
  const dragDrop = useDragDrop({
    disabled: !canMove,
    stripRef: mouthRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p): DropTarget | null => {
      if (typeof document === 'undefined') return null;
      const el = document.elementFromPoint(p.x, p.y);
      if (el === null) return null;
      if (el.closest('[data-drop-id]')?.getAttribute('data-drop-id') === TRAY_ID)
        return TRAY_TARGET;
      const place = el.closest('.cave-mouth [data-slot]');
      if (place !== null) return { kind: 'slot', slot: Number(place.getAttribute('data-slot')) };
      return el.closest('[data-drop-id="cave-mouth"]') === null ? null : MOUTH_TARGET;
    },
    sameTarget: (a, b) => (a === null || b === null ? a === b : a.slot === b.slot),
    onDrop: (creatureId, target) => {
      const result = resolveCaveDrop(setupState.slots, creatureId, target, nameOf, busy);
      setHint(result.outcome.hint);
      announce(result.outcome.announce);
      if (result.outcome.status === 'valid') setupState.change(result.slots);
      return result.outcome;
    },
  });
  const dragging = dragDrop.drag?.creatureId ?? null;
  const overSlot = dragDrop.drag?.over?.slot ?? null;
  const overTray = overSlot === TRAY_SLOT;

  // The reaction partners of a creature touched (the pointer over it, the keyboard on it, its drawer open): the kit of each of your
  // creatures is what the state already carries (saved Knack, slotted talents, worn gear), the team and the tray alike.
  const kits = useMemo(() => kitsOf(creatures, []), [creatures]);
  const partners = useReactionPartners({
    kits,
    look: props.partnerLook ?? 'dim',
    pinned: right?.panel.kind === 'mine' ? right.panel.creatureId : null,
    off: dragging !== null || fighting,
    initial: props.start?.touch ?? null,
  });
  const partner = { paint: partners.paint, touch: partners.touch };

  const mouth: CaveMouth | null =
    isSetup && blocked === null
      ? {
          mode: 'setup',
          slots: setupState.slots.map(sceneCreatureOfOwned),
          dragging: dragging !== null,
          over: overSlot === MOUTH_SLOT,
          overSlot: overSlot !== null && overSlot >= 0 ? overSlot : null,
          drag: dragDrop,
          disabled: busy,
          onCreature: (id, button) => {
            openRight({ kind: 'mine', creatureId: id }, openerOf(button));
          },
          onEnter: (button) => {
            openRight({ kind: 'enter' }, openerOf(button));
          },
          enterOpen: right?.panel.kind === 'enter',
        }
      : view.kind === 'run' && run !== null && run.status === 'active' && run.at === null
        ? {
            mode: 'entrance',
            slots: run.team.map(sceneCreatureOf),
            dragging: false,
            over: false,
            overSlot: null,
            drag: null,
            disabled: false,
            onCreature: (id, button) => {
              openRight({ kind: 'mine', creatureId: id }, openerOf(button));
            },
            onEnter: null,
            enterOpen: false,
          }
        : null;
  const team: readonly SceneCreature[] | null =
    run !== null && run.status === 'active' && run.at !== null
      ? run.team.map(sceneCreatureOf)
      : null;

  // --- Drawers ---
  const rightPanel: CanvasPanel | null =
    right === null
      ? null
      : {
          title: rightTitle(ctx, right.panel),
          children: <RightPanelBody ctx={ctx} panel={right.panel} />,
          onClose: closeRight,
          returnFocusTo: right.from,
          backLabel: 'to the cave',
        };
  const leftPanel: CanvasPanel | null =
    left === null
      ? null
      : {
          title: leftTitle(left.panel),
          children: <LeftPanelBody ctx={ctx} panel={left.panel} />,
          onClose: () => {
            setLeft(null);
          },
          returnFocusTo: left.from,
          backLabel: 'to the cave',
        };
  const plate = (id: LeftPanel, label: string): ScenePlate => ({
    id,
    label,
    open: left?.panel === id,
    onOpen: (b) => {
      openLeft(id, openerOf(b));
    },
  });
  const plates: ScenePlate[] = [
    ...(run === null || fighting ? [] : [plate('pack', 'Pack')]),
    ...(scene.run === null || fighting ? [] : [plate('route', 'Route')]),
    ...(fighting ? [plate('log', 'Log')] : []),
  ];

  // --- The fight on the scene ---
  const stage: ComponentChildren =
    view.kind === 'fight' ? (
      <CavePlayback
        key="fight"
        input={view.input}
        onDone={props.onFightDone}
        onRoom={setPlaying}
        onLog={setLog}
      />
    ) : view.kind === 'playback' ? (
      <CavePlayback
        key="watch"
        input={view.input}
        onDone={props.onPlaybackDone}
        onRoom={setPlaying}
        onLog={setLog}
      />
    ) : undefined;

  // --- The strip under the scene: the creature tray, before a run ---
  const onTeam = new Set(setupState.slots.filter((s): s is string => s !== null));
  const below: ComponentChildren =
    isSetup && blocked === null && creatures.length > 0 ? (
      <div class="rc-tray cave-tray" data-over={overTray ? 'yes' : undefined}>
        <Tray
          creatures={creatures}
          input={props.trayInput}
          label="Your creatures. Drag one to the cave mouth to add it, or onto this tray to take it off the team."
          dropId={TRAY_ID}
          drag={dragDrop}
          oneRow
          partner={partner}
          marks={(c) => trayMark(c, onTeam.has(c.id))}
          onPick={(id) => {
            const el = document.querySelector<HTMLElement>(`[data-creature="${id}"]`);
            openRight({ kind: 'mine', creatureId: id }, el === null ? null : openerOf(el));
          }}
        />
        <LiveRegion>{announcement}</LiveRegion>
        <DragGhost
          ghostRef={dragDrop.ghostRef}
          creature={
            dragging === null
              ? undefined
              : {
                  species: creatures.find((c) => c.id === dragging)?.species ?? 'unknown',
                  name: nameOf(dragging),
                }
          }
        />
      </div>
    ) : null;

  // A creature's own page replaces the canvas (as the page's team card does), and Back returns to it.
  const paged = page === null ? undefined : creatures.find((c) => c.id === page);
  if (props.configure !== undefined && paged !== undefined) {
    const team = isSetup
      ? setupState.slots.flatMap((id) => creatures.filter((c) => c.id === id))
      : (run?.team ?? []).flatMap((m) => creatures.filter((c) => c.id === m.id));
    return (
      <TeamCreaturePage
        creature={paged}
        team={team}
        configure={props.configure}
        backLabel="Cave"
        {...(isSetup && slotIndexOf(setupState.slots, paged.id) !== null
          ? {
              remove: {
                label: 'Remove from team',
                onAct: () => {
                  setPage(null);
                  setupState.change(unplace(setupState.slots, paged.id));
                },
              },
            }
          : {})}
        onFlip={(target) => {
          setPage(target.id);
        }}
        onBack={() => {
          setPage(null);
        }}
      />
    );
  }

  return (
    <PlaceCanvas
      label="Cave"
      left={leftPanel}
      right={rightPanel}
      scene={
        <CaveScene
          state={
            isSetup ? 'setup' : fighting ? 'playing' : view.kind === 'results' ? 'over' : 'run'
          }
          now={now}
          onNow={onNow}
          plates={plates}
          map={scene.map}
          undercroft={scene.undercroft}
          depth={scene.depth}
          landmark={scene.landmark}
          run={scene.run}
          openId={right?.panel.kind === 'room' ? right.panel.id : null}
          onRoom={(id, button) => {
            openRight({ kind: 'room', id }, openerOf(button));
          }}
          team={team}
          onTeamCreature={(id, button) => {
            openRight({ kind: 'mine', creatureId: id }, openerOf(button));
          }}
          mouth={mouth}
          partner={partner}
          stage={stage}
          hint={hint ?? (right === null ? props.error : null)}
        />
      }
      below={below}
    />
  );
}
