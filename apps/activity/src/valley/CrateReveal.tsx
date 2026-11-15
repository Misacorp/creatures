/**
 * The sealed crate's reveal (V-FORGE-5; Misa, 2026-11-15, option C: "a big moment"): the crate has opened and its pieces come out one at a
 * time, worst first and best last, each over the burst of its rarity with its sprite in the burst's clear centre, its name, its rarity
 * and, when a creature put it on, "Pip puts it on". A tap, Enter or Space goes on (a card also moves on by itself after a pause, except
 * the last, the best, which waits for the player); Skip, or Escape, shows the summary at once; the summary lists everything and says
 * when the bag was full and some stay sealed. Reduced motion: no rattling, bursts' rise or flight, just the cards.
 *
 * It is a modal part of the Forge's art scene (a child of `ForgeInside`, drawn over the scene in its own pixels; `crate-reveal` in
 * `art-variants.ts` picks how it plays). The server has already rolled and moved the pieces; this only shows them. The buttons are in an
 * art scene, so they show no focus ring (`art-focus.css`: the gold arrow instead).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CratePiece } from '../api';
import { cssVars } from '../css-vars';
import { ItemSprite, ItemThumb } from '../GearArt';
import { usePrefersReducedMotion } from '../hooks';
import { ActionButton } from '../ui/ActionButton';
import type { CrateLookVariant, RevealVariant } from './art-variants';
import { BURST, CRATE_OPEN, CRATE_SEALED, burstSprite, crateSprite } from './crate-art';
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
import type { Box } from './forge-interior';
import { Pic, isStill } from './parts';
import type { SceneGeometry } from './SceneFrame';

/** How long a card flies away (variants C and D) before the next one comes. */
export const FLY_MS = 380;

export interface CrateRevealProps {
  g: SceneGeometry;
  /** Where the sealed crate stands in the scene (scene pixels): the pieces rise from it in the in-scene variants. */
  crate: Box;
  best: 'rare' | 'epic' | null;
  night: boolean;
  answer: CrateOpened;
  variant: RevealVariant;
  look: CrateLookVariant;
  /** A creature's name from its id. */
  nameOf: (creatureId: string) => string | undefined;
  /** Where a piece flies to in C and D: the creature that wears it, else the bag (scene pixels). */
  flyTo: (piece: CratePiece) => { x: number; y: number };
  /** The summary was closed. */
  onDone: () => void;
}

