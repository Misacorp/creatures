/**
 * The Forge's order editor (V-FORGE-1): a drawer that adds an order to an anvil's queue (a blueprint the player knows and a count, or
 * "for my team"; optionally a Reach), changes a queued order's count or Reach, or takes it off. It is drawn by the Workshop, so an
 * anvil's "Add an order" and a blueprint's "Order" open the same one. The blueprint is picked inside the same drawer (a drill-in with
 * `ui/DrillHead`), the Reach is a short `ChoiceList`, the count is a `CountStepper`, and what one piece takes from the shelf is the shared
 * `ui/RecipeCard` (compact). Orders are free and repeatable, so there is no key; the server decides what is allowed.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  VALLEY_RULES,
  patchworkBase,
  patchworkBlueprint,
  type Element,
  type ReachId,
  type ValleyOrderView,
} from '@creatures/game';
import type { OrderRequest, ValleyVisit } from '../api';
import { partBadge } from '../count-items';
import { elementName } from '../game';
import type { BlueprintView } from '../gear-view';
import { slotName } from '../gear-view';
import { resourceIconRef } from '../icon-ref';
import type { PartKind } from '../gear-types';
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CountBadge, type CountItem } from '../ui/CountBadge';
import { CountStepper } from '../ui/CountStepper';
import { Drawer } from '../ui/Drawer';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { RecipeCard } from '../ui/RecipeCard';
import { Segmented } from '../ui/Segmented';
import { Slot, SlotRow } from '../ui/Slot';
import type { OrderOpen } from './ForgeAnvils';
import { SlotText } from './seat-parts';
import {
  REACH_CHOICES,
  SHARD_ELEMENTS,
  anvilName,
  mostHeldElement,
  orderName,
  reachName,
} from './forge-view';

/** What the editor asks the game to do. */
export interface OrderEditorProps {
  open: OrderOpen & { baseId?: string };
  visit: ValleyVisit;
  /** The blueprints the player knows; null until the gear view has loaded. */
  blueprints: readonly BlueprintView[] | null;
  busy: boolean;
  error: string | null;
  /** Sends one order request; answers whether the server took it. */
  onOrder: (request: OrderRequest) => Promise<boolean>;
  onClose: () => void;
}

const TEAM = 'team';

/** A shard's icon with how many are held now (a patchwork order's shard choice). Icons, no words (decision 2026-11-06). */
function ShardNow({ element, visit }: { element: string; visit: ValleyVisit }) {
  return (
    <PlainBadge
      kind={`${element}-shard` as PartKind}
      amount={visit.forge.shelf.shards[element] ?? 0}
    />
  );
}

/** A part's count badge without its glossary link, for use inside a button (a button never holds a button). */
function PlainBadge({ kind, amount }: { kind: PartKind; amount: number }) {
  const { entry: _entry, ...badge } = partBadge(kind, amount);
  return <CountBadge {...badge} />;
}

/** The order and the anvil it stands in, for an order id. */
function findOrder(
  visit: ValleyVisit,
  orderId: string,
): { order: ValleyOrderView; anvilId: string } | undefined {
  for (const anvil of visit.anvils) {
    const order = anvil.orders.find((o) => o.id === orderId);
    if (order !== undefined) return { order, anvilId: anvil.id };
  }
  return undefined;
}

/**
 * What one piece takes from the shelf, as the recipe card's inputs, with what the shelf holds. A patchwork blueprint (V-FORGE-12) has its
 * own price (`cost`, content data); its shard is the chosen element's, or the pile held most now.
 */
