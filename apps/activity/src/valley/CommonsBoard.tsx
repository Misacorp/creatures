/**
 * A place's project board (phase 5 step 6b, `systems/commons.md` V-COM-2, 3, 6, 12, 14): one component for every place that has a
 * project. A card in the place's page (the Signpost, the Forge, the Paddock) in the family of the seat cards: the place's level, the open
 * project's bar with what is still needed, the player's own part (private, V-COM-2), one gold Give button, a row for the plaque and a
 * row for the collection, and the player's communal seat (V-COM-14) as the shared slot row.
 *
 * The same card opens in a drawer from the Bonfire's scene (`host="sheet"`, which has no page): there the Give list, the plaque, the
 * collection and the seat open as drill-ins of the one drawer (never a layer over it). In a page they open in a drawer of their own,
 * and the seat in the shared creature picker. Giving is a keyed spend with one clear button (`SpendConfirm`); the server decides.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Creature, ValleyVisit } from '../api';
import { creatureName } from '../game';
import { busyReason } from '../gear-view';
import { baseOption, type PickerOption } from '../roster-picker';
import { ActionButton } from '../ui/ActionButton';
import { Bar } from '../ui/Bar';
import { ChoiceButton, ChoiceList } from '../ui/ChoiceList';
import { CountStepper } from '../ui/CountStepper';
import { CreatureList } from '../ui/CreatureList';
import { Drawer } from '../ui/Drawer';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { RosterPicker } from '../ui/RosterPicker';
import { Slot, SlotRow } from '../ui/Slot';
import { Tag } from '../ui/Tag';
import {
  COMMONS_NAMES,
  boardName,
  collectionOf,
  commonsOf,
  giftPrice,
  giveRows,
  levelLine,
  percentFilled,
  placeOf,
  plaqueTitle,
  socketFinder,
  socketWords,
  socketsSet,
  stateLine,
  stateTag,
  stillNeeded,
  yourPart,
  type GiveRow,
} from './commons-view';
import { SlotText, SpendConfirm } from './seat-parts';

/** The sentinel row of the creature picker that empties the seat. */
const REMOVE_ID = '';

/** What the board asks the game to do; each answers whether the server took it. */
export interface CommonsActions {
  /** Gives `units` of a part to the place's project (a keyed spend); `row.per` of them make each unit for shards of another element. */
  give: (place: string, row: GiveRow, units: number) => Promise<boolean>;
  /** Posts a creature to the player's communal seat at the place, or empties it (`null`). */
  post: (place: string, creatureId: string | null) => Promise<boolean>;
}

/** What the board can open at the start (the workbench shows each). */
export type CommonsView = 'give' | 'plaque' | 'collection' | 'seat';
export interface CommonsStart {
  view?: CommonsView;
  /** The Give list's row to open the amount for. */
  row?: string;
}

/** What a place's board and the Bonfire's sheet read. */
export interface CommonsBoardProps {
  place: string;
  visit: ValleyVisit;
  creatures: readonly Creature[];
  /** The player's Acorns (the `bait` balance). */
  acorns: number;
  busy: boolean;
  actions: CommonsActions;
  /** A page (a card among the page's cards) or the sheet the Bonfire opens. */
  host?: 'page' | 'sheet';
  /** The id a carried creature lands on (the card carries it as `data-seat`); absent on a page without a tray. */
  dropId?: string;
  /** A carried creature is over the card. */
  over?: boolean;
  /** The sheet is open (host `sheet` only). */
  open?: boolean;
  onClose?: () => void;
  start?: CommonsStart;
}

