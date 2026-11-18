/**
 * What the raid canvas's drawers hold (docs/design/combat/raid-screen.md, sections 1 and 6). The right drawer is the one thing tapped
 * (your creature, another player's, a seat, a boss move, a swap request, the finale order); the left drawer is a collection or overview
 * from a plate on the scene's frame (Weekend, Boss, Players, Log). Each is built from the game's own pieces: the creature configurator,
 * the gear list, the talent chip, the move tile, the rule cards, the timeline and the stage rows. A choice inside a drawer is a step of the
 * drawer (`StepBody`), never a sheet on it. Every name is the server's and is drawn as text.
 */
import { useState } from 'preact/hooks';
import { AbilityChipV2 } from '../AbilityChipV2';
import { ArmourChip, RuleCards } from '../BossCardV2';
import type { Creature } from '../api';
import { CreatureConfigurator, type ConfiguratorParts } from '../CreatureConfigurator';
import { creatureName, getSpecies } from '../game';
import { GearList } from '../GearList';
import { moveHelp } from '../move-help';
import { usePopoverHost } from '../PopoverHost';
import { baseOption, pickerOptions, toPickerCreature, type PickerOption } from '../roster-picker';
import { RaidNews } from '../RaidNews';
import { RaidTimeline } from '../RaidTimeline';
import type { RaidPhaseId, RaidView, RowSlotView } from '../raid-api';
import { incomingText, litMove, outgoingText, placeTextV2 } from '../raid-board-v2';
import { rankLabel } from '../raid-progress';
import type { BossMoveV2, RaidV2View } from '../raid-v2-api';
import { StageResultRow } from '../StageResultRow';
import { ElementChip } from '../sprites/ElementChip';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';
import { TalentChip } from '../TalentChip';
import type { TeamConfigure } from '../TeamCreaturePage';
import { ActionButton } from '../ui/ActionButton';
import { CreatureList } from '../ui/CreatureList';
import { MoveTile } from '../ui/MoveTile';
import { Nameplate } from '../ui/Nameplate';
import { Tag } from '../ui/Tag';
import { TrackStrip } from '../ui/TrackStrip';
import { PanelBody } from '../valley/PlaceCanvas';
import { StepBody } from '../valley/PanelStep';
import type { Intent } from '../raid-slots';
import { gearOf, talentsOf } from './extras';
import type { LeftPanel, RightPanel } from './taps';
import type { ActionId } from '../finale-v2';
import type { FinaleWindow } from '../live';

/** What a raid asks of a creature while the board can change; once a stage plays the board is locked: what it wears, nothing to change. */
const OPEN_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  knack: true,
  gear: true,
  talents: true,
};
const LOCKED_PARTS: ConfiguratorParts = {
  experience: true,
  stats: true,
  knack: true,
  knackLocked: true,
  gear: true,
  gearLocked: true,
};

type Party = NonNullable<RaidView['party']>;

/** What the drawers read and do; the canvas builds it once. */
export interface PanelCtx {
  view: RaidView;
  v2: RaidV2View;
  party: Party;
  serverNow: number;
  finale: FinaleWindow;
  owned: readonly Creature[];
  configure: TeamConfigure | undefined;
  /** The board can change (you may edit and no stage is playing). */
  canEdit: boolean;
  busy: boolean;
  intent: (intent: Intent) => void;
  askSwap: (mySlot: number, theirSlot: number) => void;
  answerSwap: (id: string, answer: 'accept' | 'decline') => void;
  cancelSwap: (id: string) => void;
  setAbility: (id: ActionId) => void;
  setAutofire: (on: boolean) => void;
  openPage: (creatureId: string) => void;
  openRight: (panel: RightPanel | null) => void;
  openLeft: (panel: LeftPanel | null) => void;
  watch: (phase: RaidPhaseId) => void;
  /** The fight log so far (the events' own text), while a stage plays. */
  log: readonly string[];
  /** Whether a stage plays on the scene now. */
  playing: boolean;
}

