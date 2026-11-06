/**
 * The Forge's page with the valley's systems on (phase 5 step 3, `systems/forge.md`): it replaces the Workshop's job slots and sits under
 * the Forge's scene, in the Workshop's left column. It is the Signpost's page for anvils: the creature tray (a hand can carry a creature
 * onto an anvil), the shelf (scrap, shards, Essence, the bag), then one card for each anvil, then the next anvil to buy.
 *
 * An anvil card is the shared slot row (`ui/Slot`: the smith, the kit; the smith opens `ui/RosterPicker` with "Back to resting", the kit a
 * `Drawer` of `ChoiceList`), then its queue of orders (a tap opens the order editor, `OrderEditor`, which the Workshop draws), the piece in
 * hand with its bar or why the smith tinkers (V-FORGE-2, 4), and the floor (`ui/Bar`; a tap opens its pieces by rarity and the anvil's
 * numbers in `ui/DataTable`s, V-RET-9). Buying an anvil or a kit is a keyed spend with one clear button (`SpendConfirm`). Shards are traded at the Market only (Q64): an anvil that waits on a shard says so and leads there.
 * The pure words are `forge-view.ts`; every spend and move is the game's (the server decides).
 */
import { useRef, useState } from 'preact/hooks';
import type { AnvilKit, ValleyAnvilView, ValleyOrderView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { PartCount } from '../GearArt';
import { busyReason } from '../gear-view';
import { acornCount, resourceCount, sayText, type Say } from '../resource-count';
import { baseOption, type PickerOption } from '../roster-picker';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { Alert } from '../ui/Alert';
import { Bar } from '../ui/Bar';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CountBadge, PriceLine, SayLine } from '../ui/CountBadge';
import { DataTable } from '../ui/DataTable';
import { DragGhost } from '../ui/DragGhost';
import { Drawer } from '../ui/Drawer';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { RosterPicker } from '../ui/RosterPicker';
import { Slot, SlotRow } from '../ui/Slot';
import { Tag } from '../ui/Tag';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { CommonsFire } from './CommonsFire';
import { SlotText, SpendConfirm, seatAt } from './seat-parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import { RAID_PAUSE, percentOf, seatPrice } from './signpost-view';
import {
  ANVIL_KIT_INFO,
  ANVIL_KIT_ORDER,
  SHARD_ELEMENTS,
  anvilBuyReason,
  anvilName,
  anvilPrice,
  floorLine,
  floorRows,
  needsItems,
  orderName,
  orderProgress,
  orderWait,
  paceLine,
  pieceLine,
  reachName,
  smithStepName,
  tinkerLine,
} from './forge-view';
import type { OrderRequest } from '../api';

/** The sentinel row of the creature picker that empties an anvil. */
const REMOVE_ID = '';

/** The id of the card a hand drops a creature on to help build (the project board's communal seat). */
const COMMUNAL_DROP = 'communal:forge';

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

/** What the page can open at the start (the workbench shows each). */
export interface ForgeStart {
  picker?: string;
  kit?: string;
  floor?: string;
  buy?: boolean;
  /** The bag's "Filter and sort" starts open (the Workshop draws it). */
  bag?: boolean;
  /** The project board's drawer or picker to open (the commons). */
  commons?: CommonsStart;
  /** The fire's numbers start open. */
  fire?: boolean;
}

