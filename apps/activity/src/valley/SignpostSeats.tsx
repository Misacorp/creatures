/**
 * The Signpost's page with the valley's systems on (phase 5 step 2, `systems/scouts.md`): it replaces today's Expeditions page and sits
 * under the Signpost's scene. The creature tray (the shared `Tray`; a hand can carry a creature from it onto a seat, and the seat
 * previews the change in fit before the drop, V-POST-4), then one card for each scout seat, then the next seat to buy.
 *
 * A seat card is the shared slot row (`ui/Slot`): the scout (a tap opens the shared creature picker, `ui/RosterPicker`, with "Back to
 * resting" as its first row), the destination (a drawer of choices, as the Knack picker is) and the kit (the same). Under it one line:
 * the pack's fill (`ui/Bar`) and when it is full; a tap on it opens what the pack holds and what the seat brings a day, its fit and
 * its mastery (V-RET-9) in `ui/DataTable`s. Buying a seat or a kit is a keyed spend with one clear button and its cost (`ActionButton`).
 * The pure words are `signpost-view.ts`; every spend and move is the game's (the server decides).
 */
import { useRef, useState } from 'preact/hooks';
import type { ScoutKit, ValleySeatView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { baseOption, type PickerOption } from '../roster-picker';
import { dropOutcome } from '../slot-outcome';
import { TOUCH_HOLD_MS } from '../dnd-core';
import { useDragDrop } from '../use-drag-drop';
import { Bar } from '../ui/Bar';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { DataTable } from '../ui/DataTable';
import { DragGhost } from '../ui/DragGhost';
import { Drawer } from '../ui/Drawer';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { RosterPicker } from '../ui/RosterPicker';
import { Slot, SlotRow } from '../ui/Slot';
import { Tag } from '../ui/Tag';
import { CommonsBoard, type CommonsActions, type CommonsStart } from './CommonsBoard';
import { SlotText, SpendConfirm, seatAt } from './seat-parts';
import { Tray } from './Tray';
import { trayFor, type TrayInput } from './tray-state';
import {
  KIT_INFO,
  KIT_ORDER,
  destinationRows,
  fitPreview,
  fitText,
  masteryName,
  masteryText,
  packContents,
  packLine,
  perDayRows,
  placeName,
  seatPriceText,
} from './signpost-view';

/** The sentinel row of the creature picker that empties a seat. */
const REMOVE_ID = '';

/** The id of the card a hand drops a creature on to help build (the project board's communal seat). */
const COMMUNAL_DROP = 'communal:signpost';

/** Why a price in Acorns cannot be paid; null when it can. */
function shortReason(acorns: number, price: number): string | null {
  return price > acorns ? `You have ${String(acorns)} Acorns; this costs ${String(price)}.` : null;
}

/** What the page asks the game to do; each answers whether the server took it. */
export interface SignpostActions {
  /** Posts a creature to a seat (a seat that holds another swaps), empties it (`null`) or points it elsewhere. */
  post: (body: {
    seatId: string;
    creatureId?: string | null;
    destination?: string;
  }) => Promise<boolean>;
  buySeat: () => Promise<boolean>;
  /** Buys a kit (a keyed spend). */
  buyKit: (kit: ScoutKit) => Promise<boolean>;
  setKit: (seatId: string, kit: ScoutKit | null) => Promise<boolean>;
}

/** What the page can open at the start (the workbench shows each). */
export interface SignpostStart {
  picker?: string;
  where?: string;
  kit?: string;
  detail?: string;
  buy?: boolean;
  /** The project board's drawer or picker to open (the commons). */
  commons?: CommonsStart;
}

export function SignpostSeats({
  visit,
  creatures,
  trayInput,
  acorns,
  busy,
  actions,
  onOpenPaddock,
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
  actions: SignpostActions;
  /** A tap on a tray creature: the Paddock, as everywhere in the valley. */
  onOpenPaddock: () => void;
  /** The Signpost's project board and the communal seat on it (a hand can carry a creature onto the card); absent leaves the page as before. */
  commons?: CommonsActions;
  start?: SignpostStart;
}) {
  const [picking, setPicking] = useState<string | null>(start.picker ?? null);
  const [where, setWhere] = useState<string | null>(start.where ?? null);
  const [kitFor, setKitFor] = useState<string | null>(start.kit ?? null);
  const [buyingKit, setBuyingKit] = useState<ScoutKit | null>(null);
  const [detail, setDetail] = useState<string | null>(start.detail ?? null);
  const [buying, setBuying] = useState(start.buy === true);
  const openers = useRef<Record<string, HTMLElement | null>>({});
  const pageRef = useRef<HTMLElement | null>(null);

  const seatOf = (id: string | null): ValleySeatView | undefined =>
    id === null ? undefined : visit.seats.find((s) => s.id === id);
  const numberOf = (seat: ValleySeatView): number => visit.seats.indexOf(seat) + 1;
  const creatureOf = (id: string | null): Creature | undefined =>
    id === null ? undefined : creatures.find((c) => c.id === id);

  const drag = useDragDrop<string>({
    disabled: busy,
    stripRef: pageRef,
    touchHoldMs: TOUCH_HOLD_MS,
    locate: (p) => seatAt(p.x, p.y),
    onDrop: (creatureId, seatId) => {
      if (seatId === null) return dropOutcome('none', null, null, 'Cancelled.');
      if (seatId === COMMUNAL_DROP && commons !== undefined) {
        void commons.post('signpost', creatureId);
        return dropOutcome('valid', null, null, '');
      }
      const seat = seatOf(seatId);
      if (seat === undefined || seat.creatureId === creatureId) {
        return dropOutcome('none', null, null, '');
      }
      void actions.post({ seatId, creatureId });
      return dropOutcome('valid', null, null, '');
    },
  });
  const carried = creatureOf(drag.drag?.creatureId ?? null);

  // The tray: the creatures a hand may carry (not on a job or a trip), the free ones first.
  const free = creatures.filter((c) => busyReason(c) === null);
  const ordered = trayFor(free, trayInput);

  const nextPrice = visit.seatPrices.next;
  const kitPrice = visit.kit.price;

  /** The creature picker's rows for a seat: everyone who can be posted; who stands at another seat swaps here. */
  function pickerOptions(seat: ValleySeatView): PickerOption[] {
    const rows: PickerOption[] = [
      {
        ...baseOption({ id: REMOVE_ID, species: '', nickname: null, level: 0 }),
        name: 'Back to resting',
        action: true,
        disabled: seat.creatureId === null ? 'Nobody is posted here' : null,
      },
    ];
    for (const c of [...creatures].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))) {
      const reason = busyReason(c);
      const other = visit.seats.find((s) => s.creatureId === c.id);
      rows.push({
        ...baseOption(c),
        onBoard: other !== undefined && other.id !== seat.id,
        disabled: c.id === seat.creatureId ? 'Posted here' : reason,
        ...(reason === null ? {} : { busy: busyKindOf(c) }),
      });
    }
    return rows;
  }

  const pickedSeat = seatOf(picking);
  const whereSeat = seatOf(where);
  const kitSeat = seatOf(kitFor);
  const detailSeat = seatOf(detail);

  return (
    <section
      class="sp-page"
      aria-label="Scouts"
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
      <ul class="sp-seats" aria-label="Scout seats">
        {visit.seats.map((seat) => {
          const n = numberOf(seat);
          const scout = creatureOf(seat.creatureId);
          const over = drag.drag?.over === seat.id;
          const preview =
            over && carried !== undefined ? fitPreview(carried, seat, visit, creatures) : null;
          const name = `Seat ${String(n)}`;
          const kit = seat.kit === null ? null : KIT_INFO[seat.kit];
          return (
            <li key={seat.id} class={`sp-seat${over ? ' over' : ''}`} data-seat={seat.id}>
              <div class="sp-seat-head">
                <h3 class="pix">{name}</h3>
                {seat.creatureId !== null && seat.store.full && (
                  <Tag kind="badge" tone="good">
                    Pack full
                  </Tag>
                )}
              </div>
              <SlotRow
                label={name}
                slots={[
                  scout === undefined ? (
                    <Slot
                      kind="talent"
                      state="empty"
                      name="Post a scout"
                      label={`${name}: nobody posted. Choose a scout`}
                      buttonRef={(el) => {
                        openers.current[`scout-${seat.id}`] = el;
                      }}
                      expanded={picking === seat.id}
                      disabled={busy}
                      onClick={() => {
                        setPicking(seat.id);
                      }}
                    />
                  ) : (
                    <Slot
                      kind="talent"
                      state="filled"
                      label={`${name}: ${creatureName(scout)}, level ${String(scout.level)}, ${masteryText(seat)}. Change`}
                      buttonRef={(el) => {
                        openers.current[`scout-${seat.id}`] = el;
                      }}
                      expanded={picking === seat.id}
                      disabled={busy}
                      onClick={() => {
                        setPicking(seat.id);
                      }}
                    >
                      <SlotText
                        name={creatureName(scout)}
                        sub={`Lv ${String(scout.level)}${seat.mastery.step === 0 ? '' : ' · ' + masteryName(seat.mastery.step)}`}
                      />
                    </Slot>
                  ),
                  <Slot
                    kind="talent"
                    state="filled"
                    label={`${name}: scouting ${placeName(seat.destination)}, ${fitText(seat)}. Change`}
                    buttonRef={(el) => {
                      openers.current[`where-${seat.id}`] = el;
                    }}
                    expanded={where === seat.id}
                    disabled={busy}
                    onClick={() => {
                      setWhere(seat.id);
                    }}
                  >
                    <SlotText
                      name={placeName(seat.destination)}
                      sub={seat.creatureId === null ? 'Scouts here' : seat.fit ? 'Fits' : 'No fit'}
                    />
                  </Slot>,
                  kit === null ? (
                    <Slot
                      kind="talent"
                      state="empty"
                      name="No kit"
                      label={`${name}: no kit. Choose one`}
                      buttonRef={(el) => {
                        openers.current[`kit-${seat.id}`] = el;
                      }}
                      expanded={kitFor === seat.id}
                      disabled={busy}
                      onClick={() => {
                        setKitFor(seat.id);
                      }}
                    />
                  ) : (
                    <Slot
                      kind="talent"
                      state="filled"
                      label={`${name}: ${kit.name}. Change`}
                      buttonRef={(el) => {
                        openers.current[`kit-${seat.id}`] = el;
                      }}
                      expanded={kitFor === seat.id}
                      disabled={busy}
                      onClick={() => {
                        setKitFor(seat.id);
                      }}
                    >
                      <SlotText name={kit.name} sub="Kit" />
                    </Slot>
                  ),
                ]}
              />
              {preview !== null ? (
                <p class="sp-line sp-preview" data-arrow={preview.arrow} role="status">
                  <span class="sp-arrow" aria-hidden="true" />
                  <span>{preview.text}</span>
                </p>
              ) : scout === undefined ? (
                <p class="sp-line muted">Pick a scout, or drag one here.</p>
              ) : (
                <button
                  type="button"
                  class="sp-line sp-pack"
                  aria-haspopup="dialog"
                  aria-label={`${packLine(seat)}. Show the pack and what this seat brings`}
                  ref={(el) => {
                    openers.current[`pack-${seat.id}`] = el;
                  }}
                  onClick={() => {
                    setDetail(seat.id);
                  }}
                >
                  <Bar
                    value={seat.store.hours}
                    max={seat.store.capHours}
                    label="Pack"
                    class="sp-bar"
                  />
                  <span class="sp-pack-text">{packLine(seat)}</span>
                </button>
              )}
            </li>
          );
        })}
        <li class="sp-seat sp-new">
          {nextPrice === null ? (
            <p class="sp-line muted">The Signpost has no more seats for now.</p>
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
              <span class="pix sp-buy-name">A new seat</span>
              <span class="sp-buy-price">{seatPriceText(nextPrice)}</span>
            </button>
          )}
        </li>
      </ul>
      {commons !== undefined && (
        <CommonsBoard
          place="signpost"
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

      {pickedSeat !== undefined && (
        <RosterPicker
          title={`Who scouts from seat ${String(numberOf(pickedSeat))}?`}
          status="A scout at another seat swaps places with this one."
          options={pickerOptions(pickedSeat)}
          placedNote="Scouting · swaps here"
          showEffects={false}
          reasonSide
          anchor={() => openers.current[`scout-${pickedSeat.id}`] ?? null}
          onClose={() => {
            setPicking(null);
          }}
          onPick={(id) => {
            const seatId = pickedSeat.id;
            setPicking(null);
            void actions.post({ seatId, creatureId: id === REMOVE_ID ? null : id });
          }}
        />
      )}

      {whereSeat !== undefined && (
        <Drawer
          open
          onClose={() => {
            setWhere(null);
          }}
          title="Where to scout"
          meta={`Seat ${String(numberOf(whereSeat))}`}
          returnFocusTo={openers.current[`where-${whereSeat.id}`] ?? null}
        >
          <div class="dr-stack pix-panel">
            <ChoiceList label="Places to scout">
              {destinationRows(visit).map((row) => (
                <ChoiceButton
                  key={row.id}
                  label={row.name}
                  line={row.closed ?? row.line}
                  selected={whereSeat.destination === row.id}
                  disabled={busy || row.closed !== null}
                  onClick={() => {
                    const seatId = whereSeat.id;
                    setWhere(null);
                    if (row.id !== whereSeat.destination) {
                      void actions.post({ seatId, destination: row.id });
                    }
                  }}
                />
              ))}
            </ChoiceList>
            <p class="muted sp-note">Moving a scout brings its pack home first.</p>
          </div>
        </Drawer>
      )}

      {kitSeat !== undefined && (
        <Drawer
          open
          onClose={() => {
            setKitFor(null);
            setBuyingKit(null);
          }}
          title={buyingKit === null ? 'Kit' : `Buy the ${KIT_INFO[buyingKit].name}`}
          meta={`Seat ${String(numberOf(kitSeat))}`}
          returnFocusTo={openers.current[`kit-${kitSeat.id}`] ?? null}
        >
          {buyingKit === null ? (
            <div class="dr-stack pix-panel">
              <ChoiceList label="Kit">
                {KIT_ORDER.map((kind) => {
                  const owned = visit.kit.owned.includes(kind);
                  return (
                    <ChoiceButton
                      key={kind}
                      label={
                        owned
                          ? KIT_INFO[kind].name
                          : `${KIT_INFO[kind].name}, ${seatPriceText(kitPrice)}`
                      }
                      line={KIT_INFO[kind].line}
                      selected={kitSeat.kit === kind}
                      disabled={busy}
                      onClick={() => {
                        if (!owned) {
                          setBuyingKit(kind);
                          return;
                        }
                        const seatId = kitSeat.id;
                        setKitFor(null);
                        void actions.setKit(seatId, kind);
                      }}
                    />
                  );
                })}
                <ChoiceButton
                  label="No kit"
                  line="Nothing packed. Switching kit costs nothing."
                  selected={kitSeat.kit === null}
                  disabled={busy}
                  onClick={() => {
                    const seatId = kitSeat.id;
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
                title={KIT_INFO[buyingKit].name}
                backLabel="to the kit list"
                focus
                onBack={() => {
                  setBuyingKit(null);
                }}
              />
              <SpendConfirm
                text={`${KIT_INFO[buyingKit].line} You keep it, and can put it on any seat.`}
                label="Buy"
                price={seatPriceText(kitPrice)}
                reason={shortReason(acorns, kitPrice)}
                busy={busy}
                onConfirm={() => {
                  const kind = buyingKit;
                  const seatId = kitSeat.id;
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

      {detailSeat !== undefined && (
        <Drawer
          open
          onClose={() => {
            setDetail(null);
          }}
          title="Pack and pace"
          meta={`Seat ${String(numberOf(detailSeat))}`}
          returnFocusTo={openers.current[`pack-${detailSeat.id}`] ?? null}
        >
          <SeatNumbers seat={detailSeat} />
        </Drawer>
      )}

      {buying && nextPrice !== null && (
        <Drawer
          open
          onClose={() => {
            setBuying(false);
          }}
          title="A new scout seat"
          returnFocusTo={openers.current['buy'] ?? null}
        >
          <SpendConfirm
            text="Another scout can explore a place for you, all day long."
            label="Buy the seat"
            price={seatPriceText(nextPrice)}
            reason={shortReason(acorns, nextPrice)}
            busy={busy}
            onConfirm={() => {
              void actions.buySeat().then((ok) => {
                if (ok) setBuying(false);
              });
            }}
          />
        </Drawer>
      )}
    </section>
  );
}

/** What the pack holds now, and what the seat brings a day, with the fit, the mastery and the kit that make it (V-RET-9). */
export function SeatNumbers({ seat }: { seat: ValleySeatView }) {
  const held = packContents(seat);
  return (
    <div class="dr-stack pix-panel">
      <p class="sp-note">{packLine(seat)}</p>
      <h4 class="pix sp-sub">In the pack</h4>
      {held.length === 0 ? (
        <p class="muted">Nothing yet.</p>
      ) : (
        <DataTable rows={held.map((r) => ({ label: r.label, value: String(r.count) }))} tabular />
      )}
      <h4 class="pix sp-sub">A day brings</h4>
      <DataTable rows={perDayRows(seat)} tabular />
      <h4 class="pix sp-sub">What makes it</h4>
      <DataTable
        rows={[
          { label: 'Fit', value: fitText(seat) },
          { label: 'Mastery', value: masteryText(seat) },
          { label: 'Kit', value: seat.kit === null ? 'None' : KIT_INFO[seat.kit].name },
          ...(seat.second ? [{ label: 'Second scout here', value: 'Fewer creatures' }] : []),
        ]}
      />
    </div>
  );
}

/** Whether a creature is busy on a job or away on a trip, for the picker's status badge. */
function busyKindOf(c: Creature): 'away' | 'job' {
  return c.busy?.kind === 'job' ? 'job' : 'away';
}
