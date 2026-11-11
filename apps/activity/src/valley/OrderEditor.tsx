/**
 * The Forge's order wizard (V-FORGE-1): adds an order to an anvil's queue (a blueprint the player knows and a count, or "for my team";
 * optionally a Reach), changes a queued order's count or Reach, or takes it off. It is drawn by the Workshop, so an anvil's "Add an
 * order" and a blueprint's "Order" open the same one. Its steps are `ui/Wizard`'s: what to make (a `ChoiceList`, a tap picks and goes
 * on), then the order itself (the count is a `CountStepper`, the Reach a short `ChoiceList`, what one piece takes from the shelf the
 * shared `ui/RecipeCard`, compact) with its one gold button pinned under it; a patchwork piece has a third step for its shard. A
 * blueprint chosen before it opens (the plans list's "Order") starts on the order step. `shell` says where it is drawn: a bottom
 * `Drawer` by default, or the Forge canvas's right drawer (a page on a phone). Orders are free and repeatable, so there is no key; the
 * server decides what is allowed.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  VALLEY_RULES,
  patchworkBase,
  patchworkBlueprint,
  type Element,
  type ReachId,
  type ValleyOrderView,
} from '@creatures/game';
import type { OrderRequest, ValleyVisit } from '../api';
import { elementName } from '../game';
import type { BlueprintView } from '../gear-view';
import { slotName } from '../gear-view';
import { resourceIconRef } from '../icon-ref';
import { anyShardCount, scrapCount, shardCount } from '../resource-count';
import { Alert } from '../ui/Alert';
import { ActionButton } from '../ui/ActionButton';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CostLine, SayLine, type CountItem } from '../ui/CountBadge';
import { CountStepper } from '../ui/CountStepper';
import { Drawer } from '../ui/Drawer';
import { RecipeCard } from '../ui/RecipeCard';
import { Segmented } from '../ui/Segmented';
import { Slot, SlotRow } from '../ui/Slot';
import { useWizard, type WizardStep } from '../ui/use-wizard';
import { WizardView } from '../ui/Wizard';
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
  /** Where the wizard is drawn; a bottom `Drawer` when absent. */
  shell?: OrderShell;
}

/** The parts a shell draws: the heading, what it is about, the wizard's body and the footer pinned under it. */
export interface OrderShellParts {
  title: string;
  meta: string | undefined;
  children: ComponentChildren;
  footer: ComponentChildren;
}

export type OrderShell = (parts: OrderShellParts) => ComponentChildren;

/** The steps of the order wizard. */
type OrderStep = 'what' | 'order' | 'shard';

const TEAM = 'team';

