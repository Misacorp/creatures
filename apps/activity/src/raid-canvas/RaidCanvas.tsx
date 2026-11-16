/**
 * The raid as a place (docs/design/combat/raid-screen.md; `ux-patterns.md`, "A place is a canvas"), behind combat v2. One scene in the
 * middle that keeps its size (the arena: the boss with its HP bar, the board of seats), a now line as its caption, the creature tray below
 * while you can place, a left drawer for overviews (Weekend, Boss, Players, Log) and a right drawer for the one thing tapped (your
 * creature, another's, a seat, a boss move, a swap request, the finale order). Drawers lie over the scene on a wide window and are full
 * pages on a phone (`PlaceCanvas`). Stages play on the scene as they happen, the finale on the same scene; outcome signals are held until a
 * playing stage ends (`hold.ts`).
 *
 * The screen above (`Raid.tsx`) owns the data and every change that goes to the server; this component draws, opens and asks. The two open
 * choices of Misa's arrive as `config`, never as a description of the surroundings.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Creature } from '../api';
import { PACK_ART } from '../sprites/pack-art';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { hitTest } from '../dnd-core';
import { FinaleInputV2 } from '../FinaleInputV2';
import { ownInput, type ActionId } from '../finale-v2';
import type { fetchReplayV2 } from '../fight-v2-api';
import { creatureName } from '../game';
import type { FinaleFeed } from './finale-feed';
import { useLiveFinaleV2 } from '../LiveV2';
import type { FinaleWindow } from '../live';
import { usePopoverHost } from '../PopoverHost';
import type { RaidPhaseId, RaidView } from '../raid-api';
import type { RaidV2View } from '../raid-v2-api';
import {
  boardCreatureInfoV2,
  boardCuesV2,
  boardSlotV2,
  creaturesBySlot,
  gridRowsV2,
  litMove,
  placeTextV2,
  rowNameV2,
  swapMarks,
} from '../raid-board-v2';
import type { Intent } from '../raid-slots';
import { earlyKillStage } from '../raid-timeline';
import type { DropTarget } from '../slot-outcome';
import { creatureInfoOf } from '../creature-info';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import type { TeamConfigure } from '../TeamCreaturePage';
import { DragGhost } from '../ui/DragGhost';
import { LiveRegion } from '../ui/LiveRegion';
import type { BoardRowModel } from '../ui/RaidBoard';
import type { SlotCue } from '../ui/slot-cue';
import { useWide } from '../ui/wide-layout';
import { useDragDrop } from '../use-drag-drop';
import { PlaceCanvas, openerOf, type CanvasPanel, type Opener } from '../valley/PlaceCanvas';
import { Tray, type TrayMark } from '../valley/Tray';
import type { TrayInput } from '../valley/tray-state';
import { resolveConfig, type RaidCanvasConfig } from './config';
import { heldView } from './hold';
import { nowInput, nowLine, type NowLine, type NowTap } from './now-line';
import { phaseName } from '../raid-text';
import { LeftPanelBody, RightPanelBody, leftTitle, rightTitle, type PanelCtx } from './panels';
import { isHeld, playingOf } from './playing';
import {
  ScenePlayer,
  playDataOfFinale,
  playDataOfReplay,
  useStageFeed,
  useWatchedStage,
  type PlayData,
} from './play';
import { RaidScene, type ScenePlate } from './RaidScene';
import {
  TRAY_SLOT,
  TRAY_TARGET,
  firstFreeSeat,
  foreignLaneOwner,
  resolveCanvasDrop,
  tapOutcome,
  type LeftPanel,
  type RightPanel,
} from './taps';

/** What the canvas asks the screen above to do; each goes to the server there. */
export interface RaidCanvasActions {
  intent: (intent: Intent) => void;
  askSwap: (mySlot: number, theirSlot: number) => void;
  answerSwap: (id: string, answer: 'accept' | 'decline') => void;
  cancelSwap: (id: string) => void;
  setAbility: (id: ActionId) => void;
  setAutofire: (on: boolean) => void;
}

