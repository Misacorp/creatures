/**
 * What a click on a destination of the Signpost's map opens (the right drawer, a page on a phone): a wizard of the destination's own
 * steps, drawn with `ui/Wizard`. The first step is the place as it is (what it is rich in, who scouts there with each pack, and the one
 * gold button that sends another scout); from it a step picks the scout (`ui/CreatureList`, a tap picks), a step picks the seat (a free
 * one, one that holds someone, or a new one to buy), a step picks the kit (and buys one: a keyed spend with one button, `SpendConfirm`),
 * and the last step reads the choice back with its one gold button. A scout already there opens its own step: its pack and pace, change
 * the scout, change the kit, move it to another place, or send it back to resting. Every seat rule and price is the game's: nothing here
 * decides anything; each pick is the game's action and the server answers. The pure words are `signpost-view.ts`.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ScoutKit, ValleySeatView } from '@creatures/game';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { acornCount, type ShortOf } from '../resource-count';
import { baseOption, type PickerOption } from '../roster-picker';
import { Alert } from '../ui/Alert';
import { Bar } from '../ui/Bar';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CreatureList } from '../ui/CreatureList';
import { PriceLine } from '../ui/CountBadge';
import { DataTable } from '../ui/DataTable';
import { Slot, SlotRow } from '../ui/Slot';
import { Tag } from '../ui/Tag';
import { useWizard, type WizardStep } from '../ui/use-wizard';
import { WizardFooter, WizardView } from '../ui/Wizard';
import { PanelBody } from './PlaceCanvas';
import { SlotText, SpendConfirm } from './seat-parts';
import { SeatNumbers, type SignpostActions } from './SignpostSeats';
import { CLOSED_RULE, seatsAt } from './signpost-map';
import {
  KIT_INFO,
  KIT_ORDER,
  RAID_PAUSE,
  destinationLine,
  FIT_PERCENT,
  destinationRows,
  fitsPlace,
  masteryName,
  masteryText,
  packLine,
  placeName,
  seatPrice,
} from './signpost-view';

/** The steps of a destination's wizard. */
export type DestinationStep =
  'hub' | 'seat-view' | 'who' | 'seat' | 'seat-buy' | 'kit' | 'kit-buy' | 'ready' | 'move';

/** The sentinel row of the creature list that empties a seat. */
const REMOVE_ID = '';

/** Why a price in Acorns cannot be paid; null when it can. */
function shortReason(acorns: number, price: number): ShortOf | null {
  return price > acorns ? { have: [acornCount(acorns)], cost: [acornCount(price)] } : null;
}

/** What is being done: send a scout (who, seat, kit, ready), change the scout of a seat, or change its kit. */
type Flow = 'send' | 'replace' | 'kit-edit';

/** The choice a send builds up. `kit` is the seat's own until the player picks another. */
interface Draft {
  creatureId: string | null;
  seatId: string | null;
  kit: ScoutKit | null;
  /** The seat step was skipped (the scout already has a seat, or the seat was clicked in the scene): Back from the kit step goes to the scout. */
  seatKnown: boolean;
}

const EMPTY_DRAFT: Draft = { creatureId: null, seatId: null, kit: null, seatKnown: false };

