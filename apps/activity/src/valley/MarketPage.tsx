/**
 * The Market's page with the valley's systems on (phase 5 step 7, `systems/forge.md` V-FORGE-11, `commons.md` V-COM-15): it sits under the
 * Market's scene, the way the Signpost's and the Forge's pages sit under theirs. While the server builds the Market it is the project board
 * (`CommonsBoard`, the same card every place uses) and nothing else; once it is built it is the broker's seat and the shard exchange (Q64: shards change hands here and nowhere else), one card of the seat family:
 * the creature tray (a hand carries a creature from it onto the seat), the shared slot row (the broker, and what it trades toward), and
 * one line of what it is doing, which opens its numbers, and a row that opens the exchange (`Exchange`, the drawer the Forge had, moved here). The creature is chosen in the shared picker (`ui/RosterPicker`), what to trade toward
 * in a drawer of choices (`ui/Drawer` + `ui/ChoiceList`, as the Signpost's destinations are). The broker has no store: its trades land
 * on the Forge's shelf as they happen. The exchange is the one keyed spend of the page. The pure words are `market-view.ts`; every move is the game's (the server decides).
 */
import { useRef, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { DataTable } from '../ui/DataTable';
import { DragGhost } from '../ui/DragGhost';
import { CountBadge, SayLine } from '../ui/CountBadge';
import { Drawer } from '../ui/Drawer';
import { RosterPicker } from '../ui/RosterPicker';
import { Slot, SlotRow } from '../ui/Slot';
import { Exchange } from './Exchange';
import {
  CommonsBoard,
  REMOVE_ID,
  seatOptions,
  type CommonsActions,
  type CommonsStart,
} from './CommonsBoard';
import { SlotText, seatAt } from './seat-parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import {
  BROKER_ELEMENTS,
  brokerLine,
  brokerOf,
  brokerRows,
  brokerSub,
  marketState,
  towardName,
} from './market-view';
import { sayText, shardMark } from '../resource-count';

/** The id of the card a hand drops a creature on to help build (the project board's communal seat). */
const COMMUNAL_DROP = 'communal:market';

/** What the page asks the game to do; each answers whether the server took it. */
export interface MarketActions {
  /** Posts a creature to the broker's seat (a creature that holds another seat swaps), or empties it (`null`). */
  post: (body: { seatId: string; creatureId: string | null }) => Promise<boolean>;
  /** Sets what the broker trades toward: an element it keeps a small stock of, or `null` (only what the orders wait on). */
  setToward: (seatId: string, toward: string | null) => Promise<boolean>;
  /** Trades shards for the element `to` (a keyed spend; Q64: only once the Market is built). */
  exchange: (request: { to: string; from: string | null; times: number }) => Promise<boolean>;
}

/** What the page can open at the start (the workbench shows each). */
export interface MarketStart {
  picker?: boolean;
  toward?: boolean;
  detail?: boolean;
  /** The exchange starts open, on this element when given (a smith's wait leads here). */
  exchange?: boolean | string;
  /** The project board's drawer or picker to open (the commons). */
  commons?: CommonsStart;
}

