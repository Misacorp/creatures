/**
 * What a click on an anvil in the Forge's canvas opens (the right drawer, a page on a phone): a wizard of the anvil's own steps, drawn
 * with `ui/Wizard`. The first step is the anvil as it is (who smiths, its kit, its queue of orders with one gold button to add another,
 * what the smith does now, the floor); from it a step picks the smith (`ui/CreatureList`, a tap picks and goes back), a step picks the
 * kit (and buys one: a keyed spend with one button, `SpendConfirm`), and a step shows the floor and the anvil's numbers. Adding or
 * changing an order is the order wizard (`OrderEditor`); this panel only asks for it. An anvil nobody smiths at opens on the smith step.
 * Nothing here decides anything: each pick is the game's action and the server answers.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AnvilKit } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { acornCount } from '../resource-count';
import { Alert } from '../ui/Alert';
import { Bar } from '../ui/Bar';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CreatureList } from '../ui/CreatureList';
import { PriceLine, SayLine } from '../ui/CountBadge';
import { Slot, SlotRow } from '../ui/Slot';
import { Tag } from '../ui/Tag';
import { useWizard, type WizardStep } from '../ui/use-wizard';
import { WizardFooter, WizardView } from '../ui/Wizard';
import {
  AnvilNumbers,
  OrderRow,
  REMOVE_ID,
  pickerOptions,
  type ForgeActions,
  type OrderOpen,
} from './ForgeAnvils';
import { PanelBody } from './PlaceCanvas';
import { SlotText, SpendConfirm } from './seat-parts';
import { RAID_PAUSE, seatPrice } from './signpost-view';
import {
  ANVIL_KIT_INFO,
  ANVIL_KIT_ORDER,
  anvilName,
  floorLine,
  pieceLine,
  smithStepName,
  tinkerLine,
} from './forge-view';

/** The steps of an anvil's wizard. */
export type AnvilStep = 'hub' | 'smith' | 'kit' | 'kit-buy' | 'floor';

