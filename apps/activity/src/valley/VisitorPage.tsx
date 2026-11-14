/**
 * The visitor's page while he is here (phase 5 step 8b, `systems/visitor.md` V-VIS-2 to 5), under his stall's scene the way the Market's page
 * sits under its scene. Two cards of the seat family (`.sp-seat`): the reroll service and the week's blueprint. While he is away his place
 * is the scene and one line (`ValleyFrame`), never this page.
 *
 * The reroll opens one drawer of the Workshop's own parts: the bag's item grid (`ItemTile` in `.item-grid`, worn pieces first, the pieces
 * you may hand over) over the chosen piece's card (`ItemCard`), the odds in words, then one confirm (the price as icons and the button).
 * What comes back is the card before and the card after with the changes marked (`diffItems`, as the item picker's compare does), the old
 * lines said plainly to be gone, and the next price. The blueprint is the shared `FindBlueprint` with its price and a Buy. The words are
 * `visitor-view.ts`; every spend is keyed by the game and decided by the server.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { VisitorPriceView } from '@creatures/game';
import type { VisitorState } from '../api';
import { diffItems } from '../creature-page/compare-diff';
import type { GearItem } from '../gear-types';
import { itemLabel } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { ItemTile } from '../ItemTile';
import { ActionButton } from '../ui/ActionButton';
import { Alert } from '../ui/Alert';
import { PriceLine, ShortOfLine } from '../ui/CountBadge';
import { Drawer } from '../ui/Drawer';
import { FindBlueprint } from '../ui/FindBlueprint';
import { FindList } from '../ui/FindRow';
import {
  GONE_LINE,
  blueprintCost,
  blueprintNote,
  blueprintShort,
  oddsLines,
  pieces,
  rerollCost,
  rerollPrice,
  rerollShort,
  type Purse,
  type VisitorHere,
} from './visitor-view';

/** What a reroll gave back: the piece as it was and as it is, what it cost and what the next one costs. */
export interface RerollDone {
  before: GearItem;
  after: GearItem;
  paid: VisitorPriceView;
  next: VisitorPriceView;
}

/** What a blueprint purchase gave: a copy of a known one adds a mark (`marks`), past the most it became scrap. */
export interface BlueprintDone {
  baseId: string;
  duplicate: boolean;
  marks?: number | undefined;
}

/** What the page asks the game to do; each resolves with what the server answered, or `undefined` when it refused. */
export interface VisitorActions {
  /** The price and odds of one piece (a free read). */
  look: (itemId: string) => Promise<VisitorHere | undefined>;
  /** Rerolls one piece (a keyed spend). */
  reroll: (itemId: string) => Promise<RerollDone | undefined>;
  /** Buys the week's blueprint (a keyed spend). */
  buy: () => Promise<BlueprintDone | undefined>;
}

/** What the page can open at the start (the workbench shows each). */
export interface VisitorStart {
  /** The reroll drawer starts open, on this piece when given. */
  reroll?: boolean | string;
}

/** What the valley shell needs of the visitor: what the server said of him (null until it has), and what his page reads and asks. */
export interface VisitorFeed {
  /** `GET /api/valley/visitor`: away, or here; null until the first answer (his place then reads "not open yet"). */
  view: VisitorState | null;
  actions: VisitorActions;
  items: readonly GearItem[] | null;
  blueprints: readonly { baseId: string; marks: number }[] | null;
  purse: Purse;
  start?: VisitorStart;
}

export function VisitorPage({
  view,
  items,
  blueprints,
  purse,
  busy,
  error = null,
  actions,
  start = {},
}: {
  view: VisitorHere;
  /** The bag, worn pieces included; null while the gear view loads. */
  items: readonly GearItem[] | null;
  /** The blueprints the player knows, with their marks (null while the gear view loads). */
  blueprints: readonly { baseId: string; marks: number }[] | null;
  /** What the player holds: Acorns, scrap and shards of every element together. */
  purse: Purse;
  busy: boolean;
  /** The server's last error, shown inside a drawer (the notice line is behind it). */
  error?: string | null;
  actions: VisitorActions;
  start?: VisitorStart;
}) {
  const [rerolling, setRerolling] = useState(start.reroll !== undefined && start.reroll !== false);
  const [bought, setBought] = useState<BlueprintDone | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mine = blueprints?.find((b) => b.baseId === view.blueprint.baseId);
  const known = mine !== undefined;
  // Bought this week: by the server's word, or by this very press (the answer lands before the next read).
  const done = view.blueprint.bought || bought !== null;
  const short = blueprintShort(view.blueprint, purse);
  return (
    <section class="sp-page vs-page" aria-label="Visitor">
      <ul class="sp-seats" aria-label="His stall">
        <li class="sp-seat">
          <div class="sp-seat-head">
            <h3 class="pix">Reroll a piece</h3>
          </div>
          <p class="sp-line">
            Hand over a piece of your gear, worn or in the bag, and all its modifier lines are drawn
            again. Its rarity and item level stay.
          </p>
          <button
            type="button"
            class="sp-buy vs-reroll"
            aria-haspopup="dialog"
            disabled={busy}
            ref={(el) => {
              opener.current = el;
            }}
            onClick={() => {
              setRerolling(true);
            }}
          >
            <span class="pix sp-buy-name">Choose a piece</span>
          </button>
        </li>
        <li class="sp-seat">
          <div class="sp-seat-head">
            <h3 class="pix">This week&rsquo;s blueprint</h3>
          </div>
          <FindList label="This week's blueprint">
            <FindBlueprint
              baseId={bought?.baseId ?? view.blueprint.baseId}
              duplicate={bought === null ? known : bought.duplicate}
              marks={bought === null ? mine?.marks : bought.marks}
            />
          </FindList>
          {!done && <p class="sp-line muted">{blueprintNote(known)}</p>}
          {done ? (
            <p class="sp-line vs-bought" role="status">
              Bought this week.
            </p>
          ) : (
            <>
              {short !== null && (
                <p class="sp-line muted vs-short">
                  <ShortOfLine short={short} />
                </p>
              )}
              <ActionButton
                label="Buy"
                cost={blueprintCost(view.blueprint)}
                wide
                large
                disabled={busy || short !== null}
                onClick={() => {
                  void actions.buy().then((result) => {
                    if (result !== undefined) setBought(result);
                  });
                }}
              />
            </>
          )}
        </li>
      </ul>
      {rerolling && (
        <RerollDrawer
          items={items}
          purse={purse}
          busy={busy}
          error={error}
          actions={actions}
          {...(typeof start.reroll === 'string' ? { initial: start.reroll } : {})}
          returnFocusTo={opener.current}
          onClose={() => {
            setRerolling(false);
          }}
        />
      )}
    </section>
  );
}

