import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { glyphOrUnknown } from '../glyphs';
import { usePrefersReducedMotion } from '../hooks';
import { finalFrame, revealFrames, type RevealFrame } from '../reveal-anim';
import { Sprite } from '../sprites/Sprite';
import { Tag } from './Tag';

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

/**
 * The timeline of a reveal: the frame to show now (the orb, the Essence count) and whether the
 * sequence is `done`, which is when the parts held back by `RevealLater` show. A player who prefers
 * reduced motion gets the end state at once.
 */
export function useRevealSequence(essence: number): { frame: RevealFrame; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const frame = useRevealFrame(essence, reduced);
  return { frame, done: frame.phase === 'done' };
}

/**
 * The orb that shakes and opens (the finale's loot reveal and a claimed job both use it). The frame
 * comes from `useRevealSequence`; it is decoration, so it is hidden from screen readers.
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

/**
 * Content that fades in once the reveal sequence is `done` (the real text is in the page from the
 * start; only its look is delayed, and not at all with reduced motion).
 */
export function RevealLater({
  done,
  class: extra,
  children,
}: {
  done: boolean;
  /** Where it is used (extra layout for one place). */
  class?: string;
  children: ComponentChildren;
}) {
  const classes = ['reveal-later', extra, done ? 'done' : ''].filter(Boolean).join(' ');
  return <div class={classes}>{children}</div>;
}

/** "Cleared" or "Not cleared" as a badge. */
export function OutcomeBadge({ cleared }: { cleared: boolean }) {
  return (
    <Tag kind="badge" tone={cleared ? 'good' : 'bad'}>
      {cleared ? 'Cleared' : 'Not cleared'}
    </Tag>
  );
}

/**
 * The card every reveal sits in: a heading (with an optional badge after it), the content, and a
 * footer that is a "Got it" button unless the screen brings its own buttons.
 */
export function RevealShell({
  id,
  title,
  badge,
  class: extra,
  status = false,
  busy = false,
  onDismiss,
  footer,
  children,
}: {
  /** The heading's id; the card is named by it. */
  id: string;
  title: ComponentChildren;
  badge?: ComponentChildren;
  /** Where it is used (extra look for one place). */
  class?: string;
  /** True when the card is announced as a status as it appears. */
  status?: boolean;
  busy?: boolean;
  /** The "Got it" button's action (leave out when `footer` is given). */
  onDismiss?: () => void;
  footer?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section
      class={extra === undefined ? 'reveal-card' : `reveal-card ${extra}`}
      {...(status ? { role: 'status' } : {})}
      aria-labelledby={id}
    >
      <h3 id={id}>
        {title}
        {badge !== undefined && <> {badge}</>}
      </h3>
      {children}
      {footer ?? (
        <p>
          <button type="button" class="primary" disabled={busy} onClick={onDismiss}>
            Got it
          </button>
        </p>
      )}
    </section>
  );
}
