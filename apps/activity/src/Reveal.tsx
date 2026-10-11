import { useEffect, useState } from 'preact/hooks';
import { AfterAction } from './AfterAction';
import { glyphOrUnknown } from './glyphs';
import { usePrefersReducedMotion } from './hooks';
import { revealSummary } from './live';
import type { RaidReveal } from './raid-api';
import { finalFrame, revealFrames, type RevealFrame } from './reveal-anim';
import { Sprite } from './sprites/Sprite';
import { creatureSpriteOrFallback } from './sprites/creature-sprites';

/** The frame to show now: it walks through the reveal's timeline, or sits at the end when motion is off. */
function useRevealFrame(essence: number, reducedMotion: boolean): RevealFrame {
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
 * The finale loot reveal. An orb shakes and opens (a chest with a gold burst for a jackpot, a gem
 * otherwise), the Essence counts up, and then the result shows: the jackpot, the Festival creature
 * (its sprite pops in) and what the finale did to the server's rank. The animation is stepped and
 * short, and the real text is in the page from the start, so screen readers get the result at
 * once; a player who prefers reduced motion sees the end state straight away.
 */
export function RevealCard({
  reveal,
  pity,
  busy,
  afterAction,
  onDismiss,
}: {
  reveal: Pick<RaidReveal, 'cleared' | 'essence' | 'jackpot'> &
    Partial<Pick<RaidReveal, 'rankChange' | 'festivalGrant'>>;
  /** The pity counter after the fight, when the server sent one. */
  pity: number | null;
  busy: boolean;
  /** Where the finale's after-action card is asked for (the caller's party in that finale). */
  afterAction?: { week: string; party: number; onReplay?: () => void };
  onDismiss: () => void;
}) {
  const summary = revealSummary(reveal, pity);
  const reduced = usePrefersReducedMotion();
  const frame = useRevealFrame(reveal.essence, reduced);
  const done = frame.phase === 'done';
  const hit = summary.jackpot.hit;
  const prop = frame.phase === 'shake' ? 'orb' : hit ? 'chest_open' : 'gem';
  const classes = ['reveal-card'];
  if (hit) classes.push('jackpot');
  const festivalSpecies = reveal.festivalGrant?.species ?? null;
  return (
    <section class={classes.join(' ')} role="status" aria-labelledby="reveal-heading">
      <h3 id="reveal-heading">
        Finale result{' '}
        <span class={summary.cleared ? 'badge good' : 'badge bad'}>
          {summary.cleared ? 'Cleared' : 'Not cleared'}
        </span>
      </h3>
      <p>{summary.outcome}</p>
      <div class={`reveal-stage phase-${frame.phase}${hit ? ' jackpot' : ''}`} aria-hidden="true">
        <Sprite sprite={glyphOrUnknown(prop)} scale={8} class="reveal-prop" />
        {hit && frame.phase !== 'shake' && (
          <span class="gold-burst">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      <p class="reveal-essence">
        <span class="visually-hidden">{summary.essence}</span>
        <span aria-hidden="true">
          <Sprite sprite={glyphOrUnknown('gem')} scale={2} /> You got{' '}
          <span class="reveal-count">{frame.count}</span> Essence
        </span>
      </p>
      <div class={done ? 'reveal-roll done' : 'reveal-roll'}>
        <p class={summary.jackpot.hit ? 'reveal-result hit' : 'reveal-result'}>
          {summary.jackpot.text}
        </p>
        {summary.jackpot.firstOnServer && <FirstBanner />}
      </div>
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
