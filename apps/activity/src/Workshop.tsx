import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameState } from './api';
import { Blueprints } from './Blueprints';
import type { GearActions } from './gear-actions';
import { PartsRow } from './GearArt';
import type { GearItem, GearState, JobResult } from './gear-types';
import {
  bagFull,
  bagText,
  blueprintViews,
  itemsWithIds,
  jobResultRarity,
  noticeLines,
  sortItems,
  unequippedReason,
} from './gear-view';
import { content } from '@creatures/game';
import { BagTools } from './BagTools';
import { NO_FILTER, selectableIds, shownItems, type BagFilter } from './bag-filter';
import { GlossaryTag } from './Glossary';
import { DismantleDrawer, type DismantleStep } from './DismantleDrawer';
import { BAG_HINT, InventoryGrid } from './InventoryGrid';
import { gearName } from './gear-view';
import { ItemDetail } from './ItemDetail';
import { JobReveal } from './JobReveal';
import { JobSlots } from './JobSlots';
import { SupplyCrafting } from './SupplyCrafting';
import {
  ForgeAnvils,
  type ForgeActions,
  type ForgeStart,
  type OrderOpen,
} from './valley/ForgeAnvils';
import type { CommonsActions } from './valley/CommonsBoard';
import { OrderEditor } from './valley/OrderEditor';
import type { TrayInput } from './valley/tray-state';
import type { ValleyVisit } from './api';
import { Accordion } from './ui/Accordion';
import { BulkBar } from './ui/BulkBar';
import { Drawer } from './ui/Drawer';
import { flipOver } from './ui/flip-logic';
import { FlipArea } from './ui/Flipper';
import { Alert } from './ui/Alert';
import { Column, Columns } from './ui/Columns';
import { useMultiSelect } from './ui/multi-select';
import { retireSelectHint, selectHintRetired, selectHintText } from './ui/select-hint';

/** The valley's Forge in place of the job slots (`VALLEY_SYSTEMS` on): what the anvils' page and the order editor need. */
export interface ForgeMode {
  visit: ValleyVisit;
  /** What the creature tray reads. */
  trayInput: TrayInput;
  acorns: number;
  actions: ForgeActions;
  /** The Forge's project board (the commons): its gifts and its communal seat; absent shows no board. */
  commons?: CommonsActions;
  onOpenPaddock: () => void;
  /** What the page and the editor have open at the start (the workbench shows each). */
  start?: ForgeStart;
  orderStart?: { anvilId: string; baseId?: string; orderId?: string };
}

const ELEMENT_IDS: readonly string[] = content.elements.map((e) => e.id);

/**
 * The Workshop tab: your parts, the job slots (with timers and claims), the bag of gear (an item's
 * details and actions open in a bottom drawer), and the blueprints you can craft from. Everything shown comes from
 * the server's gear view; every action goes back to the server, which decides.
 */