export interface RaidCanvasProps {
  /** The raid view of a combat v2 week (`rules: 2`, with its `v2` part). */
  view: RaidView;
  serverNow: number;
  finale: FinaleWindow;
  creatures: readonly Creature[];
  configure?: TeamConfigure | undefined;
  busy: boolean;
  actions: RaidCanvasActions;
  /** Misa's two open choices; any part left out takes the default (`defaultConfig`). */
  config?: Partial<RaidCanvasConfig> | undefined;
  /** Opens one of your creatures' own page. */
  onOpenPage: (creatureId: string) => void;
  /** The reveal card over the scene (the finale's result), when there is one to show. */
  reveal?: ComponentChildren;
  /** The finale's data and input: the screen's own, or (absent) the canvas fetches it while the finale is on. */
  feed?: FinaleFeed | undefined;
  /** Called when the Essence may have moved (the finale's loot arrived). */
  onBalanceChange?: (() => void) | undefined;
  /** Called when the finale has just ended, so the screen asks for the week again (the reveal). */
  onFinaleDone?: (() => void) | undefined;
  /** Where a stage playing out comes from (the replay route); the workbench gives its own. */
  stageFetcher?: typeof fetchReplayV2 | undefined;
  /** Opens the creature picker's "no creature" copy etc. is not needed: the tray's own input (trips and jobs are not read here). */
  trayInput: TrayInput;
  /** Starts with these drawers open (the workbench shows each). */
  start?: { right?: RightPanel; left?: LeftPanel } | undefined;
  /** The player is a guest of the board's finale only when in a party: gates the finale's live data. */
  inParty?: boolean;
}

const TRAY_ID = 'raid-tray';

/** Whether the creature is away (a trip or a job), for the tray's mark. */
const isAway = (c: Creature): boolean => c.busy != null;

/** The mark of a tray creature: on the board, out this weekend, away, or none. */
function trayMark(c: Creature, onBoard: ReadonlySet<string>, out: ReadonlySet<string>): TrayMark {
  const name = creatureName(c);
  const base = `${name}, level ${String(c.level)}.`;
  if (out.has(c.id)) {
    return {
      state: 'raid-out',
      label: `${base} Out this weekend. Opens it.`,
      mark: (
        <span class="rc-tray-mark" aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('skull')} scale={2} />
        </span>
      ),
    };
  }
  if (onBoard.has(c.id)) {
    return {
      state: 'raid-board',
      label: `${base} On the board. Opens it.`,
      mark: (
        <span class="rc-tray-mark" aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('check')} scale={2} />
        </span>
      ),
    };
  }
  if (isAway(c)) {
    return {
      state: 'raid-away',
      label: `${base} Away. Opens it.`,
      mark: <Sprite sprite={PACK_ART} scale={2} />,
    };
  }
  return { state: 'free', label: `${base} Opens it. Drag it to a seat.`, mark: null };
}

export function RaidCanvas(props: RaidCanvasProps) {
  const v2 = props.view.v2;
  return v2 === undefined ? null : <Canvas {...props} v2={v2} />;
}

