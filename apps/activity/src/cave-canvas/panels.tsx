/**
 * What the Cave canvas's two drawers hold (`docs/design/dungeon-canvas.md`). The right drawer is the one thing tapped: a room (what is
 * there, Go pinned), the cave mouth (depth, treats, Enter pinned), one of your creatures, a mystery room's choices, the camp, the way
 * down, the result, or the reason a run cannot start. The left drawer holds the overviews that belong to no one spot: the Pack, the
 * Route, the fight Log. Every body is the page's own component (`DungeonCamp`, `DungeonDescend`, `DungeonEvent`, `DungeonResults`,
 * `DungeonRunStrip`, `DepthPicker`, the room sheet of `DungeonNodeDrawer`), drawn in a `PanelBody` with its action pinned.
 * Nothing here changes the run: every choice is a callback to the screen above, which sends it to the server.
 */
import type { Creature } from '../api';
import { BagFullNote } from '../ui/BagFullNote';
import { CreatureConfigurator, type ConfiguratorParts } from '../CreatureConfigurator';
import { DepthPicker } from '../DepthPicker';
import { DepthProgress } from '../DepthProgress';
import { DungeonCamp } from '../DungeonCamp';
import { DungeonDescend } from '../DungeonDescend';
import { DungeonEvent } from '../DungeonEvent';
import { nodeSheet } from '../DungeonNodeDrawer';
import { DungeonResults } from '../DungeonResults';
import { DungeonRunStrip, RunTile } from '../DungeonRunStrip';
import { DungeonTreats } from '../DungeonTreats';
import { GlossaryTag } from '../Glossary';
import { place, ROW_PLACES, slotIndexOf, unplace, type Slots } from '../dungeon-team';
import { blockedText, landmarkLine, RETRY_TEXT, streakLabel, streakPips } from '../dungeon-text';
import type {
  DungeonAct,
  DungeonRunState,
  DungeonRunSummary,
  DungeonToday,
} from '../dungeon-types';
import { creatureName } from '../game';
import type { TeamConfigure } from '../TeamCreaturePage';
import type { PreviewStatusName } from '../use-job-preview';
import { Alert } from '../ui/Alert';
import { StreakTrack } from '../ui/StreakTrack';
import { PanelBody } from '../valley/PlaceCanvas';
import type { CaveView } from './hold';
import { routeRows } from './route';
import { allNodes, roomContext, type SceneMap } from './scene-model';
import type { LeftPanel, RightPanel } from './taps';

/** What a dungeon run asks of a creature while the team is set up: who it is, how it grows, what it fights with (combat v2: with a Knack). */
const SETUP_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  gear: true,
  talents: true,
  knack: true,
};
/** Once the run has begun the loadout is frozen: what it wears, nothing to change. */
const RUN_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  knack: true,
  knackLocked: true,
  gear: true,
  gearLocked: true,
};

/** The team row being set up, with what Enter needs (the pre-run state of `useDungeonSetup`, and the treats). */
export interface SetupModel {
  slots: Slots;
  change: (slots: Slots) => void;
  own: number;
  pickDepth: boolean;
  depth: number;
  setPick: (depth: number | null) => void;
  previewStatus: PreviewStatusName;
  /** Today with the picked depth's map. */
  shownToday: DungeonToday;
  treats: ReadonlySet<string>;
  setTreat: (id: string, on: boolean) => void;
  /** The three are placed. */
  complete: boolean;
  enter: () => void;
}

export interface PanelCtx {
  today: DungeonToday;
  offset: number;
  view: CaveView;
  /** The run as the canvas may show it now (the one before a fight). */
  run: DungeonRunState | null;
  scene: SceneMap;
  creatures: readonly Creature[];
  configure: TeamConfigure | undefined;
  busy: boolean;
  error: string | null;
  bait: number;
  /** The server refuses treats with the valley's systems on: no treat boxes. */
  treatsOff: boolean;
  setup: SetupModel | null;
  /** A blocked day: why (null: not blocked). */
  blocked: string | null;
  /** The fight's text so far (the Log). */
  log: readonly string[];
  onAct: (act: DungeonAct) => void;
  onWatch: (run: DungeonRunSummary) => void;
  onRetry: () => void;
  onSeeLast: () => void;
  openPage: (creatureId: string) => void;
  closeRight: () => void;
  openRight: (panel: RightPanel) => void;
}

