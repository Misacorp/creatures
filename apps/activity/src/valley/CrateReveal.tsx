/**
 * The sealed crate's reveal (V-FORGE-5; Misa, 2026-11-15: option C "a big moment", the full-screen look): the crate has opened and its
 * pieces come out one at a time over a dark stage, worst first and best last, each over the burst of its rarity with its sprite in the
 * burst's clear centre, its name, its rarity and, when a creature put it on, "Pip puts it on". The piece itself is a button: hovering it
 * (a mouse) or tapping it shows its full item card (`ItemCard`, the bag's), beside it on a wide window and over the stage on a phone; a
 * second tap, a tap on the card, or Escape closes it (Misa, 2026-11-15: "can we show the item card when the user hovers or clicks on the
 * revealed item"). Going on is the "Next" button, a tap on the stage outside the piece, or Enter / Space with the focus on the dialog (a
 * card also moves on by itself after a pause, except the last, the best, which waits for the player, and never while a card is shown).
 * Skip, or Escape, shows the summary at once; the summary lists everything, each piece showing its card the same way, and says when the
 * bag was full and some stay sealed. Reduced motion: no rattling or rise, just the cards.
 *
 * It is a modal part of the Forge's art scene (a child of `ForgeInside`, drawn over the scene in its own pixels). The server has
 * already rolled and moved the pieces; this only shows them. The buttons are in an art scene, so they show no focus ring
 * (`art-focus.css`: the gold arrow instead).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CratePiece } from '../api';
import { cssVars } from '../css-vars';
import { gearName } from '../gear-view';
import { ItemSprite, ItemThumb } from '../GearArt';
import { usePrefersReducedMotion } from '../hooks';
import { ItemCard } from '../ItemCard';
import { ActionButton } from '../ui/ActionButton';
import { BURST, CRATE_OPEN, burstSprite, crateSprite } from './crate-art';
import {
  CARD_AUTO_MS,
  advance,
  countsLine,
  crateSummary,
  onLastPiece,
  pieceCard,
  revealOrder,
  skipTo,
  type CrateOpened,
  type PieceCard,
} from './crate-view';
import { Pic, isStill } from './parts';
import type { SceneGeometry } from './SceneFrame';

export interface CrateRevealProps {
  g: SceneGeometry;
  best: 'rare' | 'epic' | null;
  night: boolean;
  answer: CrateOpened;
  /** A creature's name from its id. */
  nameOf: (creatureId: string) => string | undefined;
  /** The summary was closed. */
  onDone: () => void;
}

/**
 * Which piece's item card shows: the one the mouse is over, or the one a tap pinned (a pinned card stays until a second tap, a tap on
 * the card, Escape, or going on). A finger's tap raises mouse-like pointer events too, so only a `mouse` pointer counts as a hover.
 */
function useShownCard() {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  return {
    shown: pinned ?? hover,
    pinned: pinned !== null,
    close: (): void => {
      setHover(null);
      setPinned(null);
    },
    /** The handlers of the thing that shows piece `id`'s card. */
    bind: (id: string) => ({
      onPointerEnter: (e: PointerEvent): void => {
        if (e.pointerType === 'mouse') setHover(id);
      },
      onPointerLeave: (e: PointerEvent): void => {
        if (e.pointerType === 'mouse') setHover((now) => (now === id ? null : now));
      },
      onClick: (): void => {
        if (pinned === id) {
          setPinned(null);
          setHover(null);
        } else {
          setPinned(id);
        }
      },
    }),
  };
}
type ShownCard = ReturnType<typeof useShownCard>;

/**
 * The item card of the shown piece, inside the reveal: beside what it belongs to on a wide window (`beside` is that thing's half width
 * as a CSS length), over the stage on a phone (`crate.css`). A tap on the card closes it.
 */
function CardPop({
  piece,
  beside,
  pinned,
  onClose,
}: {
  piece: CratePiece;
  beside: string;
  /** A tap pinned it: it takes taps (a hovered one lets them through, so the mouse that is over it keeps it). */
  pinned: boolean;
  onClose: () => void;
}) {
  return (
    <div class="cr-pop-layer" ref={cssVars({ '--beside': beside })}>
      <div
        class={`cr-pop${pinned ? ' cr-pinned' : ''}`}
        role="group"
        aria-label={`${gearName(piece.item.baseId)}, the item card`}
        onClick={onClose}
      >
        <ItemCard item={piece.item} plainRarity />
      </div>
    </div>
  );
}