/** A shard's icon with how many are held now (a patchwork order's shard choice). Icons, no words (decision 2026-11-06). */
function ShardNow({ element, visit }: { element: string; visit: ValleyVisit }) {
  return <CostLine items={[shardCount(element, visit.forge.shelf.shards[element] ?? 0)]} />;
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
      ...scrapCount(scrap),
      amount: scrap,
      have: shelf.scrap,
    },
  ];
  if (element !== null) {
    inputs.push({
      ...shardCount(element, shards),
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

/** The bottom drawer an order wizard is drawn in when nothing else says where. */
const drawerShell =
  (open: OrderOpen, onClose: () => void): OrderShell =>
  ({ title, meta, children, footer }) => (
    <Drawer
      open
      onClose={onClose}
      title={title}
      meta={meta}
      returnFocusTo={open.opener}
      footer={footer}
    >
      {children}
    </Drawer>
  );

export function OrderEditor({
  open,
  visit,
  blueprints,
  busy,
  error,
  onOrder,
  onClose,
  shell,
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
  const { queueMax, orderCountMax } = visit.forge;
  const anvil = visit.anvils.find((a) => a.id === anvilId);
  const title = open.kind === 'add' ? 'Add an order' : 'Change the order';
  const meta = anvil === undefined ? undefined : anvilName(visit, anvil);
  // A blueprint chosen before it opens starts on the order step, and Back from there leaves; else the list of what to make comes first.
  const chosenBefore = open.kind === 'add' && open.baseId !== undefined;
  const steps: readonly WizardStep<OrderStep>[] =
    open.kind === 'edit'
      ? [{ id: 'order', title: 'Change the order', backLabel: 'to the Forge' }]
      : chosenBefore
        ? [
            { id: 'order', title: 'The order', backLabel: 'to the Forge' },
            { id: 'what', title: 'What to make', backLabel: 'to the order', back: 'order' },
            { id: 'shard', title: 'Which shards', backLabel: 'to the order', back: 'order' },
          ]
        : [
            { id: 'what', title: 'What to make', backLabel: 'to the Forge' },
            {
              id: 'order',
              title: 'The order',
              backLabel: 'to what to make',
              back: 'what',
              final: true,
            },
            { id: 'shard', title: 'Which shards', backLabel: 'to the order', back: 'order' },
          ];
  const wizard = useWizard(steps, { onExit: onClose });
  // The head takes the focus when a step opens after the first (the button that opened it is gone), not on the wizard's own opening.
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);

  // An order that left the queue (finished, taken off) while the wizard was open: nothing to edit, so it closes.
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

  const send = async (request: OrderRequest): Promise<void> => {
    if (await onOrder(request)) onClose();
  };
  const unchanged =
    editing !== undefined &&
    reach === editing.reach &&
    (editing.forTeam || count === editing.count);

  const whatStep = (
    <div class="pix-panel">
      <ChoiceList label="Blueprints">
        <ChoiceButton
          label="For my team"
          line="Pieces for the creatures with empty or weaker slots, until they are dressed."
          selected={what === TEAM}
          disabled={false}
          onClick={() => {
            setWhat(TEAM);
            wizard.goTo('order');
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
                  <CostLine
                    items={[
                      scrapCount(bp.patchwork.scrap),
                      shardCount(mostHeld, bp.patchwork.shards),
                    ]}
                  />
                </>
              )
            }
            selected={what === bp.baseId}
            disabled={false}
            onClick={() => {
              setWhat(bp.baseId);
              setShardPick(null);
              wizard.goTo('order');
            }}
          />
        ))}
      </ChoiceList>
    </div>
  );

  const shardStep = (
    <div class="pix-panel">
      <ChoiceList label="Shards">
        <ChoiceButton
          label="Most held"
          line={<ShardNow element={mostHeld} visit={visit} />}
          selected={shardPick === null}
          disabled={false}
          onClick={() => {
            setShardPick(null);
            wizard.goTo('order');
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
              wizard.goTo('order');
            }}
          />
        ))}
      </ChoiceList>
    </div>
  );

  const orderStep = (
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
                wizard.goTo('what');
              }}
            />
          ) : (
            <Slot
              kind="talent"
              state="filled"
              label={`What to make: ${forTeam ? 'for my team' : (blueprint?.name ?? '')}. Change`}
              disabled={busy}
              onClick={() => {
                wizard.goTo('what');
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
                    wizard.goTo('shard');
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
              line={<SayLine say={choice.line} />}
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
      {forTeam && (
        <p class="muted sp-note">
          <SayLine say={['Each piece also takes ', anyShardCount(1), ' of its element.']} />
        </p>
      )}
      {reason !== null && <Alert level="info">{reason}</Alert>}
      {error !== null && <Alert level="alert">{error}</Alert>}
      {editing !== undefined && (
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
      )}
    </div>
  );

  // The one gold button of the order step, pinned under the step.
  const footer =
    wizard.step !== 'order' ? undefined : editing === undefined ? (
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
    );

  const body = (
    <WizardView key={wizard.step} wizard={wizard} focus={opened.current}>
      {wizard.step === 'what' && whatStep}
      {wizard.step === 'shard' && editing === undefined && shardStep}
      {wizard.step === 'order' && orderStep}
    </WizardView>
  );
  return <>{(shell ?? drawerShell(open, onClose))({ title, meta, children: body, footer })}</>;
}
