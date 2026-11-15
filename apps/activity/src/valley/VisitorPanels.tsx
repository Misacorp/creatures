/**
 * What a click in the visitor's canvas opens (`VisitorCanvas.tsx` holds the state; the side rule is `PlaceCanvas`'s). Each is a `PanelBody`
 * in a one-step or small `ui/Wizard` whose first step has no Back (the X is the way out); every spend is keyed by the game and decided by
 * the server, the words are `visitor-view.ts`.
 *
 * - `RerollPanel` (right drawer, a page on a phone): the visitor. Pick a piece (the bag's item grid, `ItemTile` in `.item-grid`, worn pieces
 *   first) -> the piece's card, the odds in words and the one confirm (the price as icons on the button) -> the card before and the card
 *   after with the changes marked (`diffItems`, as the item picker's compare does), the old lines said plainly to be gone, and the next
 *   price. The card is a step of this panel, or (on a wide window) in the other drawer, the left one
 *   (`onCard`).
 * - `BlueprintPanel` (right drawer): the week's blueprint on the counter, the shared `FindBlueprint` with its price and a Buy (once a week).
 * - `SignPanel` (right drawer): the shuttered stall's sign, which says he is back Thursday (no timer).
 */
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { VisitorPriceView } from '@creatures/game';
import type { VisitorState } from '../api';
import { diffItems } from '../creature-page/compare-diff';
import type { GearItem } from '../gear-types';
import { gearName, itemLabel } from '../gear-view';
import { ItemCard } from '../ItemCard';
import { ItemTile } from '../ItemTile';
import { ActionButton } from '../ui/ActionButton';
import { Alert } from '../ui/Alert';
import { PriceLine, ShortOfLine } from '../ui/CountBadge';
import { FindBlueprint } from '../ui/FindBlueprint';
import { FindList } from '../ui/FindRow';
import { useWizard } from '../ui/use-wizard';
import { WizardView } from '../ui/Wizard';
import { PanelBody } from './PlaceCanvas';
import {
  AWAY_LINE,
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

/** What the stall asks the game to do; each resolves with what the server answered, or `undefined` when it refused. */
export interface VisitorActions {
  /** The price and odds of one piece (a free read). */
  look: (itemId: string) => Promise<VisitorHere | undefined>;
  /** Rerolls one piece (a keyed spend). */
  reroll: (itemId: string) => Promise<RerollDone | undefined>;
  /** Buys the week's blueprint (a keyed spend). */
  buy: () => Promise<BlueprintDone | undefined>;
}

/** What can be open at the start (the workbench shows each). */
export interface VisitorStart {
  /** The reroll drawer starts open, on this piece when given. */
  reroll?: boolean | string;
  /** The blueprint's drawer starts open. */
  blueprint?: boolean;
}

/** What the valley shell needs of the visitor: what the server said of him (null until it has), and what his stall reads and asks. */
export interface VisitorFeed {
  /** `GET /api/valley/visitor`: away, or here; null until the first answer (his place then reads "not open yet"). */
  view: VisitorState | null;
  actions: VisitorActions;
  items: readonly GearItem[] | null;
  blueprints: readonly { baseId: string; marks: number }[] | null;
  purse: Purse;
  start?: VisitorStart;
}

/** The item card shown beside the reroll (the left drawer on a wide window): its heading and the card itself. */
export interface PieceCard {
  title: string;
  node: ComponentChildren;
}

type RerollStep = 'pick' | 'confirm' | 'done';

/** The reroll: pick a piece, see its odds and confirm once; then the card before and after. */
export function RerollPanel({
  items,
  purse,
  busy,
  error,
  actions,
  initial,
  beside,
  onCard,
  onClose,
}: {
  items: readonly GearItem[] | null;
  purse: Purse;
  busy: boolean;
  error: string | null;
  actions: VisitorActions;
  /** The piece the flow starts on (the workbench shows it). */
  initial?: string | undefined;
  /** The item card opens in the other drawer (a wide window) instead of in this step. */
  beside: boolean;
  /** Tells the canvas which card the left drawer shows (null: none). Called as the step and the piece change. */
  onCard: (card: PieceCard | null) => void;
  onClose: () => void;
}) {
  const ordered = items === null ? [] : pieces(items);
  const [picked, setPicked] = useState<string | null>(initial ?? null);
  const wizard = useWizard<RerollStep>(
    [
      { id: 'pick', title: 'Choose a piece', backLabel: 'to the stall' },
      { id: 'confirm', title: 'Reroll this piece', backLabel: 'to your pieces', back: 'pick' },
      { id: 'done', title: 'Rerolled', backLabel: 'to your pieces', back: 'pick' },
    ],
    {
      onExit: onClose,
      ...(initial !== undefined && ordered.some((p) => p.id === initial)
        ? { initial: 'confirm' as const }
        : {}),
    },
  );
  // The price and odds of the picked piece, from the server (a free read); null until they arrive.
  const [looked, setLooked] = useState<{ id: string; view: VisitorHere } | null>(null);
  const [result, setResult] = useState<RerollDone | null>(null);
  const step = wizard.step;
  useEffect(() => {
    if (picked === null || step !== 'confirm') return;
    let current = true;
    setLooked(null);
    void actions.look(picked).then((answer) => {
      if (current && answer !== undefined) setLooked({ id: picked, view: answer });
    });
    return () => {
      current = false;
    };
    // `actions` is the game's closure and changes every render; the read follows the piece and the step only.
  }, [picked, step]);
  const piece = ordered.find((p) => p.id === picked);
  const asked = looked !== null && looked.id === picked ? looked.view.item : undefined;
  // What the next confirm costs: the answer of the piece just rerolled, else the server's read of the picked one.
  const price: VisitorPriceView | null =
    step === 'done' && result !== null ? result.next : asked === undefined ? null : asked.price;
  const short = price === null ? null : rerollShort(price, purse);

  // The card, in the other drawer when asked: only while its step is on screen, and gone with the panel.
  const cardOn = beside && step === 'confirm' && piece !== undefined;
  useEffect(() => {
    if (!cardOn) return undefined;
    onCard({ title: gearName(piece.baseId), node: <ItemCard item={piece} plainRarity /> });
    return () => {
      onCard(null);
    };
  }, [cardOn, piece]);

  const confirm = (): void => {
    if (piece === undefined || busy) return;
    void actions.reroll(piece.id).then((done) => {
      if (done !== undefined) {
        setResult(done);
        wizard.goTo('done');
      }
    });
  };
  const reason =
    short !== null ? (
      <p class="muted vs-short">
        <ShortOfLine short={short} />
      </p>
    ) : (
      error !== null && <Alert level="alert">{error}</Alert>
    );
  let footer: ComponentChildren = null;
  if (step === 'confirm') {
    footer = (
      <div class="vs-foot">
        {reason}
        <ActionButton
          label="Reroll"
          {...(price === null ? {} : { cost: rerollCost(price) })}
          wide
          large
          disabled={busy || piece === undefined || price === null || short !== null}
          onClick={confirm}
        />
      </div>
    );
  } else if (step === 'done' && price !== null) {
    footer = (
      <div class="vs-foot">
        <p class="vs-priceline">
          <span class="muted">Next reroll</span> <PriceLine price={rerollPrice(price)} />
        </p>
        {reason}
        <ActionButton
          label="Reroll again"
          wide
          large
          disabled={busy || short !== null}
          onClick={() => {
            setResult(null);
            wizard.goTo('pick');
          }}
        />
      </div>
    );
  }
  return (
    <PanelBody footer={footer}>
      <WizardView wizard={wizard} disabled={busy}>
        {step === 'pick' && (
          <div class="dr-stack vs-body">
            <p class="prose">
              Hand over a piece of your gear, worn or in the bag, and all its modifier lines are
              drawn again. Its rarity and item level stay.
            </p>
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
                      wizard.goTo('confirm');
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
        {step === 'confirm' && piece !== undefined && (
          <div class="dr-stack vs-body">
            {!beside && <ItemCard item={piece} plainRarity />}
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
          </div>
        )}
        {step === 'done' && result !== null && (
          <div class="dr-stack vs-body">
            <p class="vs-quiet" role="status">
              Rerolled. The old lines are gone.
            </p>
            <p class="vs-quiet">Before</p>
            <ItemCard item={result.before} plainRarity />
            <p class="vs-quiet">After</p>
            <ItemCard
              item={result.after}
              plainRarity
              diff={diffItems(result.after, result.before)}
            />
          </div>
        )}
      </WizardView>
    </PanelBody>
  );
}

/** The week's blueprint: the shared card with its price, and one Buy (once a week). */
export function BlueprintPanel({
  view,
  blueprints,
  purse,
  bought,
  busy,
  error,
  actions,
  onBought,
  onClose,
}: {
  view: VisitorHere;
  blueprints: readonly { baseId: string; marks: number }[] | null;
  purse: Purse;
  /** What buying it gave this visit (the answer lands before the next read says it is bought). */
  bought: BlueprintDone | null;
  busy: boolean;
  error: string | null;
  actions: VisitorActions;
  onBought: (done: BlueprintDone) => void;
  onClose: () => void;
}) {
  const wizard = useWizard<'buy'>(
    [{ id: 'buy', title: "This week's blueprint", backLabel: 'to the stall' }],
    { onExit: onClose },
  );
  const mine = blueprints?.find((b) => b.baseId === view.blueprint.baseId);
  const known = mine !== undefined;
  const done = view.blueprint.bought || bought !== null;
  const short = blueprintShort(view.blueprint, purse);
  return (
    <PanelBody
      footer={
        done ? undefined : (
          <div class="vs-foot">
            {short !== null ? (
              <p class="muted vs-short">
                <ShortOfLine short={short} />
              </p>
            ) : (
              error !== null && <Alert level="alert">{error}</Alert>
            )}
            <ActionButton
              label="Buy"
              cost={blueprintCost(view.blueprint)}
              wide
              large
              disabled={busy || short !== null}
              onClick={() => {
                void actions.buy().then((result) => {
                  if (result !== undefined) onBought(result);
                });
              }}
            />
          </div>
        )
      }
    >
      <WizardView wizard={wizard}>
        <div class="dr-stack vs-body">
          <FindList label="This week's blueprint">
            <FindBlueprint
              baseId={bought?.baseId ?? view.blueprint.baseId}
              duplicate={bought === null ? known : bought.duplicate}
              marks={bought === null ? mine?.marks : bought.marks}
            />
          </FindList>
          {done ? (
            <p class="vs-bought" role="status">
              Bought this week.
            </p>
          ) : (
            <p class="muted">{blueprintNote(known)}</p>
          )}
        </div>
      </WizardView>
    </PanelBody>
  );
}

/** The shuttered stall's sign: he is back Thursday, said plainly and never as a timer. */
export function SignPanel({ onClose }: { onClose: () => void }) {
  const wizard = useWizard<'sign'>(
    [{ id: 'sign', title: 'The stall', backLabel: 'to the stall' }],
    {
      onExit: onClose,
    },
  );
  return (
    <PanelBody>
      <WizardView wizard={wizard}>
        <p class="prose" role="status">
          {AWAY_LINE}
        </p>
      </WizardView>
    </PanelBody>
  );
}
