/**
 * The parts the Forge's canvas shares (phase 5 step 3, `systems/forge.md`; the canvas itself is `ForgeCanvas.tsx`, an anvil's wizard
 * `ForgeAnvilPanel.tsx`): what the page asks the game to do (`ForgeActions`), what it can open at the start (`ForgeStart`), the shelf
 * (scrap, shards, Essence), one order of a queue as a button, the creature picker's rows for an anvil, and the floor's and the anvil's
 * numbers in `ui/DataTable`s (V-RET-9). The pure words are `forge-view.ts`; every spend and move is the game's (the server decides).
 * Before the canvas (2026-11-11) this was the Forge's scrolling page of anvil cards.
 */
import type { AnvilKit, ValleyAnvilView, ValleyOrderView } from '@creatures/game';
import type { Creature, OrderRequest, ValleyVisit } from '../api';
import { PartCount } from '../GearArt';
import { busyReason } from '../gear-view';
import { resourceCount, sayText, type Say } from '../resource-count';
import { baseOption, type PickerOption } from '../roster-picker';
import { CountBadge, SayLine } from '../ui/CountBadge';
import { DataTable } from '../ui/DataTable';
import type { CommonsStart } from './CommonsBoard';
import { percentOf } from './signpost-view';
import {
  ANVIL_KIT_INFO,
  SHARD_ELEMENTS,
  floorLine,
  floorRows,
  needsItems,
  orderName,
  orderProgress,
  orderWait,
  paceLine,
  reachName,
  smithStepName,
} from './forge-view';

/** The sentinel row of the creature picker that empties an anvil. */
export const REMOVE_ID = '';

/** The id of the card a hand drops a creature on to help build (the project board's communal seat). */
export const COMMUNAL_DROP = 'communal:forge';

/** An order editor to open: a new order on an anvil, or an order that exists. */
export type OrderOpen =
  | { kind: 'add'; anvilId: string; opener: HTMLElement | null }
  | { kind: 'edit'; orderId: string; opener: HTMLElement | null };

/** What the page asks the game to do; each answers whether the server took it. */
export interface ForgeActions {
  /** Posts a creature to an anvil (a creature that stands elsewhere swaps) or empties it (`null`). */
  post: (body: { seatId: string; creatureId: string | null }) => Promise<boolean>;
  buyAnvil: () => Promise<boolean>;
  /** Buys a kit (a keyed spend). */
  buyKit: (kit: AnvilKit) => Promise<boolean>;
  setKit: (seatId: string, kit: AnvilKit | null) => Promise<boolean>;
  /** Adds, changes or takes off an order. */
  order: (request: OrderRequest) => Promise<boolean>;
}

/** What the canvas can open at the start (the workbench shows each). */
export interface ForgeStart {
  /** An anvil whose smith step is open (the creature picker). */
  picker?: string;
  /** An anvil whose kit step is open. */
  kit?: string;
  /** An anvil whose floor and numbers are open (the left drawer's floor, on that anvil). */
  floor?: string;
  /** The buy step of the next anvil is open. */
  buy?: boolean;
  /** The bag's "Filter and sort" starts open (the Workshop draws it). */
  bag?: boolean;
  /** The project board's drawer or picker to open (the commons). */
  commons?: CommonsStart;
  /** The fire's numbers start open. */
  fire?: boolean;
}

/** The shelf as one row of counts: scrap, the five shards and Essence. */
export function Shelf({ visit }: { visit: ValleyVisit }) {
  const { shelf } = visit.forge;
  return (
    <ul class="parts-row fg-parts" aria-label="The shelf">
      <li class={shelf.scrap === 0 ? 'none' : undefined}>
        <PartCount kind="scrap" amount={shelf.scrap} />
      </li>
      {SHARD_ELEMENTS.map((element) => {
        const held = shelf.shards[element] ?? 0;
        return (
          <li key={element} class={held === 0 ? 'none' : undefined}>
            <PartCount kind={`${element}-shard`} amount={held} />
          </li>
        );
      })}
      <li class={shelf.essence === 0 ? 'none' : undefined}>
        <CountBadge {...resourceCount('essence', shelf.essence, { entry: 'essence' })} />
      </li>
    </ul>
  );
}

/** One order of a queue as a button: its name and progress, and under it what it takes or waits on. */
export function OrderRow({
  order,
  onOpen,
  disabled,
}: {
  order: ValleyOrderView;
  onOpen: (opener: HTMLElement) => void;
  disabled: boolean;
}) {
  const wait = orderWait(order);
  const reach = reachName(order.reach);
  const needs: Say = needsItems(order);
  return (
    <li>
      <button
        type="button"
        class="sp-line sp-pack fg-order"
        disabled={disabled}
        aria-label={`${orderName(order)}, ${orderProgress(order)}${reach === '' ? '' : ', ' + reach}. ${wait === null ? 'Takes ' + sayText(needs) : sayText(wait)}. Change the order`}
        onClick={(event) => {
          onOpen(event.currentTarget);
        }}
      >
        <span class="fg-order-text">
          <strong class="pix fg-order-name">{orderName(order)}</strong>
          <span class="fg-order-sub">
            {[orderProgress(order), reach].filter((part) => part !== '').join(' · ')}
            {' · '}
            <SayLine say={wait ?? needs} />
          </span>
        </span>
      </button>
    </li>
  );
}

/** The creature picker's rows for an anvil: everyone who can be posted; who stands at another post swaps here. */
export function pickerOptions(
  visit: ValleyVisit,
  creatures: readonly Creature[],
  anvil: ValleyAnvilView,
): PickerOption[] {
  const rows: PickerOption[] = [
    {
      ...baseOption({ id: REMOVE_ID, species: '', nickname: null, level: 0 }),
      name: 'Back to resting',
      action: true,
      disabled: anvil.creatureId === null ? 'Nobody is posted here' : null,
    },
  ];
  for (const c of [...creatures].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))) {
    const reason = busyReason(c);
    const at = visit.creatures.find((r) => r.id === c.id)?.seatId ?? null;
    rows.push({
      ...baseOption(c),
      onBoard: at !== null && at !== anvil.id,
      disabled: c.id === anvil.creatureId ? 'Smithing here' : reason,
      ...(reason === null
        ? {}
        : { busy: c.busy?.kind === 'job' ? ('job' as const) : ('away' as const) }),
    });
  }
  return rows;
}

/** What the floor holds and what the anvil brings a day, with the mastery and kit that make it (V-RET-9). */
export function AnvilNumbers({ anvil }: { anvil: ValleyAnvilView }) {
  const kit = anvil.kit === null ? 'None' : ANVIL_KIT_INFO[anvil.kit].name;
  const { step, bonusBp } = anvil.mastery;
  return (
    <div class="dr-stack pix-panel">
      <p class="sp-note">{floorLine(anvil)}</p>
      <h4 class="pix sp-sub">On the floor</h4>
      <DataTable rows={floorRows(anvil)} tabular />
      <h4 class="pix sp-sub">A day brings</h4>
      <DataTable rows={[{ label: 'Pieces', value: paceLine(anvil).replace('About ', '') }]} />
      <h4 class="pix sp-sub">What makes it</h4>
      <DataTable
        rows={[
          {
            label: 'Mastery',
            value: step === 0 ? smithStepName(0) : `${smithStepName(step)}, ${percentOf(bonusBp)}`,
          },
          { label: 'Kit', value: kit },
        ]}
      />
    </div>
  );
}