const placeAt = (ctx: PanelCtx) => (slot: number) =>
  placeTextV2(slot, { rows: ctx.v2.rows, cols: ctx.v2.cols });

/** The title of a right-drawer panel (the drawer's heading, a phone page's too). */
export function rightTitle(ctx: PanelCtx, panel: RightPanel): string {
  switch (panel.kind) {
    case 'mine': {
      const c = ctx.owned.find((o) => o.id === panel.creatureId);
      return c === undefined ? 'Creature' : creatureName(c);
    }
    case 'theirs':
      return ctx.party.row.find((s) => s.slot === panel.slot)?.creature?.name ?? 'Creature';
    case 'seat':
      return placeAt(ctx)(panel.slot);
    case 'move':
      return ctx.v2.card.moves.find((m) => m.id === panel.moveId)?.name ?? 'Boss move';
    case 'swap':
      return 'Swap request';
    case 'order':
      return 'Finale order';
  }
}

export function RightPanelBody({ ctx, panel }: { ctx: PanelCtx; panel: RightPanel }) {
  switch (panel.kind) {
    case 'mine':
      return <MinePanel ctx={ctx} creatureId={panel.creatureId} />;
    case 'theirs':
      return <TheirsPanel ctx={ctx} slot={panel.slot} />;
    case 'seat':
      return <SeatPanel ctx={ctx} slot={panel.slot} />;
    case 'move':
      return <MovePanel ctx={ctx} moveId={panel.moveId} />;
    case 'swap':
      return <SwapPanel ctx={ctx} id={panel.id} />;
    case 'order':
      return <OrderPanel ctx={ctx} />;
  }
}

