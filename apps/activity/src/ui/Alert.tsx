import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { glyphOrUnknown } from '../glyphs';
import { Sprite } from '../sprites/Sprite';
import { CloseGlyph } from './Drawer';

/** How serious an alert is: its colour, its icon, and whether a screen reader is interrupted. */
export type AlertLevel = 'info' | 'success' | 'warning' | 'alert';

/** The icon of each level (bundled glyphs): a blue "i", a green tick, a gold triangle, a red stop sign. */
export const ALERT_ICONS: Readonly<Record<AlertLevel, string>> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  alert: 'alert',
};

/** How long the dismiss animation runs (the CSS of `.alert.leaving` matches it). */
export const ALERT_DISMISS_MS = 220;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

export interface AlertProps {
  level: AlertLevel;
  /** A short bold title before the message; absent: the message alone. */
  title?: string | undefined;
  /** `inline` (default): the message follows the title on the same line. `stacked`: it starts on a new line. */
  layout?: 'inline' | 'stacked';
  /** The message: one line or several (text, and a small button where one helps). */
  children: ComponentChildren;
  /**
   * Shows an X at the right that dismisses the alert: it slides out and folds away, then this is
   * called. Absent: no X, the alert stays.
   */
  onDismiss?: (() => void) | undefined;
  /** What the X says to assistive technology. */
  dismissLabel?: string;
  class?: string;
}

/**
 * A note in one of four levels (info, success, warning, alert): the level's icon on the left, an
 * optional bold title, then the message in the body font, on as many lines as it needs. An alert
 * interrupts a screen reader (`role="alert"`); the other levels are polite (`role="status"`).
 *
 * The icon and the X sit in boxes exactly one line tall at the top: with one line of text both are
 * centred on it, with more they stay at the top left and top right. The X slides the alert out and
 * folds its height away (a quick stepped animation), or removes it at once with reduced motion.
 */
export function Alert({
  level,
  title,
  layout = 'inline',
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
  class: extra,
}: AlertProps) {
  const [phase, setPhase] = useState<'shown' | 'leaving' | 'gone'>('shown');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDismiss);
  done.current = onDismiss;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  if (phase === 'gone') return null;

  const dismiss = (): void => {
    if (phase !== 'shown') return;
    const finish = (): void => {
      setPhase('gone');
      done.current?.();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    setPhase('leaving');
    timer.current = setTimeout(finish, ALERT_DISMISS_MS);
  };

  const classes = ['alert', `alert-${level}`];
  if (phase === 'leaving') classes.push('leaving');
  if (extra !== undefined) classes.push(extra);

  return (
    <div class={classes.join(' ')} role={level === 'alert' ? 'alert' : 'status'}>
      <div class="alert-body">
        <span class="alert-icon" aria-hidden="true">
          <Sprite sprite={glyphOrUnknown(ALERT_ICONS[level])} scale={2} />
        </span>
        <div class={`alert-text prose ${layout}`}>
          {title !== undefined && <strong class="alert-title">{title}</strong>}
          {title !== undefined && layout === 'inline' && ' '}
          <span class="alert-message">{children}</span>
        </div>
        {onDismiss !== undefined && (
          <button
            type="button"
            class="alert-close"
            aria-label={dismissLabel}
            disabled={phase !== 'shown'}
            onClick={dismiss}
          >
            <CloseGlyph />
          </button>
        )}
      </div>
    </div>
  );
}