export function DestinationPanel({
  visit,
  destinationId,
  creatures,
  acorns,
  busy,
  error,
  actions,
  start = 'hub',
  seatId = null,
  onClose,
}: {
  visit: ValleyVisit;
  destinationId: string;
  creatures: readonly Creature[];
  acorns: number;
  busy: boolean;
  error: string | null;
  actions: SignpostActions;
  /** The step it opens on (a seat clicked in the scene opens its own step, or the scout step for a free seat). */
  start?: DestinationStep;
  /** The seat a step starts from (`seat-view`'s seat; a free seat's `who`). */
  seatId?: string | null;
  /** Back from the first step, and after a scout is sent. */
  onClose: () => void;
}) {
  const place = visit.places.find((p) => p.id === destinationId);
  const name = placeName(destinationId);
  const [flow, setFlow] = useState<Flow>('send');
  const [draft, setDraft] = useState<Draft>(() =>
    start === 'who' && seatId !== null ? { ...EMPTY_DRAFT, seatId, seatKnown: true } : EMPTY_DRAFT,
  );
  const [editSeat, setEditSeat] = useState<string | null>(start === 'seat-view' ? seatId : null);
  const [buyingKit, setBuyingKit] = useState<ScoutKit | null>(null);

  const seatNumber = (id: string): number => visit.seats.findIndex((s) => s.id === id) + 1;
  const seatOf = (id: string | null): ValleySeatView | undefined =>
    id === null ? undefined : visit.seats.find((s) => s.id === id);
  const creatureOf = (id: string | null): Creature | undefined =>
    id === null ? undefined : creatures.find((c) => c.id === id);

  const steps: readonly WizardStep<DestinationStep>[] = [
    { id: 'hub', title: name, backLabel: 'to the map' },
    { id: 'seat-view', title: 'A scout here', backLabel: 'to the place', back: 'hub' },
    {
      id: 'who',
      title: 'Who scouts here?',
      backLabel: flow === 'replace' ? 'to the scout' : 'to the place',
      back: flow === 'replace' ? 'seat-view' : 'hub',
    },
    { id: 'seat', title: 'Which seat?', backLabel: 'to the scout list', back: 'who' },
    { id: 'seat-buy', title: 'A new scout seat', backLabel: 'to the seat list', back: 'seat' },
    {
      id: 'kit',
      title: 'Kit',
      backLabel:
        flow === 'kit-edit'
          ? 'to the scout'
          : draft.seatKnown
            ? 'to the scout list'
            : 'to the seat list',
      back: flow === 'kit-edit' ? 'seat-view' : draft.seatKnown ? 'who' : 'seat',
    },
    {
      id: 'kit-buy',
      title: buyingKit === null ? 'Buy a kit' : `Buy the ${KIT_INFO[buyingKit].name}`,
      backLabel: 'to the kit list',
      back: 'kit',
    },
    { id: 'ready', title: `Send a scout to ${name}`, backLabel: 'to the kit list', back: 'kit' },
    { id: 'move', title: 'Move the scout', backLabel: 'to the scout', back: 'seat-view' },
  ];
  const wizard = useWizard(steps, { initial: start, onExit: onClose });
  // The head takes the focus when a step opens after the first (the button that opened it is gone); not on the panel's own opening.
  const opened = useRef(false);
  useEffect(() => {
    opened.current = true;
  }, []);

  // The place left the server's list: nothing to show.
  const gone = place === undefined;
  useEffect(() => {
    if (gone) onClose();
  }, [gone]);
  if (place === undefined) return null;

  const closed = !place.open;
  const here = seatsAt(visit, destinationId);
  const nextPrice = visit.seatPrices.next;
  const kitPrice = visit.kit.price;
  const editing = seatOf(editSeat);
  const chosen = creatureOf(draft.creatureId);
  const chosenSeat = seatOf(draft.seatId);

  /** The creature's seat today (the server's word), if any. */
  const seatOfCreature = (creatureId: string): string | null =>
    visit.creatures.find((r) => r.id === creatureId)?.seatId ?? null;

  // --- The steps ---

  const hub = (
    <div class="dr-stack">
      <p class="sp-note">{destinationLine(place)}</p>
      {closed && <Alert level="info">{CLOSED_RULE}</Alert>}
      <ul class="sg-scouts" aria-label={`Scouts at ${name}`}>
        {here.map((seat) => {
          const scout = creatureOf(seat.creatureId);
          const label = `Seat ${String(seatNumber(seat.id))}: ${scout === undefined ? 'a scout' : creatureName(scout)}`;
          return (
            <li key={seat.id}>
              <button
                type="button"
                class="sp-line sp-pack"
                aria-label={`${label}. ${packLine(seat)}. Show this scout`}
                onClick={() => {
                  setEditSeat(seat.id);
                  wizard.goTo('seat-view');
                }}
              >
                <Bar
                  value={seat.store.hours}
                  max={seat.store.capHours}
                  label={`Pack, ${label}`}
                  class="sp-bar"
                />
                <span class="sp-pack-text">
                  {label}, {packLine(seat)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {here.length === 0 && (
        <p class="sp-line muted">{closed ? 'Nobody can scout here yet.' : 'Nobody scouts here.'}</p>
      )}
    </div>
  );

  const seatView = (() => {
    if (editing === undefined) return <p class="muted">That seat is gone.</p>;
    const scout = creatureOf(editing.creatureId);
    const n = seatNumber(editing.id);
    const kit = editing.kit === null ? null : KIT_INFO[editing.kit];
    const seatName = `Seat ${String(n)}`;
    return (
      <div class="dr-stack">
        <SlotRow
          label={seatName}
          slots={[
            scout === undefined ? (
              <Slot
                kind="talent"
                state="empty"
                name="Post a scout"
                label={`${seatName}: nobody posted. Choose a scout`}
                disabled={busy}
                onClick={() => {
                  setFlow('replace');
                  wizard.goTo('who');
                }}
              />
            ) : (
              <Slot
                kind="talent"
                state="filled"
                label={`${seatName}: ${creatureName(scout)}, level ${String(scout.level)}, ${masteryText(editing)}. Change`}
                disabled={busy}
                onClick={() => {
                  setFlow('replace');
                  wizard.goTo('who');
                }}
              >
                <SlotText
                  name={creatureName(scout)}
                  sub={`Lv ${String(scout.level)}${editing.mastery.step === 0 ? '' : ' · ' + masteryName(editing.mastery.step)}`}
                />
              </Slot>
            ),
            kit === null ? (
              <Slot
                kind="talent"
                state="empty"
                name="No kit"
                label={`${seatName}: no kit. Choose one`}
                disabled={busy}
                onClick={() => {
                  setFlow('kit-edit');
                  wizard.goTo('kit');
                }}
              />
            ) : (
              <Slot
                kind="talent"
                state="filled"
                label={`${seatName}: ${kit.name}. Change`}
                disabled={busy}
                onClick={() => {
                  setFlow('kit-edit');
                  wizard.goTo('kit');
                }}
              >
                <SlotText name={kit.name} sub="Kit" />
              </Slot>
            ),
          ]}
        />
        {editing.paused !== null && (
          <p class="sp-line" role="status">
            <Tag kind="badge">Paused</Tag> <span>{RAID_PAUSE}</span>
          </p>
        )}
        <SeatNumbers seat={editing} />
        <button
          type="button"
          class="sp-buy"
          disabled={busy}
          onClick={() => {
            wizard.goTo('move');
          }}
        >
          <span class="pix sp-buy-name">Move to another place</span>
        </button>
        {scout !== undefined && (
          <button
            type="button"
            class="sp-buy"
            disabled={busy}
            onClick={() => {
              void actions.post({ seatId: editing.id, creatureId: null }).then((ok) => {
                if (ok) onClose();
              });
            }}
          >
            <span class="pix sp-buy-name">Back to resting</span>
          </button>
        )}
      </div>
    );
  })();

  /** The creature list's rows: everyone who can be posted; who stands at another seat moves (or swaps) here. */
  const whoOptions = (): PickerOption[] => {
    const target = flow === 'replace' ? editing : chosenSeat;
    const rows: PickerOption[] = [];
    if (flow === 'replace') {
      rows.push({
        ...baseOption({ id: REMOVE_ID, species: '', nickname: null, level: 0 }),
        name: 'Back to resting',
        action: true,
        disabled:
          target?.creatureId === null || target === undefined ? 'Nobody is posted here' : null,
      });
    }
    for (const c of [...creatures].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))) {
      const reason = busyReason(c);
      const at = seatOfCreature(c.id);
      rows.push({
        ...baseOption(c),
        onBoard: at !== null && at !== target?.id,
        disabled:
          flow === 'replace' && c.id === target?.creatureId
            ? 'Posted here'
            : flow === 'send' && c.id === target?.creatureId
              ? 'Posted here'
              : reason,
        ...(reason === null
          ? {}
          : { busy: c.busy?.kind === 'job' ? ('job' as const) : ('away' as const) }),
      });
    }
    return rows;
  };

  const whoStep = (
    <div class="dr-stack">
      <p class="sp-note">A scout at another seat swaps places with this one.</p>
      <CreatureList
        options={whoOptions()}
        selection={{
          mode: 'pick',
          label: `Who scouts at ${name}`,
          onPick: (id) => {
            if (flow === 'replace') {
              const target = editSeat;
              if (target === null) return;
              wizard.goTo('seat-view');
              void actions.post({ seatId: target, creatureId: id === REMOVE_ID ? null : id });
              return;
            }
            const own = seatOfCreature(id);
            const seat = draft.seatId ?? own;
            setDraft((d) => ({
              ...d,
              creatureId: id,
              seatId: seat,
              kit: seatOf(seat)?.kit ?? null,
              seatKnown: seat !== null,
            }));
            wizard.goTo(seat === null ? 'seat' : 'kit');
          },
        }}
        placedNote="Scouting · moves here"
        showEffects={false}
        reasonSide
        class="flat"
      />
    </div>
  );

  const seatStep = (
    <div class="dr-stack pix-panel">
      <ChoiceList label="Seats">
        {visit.seats.map((seat) => {
          const holder = creatureOf(seat.creatureId);
          return (
            <ChoiceButton
              key={seat.id}
              label={`Seat ${String(seatNumber(seat.id))}`}
              line={
                holder === undefined
                  ? 'Free.'
                  : `${creatureName(holder)} scouts at ${placeName(seat.destination)} now, and swaps or goes back to resting.`
              }
              selected={draft.seatId === seat.id}
              disabled={busy}
              onClick={() => {
                setDraft((d) => ({ ...d, seatId: seat.id, kit: seat.kit }));
                wizard.goTo('kit');
              }}
            />
          );
        })}
        {nextPrice !== null && (
          <ChoiceButton
            label={
              <>
                A new seat, <PriceLine price={seatPrice(nextPrice)} />
              </>
            }
            line="Another scout can explore a place for you, all day long."
            disabled={busy}
            onClick={() => {
              wizard.goTo('seat-buy');
            }}
          />
        )}
      </ChoiceList>
      {visit.seats.length === 0 && nextPrice === null && (
        <p class="muted sp-note">The Signpost has no seats for now.</p>
      )}
    </div>
  );

  const seatBuyStep =
    nextPrice === null ? null : (
      <SpendConfirm
        text="Another scout can explore a place for you, all day long."
        label="Buy the seat"
        price={seatPrice(nextPrice)}
        reason={shortReason(acorns, nextPrice)}
        busy={busy}
        onConfirm={() => {
          void actions.buySeat().then((ok) => {
            if (ok) wizard.goTo('seat');
          });
        }}
      />
    );

  const kitStep = (
    <div class="dr-stack pix-panel">
      <ChoiceList label="Kit">
        {KIT_ORDER.map((kind) => {
          const owned = visit.kit.owned.includes(kind);
          const current = flow === 'kit-edit' ? editing?.kit === kind : draft.kit === kind;
          return (
            <ChoiceButton
              key={kind}
              label={
                owned ? (
                  KIT_INFO[kind].name
                ) : (
                  <>
                    {KIT_INFO[kind].name}, <PriceLine price={seatPrice(kitPrice)} />
                  </>
                )
              }
              line={KIT_INFO[kind].line}
              selected={current}
              disabled={busy}
              onClick={() => {
                if (!owned) {
                  setBuyingKit(kind);
                  wizard.goTo('kit-buy');
                  return;
                }
                if (flow === 'kit-edit' && editSeat !== null) {
                  wizard.goTo('seat-view');
                  void actions.setKit(editSeat, kind);
                  return;
                }
                setDraft((d) => ({ ...d, kit: kind }));
                wizard.goTo('ready');
              }}
            />
          );
        })}
        <ChoiceButton
          label="No kit"
          line="Nothing packed. Switching kit costs nothing."
          selected={flow === 'kit-edit' ? editing?.kit === null : draft.kit === null}
          disabled={busy}
          onClick={() => {
            if (flow === 'kit-edit' && editSeat !== null) {
              wizard.goTo('seat-view');
              void actions.setKit(editSeat, null);
              return;
            }
            setDraft((d) => ({ ...d, kit: null }));
            wizard.goTo('ready');
          }}
        />
      </ChoiceList>
    </div>
  );

  const kitBuyStep =
    buyingKit === null ? null : (
      <SpendConfirm
        text={`${KIT_INFO[buyingKit].line} You keep it, and can put it on any seat.`}
        label="Buy"
        price={seatPrice(kitPrice)}
        reason={shortReason(acorns, kitPrice)}
        busy={busy}
        onConfirm={() => {
          const kind = buyingKit;
          void (async () => {
            if (!(await actions.buyKit(kind))) return;
            setBuyingKit(null);
            if (flow === 'kit-edit' && editSeat !== null) {
              wizard.goTo('seat-view');
              await actions.setKit(editSeat, kind);
              return;
            }
            setDraft((d) => ({ ...d, kit: kind }));
            wizard.goTo('ready');
          })();
        }}
      />
    );

  // The one the chosen seat holds now, when it is not the scout sent: it goes back to resting (or takes the sent scout's old seat).
  const leaving =
    chosenSeat === undefined || chosenSeat.creatureId === draft.creatureId
      ? undefined
      : creatureOf(chosenSeat.creatureId);

  const readyStep = (
    <div class="dr-stack">
      <DataTable
        rows={[
          { label: 'Scout', value: chosen === undefined ? '' : creatureName(chosen) },
          {
            label: 'Seat',
            value: chosenSeat === undefined ? '' : `Seat ${String(seatNumber(chosenSeat.id))}`,
          },
          { label: 'Place', value: name },
          { label: 'Kit', value: draft.kit === null ? 'None' : KIT_INFO[draft.kit].name },
          {
            label: 'Fit',
            value:
              chosen === undefined
                ? ''
                : fitsPlace(chosen, place)
                  ? `Fits here, +${String(FIT_PERCENT)}%`
                  : 'No fit here',
          },
        ]}
      />
      {leaving !== undefined && (
        <p class="sp-note">
          {draft.creatureId !== null && seatOfCreature(draft.creatureId) !== null
            ? `${creatureName(leaving)} swaps places with the scout.`
            : `${creatureName(leaving)} goes back to resting.`}
        </p>
      )}
      <p class="sp-note">Moving a scout brings its pack home first.</p>
    </div>
  );

  const send = (): void => {
    if (chosen === undefined || chosenSeat === undefined) return;
    const kit = draft.kit;
    const kitChanged = kit !== chosenSeat.kit;
    void (async () => {
      const ok = await actions.post({
        seatId: chosenSeat.id,
        creatureId: chosen.id,
        destination: destinationId,
      });
      if (!ok) return;
      if (kitChanged) await actions.setKit(chosenSeat.id, kit);
      setDraft(EMPTY_DRAFT);
      onClose();
    })();
  };

  const sendBlocked = closed
    ? 'Closed until a Festival week'
    : visit.seats.length === 0 && nextPrice === null
      ? 'The Signpost has no seats for now.'
      : null;

  return (
    <PanelBody
      footer={
        wizard.step === 'hub' ? (
          <WizardFooter
            label="Send a scout here"
            blocked={sendBlocked}
            busy={busy}
            onFinish={() => {
              setFlow('send');
              setDraft(EMPTY_DRAFT);
              wizard.goTo('who');
            }}
          />
        ) : wizard.step === 'ready' ? (
          <WizardFooter
            label={chosen === undefined ? 'Send' : `Send ${creatureName(chosen)} to ${name}`}
            busy={busy}
            onFinish={send}
          />
        ) : undefined
      }
    >
      <WizardView
        key={wizard.step}
        wizard={wizard}
        focus={opened.current}
        disabled={busy && (wizard.step === 'kit-buy' || wizard.step === 'seat-buy')}
      >
        {wizard.step === 'hub' && hub}
        {wizard.step === 'seat-view' && seatView}
        {wizard.step === 'who' && whoStep}
        {wizard.step === 'seat' && seatStep}
        {wizard.step === 'seat-buy' && seatBuyStep}
        {wizard.step === 'kit' && kitStep}
        {wizard.step === 'kit-buy' && kitBuyStep}
        {wizard.step === 'ready' && readyStep}
        {wizard.step === 'move' && (
          <div class="dr-stack pix-panel">
            <ChoiceList label="Places to scout">
              {destinationRows(visit).map((row) => (
                <ChoiceButton
                  key={row.id}
                  label={row.name}
                  line={row.closed ?? row.line}
                  selected={destinationId === row.id}
                  disabled={busy || row.closed !== null}
                  onClick={() => {
                    if (editSeat === null || row.id === destinationId) return;
                    void actions.post({ seatId: editSeat, destination: row.id }).then((ok) => {
                      if (ok) onClose();
                    });
                  }}
                />
              ))}
            </ChoiceList>
            <p class="muted sp-note">Moving a scout brings its pack home first.</p>
          </div>
        )}
        {error !== null && (wizard.step === 'kit-buy' || wizard.step === 'seat-buy') && (
          <Alert level="alert">{error}</Alert>
        )}
      </WizardView>
    </PanelBody>
  );
}

/** The one step that buys the next seat from the scene's dashed outline: the price and the one button (a keyed spend, `SpendConfirm`). */
export function SeatBuyPanel({
  visit,
  acorns,
  busy,
  error,
  actions,
  onClose,
}: {
  visit: ValleyVisit;
  acorns: number;
  busy: boolean;
  error: string | null;
  actions: SignpostActions;
  /** Back from the step, and after the seat is bought. */
  onClose: () => void;
}) {
  const next = visit.seatPrices.next;
  const wizard = useWizard<'buy'>(
    [{ id: 'buy', title: 'A new scout seat', backLabel: 'to the signpost' }],
    {
      onExit: onClose,
    },
  );
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        {next === null ? (
          <p class="muted">The Signpost has no more seats for now.</p>
        ) : (
          <SpendConfirm
            text="Another scout can explore a place for you, all day long."
            label="Buy the seat"
            price={seatPrice(next)}
            reason={shortReason(acorns, next)}
            busy={busy}
            onConfirm={() => {
              void actions.buySeat().then((ok) => {
                if (ok) onClose();
              });
            }}
          />
        )}
        {error !== null && <Alert level="alert">{error}</Alert>}
      </WizardView>
    </PanelBody>
  );
}