/** One of your creatures: the configurator (role, Knack, talents, gear), its page, and off the board while the board can change. */
function MinePanel({ ctx, creatureId }: { ctx: PanelCtx; creatureId: string }) {
  const creature = ctx.owned.find((c) => c.id === creatureId);
  if (creature === undefined) {
    return (
      <PanelBody>
        <p class="muted">This creature is not available.</p>
      </PanelBody>
    );
  }
  const onBoard = ctx.party.row.some((s) => s.creature?.creatureId === creatureId);
  const out = ctx.v2.out.some((o) => o.creatureId === creatureId);
  return (
    <PanelBody>
      {out && <p class="muted small">Out this weekend: it cannot be placed.</p>}
      {!onBoard && !out && <p class="muted small">Not on the board.</p>}
      {ctx.configure === undefined ? (
        <p class="muted">{`${creatureName(creature)}, level ${String(creature.level)}`}</p>
      ) : (
        <CreatureConfigurator
          key={creature.id}
          creature={creature}
          state={ctx.configure.state}
          gear={ctx.configure.gear}
          busy={ctx.configure.busy}
          parts={ctx.canEdit ? OPEN_PARTS : LOCKED_PARTS}
          actions={ctx.configure.actions}
          buttons={[
            {
              label: 'Creature page',
              withCreature: true,
              onAct: () => {
                ctx.openPage(creature.id);
              },
            },
            ...(ctx.canEdit && onBoard
              ? [
                  {
                    label: 'Remove from board',
                    danger: true,
                    withCreature: true,
                    onAct: () => {
                      ctx.openRight(null);
                      ctx.intent({ type: 'unplace', creatureId: creature.id });
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
    </PanelBody>
  );
}

/** The creatures of yours on the board, as the options of a swap offer (the seat is the note). */
export function swapChoices(party: Party, place: (slot: number) => string): PickerOption[] {
  return party.row.flatMap((s) =>
    s.creature?.mine === true && s.creature.creatureId !== undefined
      ? [
          {
            ...baseOption({
              id: s.creature.creatureId,
              species: s.creature.species,
              nickname: s.creature.name,
              level: s.creature.level,
            }),
            note: place(s.slot),
          },
        ]
      : [],
  );
}

/** Another player's creature: read-only (owner, level, role, Knack, talents, worn gear), and Ask to swap while the board can change. */
function TheirsPanel({ ctx, slot }: { ctx: PanelCtx; slot: number }) {
  const [asking, setAsking] = useState(false);
  const cell: RowSlotView | undefined = ctx.party.row.find((s) => s.slot === slot);
  const c = cell?.creature ?? null;
  const entry = ctx.v2.creatures.find((e) => e.slot === slot);
  if (c === null) {
    return (
      <PanelBody>
        <p class="muted">That seat is empty now.</p>
      </PanelBody>
    );
  }
  const species = getSpecies(c.species);
  const talents = talentsOf(entry);
  const gear = gearOf(entry);
  const place = placeAt(ctx);
  const mine = ctx.party.row.filter((s) => s.creature?.mine === true).length;
  if (asking) {
    return (
      <StepBody
        title={`Swap with ${c.ownerName}'s ${c.name}`}
        backLabel="to the creature"
        onBack={() => {
          setAsking(false);
        }}
      >
        <CreatureList
          options={swapChoices(ctx.party, place)}
          showEffects={false}
          placedNote=""
          selection={{
            mode: 'pick',
            label: 'Your creature to offer',
            onPick: (creatureId) => {
              const mySlot = ctx.party.row.find((s) => s.creature?.creatureId === creatureId)?.slot;
              setAsking(false);
              ctx.openRight(null);
              if (mySlot !== undefined) ctx.askSwap(mySlot, slot);
            },
          }}
        />
      </StepBody>
    );
  }
  return (
    <PanelBody
      footer={
        ctx.canEdit && mine > 0 ? (
          <ActionButton
            label="Ask to swap"
            wide
            onClick={() => {
              setAsking(true);
            }}
          />
        ) : undefined
      }
    >
      <div class="rc-stack">
        <div class="rc-head">
          <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={4} />
          <div class="rc-head-text">
            <Nameplate level={c.level} levelPrefix="Lv">
              {c.name}
            </Nameplate>
            {species !== undefined && <ElementChip element={species.element} role={species.role} />}
          </div>
        </div>
        <p class="muted small">{`${c.ownerName} · ${place(slot)}`}</p>
        {entry?.knackName != null && (
          <p>
            <Tag kind="chip">{entry.knackName}</Tag>
          </p>
        )}
        {talents.length > 0 && (
          <ul class="rc-talents" aria-label="Talents">
            {talents.map((t) => (
              <li key={t.id ?? t.name}>
                <TalentChip talent={t} />
              </li>
            ))}
          </ul>
        )}
        {gear.length > 0 && <GearList level={c.level} worn={gear} emptySlots={false} />}
      </div>
    </PanelBody>
  );
}

/** An empty seat of yours: pick a creature for it. */
function SeatPanel({ ctx, slot }: { ctx: PanelCtx; slot: number }) {
  const options = pickerOptions({
    creatures: ctx.owned.map(toPickerCreature),
    row: ctx.party.row,
    length: ctx.party.rowLength,
    slot,
    turnOrder: ctx.view.boss.turnOrder,
    showEffects: false,
    max: ctx.v2.seats,
    out: new Set(ctx.v2.out.filter((o) => o.mine).map((o) => o.creatureId)),
  });
  return (
    <PanelBody>
      <CreatureList
        options={options}
        showEffects={false}
        placedNote="On the board · moves here"
        class="flat"
        selection={{
          mode: 'pick',
          label: 'Creatures to place',
          onPick: (creatureId) => {
            ctx.openRight(null);
            ctx.intent({ type: 'place', creatureId, slot });
          },
        }}
      />
    </PanelBody>
  );
}

/** A boss move: what it does, how often it comes, and a tag for each keyword on it (its slots are lit on the board). */
function MovePanel({ ctx, moveId }: { ctx: PanelCtx; moveId: string }) {
  const move = ctx.v2.card.moves.find((m) => m.id === moveId);
  if (move === undefined) {
    return (
      <PanelBody>
        <p class="muted">This move is not on the card.</p>
      </PanelBody>
    );
  }
  const help = moveHelp(move);
  return (
    <PanelBody>
      <div class="rc-stack">
        <strong class="pix">{help.name}</strong>
        <p class="muted small">{help.label}</p>
        <p>{help.what}</p>
        <p>{help.rhythm}</p>
        {help.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        {help.keywords.length > 0 && (
          <p class="tags">
            {help.keywords.map((k) => (
              <Tag key={k.name} entry={k.entry}>
                {k.name}
              </Tag>
            ))}
          </p>
        )}
      </div>
    </PanelBody>
  );
}

/** A swap request: who asks, which seats, Accept or Decline (or Cancel for the asker). */
function SwapPanel({ ctx, id }: { ctx: PanelCtx; id: string }) {
  const grid = { rows: ctx.v2.rows, cols: ctx.v2.cols };
  const incoming = ctx.v2.swaps.incoming.find((r) => r.id === id);
  const outgoing = ctx.v2.swaps.outgoing.find((r) => r.id === id);
  const request = incoming ?? outgoing;
  if (request === undefined) {
    return (
      <PanelBody>
        <p class="muted">That request has ended.</p>
      </PanelBody>
    );
  }
  const seats =
    request.creatureB === null
      ? ''
      : `${placeTextV2(request.slotA, grid)} and ${placeTextV2(request.slotB, grid)}`;
  return (
    <PanelBody
      footer={
        incoming !== undefined ? (
          <div class="rc-actions">
            <ActionButton
              label="Accept"
              disabled={ctx.busy}
              onClick={() => {
                ctx.openRight(null);
                ctx.answerSwap(id, 'accept');
              }}
            />
            <button
              type="button"
              disabled={ctx.busy}
              onClick={() => {
                ctx.openRight(null);
                ctx.answerSwap(id, 'decline');
              }}
            >
              Decline
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={ctx.busy}
            onClick={() => {
              ctx.openRight(null);
              ctx.cancelSwap(id);
            }}
          >
            Cancel request
          </button>
        )
      }
    >
      <div class="rc-stack">
        <p>{incoming !== undefined ? incomingText(incoming, grid) : outgoingText(request, grid)}</p>
        {seats !== '' && <p class="muted small">{`Seats: ${seats}.`}</p>}
      </div>
    </PanelBody>
  );
}

/** The finale order: Rally, Shield Wall (its row is picked in the fight), Purge and Auto fire; the game's own chip. */
function OrderPanel({ ctx }: { ctx: PanelCtx }) {
  return (
    <PanelBody>
      <AbilityChipV2
        you={ctx.view.you}
        editable={ctx.finale === 'before'}
        busy={ctx.busy}
        onPick={ctx.setAbility}
        onAutoFire={ctx.setAutofire}
      />
    </PanelBody>
  );
}

// --- The left drawer ---

export const leftTitle = (panel: LeftPanel): string =>
  panel === 'weekend'
    ? 'Weekend'
    : panel === 'boss'
      ? 'Boss'
      : panel === 'players'
        ? 'Players'
        : 'Log';

export function LeftPanelBody({ ctx, panel }: { ctx: PanelCtx; panel: LeftPanel }) {
  switch (panel) {
    case 'weekend':
      return <WeekendPanel ctx={ctx} />;
    case 'boss':
      return <BossPanel ctx={ctx} />;
    case 'players':
      return <PlayersPanel ctx={ctx} />;
    case 'log':
      return <LogPanel ctx={ctx} />;
  }
}

/** The weekend: its timeline, each played stage with its result and Watch, last week's best, and (admins) the raid news channel. */
function WeekendPanel({ ctx }: { ctx: PanelCtx }) {
  const { view, v2, party } = ctx;
  return (
    <PanelBody>
      <div class="rc-stack">
        <RaidTimeline
          view={view}
          serverNow={ctx.serverNow}
          finale={ctx.finale}
          owned={ctx.owned.length}
          onAct={() => undefined}
          onReplay={ctx.watch}
          bare
        />
        {party.results.length > 0 && (
          <ul class="cards" aria-label="Played stages">
            {party.results.map((result) => (
              <StageResultRow
                key={result.phase}
                result={result}
                week={view.weekId}
                party={party.party}
                view={view}
                onReplay={() => {
                  ctx.watch(result.phase);
                }}
              />
            ))}
          </ul>
        )}
        {v2.bestShareBp > 0 && (
          <p class="muted small">
            {`Last week's best: ${String(Math.round(v2.bestShareBp / 100))}% of its HP.`}
          </p>
        )}
        <RaidNews />
      </div>
    </PanelBody>
  );
}

/** The boss: rule cards, every move with when it comes, Escalating, Boss Rank and the track, and a "?" to How to play. */
function BossPanel({ ctx }: { ctx: PanelCtx }) {
  const popovers = usePopoverHost();
  const { view, v2 } = ctx;
  const { card } = v2;
  const arena = { rows: v2.rows, cols: v2.cols };
  const rank = rankLabel(view.rank);
  const open = (move: BossMoveV2): void => {
    ctx.openRight({ kind: 'move', moveId: move.id });
  };
  return (
    <PanelBody>
      <div class="rc-stack">
        <div class="rc-boss-line">
          <strong class="pix">{view.boss.name}</strong>
          <ElementChip element={view.boss.element} context="boss" />
          <ArmourChip armour={card.armour} />
          {rank !== null && (
            <Tag tone="rank" entry="boss-rank">
              {rank}
            </Tag>
          )}
          <button
            type="button"
            class="rc-help"
            aria-label="How the raid works"
            onClick={() => {
              popovers?.openHowTo('raid-week');
            }}
          >
            ?
          </button>
        </div>
        <RuleCards card={card} />
        <ul class="boss-moves" aria-label="Boss moves">
          {card.moves.map((move) => (
            <li key={move.id}>
              <MoveTile
                move={move}
                arena={arena}
                lit={litMove(v2.preview, move).slots}
                selected={false}
                onToggle={() => {
                  open(move);
                }}
              />
            </li>
          ))}
        </ul>
        <TrackStrip order={v2.track.order} index={v2.track.index} rank={view.rank ?? v2.slot} />
      </div>
    </PanelBody>
  );
}

/** Everyone on the board with their creatures as sprites and levels; a tap opens one in the right drawer. */
function PlayersPanel({ ctx }: { ctx: PanelCtx }) {
  const byOwner = new Map<string, RowSlotView[]>();
  for (const s of ctx.party.row) {
    if (s.creature === null) continue;
    const list = byOwner.get(s.creature.ownerName) ?? [];
    list.push(s);
    byOwner.set(s.creature.ownerName, list);
  }
  return (
    <PanelBody>
      <ul class="rc-players" aria-label="Players">
        {[...byOwner.entries()].map(([owner, seats]) => (
          <li key={owner} class="rc-player">
            <span class="pix rc-player-name">{owner}</span>
            <span class="rc-player-team">
              {seats.map((s) => {
                const c = s.creature;
                if (c === null) return null;
                return (
                  <button
                    key={s.slot}
                    type="button"
                    class="rc-mini"
                    aria-label={`${c.name}, level ${String(c.level)}, ${owner}`}
                    onClick={() => {
                      ctx.openRight(
                        c.mine && c.creatureId !== undefined
                          ? { kind: 'mine', creatureId: c.creatureId }
                          : { kind: 'theirs', slot: s.slot },
                      );
                    }}
                  >
                    <Sprite sprite={creatureSpriteOrFallback(c.species)} scale={2} />
                    <Nameplate size="sm" level={c.level} />
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </PanelBody>
  );
}

/** The fight log of the stage playing (the engine's own text, as it has happened so far). */
function LogPanel({ ctx }: { ctx: PanelCtx }) {
  return (
    <PanelBody>
      {ctx.log.length === 0 ? (
        <p class="muted">Nothing has happened yet.</p>
      ) : (
        <ol class="replay-log rc-log" aria-label="Fight log">
          {ctx.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
    </PanelBody>
  );
}