export const rightTitle = (ctx: PanelCtx, panel: RightPanel): string => {
  switch (panel.kind) {
    case 'room': {
      const node = allNodes(ctx.scene).find((n) => n.id === panel.id);
      return node === undefined ? 'Room' : (roomSheet(ctx, panel.id)?.title ?? 'Room');
    }
    case 'enter':
      return 'Enter the cave';
    case 'mine': {
      const c = ctx.creatures.find((x) => x.id === panel.creatureId);
      return c === undefined ? 'Creature' : creatureName(c);
    }
    case 'event':
      return ctx.run?.pending?.kind === 'event' ? ctx.run.pending.event.name : 'Mystery room';
    case 'camp':
      return 'Camp';
    case 'descend':
      return 'The way down';
    case 'result':
      return 'The run';
    case 'blocked':
      return 'Not today';
    case 'retry':
      return 'One more try';
  }
};

export const leftTitle = (panel: LeftPanel): string =>
  ({ pack: 'Pack and team', route: 'The route so far', log: 'Fight log' })[panel];

/** The room's sheet (the page's own, `nodeSheet`), or null for a room the map does not have. */
function roomSheet(ctx: PanelCtx, id: string) {
  const node = allNodes(ctx.scene).find((n) => n.id === id);
  if (node === undefined) return null;
  const { ahead, descent, cracked } = roomContext(ctx.scene);
  const active = ctx.run !== null && ctx.run.status === 'active' && ctx.view.kind === 'run';
  return nodeSheet({
    node,
    state: ctx.scene.run,
    ahead,
    // Go only on an open run that waits for a pick; the preview, a fight playing and a finished run have none.
    ...(active
      ? {
          onGo: (nodeId: string) => {
            ctx.onAct({ type: 'move', node: nodeId });
          },
        }
      : {}),
    busy: ctx.busy,
    landmark: ctx.scene.landmark,
    crack: cracked.has(node.id),
    descent: descent.has(node.id),
    onClose: ctx.closeRight,
  });
}

export function RightPanelBody({ ctx, panel }: { ctx: PanelCtx; panel: RightPanel }) {
  switch (panel.kind) {
    case 'room':
      return <RoomPanel ctx={ctx} id={panel.id} />;
    case 'enter':
      return <EnterPanel ctx={ctx} />;
    case 'mine':
      return <MinePanel ctx={ctx} creatureId={panel.creatureId} />;
    case 'event': {
      const pending = ctx.run?.pending;
      if (ctx.run === null || pending?.kind !== 'event') return <Gone />;
      return (
        <PanelBody>
          <DungeonEvent
            key={ctx.run.step}
            event={pending.event}
            busy={ctx.busy}
            onPick={(option) => {
              ctx.onAct({ type: 'event', option });
            }}
          />
        </PanelBody>
      );
    }
    case 'camp': {
      const pending = ctx.run?.pending;
      if (ctx.run === null || pending?.kind !== 'camp') return <Gone />;
      return (
        <PanelBody>
          <DungeonCamp
            key={ctx.run.step}
            team={ctx.run.team}
            pack={ctx.run.pack}
            camp={pending}
            creatures={ctx.creatures}
            busy={ctx.busy}
            rules={ctx.run.rules}
            onAct={ctx.onAct}
          />
        </PanelBody>
      );
    }
    case 'descend': {
      const pending = ctx.run?.pending;
      if (ctx.run === null || pending?.kind !== 'descend') return <Gone />;
      return (
        <PanelBody>
          <DungeonDescend
            key={ctx.run.step}
            descent={pending}
            pack={ctx.run.pack}
            depth={ctx.run.depth}
            busy={ctx.busy}
            onAct={ctx.onAct}
          />
        </PanelBody>
      );
    }
    case 'result': {
      if (ctx.view.kind !== 'results') return <Gone />;
      const run = ctx.view.run;
      return (
        <PanelBody>
          <DungeonResults
            run={run}
            today={ctx.today}
            offset={ctx.offset}
            canRetry={ctx.today.canRun}
            busy={ctx.busy}
            error={ctx.error}
            showMap={false}
            onWatch={() => {
              ctx.onWatch(run);
            }}
            onRetry={ctx.onRetry}
          />
        </PanelBody>
      );
    }
    case 'blocked':
      return (
        <PanelBody>
          <p role="status">{ctx.blocked ?? blockedText(ctx.today) ?? 'The cave is closed.'}</p>
        </PanelBody>
      );
    case 'retry':
      return (
        <PanelBody
          footer={
            <button type="button" class="primary" onClick={ctx.onSeeLast}>
              See your last run
            </button>
          }
        >
          <p>{RETRY_TEXT}</p>
        </PanelBody>
      );
  }
}