function Canvas(props: RaidCanvasProps & { v2: RaidV2View }) {
  const { serverNow, creatures, configure, busy, actions } = props;
  const wide = useWide();
  const config = resolveConfig(!wide, props.config);
  const popovers = usePopoverHost();

  const named = playingOf(props.view);
  // A stage plays until `endsAt`; while it does, the view is shown without its outcome (`hold.ts`).
  const playing = isHeld(named, serverNow) ? named : null;
  const view = heldView(props.view, playing, serverNow);
  const v2 = view.v2 ?? props.v2;
  const party = view.party;

  const [right, setRight] = useState<{ panel: RightPanel; from: Opener | null } | null>(
    props.start?.right === undefined ? null : { panel: props.start.right, from: null },
  );
  const [left, setLeft] = useState<{ panel: LeftPanel; from: Opener | null } | null>(
    props.start?.left === undefined ? null : { panel: props.start.left, from: null },
  );
  const [litId, setLitId] = useState<string | null>(null);
  const [litSlot, setLitSlot] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [announcement, announce] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [watch, setWatch] = useState<{ week: string; party: number; phase: RaidPhaseId } | null>(
    null,
  );
  const stripRef = useRef<HTMLDivElement>(null);

  // --- What plays on the scene: a Watch from the Weekend drawer, the finale, or the stage playing out now ---
  const finaleOn = props.finale === 'lobby' || props.finale === 'live';
  const own = useLiveFinaleV2({
    initial: null,
    enabled: finaleOn && props.feed === undefined && props.inParty !== false,
    onBalanceChange: props.onBalanceChange ?? (() => undefined),
  });
  const feed: FinaleFeed = props.feed ?? {
    snapshot: own.snapshot,
    busy: own.busy,
    actionError: own.actionError,
    act: (key, action, row) => {
      void own.act(key, action, row);
    },
  };
  const snapshot = finaleOn ? feed.snapshot : null;
  const finaleData = snapshot === null ? null : playDataOfFinale(snapshot);
  const stageData = useStageFeed({
    playing: watch === null && !finaleOn ? playing : null,
    week: view.weekId,
    party: party?.party ?? null,
    ...(props.stageFetcher === undefined ? {} : { fetcher: props.stageFetcher }),
  });
  const watched = useWatchedStage(
    watch === null
      ? null
      : {
          week: watch.week,
          party: watch.party,
          phase:
            watch.phase === 'phase1' ? 'stage1' : watch.phase === 'phase2' ? 'stage2' : 'finale',
        },
  );
  const play: PlayData | null =
    watch !== null
      ? watched.data === null
        ? null
        : playDataOfReplay(watched.data, false, playing?.roundMs ?? 30_000)
      : finaleData !== null
        ? finaleData
        : stageData !== null && playing !== null
          ? playDataOfReplay(stageData, true, playing.roundMs)
          : null;
  const finaleDone = snapshot?.status === 'done';
  const wasDone = useRef(false);
  useEffect(() => {
    if (finaleDone && !wasDone.current) props.onFinaleDone?.();
    wasDone.current = finaleDone;
  }, [finaleDone]);
  // Watching ends with the stage; so does the log of a stage that is no longer on.
  useEffect(() => {
    if (play === null) setLog([]);
  }, [play === null]);

  const grid = { rows: v2.rows, cols: v2.cols };
  const placeAt = (slot: number): string => placeTextV2(slot, grid);
  const canEdit = view.you.canEdit && playing === null && !finaleOn && watch === null;
  const rosterNames = view.roster.map((r) => r.displayName);
  const outIds = new Set(v2.out.filter((o) => o.mine).map((o) => o.creatureId));
  const onBoardIds = new Set(
    (party?.row ?? []).flatMap((s) =>
      s.creature?.mine === true && s.creature.creatureId !== undefined
        ? [s.creature.creatureId]
        : [],
    ),
  );

  // --- Drawers ---
  const ctx: PanelCtx | null =
    party === null
      ? null
      : {
          view,
          v2,
          party,
          serverNow,
          finale: props.finale,
          owned: creatures,
          configure,
          canEdit,
          busy,
          intent: actions.intent,
          askSwap: actions.askSwap,
          answerSwap: actions.answerSwap,
          cancelSwap: actions.cancelSwap,
          setAbility: actions.setAbility,
          setAutofire: actions.setAutofire,
          openPage: props.onOpenPage,
          openRight: (panel) => {
            setRight(panel === null ? null : { panel, from: null });
            if (panel?.kind === 'move') setLitId(panel.moveId);
            else setLitId(null);
            setLitSlot(null);
          },
          openLeft: (panel) => {
            setLeft(panel === null ? null : { panel, from: null });
          },
          watch: (phase) => {
            if (party !== null) setWatch({ week: view.weekId, party: party.party, phase });
            setLeft(null);
          },
          log,
          playing: play !== null,
        };

  const closeRight = (): void => {
    setRight(null);
    setLitId(null);
    setLitSlot(null);
  };
  const openRight = (panel: RightPanel, from: Opener | null): void => {
    setRight({ panel, from });
    setLitId(panel.kind === 'move' ? panel.moveId : null);
    setLitSlot(null);
  };
  const openLeft = (panel: LeftPanel, from: Opener | null): void => {
    setLeft((now) => (now?.panel === panel ? null : { panel, from }));
  };

  const rightPanel: CanvasPanel | null =
    right === null || ctx === null
      ? null
      : {
          title: rightTitle(ctx, right.panel),
          children: <RightPanelBody ctx={ctx} panel={right.panel} />,
          onClose: closeRight,
          returnFocusTo: right.from,
          backLabel: 'to the raid',
        };
  const leftPanel: CanvasPanel | null =
    left === null || ctx === null
      ? null
      : {
          title: leftTitle(left.panel),
          children: <LeftPanelBody ctx={ctx} panel={left.panel} />,
          onClose: () => {
            setLeft(null);
          },
          returnFocusTo: left.from,
          backLabel: 'to the raid',
        };

  // --- The now line ---
  const rounds = play?.rounds ?? view.boss.finaleRounds;
  const lineNow = nowLine(
    nowInput(
      view,
      finaleOn && snapshot !== null && snapshot.status === 'live'
        ? {
            stage: 3,
            startsAt: snapshot.startsAt ?? serverNow,
            roundMs: snapshot.roundMs,
            nextRoundAt: snapshot.nextRoundAt,
            endsAt: (snapshot.startsAt ?? serverNow) + snapshot.roundMs * snapshot.rounds,
          }
        : playing,
      serverNow,
      creatures.length,
      rounds,
    ),
  );
  // Watching a played stage from the Weekend drawer: the line says so, and a plate puts the board back.
  const now: NowLine =
    watch === null
      ? lineNow
      : { id: 'playing', text: `Watching ${phaseName(watch.phase, 2)}`, tap: { kind: 'log' } };
  const onNow = (button: HTMLElement): void => {
    const tap: NowTap = now.tap;
    const from = openerOf(button);
    if (tap === null) return;
    switch (tap.kind) {
      case 'swap':
        openRight({ kind: 'swap', id: tap.id }, from);
        return;
      case 'log':
        openLeft('log', from);
        return;
      case 'weekend':
        openLeft('weekend', from);
        return;
      case 'order':
        openRight({ kind: 'order' }, from);
        return;
      case 'place': {
        const slot = party === null ? null : firstFreeSeat(party.row, grid);
        if (slot !== null) openRight({ kind: 'seat', slot }, from);
        return;
      }
    }
  };

  // --- The board and the hand that moves creatures ---
  const dropCtx = {
    locked: !canEdit,
    row: party?.row ?? [],
    place: placeAt,
    seats: v2.seats,
    out: outIds,
  };
  const nameOf = (creatureId: string): string => {
    const own = creatures.find((c) => c.id === creatureId);
    return own === undefined ? 'Creature' : creatureName(own);
  };
  const locate = (p: { x: number; y: number }): DropTarget | null => {
    if (typeof document !== 'undefined') {
      const over = document.elementFromPoint(p.x, p.y)?.closest('[data-drop-id]');
      if (over?.getAttribute('data-drop-id') === TRAY_ID) return TRAY_TARGET;
    }
    const strip = stripRef.current;
    if (strip === null) return null;
    const box = strip.getBoundingClientRect();
    const slop = 6;
    const inside =
      p.x >= box.left - slop &&
      p.x <= box.right + slop &&
      p.y >= box.top - slop &&
      p.y <= box.bottom + slop;
    if (!inside) return null;
    const slot = hitTest(
      [...strip.querySelectorAll<HTMLElement>('[data-slot]')].map((el) => ({
        id: Number(el.dataset['slot']),
        rect: el.getBoundingClientRect(),
      })),
      p,
      slop,
    );
    return slot === null ? null : { kind: 'slot', slot };
  };
  const dragDrop = useDragDrop({
    disabled: busy || !canEdit,
    stripRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate,
    sameTarget: (a, b) => (a === null || b === null ? a === b : a.slot === b.slot),
    onDrop: (creatureId, target) => {
      const outcome = resolveCanvasDrop(dropCtx, creatureId, nameOf(creatureId), target);
      setHint(outcome.hint);
      announce(outcome.announce);
      if (outcome.intent !== null) actions.intent(outcome.intent);
      return outcome;
    },
  });
  const dragging = dragDrop.drag?.creatureId ?? null;
  useEffect(() => {
    if (dragging !== null) popovers?.close();
  }, [dragging === null]);
  const overTray = dragDrop.drag?.over?.slot === TRAY_SLOT;
  const statuses =
    dragging === null
      ? null
      : new Map(
          (party?.row ?? []).map((s) => [
            s.slot,
            resolveCanvasDrop(dropCtx, dragging, nameOf(dragging), { kind: 'slot', slot: s.slot })
              .status,
          ]),
        );

  const tappedMove = v2.card.moves.find((m) => m.id === litId);
  const cues = useMemo(() => {
    const out = new Map<number, SlotCue>(
      boardCuesV2(v2.preview, tappedMove === undefined ? null : litMove(v2.preview, tappedMove)),
    );
    // A creature tapped on a phone (`popover-first`): it and the creatures it covers light on the board.
    if (litSlot !== null && party !== null) {
      const own = party.row.find((s) => s.slot === litSlot);
      out.set(litSlot, { ...out.get(litSlot), cover: true });
      const reach = own?.creature?.reach;
      if (reach !== undefined) {
        const lane = Math.floor(litSlot / v2.rows);
        for (const s of party.row) {
          const col = Math.floor(s.slot / v2.rows);
          if (s.slot % v2.rows !== litSlot % v2.rows || col === lane) continue;
          const d = col - lane;
          if ((d < 0 && -d <= reach.left) || (d > 0 && d <= reach.right)) {
            out.set(s.slot, { ...out.get(s.slot), cover: true });
          }
        }
      }
    }
    return out;
  }, [v2.preview, tappedMove, litSlot, party?.row]);

  const swaps = swapMarks(v2.swaps, party?.row ?? []);
  const bySlot = new Map((party?.row ?? []).map((s) => [s.slot, s]));
  const boardModels: BoardRowModel[] = gridRowsV2(grid).map((row, rowIndex) => ({
    zone: row.zone,
    name: rowNameV2(rowIndex),
    label: rowNameV2(rowIndex),
    slots: row.slots.flatMap((n) => {
      const slot = bySlot.get(n);
      if (slot === undefined) return [];
      const model = boardSlotV2(
        slot,
        { grid, creatures: creaturesBySlot(v2.creatures), swaps },
        rosterNames,
        canEdit,
      );
      const occupant = model.occupant;
      const bare = config.seatPlates === 'mine' && occupant !== null && !occupant.mine;
      const selected =
        right?.panel.kind === 'mine' && slot.creature?.creatureId === right.panel.creatureId
          ? true
          : right?.panel.kind === 'theirs' && right.panel.slot === n
            ? true
            : litSlot === n;
      return [
        { ...model, ...(bare ? { bare: true } : {}), ...(selected ? { selected: true } : {}) },
      ];
    }),
  }));

  const tapSlot = (slotNumber: number, button: HTMLElement): void => {
    if (dragDrop.consumeClick()) return;
    if (party === null) return;
    const cell = bySlot.get(slotNumber);
    const occupant = cell?.creature ?? null;
    const mark = swaps.get(slotNumber);
    const result = tapOutcome({
      slot: slotNumber,
      occupant: occupant === null ? null : { mine: occupant.mine, creatureId: occupant.creatureId },
      swapId: mark === undefined ? null : (mark.incoming[0]?.id ?? mark.outgoing[0]?.id ?? null),
      canEdit,
      laneOwner: foreignLaneOwner(party.row, grid, slotNumber),
      config,
    });
    setHint(null);
    const from = openerOf(button);
    switch (result.kind) {
      case 'open':
        openRight(result.panel, from);
        return;
      case 'locked':
        setHint('The board is locked.');
        return;
      case 'seat-note':
        popovers?.openCustom(`raid-seat:${String(slotNumber)}`, button, {
          label: `${result.owner}'s seat`,
          body: (
            <div class="pop-stack">
              <strong class="pix">{`${result.owner}'s seat`}</strong>
              <p>{placeAt(slotNumber)}</p>
            </div>
          ),
        });
        return;
      case 'popover': {
        if (occupant === null || popovers === null) return;
        const info = boardCreatureInfoV2(occupant);
        if (info === null) return;
        setLitSlot(result.lit);
        const shown = occupant.mine ? creatureInfoOf(info) : info;
        popovers.openCreature(`raid-slot:${String(slotNumber)}`, shown, button, [
          {
            label: 'Open',
            onAct: () => {
              openRight(result.panel, from);
            },
          },
        ]);
        return;
      }
    }
  };

  // --- The strip under the scene: the tray while you can place, the finale order during the finale ---
  const ability = snapshot === null ? null : ownInput(snapshot);
  const trayCreatures = [...creatures];
  const below: ComponentChildren = finaleOn ? (
    snapshot !== null && ability !== null && snapshot.status !== 'done' ? (
      <div class="rc-strip">
        <FinaleInputV2
          snapshot={snapshot}
          ability={ability}
          busy={feed.busy}
          error={feed.actionError}
          onFire={(row) => {
            feed.act(ability.key, 'fire', row);
          }}
          onAuto={(on) => {
            feed.act(ability.key, on ? 'unhold' : 'hold');
          }}
        />
      </div>
    ) : null
  ) : canEdit && party !== null && trayCreatures.length > 0 ? (
    <div class="rc-tray" data-over={overTray ? 'yes' : undefined}>
      <Tray
        creatures={trayCreatures}
        input={props.trayInput}
        label="Your creatures. Drag one to a seat, or onto this tray to take it off the board."
        dropId={TRAY_ID}
        drag={dragDrop}
        marks={(c) => trayMark(c, onBoardIds, outIds)}
        onPick={(id) => {
          const el = document.querySelector<HTMLElement>(`[data-creature="${id}"]`);
          openRight({ kind: 'mine', creatureId: id }, el === null ? null : openerOf(el));
        }}
      />
    </div>
  ) : null;

  // --- The scene ---
  const fell = earlyKillStage(view) !== null || (party?.bossHp?.current ?? 1) <= 0;
  const state =
    play !== null
      ? finaleOn
        ? 'finale'
        : 'playing'
      : finaleOn
        ? 'finale'
        : canEdit
          ? 'placing'
          : 'idle';
  const plates: ScenePlate[] = [
    ...(watch === null
      ? []
      : [
          {
            id: 'close',
            label: 'Close replay',
            open: false,
            onOpen: () => {
              setWatch(null);
              setLog([]);
            },
          },
        ]),
    {
      id: 'weekend',
      label: 'Weekend',
      open: left?.panel === 'weekend',
      onOpen: (b) => {
        openLeft('weekend', openerOf(b));
      },
    },
    {
      id: 'boss',
      label: 'Boss',
      open: left?.panel === 'boss',
      onOpen: (b) => {
        openLeft('boss', openerOf(b));
      },
    },
    ...(party === null
      ? []
      : [
          play !== null
            ? {
                id: 'log',
                label: 'Log',
                open: left?.panel === 'log',
                onOpen: (b: HTMLElement) => {
                  openLeft('log', openerOf(b));
                },
              }
            : {
                id: 'players',
                label: 'Players',
                open: left?.panel === 'players',
                onOpen: (b: HTMLElement) => {
                  openLeft('players', openerOf(b));
                },
              },
        ]),
  ];
  const stage =
    play === null ? undefined : <ScenePlayer key={play.id} data={play} onLog={setLog} />;
  const board =
    party === null
      ? null
      : {
          rows: boardModels,
          stripRef,
          emptyLabel: canEdit ? 'Add' : 'empty',
          disabled: busy,
          drag: dragDrop,
          statuses,
          cues,
          onTap: tapSlot,
        };
  return (
    <PlaceCanvas
      label="Raid"
      left={leftPanel}
      right={rightPanel}
      scene={
        <RaidScene
          state={state}
          now={now}
          onNow={onNow}
          plates={plates}
          boss={{ id: view.boss.id, name: view.boss.name }}
          hp={party?.bossHp ?? null}
          fallen={fell}
          {...(wide ? {} : { bossScale: 3 })}
          onBoss={(b) => {
            openLeft('boss', openerOf(b));
          }}
          moves={canEdit && play === null ? v2.card.moves : null}
          litMove={litId}
          onMove={(move, button) => {
            openRight({ kind: 'move', moveId: move.id }, openerOf(button));
          }}
          board={board}
          stage={stage}
          reveal={props.reveal}
          hint={hint}
        />
      }
      below={
        <>
          {below}
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
        </>
      }
    />
  );
}