/** One card: the burst of the piece's rarity with its sprite in the centre, and its words. A button: a tap goes on. */
function Card({
  piece,
  card,
  scale,
  index,
  total,
  last,
  flying,
  rise,
  onGo,
  buttonRef,
}: {
  piece: CratePiece;
  card: PieceCard;
  scale: number;
  index: number;
  total: number;
  last: boolean;
  flying: { dx: number; dy: number } | null;
  rise: { dx: number; dy: number };
  onGo: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const side = BURST.size * scale;
  const itemAt = (BURST.centre + (BURST.centreSize - 12) / 2) * scale;
  return (
    <button
      type="button"
      ref={(el) => {
        buttonRef(el);
        if (el !== null) {
          cssVars({
            '--rise-x': `${String(rise.dx)}px`,
            '--rise-y': `${String(rise.dy)}px`,
            '--fly-x': `${String(flying?.dx ?? 0)}px`,
            '--fly-y': `${String(flying?.dy ?? 0)}px`,
          })(el);
        }
      }}
      class={`cr-card rarity-${piece.item.rarity}${last ? ' cr-last' : ''}${flying === null ? '' : ' cr-flying'}`}
      data-first={index === 0 ? 'yes' : undefined}
      aria-label={`${card.spoken}. ${last ? 'Show everything' : 'Next piece'}`}
      onClick={onGo}
    >
      <span class="cr-count pix" aria-hidden="true">
        {index + 1} / {total}
      </span>
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
        {last ? 'Tap to see it all' : 'Tap to go on'}
      </span>
    </button>
  );
}

/** The end: everything the crate held. */
function Summary({
  answer,
  ordered,
  onDone,
  doneRef,
}: {
  answer: CrateOpened;
  ordered: readonly CratePiece[];
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
              <ItemThumb item={p.item} scale={3} spoken />
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

export function CrateReveal({
  g,
  crate,
  best,
  night,
  answer,
  variant,
  look,
  nameOf,
  flyTo,
  onDone,
}: CrateRevealProps) {
  const ordered = revealOrder(answer.pieces);
  const total = ordered.length;
  const [at, setAt] = useState(0);
  const [flying, setFlying] = useState<{ dx: number; dy: number } | null>(null);
  const reduced = usePrefersReducedMotion();
  const still = isStill();
  const fly = (variant === 'C' || variant === 'D') && !reduced;
  const full = variant === 'B' || variant === 'D';
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const doneRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summary = at >= total;

  const clear = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const go = (): void => {
    if (summary || flying !== null) return;
    clear();
    const piece = ordered[at];
    const burst = cardRef.current?.querySelector('[data-burst]');
    const scene = rootRef.current?.getBoundingClientRect();
    if (!fly || piece === undefined || burst === null || burst === undefined || !scene) {
      setAt((now) => advance(now, total));
      return;
    }
    const from = burst.getBoundingClientRect();
    const to = flyTo(piece);
    setFlying({
      dx: Math.round(scene.left + g.X(to.x) - (from.left + from.width / 2)),
      dy: Math.round(scene.top + g.Y(to.y) - (from.top + from.height / 2)),
    });
    timer.current = setTimeout(() => {
      setFlying(null);
      setAt((now) => advance(now, total));
    }, FLY_MS);
  };
  const skip = (): void => {
    clear();
    setFlying(null);
    setAt(skipTo(total));
  };

  // A card moves on by itself after a pause (not the last, which is the best, and not for a player who asked for less motion).
  useEffect(() => {
    if (summary || reduced || still || onLastPiece(at, total)) return undefined;
    const id = setTimeout(go, CARD_AUTO_MS);
    return () => {
      clearTimeout(id);
    };
  }, [at, summary, reduced, still, total]);

  // The focus goes to the card, then to the summary; the page behind is inert for the keyboard while this is open.
  useLayoutEffect(() => {
    (summary ? doneRef.current : cardRef.current)?.focus();
  }, [summary, at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (summary) onDone();
      else skip();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [summary, total, onDone]);

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // Skip, or close the summary; the document's own listener below is for a focus that was lost.
      e.preventDefault();
      e.stopPropagation();
      if (summary) onDone();
      else skip();
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

  // The open crate: where it stood (in the scene) or big at the bottom (full screen).
  const open = crateSprite('open', { best, night, look });
  const cardScale = full ? g.s + 1 : g.s;
  const crateScale = full ? g.s * 2 : g.s;
  const stageW = g.X(g.W);
  // In the scene a card rises from the crate to the middle; full screen it rises from the crate at the bottom.
  const cardTop = g.Y(Math.max(g.top + 6, 18));
  const rise = full
    ? { dx: 0, dy: Math.round(g.Y(g.H) * 0.3) }
    : {
        dx: Math.round(g.X(crate.x + crate.w / 2) - stageW / 2),
        dy: Math.round(g.Y(crate.y) - cardTop - BURST.size * cardScale * 0.4),
      };
  const piece = ordered[at];
  const card = piece === undefined ? undefined : pieceCard(piece, (id) => nameOf(id));

  return (
    <div
      class={`cr-reveal cr-v-${variant}${full ? ' cr-full' : ''}`}
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
      {full ? (
        <div class="cr-crate cr-crate-big" aria-hidden="true">
          <Pic sprite={open} scale={crateScale} class={`cr-open cr-glow-${best ?? 'rare'}`} />
        </div>
      ) : (
        <div
          class="cr-crate"
          aria-hidden="true"
          ref={cssVars({
            '--cx': `${String(g.X(crate.x))}px`,
            '--cy': `${String(g.Y(crate.y + CRATE_SEALED.base + 1 - CRATE_OPEN.h))}px`,
          })}
        >
          <Pic sprite={open} scale={crateScale} class={`cr-open cr-glow-${best ?? 'rare'}`} />
        </div>
      )}
      {!summary && (
        <button type="button" class="cr-skip pix" onClick={skip}>
          Skip
        </button>
      )}
      <div class="cr-stage" ref={cssVars({ '--card-top': `${String(cardTop)}px` })}>
        {piece !== undefined && card !== undefined && (
          <Card
            key={piece.item.id}
            piece={piece}
            card={card}
            scale={cardScale}
            index={at}
            total={total}
            last={onLastPiece(at, total)}
            flying={flying}
            rise={rise}
            onGo={go}
            buttonRef={(el) => {
              cardRef.current = el;
            }}
          />
        )}
        {summary && (
          <Summary
            answer={answer}
            ordered={ordered}
            onDone={onDone}
            doneRef={(el) => {
              doneRef.current = el;
            }}
          />
        )}
      </div>
    </div>
  );
}
