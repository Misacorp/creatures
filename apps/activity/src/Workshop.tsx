import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameState } from './api';
import { Blueprints } from './Blueprints';
import type { GearActions } from './gear-actions';
import { PartsRow } from './GearArt';
import type { GearItem, GearState, JobResult } from './gear-types';
import {
  bagFull,
  bagText,
  itemsWithIds,
  jobResultRarity,
  noticeLines,
  sortItems,
  unequippedReason,
} from './gear-view';
import { GlossaryTag } from './Glossary';
import { DismantleDrawer, type DismantleStep } from './DismantleDrawer';
import { BAG_HINT, InventoryGrid } from './InventoryGrid';
import { gearName } from './gear-view';
import { ItemDetail } from './ItemDetail';
import { JobReveal } from './JobReveal';
import { JobSlots } from './JobSlots';
import { SupplyCrafting } from './SupplyCrafting';
import { Accordion } from './ui/Accordion';
import { BulkBar } from './ui/BulkBar';
import { Drawer } from './ui/Drawer';
import { flipOver } from './ui/flip-logic';
import { FlipArea } from './ui/Flipper';
import { Alert } from './ui/Alert';
import { useMultiSelect } from './ui/multi-select';
import { retireSelectHint, selectHintRetired, selectHintText } from './ui/select-hint';

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
  const selection = useMultiSelect(sortItems(gear?.items ?? []).map((i) => i.id));
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
  const selected = gear.items.find((i) => i.id === selectedId) ?? null;
  const picked = itemsWithIds(gear.items, selection.ids);
  // The drawer flips through the bag's items in the grid's order.
  const ordered = sortItems(gear.items);
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
    <div class="workshop">
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
      <section class="ws-section" aria-labelledby="ws-gear">
        <div class="ws-head">
          <h3 id="ws-gear">
            Gear <GlossaryTag entry="gear" look="help" />
          </h3>
          <span class={bagFull(gear.inventory) ? 'bag-count over' : 'bag-count muted'}>
            Bag: {bagText(gear.inventory)}
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
        {bagFull(gear.inventory) && (
          <Alert level="warning">Gear you find becomes parts until the bag has room.</Alert>
        )}
        {gear.items.length === 0 ? (
          <p class="empty muted">Your bag is empty.</p>
        ) : (
          <InventoryGrid
            items={gear.items}
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
    </div>
  );
}