export function ForgeAnvilPanel({
  visit,
  anvilId,
  creatures,
  acorns,
  busy,
  error,
  actions,
  start = 'hub',
  onOrder,
  onOpenMarket,
  onClose,
}: {
  visit: ValleyVisit;
  anvilId: string;
  creatures: readonly Creature[];
  acorns: number;
  busy: boolean;
  error: string | null;
  actions: ForgeActions;
  /** The step it opens on (an anvil nobody smiths at starts on the smith step). */
  start?: AnvilStep;
  /** Opens the order wizard (add, or change an order). */
  onOrder: (open: OrderOpen) => void;
  /** The Market (Q64): the shard exchange lives there; `to` is the element this anvil waits for. */
  onOpenMarket: (to: string | null) => void;
  /** Back from the first step. */
  onClose: () => void;
}) {
  const anvil = visit.anvils.find((a) => a.id === anvilId);
  const name = anvil === undefined ? 'Anvil' : anvilName(visit, anvil);
  const [buyingKit, setBuyingKit] = useState<AnvilKit | null>(null);
  const steps: readonly WizardStep<AnvilStep>[] = [
    { id: 'hub', title: 'Smith and orders', backLabel: 'to the forge' },
    { id: 'smith', title: 'Who smiths here?', backLabel: 'to the anvil', back: 'hub' },
    { id: 'kit', title: 'Kit', backLabel: 'to the anvil', back: 'hub' },
    {
      id: 'kit-buy',
      title: buyingKit === null ? 'Buy a kit' : `Buy the ${ANVIL_KIT_INFO[buyingKit].name}`,
      backLabel: 'to the kit list',
      back: 'kit',
    },
    { id: 'floor', title: 'Floor and pace', backLabel: 'to the anvil', back: 'hub' },
  ];
  const wizard = useWizard(steps, { initial: start, onExit: onClose });
  // The head takes the focus when a step opens after the first (the button that opened it is gone); not on the panel's own opening.
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);

  // The anvil left (the server's word): nothing to show.
  const gone = anvil === undefined;
  useEffect(() => {
    if (gone) onClose();
  }, [gone]);
  if (anvil === undefined) return null;

  const smith = creatures.find((c) => c.id === anvil.creatureId);
  const kit = anvil.kit === null ? null : ANVIL_KIT_INFO[anvil.kit];
  const marketBuilt = visit.market?.open === true;
  const tinker = tinkerLine(anvil, marketBuilt);
  const piece = pieceLine(anvil);
  const room = anvil.orders.length < visit.forge.queueMax;

  const hub = (
    <div class="fc-hub">
      <SlotRow
        label={name}
        slots={[
          smith === undefined ? (
            <Slot
              kind="talent"
              state="empty"
              name="Post a smith"
              label={`${name}: nobody posted. Choose a smith`}
              disabled={busy}
              onClick={() => {
                wizard.goTo('smith');
              }}
            />
          ) : (
            <Slot
              kind="talent"
              state="filled"
              label={`${name}: ${creatureName(smith)}, level ${String(smith.level)}, ${smithStepName(anvil.mastery.step)}. Change`}
              disabled={busy}
              onClick={() => {
                wizard.goTo('smith');
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
              disabled={busy}
              onClick={() => {
                wizard.goTo('kit');
              }}
            />
          ) : (
            <Slot
              kind="talent"
              state="filled"
              label={`${name}: ${kit.name}. Change`}
              disabled={busy}
              onClick={() => {
                wizard.goTo('kit');
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
            onOpen={() => {
              onOrder({ kind: 'edit', orderId: order.id, opener: null });
            }}
          />
        ))}
        {anvil.orders.length === 0 && (
          <li>
            <p class="sp-line muted">No orders yet.</p>
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
          aria-label={`${floorLine(anvil)}. Show the floor and what this anvil brings`}
          onClick={() => {
            wizard.goTo('floor');
          }}
        >
          <Bar value={anvil.floor.count} max={anvil.floor.cap} label="Floor" class="sp-bar" />
          <span class="sp-pack-text">{floorLine(anvil)}</span>
        </button>
      )}
    </div>
  );

  const kitStep = (
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
                    {ANVIL_KIT_INFO[kind].name}, <PriceLine price={seatPrice(visit.kit.price)} />
                  </>
                )
              }
              line={ANVIL_KIT_INFO[kind].line}
              selected={anvil.kit === kind}
              disabled={busy}
              onClick={() => {
                if (!owned) {
                  setBuyingKit(kind);
                  wizard.goTo('kit-buy');
                  return;
                }
                wizard.goTo('hub');
                void actions.setKit(anvil.id, kind);
              }}
            />
          );
        })}
        <ChoiceButton
          label="No kit"
          line="Nothing packed. Switching kit costs nothing."
          selected={anvil.kit === null}
          disabled={busy}
          onClick={() => {
            wizard.goTo('hub');
            void actions.setKit(anvil.id, null);
          }}
        />
      </ChoiceList>
    </div>
  );

  const kitBuyStep =
    buyingKit === null ? null : (
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
          void (async () => {
            if (!(await actions.buyKit(kind))) return;
            setBuyingKit(null);
            wizard.goTo('hub');
            await actions.setKit(anvil.id, kind);
          })();
        }}
      />
    );

  return (
    <PanelBody
      footer={
        wizard.step === 'hub' ? (
          <WizardFooter
            label="Add an order"
            blocked={
              room
                ? null
                : `This anvil's queue is full (${String(visit.forge.queueMax)} orders).`
            }
            busy={busy}
            onFinish={() => {
              onOrder({ kind: 'add', anvilId: anvil.id, opener: null });
            }}
          />
        ) : undefined
      }
    >
      <WizardView
        key={wizard.step}
        wizard={wizard}
        focus={opened.current}
        disabled={busy && wizard.step === 'kit-buy'}
      >
        {wizard.step === 'hub' && hub}
        {wizard.step === 'smith' && (
          <SmithStep
            onPick={(id) => {
              wizard.goTo('hub');
              void actions.post({ seatId: anvil.id, creatureId: id === REMOVE_ID ? null : id });
            }}
            visit={visit}
            creatures={creatures}
            anvilId={anvil.id}
            title={name}
          />
        )}
        {wizard.step === 'kit' && kitStep}
        {wizard.step === 'kit-buy' && kitBuyStep}
        {wizard.step === 'floor' && <AnvilNumbers anvil={anvil} />}
        {error !== null && wizard.step === 'kit-buy' && <Alert level="alert">{error}</Alert>}
      </WizardView>
    </PanelBody>
  );
}

/** The smith step: the creature list with a tap picking (and the step closing). */
function SmithStep({
  onPick,
  visit,
  creatures,
  anvilId,
  title,
}: {
  onPick: (creatureId: string) => void;
  visit: ValleyVisit;
  creatures: readonly Creature[];
  anvilId: string;
  title: string;
}) {
  const anvil = visit.anvils.find((a) => a.id === anvilId);
  if (anvil === undefined) return null;
  return (
    <div class="dr-stack">
      <p class="sp-note">A creature at another post swaps places with this one.</p>
      <CreatureList
        options={pickerOptions(visit, creatures, anvil)}
        selection={{ mode: 'pick', onPick, label: `Who smiths at ${title.toLowerCase()}` }}
        placedNote="Posted · swaps here"
        showEffects={false}
        reasonSide
        class="flat"
      />
    </div>
  );
}