/** The reroll's drawer: pick a piece, see its card, its price and the odds, confirm once; then the card before and after. */
function RerollDrawer({
  items,
  purse,
  busy,
  error,
  actions,
  initial,
  returnFocusTo,
  onClose,
}: {
  items: readonly GearItem[] | null;
  purse: Purse;
  busy: boolean;
  error: string | null;
  actions: VisitorActions;
  initial?: string;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(initial ?? null);
  // The price and odds of the picked piece, from the server (a free read); null until they arrive.
  const [looked, setLooked] = useState<{ id: string; view: VisitorHere } | null>(null);
  const [result, setResult] = useState<RerollDone | null>(null);
  useEffect(() => {
    if (picked === null || result !== null) return;
    let current = true;
    setLooked(null);
    void actions.look(picked).then((answer) => {
      if (current && answer !== undefined) setLooked({ id: picked, view: answer });
    });
    return () => {
      current = false;
    };
    // `actions` is the game's closure and changes every render; the read follows the piece only.
  }, [picked, result]);
  const ordered = items === null ? [] : pieces(items);
  const piece = ordered.find((p) => p.id === picked);
  const asked = looked !== null && looked.id === picked ? looked.view.item : undefined;
  // What the next confirm costs: the answer of the piece just rerolled, else the server's read of the picked one.
  const price: VisitorPriceView | null =
    result !== null ? result.next : asked === undefined ? null : asked.price;
  const short = price === null ? null : rerollShort(price, purse);
  const confirm = (): void => {
    if (piece === undefined || busy) return;
    void actions.reroll(piece.id).then((done) => {
      if (done !== undefined) setResult(done);
    });
  };
  return (
    <Drawer
      open
      onClose={onClose}
      title="Reroll a piece"
      meta={items === null || items.length === 0 ? undefined : `${String(items.length)} pieces`}
      returnFocusTo={returnFocusTo}
      class="vs-drawer"
      footer={
        <div class="vs-foot">
          {result !== null && price !== null && (
            <p class="vs-priceline">
              <span class="muted">Next reroll</span> <PriceLine price={rerollPrice(price)} />
            </p>
          )}
          {short !== null ? (
            <p class="muted vs-short">
              <ShortOfLine short={short} />
            </p>
          ) : (
            error !== null && <Alert level="alert">{error}</Alert>
          )}
          {result === null ? (
            <ActionButton
              label={piece === undefined ? 'Choose a piece' : 'Reroll'}
              {...(price === null ? {} : { cost: rerollCost(price) })}
              wide
              large
              disabled={busy || piece === undefined || price === null || short !== null}
              onClick={confirm}
            />
          ) : (
            <ActionButton
              label="Reroll again"
              wide
              large
              disabled={busy || short !== null}
              onClick={() => {
                setResult(null);
              }}
            />
          )}
        </div>
      }
    >
      {result === null ? (
        <div class="dr-stack vs-body">
          {items === null ? (
            <p class="muted">Loading...</p>
          ) : ordered.length === 0 ? (
            <p class="muted">You have no pieces to hand over.</p>
          ) : (
            <ul class="item-grid" aria-label="Your pieces">
              {ordered.map((p) => (
                <ItemTile
                  key={p.id}
                  item={p}
                  label={`${itemLabel(p)}${p.equippedOn === null ? '' : ', worn'}`}
                  selected={p.id === picked}
                  flag={p.equippedOn === null ? null : 'Worn'}
                  onSelect={() => {
                    setPicked(p.id);
                  }}
                />
              ))}
            </ul>
          )}
          {piece !== undefined && (
            <>
              <ItemCard item={piece} plainRarity />
              {asked === undefined ? (
                <p class="muted">Looking at the odds...</p>
              ) : (
                <ul class="vs-odds" aria-label="The odds">
                  {oddsLines(asked.odds).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p class="vs-gone">{GONE_LINE}</p>
            </>
          )}
        </div>
      ) : (
        <div class="dr-stack vs-body">
          <p class="vs-quiet" role="status">
            Rerolled. The old lines are gone.
          </p>
          <p class="vs-quiet">Before</p>
          <ItemCard item={result.before} plainRarity />
          <p class="vs-quiet">After</p>
          <ItemCard item={result.after} plainRarity diff={diffItems(result.after, result.before)} />
        </div>
      )}
    </Drawer>
  );
}