export function MarketPage({
  visit,
  creatures,
  trayInput,
  acorns,
  busy,
  actions,
  commons,
  onOpenPaddock,
  error = null,
  start = {},
}: {
  visit: ValleyVisit;
  creatures: readonly Creature[];
  trayInput: TrayInput;
  acorns: number;
  busy: boolean;
  actions: MarketActions;
  /** The Market's project board while it is built (a hand can carry a creature onto its helper slot). */
  commons?: CommonsActions;
  /** A tap on a tray creature: the Paddock, as everywhere in the valley. */
  onOpenPaddock: () => void;
  /** The server's last error: the notice line is behind a drawer, so the exchange shows it itself. */
  error?: string | null;
  start?: MarketStart;
}) {
  const [picking, setPicking] = useState(start.picker === true);
  const [toward, setToward] = useState(start.toward === true);
  const [detail, setDetail] = useState(start.detail === true);
  const [trading, setTrading] = useState(start.exchange !== undefined && start.exchange !== false);
  const openers = useRef<Record<string, HTMLElement | null>>({});
  const pageRef = useRef<HTMLElement | null>(null);
  const state = marketState(visit);
  const seat = brokerOf(visit);
  // The shard an anvil waits for: the exchange starts on it (the one-tap fix).
  const wanted =
    visit.anvils.find((anvil) => anvil.tinkering?.reason === 'shard')?.tinkering?.shardElement ??
    null;

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: pageRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, seatId) => {
      if (seatId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (seatId === COMMUNAL_DROP && commons !== undefined) {
        void commons.post('market', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      if (seat === null || seatId !== seat.id || seat.creatureId === creatureId) {
        return dropOutcome('none', null, null, '');
      }
      void actions.post({ seatId, creatureId });
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = creatures.find((c) => c.id === drag.drag?.creatureId);
  const free = creatures.filter((c) => busyReason(c) === null);
  const ordered = trayFor(free, trayInput);
  const broker = creatures.find((c) => c.id === seat?.creatureId);
  const over = seat !== null && drag.drag?.over === seat.id;

  return (
    <section
      class="sp-page"
      aria-label="Market"
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
      {state === 'built' && seat !== null ? (
        <ul class="sp-seats" aria-label="Broker seat">
          <li class={`sp-seat${over ? ' over' : ''}`} data-seat={seat.id}>
            <div class="sp-seat-head">
              <h3 class="pix">Broker</h3>
            </div>
            <SlotRow
              label="Broker"
              slots={[
                broker === undefined ? (
                  <Slot
                    kind="talent"
                    state="empty"
                    name="Post a broker"
                    label="Broker: nobody posted. Choose a creature"
                    buttonRef={(el) => {
                      openers.current['broker'] = el;
                    }}
                    expanded={picking}
                    disabled={busy}
                    onClick={() => {
                      setPicking(true);
                    }}
                  />
                ) : (
                  <Slot
                    kind="talent"
                    state="filled"
                    label={`Broker: ${creatureName(broker)}, level ${String(broker.level)}. Change`}
                    buttonRef={(el) => {
                      openers.current['broker'] = el;
                    }}
                    expanded={picking}
                    disabled={busy}
                    onClick={() => {
                      setPicking(true);
                    }}
                  >
                    <SlotText name={creatureName(broker)} sub={brokerSub(seat, broker.level)} />
                  </Slot>
                ),
                <Slot
                  kind="talent"
                  state="filled"
                  label={`Trades toward: ${towardName(seat.toward)}. Change`}
                  buttonRef={(el) => {
                    openers.current['toward'] = el;
                  }}
                  expanded={toward}
                  disabled={busy}
                  onClick={() => {
                    setToward(true);
                  }}
                >
                  <SlotText
                    name={
                      seat.toward === null ? (
                        'The orders'
                      ) : (
                        <CountBadge {...shardMark(seat.toward)} size="inline" />
                      )
                    }
                    sub="Trades toward"
                  />
                </Slot>,
              ]}
            />
            {seat.creatureId === null ? (
              <p class="sp-line muted">
                <SayLine say={brokerLine(seat)} />
              </p>
            ) : (
              <button
                type="button"
                class="sp-line sp-pack mk-line"
                aria-haspopup="dialog"
                aria-label={`${sayText(brokerLine(seat))} Show the rates`}
                ref={(el) => {
                  openers.current['detail'] = el;
                }}
                onClick={() => {
                  setDetail(true);
                }}
              >
                <span class="sp-pack-text">
                  <SayLine say={brokerLine(seat)} />
                </span>
              </button>
            )}
            <button
              type="button"
              class="sp-buy mk-trade"
              aria-haspopup="dialog"
              disabled={busy}
              ref={(el) => {
                openers.current['trade'] = el;
              }}
              onClick={() => {
                setTrading(true);
              }}
            >
              <span class="pix sp-buy-name">Trade shards</span>
            </button>
          </li>
        </ul>
      ) : (
        commons !== undefined && (
          <CommonsBoard
            place="market"
            visit={visit}
            creatures={creatures}
            acorns={acorns}
            busy={busy}
            actions={commons}
            dropId={COMMUNAL_DROP}
            over={drag.drag?.over === COMMUNAL_DROP}
            {...(start.commons === undefined ? {} : { start: start.commons })}
          />
        )
      )}
      <DragGhost
        ghostRef={drag.ghostRef}
        creature={
          carried === undefined
            ? undefined
            : { species: carried.species, name: creatureName(carried) }
        }
      />

      {picking && seat !== null && (
        <RosterPicker
          title="Who trades at the Market?"
          status="A creature at another post swaps places with this one."
          options={seatOptions(creatures, visit, seat.id, seat.creatureId)}
          placedNote="Trading · swaps here"
          showEffects={false}
          reasonSide
          anchor={() => openers.current['broker'] ?? null}
          onClose={() => {
            setPicking(false);
          }}
          onPick={(id) => {
            setPicking(false);
            void actions.post({ seatId: seat.id, creatureId: id === REMOVE_ID ? null : id });
          }}
        />
      )}

      {toward && seat !== null && (
        <Drawer
          open
          onClose={() => {
            setToward(false);
          }}
          title="Trade toward"
          meta="Broker"
          returnFocusTo={openers.current['toward'] ?? null}
        >
          <div class="dr-stack pix-panel">
            <ChoiceList label="What the broker trades toward">
              <ChoiceButton
                label="What the orders need"
                line="Trades only for the shards your anvils wait on."
                selected={seat.toward === null}
                disabled={busy}
                onClick={() => {
                  setToward(false);
                  if (seat.toward !== null) void actions.setToward(seat.id, null);
                }}
              />
              {BROKER_ELEMENTS.map((element) => (
                <ChoiceButton
                  key={element}
                  label={<CountBadge {...shardMark(element)} size="inline" />}
                  line="Also keeps a small stock of these on the shelf."
                  selected={seat.toward === element}
                  disabled={busy}
                  onClick={() => {
                    setToward(false);
                    if (seat.toward !== element) void actions.setToward(seat.id, element);
                  }}
                />
              ))}
            </ChoiceList>
            <p class="muted sp-note">It never trades the few shards you keep for the Forge.</p>
          </div>
        </Drawer>
      )}

      {trading && state === 'built' && (
        <Drawer
          open
          onClose={() => {
            setTrading(false);
          }}
          title="Trade shards"
          returnFocusTo={openers.current['trade'] ?? null}
        >
          <Exchange
            visit={visit}
            busy={busy}
            error={error}
            initial={typeof start.exchange === 'string' ? start.exchange : wanted}
            onTrade={(request) => {
              void actions.exchange(request).then((ok) => {
                if (ok) setTrading(false);
              });
            }}
          />
        </Drawer>
      )}

      {detail && seat !== null && (
        <Drawer
          open
          onClose={() => {
            setDetail(false);
          }}
          title="Rates"
          meta="Broker"
          returnFocusTo={openers.current['detail'] ?? null}
        >
          <div class="dr-stack pix-panel">
            <DataTable
              rows={brokerRows(seat).map((r) => ({
                label: r.label,
                value: <SayLine say={r.value} />,
              }))}
            />
          </div>
        </Drawer>
      )}
    </section>
  );
}