/** One card: the burst of the piece's rarity with its sprite in the centre, and its words. The piece is a button: it shows its card. */
function Card({
  piece,
  card,
  scale,
  index,
  total,
  last,
  rise,
  shown,
  onGo,
  pieceRef,
}: {
  piece: CratePiece;
  card: PieceCard;
  scale: number;
  index: number;
  total: number;
  last: boolean;
  rise: { dx: number; dy: number };
  shown: ShownCard;
  onGo: () => void;
  pieceRef: (el: HTMLButtonElement | null) => void;
}) {
  const side = BURST.size * scale;
  const itemAt = (BURST.centre + (BURST.centreSize - 12) / 2) * scale;
  return (
    <div
      class={`cr-card rarity-${piece.item.rarity}${last ? ' cr-last' : ''}`}
      data-first={index === 0 ? 'yes' : undefined}
      ref={cssVars({ '--rise-x': `${String(rise.dx)}px`, '--rise-y': `${String(rise.dy)}px` })}
    >
      <span class="cr-count pix" aria-hidden="true">
        {index + 1} / {total}
      </span>
      <button
        type="button"
        class="cr-piece cr-keep"
        ref={pieceRef}
        aria-label={`${card.spoken}. Show the item card`}
        aria-expanded={shown.shown === piece.item.id}
        {...shown.bind(piece.item.id)}
      >
        <span
          class="cr-burst"
          data-burst
          ref={cssVars({ '--bw': `${String(side)}px`, '--item': `${String(itemAt)}px` })}
        >
          <Pic sprite={burstSprite(piece.item.rarity)} scale={scale} class="cr-ring" />
          <span class="cr-item">
            <ItemSprite baseId={piece.item.baseId} scale={scale} />
          </span>
        </span>
      </button>
      <span class="cr-name pix" aria-hidden="true">
        {card.name}
      </span>
      <span class="cr-meta pix" aria-hidden="true">
        <span class="cr-rarity">{card.rarityLabel}</span> {card.slot}, Lv {card.level}
      </span>
      {card.wearLine !== null && (
        <span class="cr-line pix" aria-hidden="true">
          {card.wearLine}
        </span>
      )}
      <span class="cr-hint pix" aria-hidden="true">
        Tap the piece for its card
      </span>
      <span class="cr-next cr-keep">
        <ActionButton label={last ? 'Show everything' : 'Next'} onClick={onGo} />
      </span>
    </div>
  );
}