export function Workshop({
  state,
  gear,
  failed,
  offset,
  busy,
  error = null,
  reveal,
  actions,
  onRetry,
  onClaimed,
  onDismissReveal,
  initialSelectedId,
  initialCardDismantle,
  forge,
}: {
  state: GameState;
  gear: GearState | null;
  /** The gear view could not be loaded. */
  failed: boolean;
  /** Server clock minus local clock, in ms. */
  offset: number;
  busy: boolean;
  /** The server's last error (the game's notice line is behind a drawer, so a job's drawer shows it itself). */
  error?: string | null;
  reveal: JobResult | null;
  actions: GearActions;
  onRetry: () => void;
  onClaimed: (result: JobResult) => void;
  onDismissReveal: () => void;
  /** The item whose drawer is up when the tab opens (the workbench shows one; the game starts with none). */
  initialSelectedId?: string;
  /** The workbench shows the item card's Dismantle flow open on this step (with `initialSelectedId`). */
  initialCardDismantle?: DismantleStep;
  /**
   * The Forge's anvils (phase 5 step 3): replace the job slots and the supply crafts, blueprints are ordered instead of crafted, and the
   * bag gains a filter and a sort. Absent (the flag off): the Workshop as it was.
   */
  forge?: ForgeMode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  // The drawer was flipped to another item: the new card does not take the focus from the arrows.
  const [flipped, setFlipped] = useState(false);
  // The item's "Equip on" list is shown inside the drawer: flipping is paused while it is (no arrows, swipe or
  // keys), so nothing acts on the item behind it. The drawer keeps its structure, so the item's state survives.
  const [drilling, setDrilling] = useState(false);
  // The bag's multi-select (2026-10-27): started by a gesture on a tile, held only here; the bulk bar's
  // "Dismantle" picks the creature and confirms. `pile` is the items the confirmation shows (the drawer is open
  // while set).
  const [filter, setFilter] = useState<BagFilter>(NO_FILTER);
  const shown =
    forge === undefined
      ? sortItems(gear?.items ?? [])
      : shownItems(gear?.items ?? [], filter, ELEMENT_IDS);
  const selection = useMultiSelect(shown.map((i) => i.id));
  // The order editor, drawn here so an anvil's "Add an order" and a blueprint's "Order" open the same one.
  const [orderOpen, setOrderOpen] = useState<(OrderOpen & { baseId?: string }) | null>(
    forge?.orderStart === undefined
      ? null
      : forge.orderStart.orderId === undefined
        ? {
            kind: 'add',
            anvilId: forge.orderStart.anvilId,
            opener: null,
            ...(forge.orderStart.baseId === undefined ? {} : { baseId: forge.orderStart.baseId }),
          }
        : { kind: 'edit', orderId: forge.orderStart.orderId, opener: null },
  );
  const [pile, setPile] = useState<GearItem[] | null>(null);
  const dismantleButton = useRef<HTMLButtonElement | null>(null);
  // The item card's red Dismantle: the same `DismantleDrawer` as the bulk bar's, for this one item, taking the place
  // of the card's drawer (one drawer at a time). `backFromFlow` returns the focus to the card's button.
  const [cardFlow, setCardFlow] = useState(initialCardDismantle !== undefined);
  const [backFromFlow, setBackFromFlow] = useState(false);
  // The one-time hint about selecting several: gone for good once dismissed or once anything was selected.
  const [hintOpen, setHintOpen] = useState(() => !selectHintRetired(BAG_HINT));
  useEffect(() => {
    if (selection.active) {
      retireSelectHint(BAG_HINT);
      setHintOpen(false);
    }
  }, [selection.active]);
  if (gear === null) {
    return failed ? (
      <section class="ws-section">
        <Alert level="alert">The Workshop could not be loaded.</Alert>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    ) : (
      <p class="muted">Opening the Workshop...</p>
    );
  }
  // With the valley's Forge the bag is the valley's (its own cap, worn pieces not counted); this is the one place it shows.
  const bag: GearState['inventory'] =
    forge === undefined
      ? gear.inventory
      : { used: forge.visit.forge.bag.count, cap: forge.visit.forge.bag.cap, reserved: 0 };
  const selected = gear.items.find((i) => i.id === selectedId) ?? null;
  const picked = itemsWithIds(gear.items, selection.ids);
  // The drawer flips through the bag's items in the grid's order.
  const ordered = shown;
  const itemFlip = flipOver({
    list: ordered,
    at: ordered.findIndex((i) => i.id === selected?.id),
    noun: 'item',
    nameOf: (item) => gearName(item.baseId),
    pick: (item) => {
      setSelectedId(item.id);
      setFlipped(true);
      setBackFromFlow(false);
    },
  });
  const flip = drilling && itemFlip !== undefined ? { ...itemFlip, paused: true } : itemFlip;
  return (
    <Columns from="60rem" ratio={forge === undefined ? '1-3' : '2-3'} class="workshop">
      {gear.notice !== null && (
        <section class="ws-section card-item notice-card" aria-labelledby="ws-notice">
          <h3 id="ws-notice">Gear has changed</h3>
          <ul>
            {noticeLines(gear.notice).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {gear.notice.unequipped.length > 0 && (
            <Accordion title="Why some items are in the bag" variant="compact">
              <ul>
                {gear.notice.unequipped.map((note) => (
                  <li key={note.id}>
                    {gearName(note.baseId)} came off: {unequippedReason(note)}.
                  </li>
                ))}
              </ul>
            </Accordion>
          )}
          <p class="actions">
            <button
              type="button"
              class="primary"
              disabled={busy}
              onClick={() => {
                void actions.dismissNotice();
              }}
            >
              Got it
            </button>
          </p>
        </section>
      )}
      {reveal !== null && (
        <JobReveal
          result={reveal}
          items={gear.items}
          rarity={jobResultRarity(reveal)}
          creatures={state.creatures}
          onDismiss={onDismissReveal}
        />
      )}
      {forge !== undefined && (
        <Column stack="tight">
          <ForgeAnvils
            visit={forge.visit}
            creatures={state.creatures}
            trayInput={forge.trayInput}
            acorns={forge.acorns}
            busy={busy}
            error={error}
            actions={forge.actions}
            onOrder={(open) => {
              setOrderOpen(open);
            }}
            onOpenPaddock={forge.onOpenPaddock}
            {...(forge.commons === undefined ? {} : { commons: forge.commons })}
            {...(forge.start === undefined ? {} : { start: forge.start })}
          />
        </Column>
      )}
      {forge === undefined && (
        <Column sticky stack="tight">
          <section class="ws-section" aria-labelledby="ws-parts">
            <h3 id="ws-parts">Parts</h3>
            <PartsRow parts={gear.parts} />
            <p>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('ws-supplies')?.scrollIntoView({ block: 'start' });
                }}
              >
                Craft supplies
              </button>
            </p>
          </section>
          <JobSlots
            gear={gear}
            creatures={state.creatures}
            offset={offset}
            busy={busy}
            onClaim={(job) => {
              void actions.claimJob(job.id).then((result) => {
                if (result !== undefined) onClaimed(result);
              });
            }}
          />
        </Column>
      )}
      <Column stack="tight">
        <section class="ws-section" aria-labelledby="ws-gear">
          <div class="ws-head">
            <h3 id="ws-gear">
              Gear <GlossaryTag entry="gear" look="help" />
            </h3>
            <span class={bagFull(bag) ? 'bag-count over' : 'bag-count muted'}>
              Bag: {bagText(bag)}
            </span>
          </div>
          {hintOpen && gear.items.length > 0 && (
            <Alert
              level="info"
              class="bag-hint"
              onDismiss={() => {
                retireSelectHint(BAG_HINT);
                setHintOpen(false);
              }}
            >
              {selectHintText(BAG_HINT)}
            </Alert>
          )}
          {bagFull(bag) && (
            <Alert level="warning">
              {forge === undefined
                ? 'Gear you find becomes parts until the bag has room.'
                : 'Finished pieces wait on the anvils\u2019 floors until the bag has room.'}
            </Alert>
          )}
          {forge !== undefined && gear.items.length > 0 && (
            <BagTools
              filter={filter}
              onChange={setFilter}
              shown={shown.length}
              total={gear.items.length}
              selectable={selectableIds(shown).length}
              open={forge.start?.bag === true}
              onSelectAll={() => {
                selection.setAll(selectableIds(shown));
              }}
            />
          )}
          {gear.items.length === 0 ? (
            <p class="empty muted">Your bag is empty.</p>
          ) : shown.length === 0 ? (
            <p class="empty muted">Nothing in the bag matches the filter.</p>
          ) : (
            <InventoryGrid
              items={shown}
              inOrder={forge !== undefined}
              creatures={state.creatures}
              openId={selected?.id ?? null}
              selection={selection}
              onOpen={(id) => {
                setFlipped(false);
                setBackFromFlow(false);
                setSelectedId(id === selectedId ? null : id);
              }}
            />
          )}
          {selection.active && (
            <BulkBar count={picked.length} onClear={selection.clear}>
              <button
                ref={dismantleButton}
                type="button"
                class="primary"
                disabled={busy}
                onClick={() => {
                  setPile(picked);
                }}
              >
                Dismantle
              </button>
            </BulkBar>
          )}
          {pile !== null && (
            <DismantleDrawer
              items={pile}
              gear={gear}
              creatures={state.creatures}
              busy={busy}
              error={error}
              returnFocusTo={dismantleButton.current}
              loadPreview={actions.previewDismantle}
              checkLocks={actions.checkDismantle}
              onConfirm={async (creatureId) => {
                const result = await actions.dismantlePile(
                  creatureId,
                  pile.map((i) => i.id),
                );
                if (result === undefined) return false;
                setPile(null);
                selection.clear();
                onClaimed(result);
                return true;
              }}
              onClose={() => {
                setPile(null);
              }}
            />
          )}
          {selected !== null && cardFlow && (
            <DismantleDrawer
              items={[selected]}
              gear={gear}
              creatures={state.creatures}
              busy={busy}
              error={error}
              exitLabel="to the item"
              swap
              {...(initialCardDismantle === undefined ? {} : { start: initialCardDismantle })}
              loadPreview={actions.previewDismantle}
              checkLocks={actions.checkDismantle}
              onConfirm={async (creatureId) => {
                const result = await actions.dismantlePile(creatureId, [selected.id]);
                if (result === undefined) return false;
                setCardFlow(false);
                setSelectedId(null);
                selection.clear();
                onClaimed(result);
                return true;
              }}
              onClose={() => {
                setCardFlow(false);
                setBackFromFlow(true);
              }}
              onDismiss={() => {
                setCardFlow(false);
                setSelectedId(null);
                setBackFromFlow(false);
              }}
            />
          )}
          <Drawer
            open={selected !== null && !cardFlow}
            title={selected === null ? 'Item' : gearName(selected.baseId)}
            titleHidden
            class={backFromFlow ? 'item-drawer drawer-swap' : 'item-drawer'}
            flip={flip}
            onClose={() => {
              setSelectedId(null);
              setBackFromFlow(false);
            }}
          >
            {selected !== null && (
              <FlipArea flip={flip}>
                <ItemDetail
                  key={selected.id}
                  item={selected}
                  creatures={state.creatures}
                  busy={busy}
                  actions={actions}
                  focusName={!flipped && !backFromFlow}
                  focusDismantle={backFromFlow}
                  onDrill={setDrilling}
                  onDismantle={() => {
                    setBackFromFlow(false);
                    setCardFlow(true);
                  }}
                />
              </FlipArea>
            )}
          </Drawer>
        </section>
        <Blueprints
          gear={gear}
          creatures={state.creatures}
          busy={busy}
          error={error}
          loadPreview={actions.previewCraft}
          {...(forge === undefined
            ? {}
            : {
                order: {
                  reason: forge.visit.anvils.length === 0 ? 'Buy an anvil to order pieces.' : null,
                  onOrder: (baseId: string, opener: HTMLElement) => {
                    const room = forge.visit.anvils.find(
                      (a) => a.orders.length < forge.visit.forge.queueMax,
                    );
                    setOrderOpen({
                      kind: 'add',
                      anvilId: (room ?? forge.visit.anvils[0])?.id ?? '',
                      baseId,
                      opener,
                    });
                  },
                },
              })}
          onCraft={async (baseId, creatureId, reach, treat) =>
            (await actions.startJob({
              kind: 'craft',
              creatureId,
              blueprintId: baseId,
              reach,
              ...(treat ? { treat: true } : {}),
            })) !== undefined
          }
        />
        {forge === undefined && (
          <SupplyCrafting
            gear={gear}
            creatures={state.creatures}
            stock={state.supplies}
            busy={busy}
            error={error}
            onCraft={async (supplyId, creatureId, treat) =>
              (await actions.startJob({
                kind: 'supply',
                creatureId,
                supplyId,
                ...(treat ? { treat: true } : {}),
              })) !== undefined
            }
            onConvert={async (recipeId, creatureId, treat) =>
              (await actions.startJob({
                kind: 'convert',
                creatureId,
                recipeId,
                ...(treat ? { treat: true } : {}),
              })) !== undefined
            }
          />
        )}
      </Column>
      {forge !== undefined && orderOpen !== null && (
        <OrderEditor
          open={orderOpen}
          visit={forge.visit}
          blueprints={blueprintViews(gear.blueprints, gear.skills)}
          busy={busy}
          error={error}
          onOrder={forge.actions.order}
          onClose={() => {
            setOrderOpen(null);
          }}
        />
      )}
    </Columns>
  );
}
