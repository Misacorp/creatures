import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { AfterAction } from './AfterAction';
import { glyphOrUnknown } from './glyphs';
import { usePrefersReducedMotion } from './hooks';
import { revealSummary } from './live';
import type { RaidReveal } from './raid-api';
import { finalFrame, revealFrames, type RevealFrame } from './reveal-anim';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';
import { FinaleGearLoot } from './FinaleGearLoot';

/** The frame to show now: it walks through the reveal's timeline, or sits at the end when motion is off. */
export function useRevealFrame(essence: number, reducedMotion: boolean): RevealFrame {
  const [frame, setFrame] = useState<RevealFrame>(() =>
    reducedMotion ? finalFrame(essence) : (revealFrames(essence)[0] as RevealFrame),
  );
  useEffect(() => {
    if (reducedMotion) {
      setFrame(finalFrame(essence));
      return undefined;
    }
    const timers = revealFrames(essence).map((next) =>
      setTimeout(() => {
        setFrame(next);
      }, next.at),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [essence, reducedMotion]);
  return frame;
}

/**
 * The orb that shakes and opens (the finale's loot reveal and a claimed job both use it). The frame
 * comes from `useRevealFrame`; it is decoration, so it is hidden from screen readers.
 */
export function RevealStage({
  frame,
  opened,
}: {
  frame: RevealFrame;
  /** What the opened orb shows instead of the gem (a claimed job shows its item). */
  opened?: ComponentChildren;
}) {
  const shaking = frame.phase === 'shake';
  return (
    <div class={`reveal-stage phase-${frame.phase}`} aria-hidden="true">
      {!shaking && opened !== undefined ? (
        <span class="reveal-prop">{opened}</span>
      ) : (
        <Sprite sprite={glyphOrUnknown(shaking ? 'orb' : 'gem')} scale={8} class="reveal-prop" />
      )}
    </div>
  );
}

/** "First on server" as a banner with a sparkle on each side. */
function FirstBanner() {
  const sparkle = glyphOrUnknown('sparkle');
  return (
    <span class="banner-first pix">
      <Sprite sprite={sparkle} scale={2} />
      First on server
      <Sprite sprite={sparkle} scale={2} />
    </span>
  );
}

/**
 * The finale loot reveal. An orb shakes and opens into a gem, the Essence counts up (one figure: the
 * server's jackpot is hidden and only ever part of this total), and then the result shows: the
 * Festival creature (its sprite pops in) and what the finale did to the server's rank. The animation
 * is stepped and short, and the real text is in the page from the start, so screen readers get the
 * result at once; a player who prefers reduced motion sees the end state straight away.
 */
export function RevealCard({
  reveal,
  busy,
  afterAction,
  gearWeek,
  onDismiss,
}: {
  reveal: Pick<RaidReveal, 'cleared' | 'essence'> &
    Partial<Pick<RaidReveal, 'rankChange' | 'festivalGrant'>>;
  busy: boolean;
  /** Where the finale's after-action card is asked for (the caller's party in that finale). */
  afterAction?: { week: string; party: number; onReplay?: () => void };
  /** The raid week whose gear grant (the finale's roll and the Festival piece) is shown as a pop-in. */
  gearWeek?: string;
  onDismiss: () => void;
}) {
  const summary = revealSummary(reveal);
  const reduced = usePrefersReducedMotion();
  const frame = useRevealFrame(reveal.essence, reduced);
  const done = frame.phase === 'done';
  const festivalSpecies = reveal.festivalGrant?.species ?? null;
  return (
    <section class="reveal-card" role="status" aria-labelledby="reveal-heading">
      <h3 id="reveal-heading">
        Finale result{' '}
        <span class={summary.cleared ? 'badge good' : 'badge bad'}>
          {summary.cleared ? 'Cleared' : 'Not cleared'}
        </span>
      </h3>
      <p>{summary.outcome}</p>
      <RevealStage frame={frame} />
      <p class="reveal-essence">
        <span class="visually-hidden">{summary.essence}</span>
        <span aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('gem')} scale={2} /> You got{' '}
          <span class="reveal-count">{frame.count}</span> Essence
        </span>
      </p>
      {summary.festival !== null && (
        <div class={done ? 'reveal-festival-box done' : 'reveal-festival-box'}>
          {festivalSpecies !== null && (
            <Sprite sprite={creatureSpriteOrFallback(festivalSpecies)} scale={6} class="pop-in" />
          )}
          <p class="reveal-festival">{summary.festival.text}</p>
          {summary.festival.firstOnServer && <FirstBanner />}
        </div>
      )}
      {summary.rank !== null && <p class="reveal-rank">{summary.rank}</p>}
      {gearWeek !== undefined && <FinaleGearLoot week={gearWeek} done={done} />}
      {afterAction !== undefined && (
        <AfterAction
          week={afterAction.week}
          party={afterAction.party}
          phase="finale"
          {...(afterAction.onReplay === undefined ? {} : { onReplay: afterAction.onReplay })}
        />
      )}
      <p>
        <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
          Got it
        </button>
      </p>
    </section>
  );
}