/** The end: everything the crate held, each piece showing its card on hover or tap. */
function Summary({
  answer,
  ordered,
  shown,
  onDone,
  doneRef,
}: {
  answer: CrateOpened;
  ordered: readonly CratePiece[];
  shown: ShownCard;
  onDone: () => void;
  doneRef: (el: HTMLElement | null) => void;
}) {
  const sum = crateSummary(answer);
  return (
    <div class="cr-summary pix-panel" ref={doneRef} tabIndex={-1}>
      <h2 class="cr-title pix">
        {sum.total === 1 ? 'The crate held 1 piece' : `The crate held ${String(sum.total)} pieces`}
      </h2>
      {sum.total > 0 && (
        <ul class="cr-thumbs" aria-label="Everything in the crate, best first">
          {[...ordered].reverse().map((p) => (
            <li key={p.item.id}>
              <button
                type="button"
                class="cr-thumb"
                aria-expanded={shown.shown === p.item.id}
                {...shown.bind(p.item.id)}
              >
                <ItemThumb item={p.item} scale={3} spoken />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p class="cr-sum pix">
        {countsLine(sum.counts)}
        {sum.worn > 0 && (
          <>
            <br />
            {sum.worn === 1 ? '1 was put on at once' : `${String(sum.worn)} were put on at once`}
          </>
        )}
        {sum.total > sum.worn && (
          <>
            <br />
            {sum.total - sum.worn === 1
              ? '1 went to the bag'
              : `${String(sum.total - sum.worn)} went to the bag`}
          </>
        )}
      </p>
      {sum.sealedLine !== null && <p class="cr-sealed pix">{sum.sealedLine}</p>}
      <ActionButton label="Done" onClick={onDone} wide />
    </div>
  );
}

export function CrateReveal({ g, best, night, answer, nameOf, onDone }: CrateRevealProps) {
  const ordered = revealOrder(answer.pieces);
  const total = ordered.length;
  const [at, setAt] = useState(0);
  const reduced = usePrefersReducedMotion();
  const still = isStill();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pieceRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef<HTMLElement | null>(null);
  const summary = at >= total;
  const shown = useShownCard();

  const go = (): void => {
    if (summary) return;
    shown.close();
    setAt((now) => advance(now, total));
  };
  const skip = (): void => {
    shown.close();
    setAt(skipTo(total));
  };
  /** Escape: a shown card closes first; then Skip, or the summary's close. */
  const escape = (): void => {
    if (shown.pinned) shown.close();
    else if (summary) onDone();
    else skip();
  };
  const latestEscape = useRef(escape);
  latestEscape.current = escape;

  // A card moves on by itself after a pause (not the last, which is the best, not for a player who asked for less motion, and not
  // while a card of its item is shown: the player is reading it).
  useEffect(() => {
    if (summary || reduced || still || onLastPiece(at, total) || shown.shown !== null) {
      return undefined;
    }
    const id = setTimeout(go, CARD_AUTO_MS);
    return () => {
      clearTimeout(id);
    };
  }, [at, summary, reduced, still, total, shown.shown]);

  // The focus goes to the piece, then to the summary; the page behind is inert for the keyboard while this is open.
  useLayoutEffect(() => {
    (summary ? doneRef.current : pieceRef.current)?.focus();
  }, [summary, at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      latestEscape.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // The document's own listener is for a focus that was lost.
      e.preventDefault();
      e.stopPropagation();
      escape();
    } else if (e.key === 'Tab') {
      const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (first === undefined || lastItem === undefined) return;
      const here = document.activeElement;
      if (e.shiftKey && (here === first || here === rootRef.current)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && here === lastItem) {
        e.preventDefault();
        first.focus();
      }
    } else if (
      ((e.key === 'Enter' || e.key === ' ') && e.target === rootRef.current) ||
      e.target === doneRef.current
    ) {
      e.preventDefault();
      if (summary) onDone();
      else go();
    }
  };

  // A tap on the stage outside the piece, the card and the buttons goes on (those carry `cr-keep`).
  const onStageClick = (e: MouseEvent): void => {
    if (summary) return;
    const target = e.target as { closest?: (selector: string) => unknown } | null;
    if (target?.closest?.('.cr-keep') == null) go();
  };

  // The open crate big at the bottom of the dark stage; a piece rises from it.
  const open = crateSprite('open', { best, night });
  const cardScale = g.s + 1;
  const crateScale = g.s * 2;
  const rise = { dx: 0, dy: Math.round(g.Y(g.H) * 0.3) };
  const piece = ordered[at];
  const card = piece === undefined ? undefined : pieceCard(piece, (id) => nameOf(id));
  const burstSide = BURST.size * cardScale;
  const shownPiece = ordered.find((p) => p.item.id === shown.shown);

  return (
    <div
      class="cr-reveal"
      role="dialog"
      aria-modal="true"
      aria-label="The sealed crate is open"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      ref={(el) => {
        rootRef.current = el;
        cssVars({ '--crate-room': `${String(CRATE_OPEN.h * crateScale + 28)}px` })(el);
      }}
    >
      <div class="cr-dim" aria-hidden="true" />
      <div class="cr-crate" aria-hidden="true">
        <Pic sprite={open} scale={crateScale} class={`cr-open cr-glow-${best ?? 'rare'}`} />
      </div>
      {!summary && (
        <button type="button" class="cr-skip pix" onClick={skip}>
          Skip
        </button>
      )}
      <div class="cr-stage" onClick={onStageClick}>
        {piece !== undefined && card !== undefined && (
          <Card
            key={piece.item.id}
            piece={piece}
            card={card}
            scale={cardScale}
            index={at}
            total={total}
            last={onLastPiece(at, total)}
            rise={rise}
            shown={shown}
            onGo={go}
            pieceRef={(el) => {
              pieceRef.current = el;
            }}
          />
        )}
        {summary && (
          <Summary
            answer={answer}
            ordered={ordered}
            shown={shown}
            onDone={onDone}
            doneRef={(el) => {
              doneRef.current = el;
            }}
          />
        )}
      </div>
      {shownPiece !== undefined && (
        <CardPop
          piece={shownPiece}
          beside={summary ? '11rem' : `${String(burstSide / 2)}px`}
          pinned={shown.pinned}
          onClose={shown.close}
        />
      )}
    </div>
  );
}