/** The creature picker's rows for the communal seat: everyone who can be posted; who stands at another seat swaps here. */
function seatOptions(
  creatures: readonly Creature[],
  visit: ValleyVisit,
  seatId: string | null,
  posted: string | null,
): PickerOption[] {
  const rows: PickerOption[] = [
    {
      ...baseOption({ id: REMOVE_ID, species: '', nickname: null, level: 0 }),
      name: 'Back to resting',
      action: true,
      disabled: posted === null ? 'Nobody is posted here' : null,
    },
  ];
  for (const c of [...creatures].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))) {
    const reason = busyReason(c);
    const at = visit.creatures.find((r) => r.id === c.id)?.seatId ?? null;
    rows.push({
      ...baseOption(c),
      onBoard: at !== null && at !== seatId,
      disabled: c.id === posted ? 'Posted here' : reason,
      ...(reason === null
        ? {}
        : { busy: c.busy?.kind === 'job' ? ('job' as const) : ('away' as const) }),
    });
  }
  return rows;
}

export function CommonsBoard({
  place,
  visit,
  creatures,
  acorns,
  busy,
  actions,
  host = 'page',
  dropId,
  over = false,
  open = true,
  onClose,
  start = {},
}: CommonsBoardProps) {
  const commons = commonsOf(visit);
  const p = placeOf(commons, place);
  const [view, setView] = useState<CommonsView | null>(start.view ?? null);
  const [rowId, setRowId] = useState<string | null>(start.row ?? null);
  const [units, setUnits] = useState(1);
  const openers = useRef<Record<string, HTMLElement | null>>({});
  // In the sheet, coming back from a drill-in drops the view the focus was in: it goes to the sheet's own body, so Escape still closes it.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const wasDeeper = useRef(false);
  useEffect(() => {
    if (view !== null) wasDeeper.current = true;
    else if (wasDeeper.current) {
      wasDeeper.current = false;
      sheetRef.current?.focus({ preventScroll: true });
    }
  }, [view]);
  if (p === undefined) return null;

  const name = COMMONS_NAMES[place] ?? place;
  const board = collectionOf(commons, place);
  const seat = commons?.communal.find((c) => c.place === place);
  const poster = seat?.creatureId ?? null;
  const helper = poster === null ? undefined : creatures.find((c) => c.id === poster);
  const rate = visit.forge.exchange.rate;
  const rows = giveRows(
    p,
    { acorns, scrap: visit.forge.shelf.scrap, shards: visit.forge.shelf.shards },
    rate,
  );
  const row = rows.find((r) => r.id === rowId);

  const close = (): void => {
    setView(null);
    setRowId(null);
  };
  const back = (): void => {
    if (view === 'give' && rowId !== null) setRowId(null);
    else close();
  };

  const give = async (r: GiveRow): Promise<void> => {
    if (await actions.give(place, r, units)) close();
  };

  // --- The pieces of the card ---
  const needs = stillNeeded(p);
  const mine = yourPart(p);
  const percent = percentFilled(p);
  const card = (
    <>
      {host === 'page' && (
        <>
          <div class="sp-seat-head">
            <h3 class="pix">{name}</h3>
            <Tag kind="badge" {...(p.state === 'open' ? { tone: 'good' as const } : {})}>
              {stateTag(p)}
            </Tag>
          </div>
          <p class="cm-level">{levelLine(p)}</p>
        </>
      )}
      {p.state === 'open' && p.project !== null ? (
        <div class="cm-project">
          <div class="sp-line cm-bar">
            <Bar
              value={p.project.progress}
              max={p.project.size}
              label={`${name} project`}
              class="sp-bar"
            />
            <span class="sp-pack-text">{percent}%</span>
          </div>
          {needs !== '' && <p class="cm-need">Still needed: {needs}</p>}
        </div>
      ) : (
        <p class="cm-need">{stateLine(p)}</p>
      )}
      {mine !== '' && <p class="cm-mine">{mine}</p>}
      {p.state === 'open' && (
        <ActionButton
          label="Give"
          detail={p.project?.cosmetic === true ? 'a decoration' : 'to the next level'}
          wide
          disabled={busy}
          onClick={() => {
            setView('give');
          }}
        />
      )}
      <div class="cm-helper">
        <SlotRow
          label={`${name}: your helper`}
          slots={[
            helper === undefined ? (
              <Slot
                kind="talent"
                state="empty"
                name="Post a helper"
                label={`${name}: nobody helps. Choose a creature`}
                buttonRef={(el) => {
                  openers.current['seat'] = el;
                }}
                expanded={view === 'seat'}
                disabled={busy}
                onClick={() => {
                  setView('seat');
                }}
              />
            ) : (
              <Slot
                kind="talent"
                state="filled"
                label={`${name}: ${creatureName(helper)}, level ${String(helper.level)}, helping. Change`}
                buttonRef={(el) => {
                  openers.current['seat'] = el;
                }}
                expanded={view === 'seat'}
                disabled={busy}
                onClick={() => {
                  setView('seat');
                }}
              >
                <SlotText
                  name={creatureName(helper)}
                  sub={`Lv ${String(helper.level)} · Helping`}
                />
              </Slot>
            ),
          ]}
        />
        <p class="cm-need">A creature here helps build, a little each day.</p>
      </div>
      {board !== undefined && (
        <button
          type="button"
          class="sp-line sp-pack cm-row"
          aria-haspopup="dialog"
          aria-label={`${boardName(place)}, ${String(socketsSet(board))} / ${String(board.sockets.length)} finds set. Show the collection`}
          ref={(el) => {
            openers.current['collection'] = el;
          }}
          onClick={() => {
            setView('collection');
          }}
        >
          <Bar
            value={socketsSet(board)}
            max={Math.max(1, board.sockets.length)}
            label="Collection"
            class="sp-bar"
          />
          <span class="sp-pack-text">
            {boardName(place)} {socketsSet(board)} / {board.sockets.length}
          </span>
        </button>
      )}
      {p.plaque.length > 0 && (
        <button
          type="button"
          class="sp-line sp-pack cm-row"
          aria-haspopup="dialog"
          aria-label={`The plaque of level ${String(p.level)}. Show who built it`}
          ref={(el) => {
            openers.current['plaque'] = el;
          }}
          onClick={() => {
            setView('plaque');
          }}
        >
          <span class="sp-pack-text">Plaque of level {p.level}</span>
          <span class="cm-row-note muted">{p.plaque.length} names</span>
        </button>
      )}
    </>
  );

  // --- The views a tap opens ---
  const giveList = (
    <div class="dr-stack pix-panel">
      <ChoiceList label="What to give">
        {rows.map((r) => (
          <ChoiceButton
            key={r.id}
            label={r.name}
            line={r.reason ?? `You have ${String(r.held)}`}
            disabled={busy || r.reason !== null}
            onClick={() => {
              setRowId(r.id);
              setUnits(r.max);
            }}
          />
        ))}
      </ChoiceList>
    </div>
  );
  const giveAmount =
    row === undefined ? null : (
      <div class="dr-stack pix-panel cm-give">
        <div class="cm-amount">
          <CountStepper
            label={row.name}
            value={Math.min(units, Math.max(row.max, 1))}
            min={1}
            max={Math.max(row.max, 1)}
            disabled={busy || row.max < 1}
            onChange={setUnits}
          />
          <button
            type="button"
            class="cm-all"
            disabled={busy || row.max < 1}
            onClick={() => {
              setUnits(row.max);
            }}
          >
            All
          </button>
        </div>
        <SpendConfirm
          text={`Gifts count in full, whoever gives. The project still takes ${String(row.max)} of this.`}
          label="Give"
          price={giftPrice(row, Math.min(units, Math.max(row.max, 1)))}
          reason={row.reason}
          busy={busy}
          onConfirm={() => {
            void give(row);
          }}
        />
      </div>
    );
  const plaque = (
    <div class="dr-stack pix-panel">
      <p class="sp-note">{plaqueTitle(p)}</p>
      {p.plaque.length === 0 ? (
        <p class="muted">Nobody yet.</p>
      ) : (
        <ul class="cm-names" aria-label="Names on the plaque">
          {p.plaque.map((n, i) => (
            <li key={`${String(i)}-${n}`}>{n}</li>
          ))}
        </ul>
      )}
      {p.keepsakes > 0 && (
        <p class="muted sp-note">
          You helped build it. A keepsake of it waits on your shelf in the House.
        </p>
      )}
    </div>
  );
  const collection =
    board === undefined ? null : (
      <div class="dr-stack pix-panel">
        <p class="sp-note">
          {socketsSet(board)} / {board.sockets.length} set
          {board.done ? '. The collection is complete.' : '. A find sets itself when it turns up.'}
        </p>
        <ul class="cm-sockets" aria-label="Sockets">
          {board.sockets.map((s, i) => {
            const words = socketWords(s.source);
            return (
              <li key={`${String(i)}-${s.source}`} class={`cm-socket${s.set ? ' set' : ''}`}>
                <strong class="pix">{words.name}</strong>
                <span class="cm-socket-line">{s.set ? socketFinder(s.finder) : words.where}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  const seatList = (
    <CreatureList
      options={seatOptions(creatures, visit, seat?.seatId ?? null, poster)}
      selection={{
        mode: 'pick',
        onPick: (id) => {
          close();
          void actions.post(place, id === REMOVE_ID ? null : id);
        },
      }}
      placedNote="Posted · swaps here"
      showEffects={false}
      reasonSide
      class="flat"
    />
  );

  const titleOf = (v: CommonsView): string =>
    v === 'give'
      ? row === undefined
        ? 'Give to the project'
        : row.name
      : v === 'plaque'
        ? `Plaque, level ${String(p.level)}`
        : v === 'collection'
          ? boardName(place)
          : 'Who helps build?';
  const bodyOf = (v: CommonsView): ComponentChildren =>
    v === 'give'
      ? row === undefined
        ? giveList
        : giveAmount
      : v === 'plaque'
        ? plaque
        : v === 'collection'
          ? collection
          : seatList;

  if (host === 'sheet') {
    return (
      <Drawer
        open={open}
        onClose={() => {
          close();
          onClose?.();
        }}
        title={name}
        meta={levelLine(p)}
      >
        {view === null ? (
          <div class="dr-stack cm-board cm-sheet" ref={sheetRef} tabIndex={-1}>
            {card}
          </div>
        ) : (
          <div class="dr-stack" onKeyDown={onDrillKey(back)}>
            <DrillHead
              title={titleOf(view)}
              backLabel={view === 'give' && rowId !== null ? 'to the list' : `to the ${name}`}
              focus
              onBack={back}
            />
            {bodyOf(view)}
          </div>
        )}
      </Drawer>
    );
  }

  return (
    <section
      class={`sp-seat cm-board${over ? ' over' : ''}`}
      aria-label={`${name} project`}
      {...(dropId === undefined ? {} : { 'data-seat': dropId })}
    >
      {card}
      {view === 'seat' && (
        <RosterPicker
          title="Who helps build?"
          status="A creature at another post swaps places with this one."
          options={seatOptions(creatures, visit, seat?.seatId ?? null, poster)}
          placedNote="Posted · swaps here"
          showEffects={false}
          reasonSide
          anchor={() => openers.current['seat'] ?? null}
          onClose={close}
          onPick={(id) => {
            close();
            void actions.post(place, id === REMOVE_ID ? null : id);
          }}
        />
      )}
      {view !== null && view !== 'seat' && (
        <Drawer
          open
          onClose={close}
          title={view === 'give' ? 'Give to the project' : titleOf(view)}
          meta={name}
          returnFocusTo={openers.current[view === 'give' ? 'give' : view] ?? null}
        >
          {view === 'give' && rowId !== null ? (
            <div class="dr-stack" onKeyDown={onDrillKey(back)}>
              <DrillHead title={row?.name ?? ''} backLabel="to the list" focus onBack={back} />
              {giveAmount}
            </div>
          ) : (
            bodyOf(view)
          )}
        </Drawer>
      )}
    </section>
  );
}