function inputsOf(
  visit: ValleyVisit,
  element: string | null,
  reach: ReachId,
  cost?: { scrap: number; shards: number },
): (CountItem & { amount: number; have: number })[] {
  const { shelf } = visit.forge;
  const forge = VALLEY_RULES.forge;
  const scrap = cost?.scrap ?? forge.scrap;
  const shards = cost?.shards ?? forge.shard;
  const inputs: (CountItem & { amount: number; have: number })[] = [
    {
      key: 'scrap',
      ...partBadge('scrap', scrap),
      amount: scrap,
      have: shelf.scrap,
    },
  ];
  if (element !== null) {
    inputs.push({
      key: 'shard',
      ...partBadge(`${element}-shard` as PartKind, shards),
      amount: shards,
      have: shelf.shards[element] ?? 0,
    });
  }
  if (reach !== 'none') {
    const essence = forge.reach[reach].essence;
    inputs.push({
      key: 'essence',
      icon: resourceIconRef('essence'),
      label: 'Essence',
      amount: essence,
      have: shelf.essence,
    });
  }
  return inputs;
}

export function OrderEditor({
  open,
  visit,
  blueprints,
  busy,
  error,
  onOrder,
  onClose,
}: OrderEditorProps) {
  const found = open.kind === 'edit' ? findOrder(visit, open.orderId) : undefined;
  const [anvilId, setAnvilId] = useState(
    open.kind === 'add' ? open.anvilId : (found?.anvilId ?? ''),
  );
  const [what, setWhat] = useState<string | null>(
    open.kind === 'add' ? (open.baseId ?? null) : null,
  );
  const [count, setCount] = useState(found?.order.count ?? 1);
  const [reach, setReach] = useState<ReachId>(found?.order.reach ?? 'none');
  /** A patchwork order's shard element (V-FORGE-12); null: the pile held most when a piece starts. */
  const [shardPick, setShardPick] = useState<string | null>(null);
  const [drill, setDrill] = useState<'what' | 'shard' | null>(null);
  const { queueMax, orderCountMax } = visit.forge;
  const anvil = visit.anvils.find((a) => a.id === anvilId);
  const title = open.kind === 'add' ? 'Add an order' : 'Change the order';
  const meta = anvil === undefined ? undefined : anvilName(visit, anvil);

  // An order that left the queue (finished, taken off) while the drawer was open: nothing to edit, so it closes.
  const gone = open.kind === 'edit' && found === undefined;
  useEffect(() => {
    if (gone) onClose();
  }, [gone]);
  if (gone) return null;
  const editing = found?.order;
  const forTeam = editing === undefined ? what === TEAM : editing.forTeam;
  const blueprint =
    editing !== undefined
      ? blueprints?.find((b) => b.baseId === editing.blueprintId)
      : blueprints?.find((b) => b.baseId === what);
  const patch =
    editing !== undefined
      ? patchworkBlueprint(editing.blueprintId ?? '')
      : patchworkBlueprint(blueprint?.baseId ?? '');
  // A patchwork order's shard: the one named, or (named none) the pile held most right now.
  const chosen = editing === undefined ? shardPick : (editing.needs.shardElement ?? null);
  const mostHeld = mostHeldElement(visit.forge.shelf.shards);
  const element = forTeam
    ? null
    : patch !== undefined
      ? (chosen ?? mostHeld)
      : (blueprint?.element ?? editing?.needs.shardElement ?? null);
  const queueFull = editing === undefined && anvil !== undefined && anvil.orders.length >= queueMax;
  const reason =
    editing !== undefined
      ? null
      : anvil === undefined
        ? 'Buy an anvil first.'
        : queueFull
          ? 'This anvil’s queue is full.'
          : what === null
            ? 'Choose what to make.'
            : null;

  const outputs: CountItem[] = forTeam
    ? [
        {
          key: 'team',
          icon: { kind: 'glyph', id: 'anvil' },
          amount: 1,
          label: 'A piece for the team',
        },
      ]
    : patch !== undefined && element !== null
      ? // The piece it makes is the plainest piece of its slot in that shard's element: its own look and tint.
        [
          {
            key: 'piece',
            icon: { kind: 'gear', baseId: patchworkBase(patch.slot, element as Element).id },
            amount: 1,
            label: patchworkBase(patch.slot, element as Element).name,
          },
        ]
      : [
          {
            key: 'piece',
            icon: { kind: 'gear', baseId: blueprint?.baseId ?? editing?.blueprintId ?? '' },
            amount: 1,
            label: blueprint?.name ?? (editing === undefined ? 'A piece' : orderName(editing)),
          },
        ];

  if (drill === 'shard' && editing === undefined) {
    return (
      <Drawer open onClose={onClose} title={title} meta={meta} returnFocusTo={open.opener}>
        <div
          class="dr-stack"
          onKeyDown={onDrillKey(() => {
            setDrill(null);
          })}
        >
          <DrillHead
            title="Which shards"
            backLabel="to the order"
            focus
            onBack={() => {
              setDrill(null);
            }}
          />
          <div class="pix-panel">
            <ChoiceList label="Shards">
              <ChoiceButton
                label="Most held"
                line={<ShardNow element={mostHeld} visit={visit} />}
                selected={shardPick === null}
                disabled={false}
                onClick={() => {
                  setShardPick(null);
                  setDrill(null);
                }}
              />
              {SHARD_ELEMENTS.map((e) => (
                <ChoiceButton
                  key={e}
                  label={elementName(e)}
                  line={<ShardNow element={e} visit={visit} />}
                  selected={shardPick === e}
                  disabled={false}
                  onClick={() => {
                    setShardPick(e);
                    setDrill(null);
                  }}
                />
              ))}
            </ChoiceList>
          </div>
        </div>
      </Drawer>
    );
  }
  if (drill === 'what' && editing === undefined) {
    return (
      <Drawer open onClose={onClose} title={title} meta={meta} returnFocusTo={open.opener}>
        <div
          class="dr-stack"
          onKeyDown={onDrillKey(() => {
            setDrill(null);
          })}
        >
          <DrillHead
            title="What to make"
            backLabel="to the order"
            focus
            onBack={() => {
              setDrill(null);
            }}
          />
          <div class="pix-panel">
            <ChoiceList label="Blueprints">
              <ChoiceButton
                label="For my team"
                line="Pieces for the creatures with empty or weaker slots, until they are dressed."
                selected={what === TEAM}
                disabled={false}
                onClick={() => {
                  setWhat(TEAM);
                  setDrill(null);
                }}
              />
              {(blueprints ?? []).map((bp) => (
                <ChoiceButton
                  key={bp.baseId}
                  label={bp.name}
                  line={
                    bp.patchwork === undefined ? (
                      `${slotName(bp.slot)}${bp.element === null ? '' : ' · ' + elementName(bp.element)}`
                    ) : (
                      <>
                        {slotName(bp.slot)} ·{' '}
                        <PlainBadge kind="scrap" amount={bp.patchwork.scrap} />{' '}
                        <PlainBadge
                          kind={`${mostHeld}-shard` as PartKind}
                          amount={bp.patchwork.shards}
                        />
                      </>
                    )
                  }
                  selected={what === bp.baseId}
                  disabled={false}
                  onClick={() => {
                    setWhat(bp.baseId);
                    setShardPick(null);
                    setDrill(null);
                  }}
                />
              ))}
            </ChoiceList>
          </div>
        </div>
      </Drawer>
    );
  }

  const send = async (request: OrderRequest): Promise<void> => {
    if (await onOrder(request)) onClose();
  };
  const unchanged =
    editing !== undefined &&
    reach === editing.reach &&
    (editing.forTeam || count === editing.count);

  return (
    <Drawer open onClose={onClose} title={title} meta={meta} returnFocusTo={open.opener}>
      <div class="dr-stack">
        {editing === undefined && visit.anvils.length > 1 && (
          <Segmented
            label="Anvil"
            options={visit.anvils.map((a) => ({ id: a.id, label: anvilName(visit, a) }))}
            value={anvilId}
            onChange={setAnvilId}
          />
        )}
        <SlotRow
          label="Order"
          slots={[
            editing !== undefined ? (
              <Slot
                kind="talent"
                state="filled"
                label={`${orderName(editing)}, ${String(editing.made)} made`}
              >
                <SlotText name={orderName(editing)} sub={`${String(editing.made)} made`} />
              </Slot>
            ) : what === null ? (
              <Slot
                kind="talent"
                state="empty"
                name="Choose"
                label="What to make: nothing chosen. Choose"
                disabled={busy || blueprints === null}
                onClick={() => {
                  setDrill('what');
                }}
              />
            ) : (
              <Slot
                kind="talent"
                state="filled"
                label={`What to make: ${forTeam ? 'for my team' : (blueprint?.name ?? '')}. Change`}
                disabled={busy}
                onClick={() => {
                  setDrill('what');
                }}
              >
                <SlotText
                  name={forTeam ? 'For my team' : (blueprint?.name ?? '')}
                  sub={forTeam ? 'Until dressed' : 'Blueprint'}
                />
              </Slot>
            ),
            ...(patch !== undefined && editing === undefined
              ? [
                  <Slot
                    kind="talent"
                    state="filled"
                    label={`Shards: ${shardPick === null ? 'most held, now ' + elementName(mostHeld) : elementName(shardPick)}. Change`}
                    disabled={busy}
                    onClick={() => {
                      setDrill('shard');
                    }}
                  >
                    <SlotText
                      name={shardPick === null ? 'Most held' : elementName(shardPick)}
                      sub={<ShardNow element={shardPick ?? mostHeld} visit={visit} />}
                    />
                  </Slot>,
                ]
              : []),
          ]}
        />
        {!forTeam && (
          <div class="fg-times">
            <span class="fg-times-name">How many</span>
            <CountStepper
              label="piece"
              value={count}
              min={Math.max(1, editing?.made ?? 1)}
              max={orderCountMax}
              onChange={setCount}
              disabled={busy}
            />
          </div>
        )}
        {patch === undefined && (
          <ChoiceList label="Reach">
            {REACH_CHOICES.map((choice) => (
              <ChoiceButton
                key={choice.id}
                label={choice.name}
                line={choice.line}
                selected={reach === choice.id}
                disabled={busy}
                onClick={() => {
                  setReach(choice.id);
                }}
              />
            ))}
          </ChoiceList>
        )}
        <RecipeCard
          compact
          inputs={inputsOf(
            visit,
            element,
            patch === undefined ? reach : 'none',
            patch === undefined ? undefined : { scrap: patch.scrap, shards: patch.shards },
          )}
          outputs={outputs}
          actionLabel="Order"
          onStart={() => undefined}
        />
        {forTeam && <p class="muted sp-note">Each piece also takes a shard of its element.</p>}
        {reason !== null && <Alert level="info">{reason}</Alert>}
        {error !== null && <Alert level="alert">{error}</Alert>}
        {editing === undefined ? (
          <ActionButton
            label="Add to the queue"
            detail={reach === 'none' || patch !== undefined ? '' : reachName(reach)}
            wide
            large
            disabled={busy || reason !== null}
            onClick={() => {
              if (anvil === undefined) return;
              void send(
                what === TEAM
                  ? { action: 'add', seatId: anvil.id, forTeam: true, reach }
                  : {
                      action: 'add',
                      seatId: anvil.id,
                      blueprintId: what ?? '',
                      count,
                      reach: patch === undefined ? reach : 'none',
                      ...(patch !== undefined && shardPick !== null ? { element: shardPick } : {}),
                    },
              );
            }}
          />
        ) : (
          <>
            <ActionButton
              label="Save"
              wide
              large
              disabled={busy || unchanged}
              onClick={() => {
                void send({
                  action: 'edit',
                  orderId: editing.id,
                  ...(editing.forTeam ? {} : { count }),
                  reach,
                });
              }}
            />
            <button
              type="button"
              class="danger"
              disabled={busy}
              onClick={() => {
                void send({ action: 'remove', orderId: editing.id });
              }}
            >
              Take it off the queue
            </button>
          </>
        )}
      </div>
    </Drawer>
  );
}