/** A panel whose choice is no longer waiting (the run moved on while it stood open). */
function Gone() {
  return (
    <PanelBody>
      <p class="muted">Nothing is waiting here any more.</p>
    </PanelBody>
  );
}

function RoomPanel({ ctx, id }: { ctx: PanelCtx; id: string }) {
  const sheet = roomSheet(ctx, id);
  if (sheet === null) return <Gone />;
  return (
    <PanelBody footer={sheet.footer}>
      {sheet.help !== null && (
        <p class="muted small">
          <GlossaryTag entry={sheet.help} look="help" />
        </p>
      )}
      {sheet.body}
    </PanelBody>
  );
}

/** The cave mouth: today in a line, the depth to play, the treats, and Enter pinned. */
function EnterPanel({ ctx }: { ctx: PanelCtx }) {
  const { setup, today } = ctx;
  if (setup === null) return <Gone />;
  const shown = setup.shownToday;
  const slots = setup.slots;
  return (
    <PanelBody
      footer={
        <div class="dungeon-enter">
          {ctx.error !== null && <Alert level="alert">{ctx.error}</Alert>}
          <BagFullNote
            inventory={ctx.configure?.gear?.inventory}
            onOpenWorkshop={ctx.configure?.onOpenWorkshop}
          />
          <button
            type="button"
            class="primary"
            disabled={ctx.busy || !setup.complete}
            aria-describedby={setup.complete ? undefined : 'cave-enter-note'}
            onClick={setup.enter}
          >
            {ctx.busy ? 'Entering...' : 'Enter the cave'}
          </button>
          {!setup.complete && (
            <p id="cave-enter-note" class="muted">
              Place 3 creatures to enter.
            </p>
          )}
        </div>
      }
    >
      <div class="dr-stack">
        <GlossaryTag
          entry="streak"
          look="chip"
          class="streak-tag"
          label={`${streakLabel(today.streak)}. What is a streak?`}
        >
          <StreakTrack pips={streakPips(today.streak)} label={streakLabel(today.streak)} />
        </GlossaryTag>
        {shown.landmarkBoss != null && <p class="dnd-line">{landmarkLine(shown.landmarkBoss)}</p>}
        <DepthProgress depth={setup.own} />
        {setup.pickDepth && (
          <DepthPicker
            own={setup.own}
            picked={setup.depth}
            status={setup.previewStatus}
            onPick={(picked) => {
              setup.setPick(picked >= setup.own ? null : picked);
            }}
          />
        )}
        {!ctx.treatsOff && (
          <DungeonTreats
            creatures={ctx.creatures}
            slots={slots}
            treats={setup.treats}
            bait={ctx.bait}
            busy={ctx.busy}
            rules={today.rules}
            onChange={setup.setTreat}
          />
        )}
      </div>
    </PanelBody>
  );
}