/** The shelf as one row of counts: scrap, the five shards and Essence. */
function Shelf({ visit }: { visit: ValleyVisit }) {
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
function OrderRow({
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
        aria-haspopup="dialog"
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

export function ForgeAnvils({
  visit,
  creatures,
  trayInput,
  acorns,
  busy,
  error = null,
  actions,
  onOrder,
  onOpenPaddock,
  onOpenMarket,
  commons,
  start = {},
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  /** What the tray reads (the trips and jobs of the game, the server's now). */
  trayInput: TrayInput;
  /** The player's Acorns (the `bait` balance). */
  acorns: number;
  busy: boolean;
  /** The server's last error: the notice line is behind a drawer, so a drawer shows it itself. */
  error?: string | null;
  actions: ForgeActions;
  /** Opens the order editor (the Workshop draws it, so a blueprint can open it too). */
  onOrder: (open: OrderOpen) => void;
  /** A tap on a tray creature: the Paddock, as everywhere in the valley. */
  onOpenPaddock: () => void;
  /** The Market (Q64): the shard exchange lives there; `to` is the element an anvil waits for, so its exchange can start on it. */
  onOpenMarket: (to: string | null) => void;
  /** The Forge's project board and the communal seat on it (a hand can carry a creature onto the card); absent leaves the page as before. */
  commons?: CommonsActions;
  start?: ForgeStart;
}) {
  const [picking, setPicking] = useState<string | null>(start.picker ?? null);
  const [kitFor, setKitFor] = useState<string | null>(start.kit ?? null);
  const [buyingKit, setBuyingKit] = useState<AnvilKit | null>(null);
  const [floorOf, setFloorOf] = useState<string | null>(start.floor ?? null);
  const [buying, setBuying] = useState(start.buy === true);
  const openers = useRef<Record<string, HTMLElement | null>>({});
  const pageRef = useRef<HTMLElement | null>(null);

  const anvilOf = (id: string | null): ValleyAnvilView | undefined =>
    id === null ? undefined : visit.anvils.find((a) => a.id === id);
  const creatureOf = (id: string | null): Creature | undefined =>
    id === null ? undefined : creatures.find((c) => c.id === id);

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: pageRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, anvilId) => {
      if (anvilId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (anvilId === COMMUNAL_DROP && commons !== undefined) {
        void commons.post('forge', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      const anvil = anvilOf(anvilId);
      if (anvil === undefined || anvil.creatureId === creatureId) {
        return dropOutcome('none', null, null, '');
      }
      void actions.post({ seatId: anvilId, creatureId });
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = creatureOf(drag.drag?.creatureId ?? null);

  // The tray: the creatures a hand may carry (not on a job or a trip), the free ones first.
  const free = creatures.filter((c) => busyReason(c) === null);
  const ordered = trayFor(free, trayInput);

  /** The creature picker's rows for an anvil: everyone who can be posted; who stands at another post swaps here. */
  function pickerOptions(anvil: ValleyAnvilView): PickerOption[] {
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

  const pickedAnvil = anvilOf(picking);
  const kitAnvil = anvilOf(kitFor);
  const floorAnvil = anvilOf(floorOf);
  const buyReason = anvilBuyReason(visit, acorns);
  const nextPrice = visit.anvilPrices.next;
  const marketBuilt = visit.market?.open === true;

  return (
    <section
      class="sp-page fg-page"
      aria-label="Anvils"
      ref={pageRef}
      data-carrying={drag.drag === null ? undefined : 'yes'}
    >
      <Tray
        creatures={ordered}
        input={trayInput}
        label="Creatures to post"
        onPick={onOpenPaddock}
        drag={drag}
      />
      <CommonsFire visit={visit} start={start.fire === true} />
      <div class="fg-shelf">
        <Shelf visit={visit} />
      </div>
      <ul class="sp-seats" aria-label="Anvils">
        {visit.anvils.map((anvil) => {
          const name = anvilName(visit, anvil);
          const smith = creatureOf(anvil.creatureId);
          const over = drag.drag?.over === anvil.id;
          const kit = anvil.kit === null ? null : ANVIL_KIT_INFO[anvil.kit];
          const tinker = tinkerLine(anvil, marketBuilt);
          const piece = pieceLine(anvil);
          const room = anvil.orders.length < visit.forge.queueMax;
          return (
            <li key={anvil.id} class={`sp-seat${over ? ' over' : ''}`} data-seat={anvil.id}>
              <div class="sp-seat-head">
                <h3 class="pix">{name}</h3>
                {anvil.floor.full && (
                  <Tag kind="badge" tone="busy">
                    Floor full
                  </Tag>
                )}
              </div>
              <SlotRow
                label={name}
                slots={[
                  smith === undefined ? (
                    <Slot
                      kind="talent"
                      state="empty"
                      name="Post a smith"
                      label={`${name}: nobody posted. Choose a smith`}
                      buttonRef={(el) => {
                        openers.current[`smith-${anvil.id}`] = el;
                      }}
                      expanded={picking === anvil.id}
                      disabled={busy}
                      onClick={() => {
                        setPicking(anvil.id);
                      }}
                    />
                  ) : (
                    <Slot
                      kind="talent"
                      state="filled"
                      label={`${name}: ${creatureName(smith)}, level ${String(smith.level)}, ${smithStepName(anvil.mastery.step)}. Change`}
                      buttonRef={(el) => {
                        openers.current[`smith-${anvil.id}`] = el;
                      }}
                      expanded={picking === anvil.id}
                      disabled={busy}
                      onClick={() => {
                        setPicking(anvil.id);
                      }}
                    >
                      <SlotText
                        name={creatureName(smith)}
                        sub={`Lv ${String(smith.level)}${anvil.mastery.step === 0 ? '' : ' · ' + smithStepName(anvil.mastery.step)}`}
                      />
                    </Slot>
                  ),
                  kit === null ? (
                    <Slot
                      kind="talent"
                      state="empty"
                      name="No kit"
                      label={`${name}: no kit. Choose one`}
                      buttonRef={(el) => {
                        openers.current[`kit-${anvil.id}`] = el;
                      }}
                      expanded={kitFor === anvil.id}
                      disabled={busy}
                      onClick={() => {
                        setKitFor(anvil.id);
                      }}
                    />
                  ) : (
                    <Slot
                      kind="talent"
                      state="filled"
                      label={`${name}: ${kit.name}. Change`}
                      buttonRef={(el) => {
                        openers.current[`kit-${anvil.id}`] = el;
                      }}
                      expanded={kitFor === anvil.id}
                      disabled={busy}
                      onClick={() => {
                        setKitFor(anvil.id);
                      }}
                    >
                      <SlotText name={kit.name} sub="Kit" />
                    </Slot>
                  ),
                ]}
              />
              <ul class="fg-orders" aria-label={`${name} orders`}>
                {anvil.orders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    disabled={busy}
                    onOpen={(opener) => {
                      onOrder({ kind: 'edit', orderId: order.id, opener });
                    }}
                  />
                ))}
                {room && (
                  <li>
                    <button
                      type="button"
                      class="sp-buy fg-add"
                      aria-haspopup="dialog"
                      disabled={busy}
                      onClick={(event) => {
                        onOrder({ kind: 'add', anvilId: anvil.id, opener: event.currentTarget });
                      }}
                    >
                      <span class="pix sp-buy-name">Add an order</span>
                      <span class="sp-buy-price">
                        {anvil.orders.length} / {visit.forge.queueMax}
                      </span>
                    </button>
                  </li>
                )}
              </ul>
              {anvil.paused !== null && smith !== undefined ? (
                <p class="sp-line fg-tinker" role="status">
                  <Tag kind="badge">Paused</Tag>
                  <span>{RAID_PAUSE}</span>
                </p>
              ) : tinker !== null ? (
                <>
                  <p class="sp-line fg-tinker" role="status">
                    <Tag kind="badge">Tinkering</Tag>
                    <span>
                      <SayLine say={tinker} />
                    </span>
                  </p>
                  {anvil.tinkering?.reason === 'shard' && (
                    <button
                      type="button"
                      class="sp-buy fg-market"
                      disabled={busy}
                      onClick={() => {
                        onOpenMarket(anvil.tinkering?.shardElement ?? null);
                      }}
                    >
                      <span class="pix sp-buy-name">
                        {marketBuilt ? 'Trade at the Market' : 'Go to the Market'}
                      </span>
                    </button>
                  )}
                </>
              ) : smith === undefined ? (
                <p class="sp-line muted">Pick a smith, or drag one here.</p>
              ) : (
                piece !== null &&
                anvil.piece !== null && (
                  <div class="sp-line fg-piece">
                    <Bar
                      value={anvil.piece.progress}
                      max={anvil.piece.need}
                      label="Piece in hand"
                      class="sp-bar"
                    />
                    <span class="sp-pack-text">{piece}</span>
                  </div>
                )
              )}
              {smith !== undefined && (
                <button
                  type="button"
                  class="sp-line sp-pack"
                  aria-haspopup="dialog"
                  aria-label={`${floorLine(anvil)}. Show the floor and what this anvil brings`}
                  ref={(el) => {
                    openers.current[`floor-${anvil.id}`] = el;
                  }}
                  onClick={() => {
                    setFloorOf(anvil.id);
                  }}
                >
                  <Bar
                    value={anvil.floor.count}
                    max={anvil.floor.cap}
                    label="Floor"
                    class="sp-bar"
                  />
                  <span class="sp-pack-text">{floorLine(anvil)}</span>
                </button>
              )}
            </li>
          );
        })}
        <li class="sp-seat sp-new">
          {nextPrice === null ? (
            <p class="sp-line muted">The Forge has no more anvils for now.</p>
          ) : (
            <button
              type="button"
              class="sp-buy"
              aria-haspopup="dialog"
              disabled={busy}
              ref={(el) => {
                openers.current['buy'] = el;
              }}
              onClick={() => {
                setBuying(true);
              }}
            >
              <span class="pix sp-buy-name">A new anvil</span>
              <span class="sp-buy-price">
                <PriceLine price={anvilPrice(nextPrice)} />
              </span>
            </button>
          )}
        </li>
      </ul>
      {commons !== undefined && (
        <CommonsBoard
          place="forge"
          visit={visit}
          creatures={creatures}
          acorns={acorns}
          busy={busy}
          actions={commons}
          dropId={COMMUNAL_DROP}
          over={drag.drag?.over === COMMUNAL_DROP}
          {...(start.commons === undefined ? {} : { start: start.commons })}
        />
      )}
      <DragGhost
        ghostRef={drag.ghostRef}
        creature={
          carried === undefined
            ? undefined
            : { species: carried.species, name: creatureName(carried) }
        }
      />

      {pickedAnvil !== undefined && (
        <RosterPicker
          title={`Who smiths at ${anvilName(visit, pickedAnvil).toLowerCase()}?`}
          status="A creature at another post swaps places with this one."
          options={pickerOptions(pickedAnvil)}
          placedNote="Posted · swaps here"
          showEffects={false}
          reasonSide
          anchor={() => openers.current[`smith-${pickedAnvil.id}`] ?? null}
          onClose={() => {
            setPicking(null);
          }}
          onPick={(id) => {
            const seatId = pickedAnvil.id;
            setPicking(null);
            void actions.post({ seatId, creatureId: id === REMOVE_ID ? null : id });
          }}
        />
      )}

      {kitAnvil !== undefined && (
        <Drawer
          open
          onClose={() => {
            setKitFor(null);
            setBuyingKit(null);
          }}
          title={buyingKit === null ? 'Kit' : `Buy the ${ANVIL_KIT_INFO[buyingKit].name}`}
          meta={anvilName(visit, kitAnvil)}
          returnFocusTo={openers.current[`kit-${kitAnvil.id}`] ?? null}
        >
          {buyingKit === null ? (
            <div class="dr-stack pix-panel">
              <ChoiceList label="Kit">
                {ANVIL_KIT_ORDER.map((kind) => {
                  const owned = visit.kit.owned.includes(kind);
                  return (
                    <ChoiceButton
                      key={kind}
                      label={
                        owned ? (
                          ANVIL_KIT_INFO[kind].name
                        ) : (
                          <>
                            {ANVIL_KIT_INFO[kind].name},{' '}
                            <PriceLine price={seatPrice(visit.kit.price)} />
                          </>
                        )
                      }
                      line={ANVIL_KIT_INFO[kind].line}
                      selected={kitAnvil.kit === kind}
                      disabled={busy}
                      onClick={() => {
                        if (!owned) {
                          setBuyingKit(kind);
                          return;
                        }
                        const seatId = kitAnvil.id;
                        setKitFor(null);
                        void actions.setKit(seatId, kind);
                      }}
                    />
                  );
                })}
                <ChoiceButton
                  label="No kit"
                  line="Nothing packed. Switching kit costs nothing."
                  selected={kitAnvil.kit === null}
                  disabled={busy}
                  onClick={() => {
                    const seatId = kitAnvil.id;
                    setKitFor(null);
                    void actions.setKit(seatId, null);
                  }}
                />
              </ChoiceList>
            </div>
          ) : (
            <div
              class="dr-stack"
              onKeyDown={onDrillKey(() => {
                setBuyingKit(null);
              })}
            >
              <DrillHead
                title={ANVIL_KIT_INFO[buyingKit].name}
                backLabel="to the kit list"
                focus
                onBack={() => {
                  setBuyingKit(null);
                }}
              />
              <SpendConfirm
                text={`${ANVIL_KIT_INFO[buyingKit].line} You keep it, and can put it on any anvil.`}
                label="Buy"
                price={seatPrice(visit.kit.price)}
                reason={
                  visit.kit.price > acorns
                    ? { have: [acornCount(acorns)], cost: [acornCount(visit.kit.price)] }
                    : null
                }
                busy={busy}
                onConfirm={() => {
                  const kind = buyingKit;
                  const seatId = kitAnvil.id;
                  void (async () => {
                    if (!(await actions.buyKit(kind))) return;
                    setBuyingKit(null);
                    setKitFor(null);
                    await actions.setKit(seatId, kind);
                  })();
                }}
              />
            </div>
          )}
        </Drawer>
      )}

      {floorAnvil !== undefined && (
        <Drawer
          open
          onClose={() => {
            setFloorOf(null);
          }}
          title="Floor and pace"
          meta={anvilName(visit, floorAnvil)}
          returnFocusTo={openers.current[`floor-${floorAnvil.id}`] ?? null}
        >
          <AnvilNumbers anvil={floorAnvil} />
        </Drawer>
      )}

      {buying && (
        <Drawer
          open
          onClose={() => {
            setBuying(false);
          }}
          title="A new anvil"
          returnFocusTo={openers.current['buy'] ?? null}
        >
          <SpendConfirm
            text="Another smith can make gear for you, one piece after another."
            label="Buy the anvil"
            price={anvilPrice(nextPrice)}
            reason={buyReason}
            busy={busy}
            onConfirm={() => {
              void actions.buyAnvil().then((ok) => {
                if (ok) setBuying(false);
              });
            }}
          />
          {error !== null && <Alert level="alert">{error}</Alert>}
        </Drawer>
      )}
    </section>
  );
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