/**
 * One of your creatures. Before the run: the configurator (Knack, talents, gear), its page, and on or off the team. In the run: the
 * creature as the run holds it (HP, the gear it wears, frozen when it joined) and, locked, the configurator.
 */
function MinePanel({ ctx, creatureId }: { ctx: PanelCtx; creatureId: string }) {
  const creature = ctx.creatures.find((c) => c.id === creatureId);
  const inRun = ctx.run?.team.find((c) => c.id === creatureId);
  const { setup } = ctx;
  if (creature === undefined && inRun === undefined) {
    return (
      <PanelBody>
        <p class="muted">This creature is not available.</p>
      </PanelBody>
    );
  }
  const on = setup === null ? null : slotIndexOf(setup.slots, creatureId) !== null;
  const free = setup === null ? -1 : setup.slots.findIndex((s) => s === null);
  const buttons: {
    label: string;
    danger?: boolean;
    withCreature: boolean;
    onAct: () => void;
  }[] = [
    ...(creature === undefined || ctx.configure === undefined
      ? []
      : [
          {
            label: 'Creature page',
            withCreature: true,
            onAct: () => {
              ctx.openPage(creature.id);
            },
          },
        ]),
    ...(setup !== null && on === true
      ? [
          {
            label: 'Remove from team',
            danger: true,
            withCreature: true,
            onAct: () => {
              ctx.closeRight();
              setup.change(unplace(setup.slots, creatureId));
            },
          },
        ]
      : []),
    ...(setup !== null && on === false && free >= 0 && free < ROW_PLACES.length
      ? [
          {
            label: 'Add to team',
            withCreature: true,
            onAct: () => {
              ctx.closeRight();
              setup.change(place(setup.slots, creatureId, free));
            },
          },
        ]
      : []),
  ];
  return (
    <PanelBody>
      {inRun !== undefined && (
        <ul class="dr-stack">
          <RunTile creature={inRun} rules={ctx.run?.rules} />
        </ul>
      )}
      {setup !== null && on === false && free < 0 && (
        <p class="muted small">The team is full. Remove one to add this creature.</p>
      )}
      {creature !== undefined &&
        (ctx.configure === undefined ? (
          <p class="muted">{`${creatureName(creature)}, level ${String(creature.level)}`}</p>
        ) : (
          <CreatureConfigurator
            key={creature.id}
            creature={creature}
            state={ctx.configure.state}
            gear={ctx.configure.gear}
            busy={ctx.configure.busy}
            parts={setup === null ? RUN_PARTS : SETUP_PARTS}
            actions={ctx.configure.actions}
            buttons={buttons}
          />
        ))}
    </PanelBody>
  );
}

export function LeftPanelBody({ ctx, panel }: { ctx: PanelCtx; panel: LeftPanel }) {
  switch (panel) {
    case 'pack':
      return (
        <PanelBody>
          {ctx.run === null ? (
            <p class="muted">Nothing packed yet.</p>
          ) : (
            <DungeonRunStrip state={ctx.run} />
          )}
        </PanelBody>
      );
    case 'route': {
      const rows = routeRows(ctx.scene.run?.history, allNodes(ctx.scene));
      const done = rows.length;
      return (
        <PanelBody>
          {done === 0 ? (
            <p class="muted">No rooms yet. Today&apos;s map is on the scene.</p>
          ) : (
            <ol class="dr-stack cave-route">
              {rows.map((row) => (
                <li key={row.key} class="dnd-line">
                  <strong>{row.title}</strong>
                  {': '}
                  {row.text}
                </li>
              ))}
            </ol>
          )}
        </PanelBody>
      );
    }
    case 'log':
      return (
        <PanelBody>
          {ctx.log.length === 0 ? (
            <p class="muted">Nothing has happened yet.</p>
          ) : (
            <ol class="replay-log" aria-label="Fight log">
              {ctx.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
        </PanelBody>
      );
  }
}
