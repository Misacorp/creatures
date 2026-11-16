/**
 * A step inside a panel (`docs/design/ux-patterns.md`, "A place is a canvas": no sheet over a drawer). `StepHold` draws a panel's list
 * and, when there is a step, the step in its place: the list stays mounted (its filter, its selection) but hidden, and its scroll
 * is put back when the step goes. `StepBody` is the step's frame: the Back head, what the step shows, and a pinned footer.
 */
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { DrillHead } from '../ui/DrillHead';
import { onDrillKey } from '../ui/drill-keys';
import { keyboardHasFocus } from '../ui/focus-return';
import { PanelBody } from './PlaceCanvas';

export function StepHold({
  list,
  step,
}: {
  list: ComponentChildren;
  step: ComponentChildren | null;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const kept = useRef({
    top: 0,
    opener: null as HTMLElement | null,
    byKeyboard: false,
    open: false,
  });
  const open = step !== null && step !== undefined && step !== false;
  if (open && !kept.current.open) {
    // The step is about to replace the list: note where it was scrolled and what the player used to open the step.
    kept.current.top = holder.current?.querySelector('.pc-scroll')?.scrollTop ?? 0;
    const active =
      typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
    kept.current.opener = active ?? null;
    kept.current.byKeyboard = typeof document !== 'undefined' && keyboardHasFocus();
  }
  useLayoutEffect(() => {
    const was = kept.current.open;
    kept.current.open = open;
    if (open || !was) return;
    const scroll = holder.current?.querySelector('.pc-scroll');
    if (scroll) scroll.scrollTop = kept.current.top;
    const back = kept.current.opener;
    if (kept.current.byKeyboard && back !== null && back.isConnected) {
      back.focus({ preventScroll: true });
    }
  }, [open]);
  return (
    <>
      <div class="ps-list" ref={holder} hidden={open}>
        {list}
      </div>
      {open && step}
    </>
  );
}

/** One step's frame: the Back head (Escape goes back too), the content that scrolls, and the footer pinned under it. */
export function StepBody({
  title,
  backLabel,
  onBack,
  head,
  footer,
  focusBack = false,
  showHeader = true,
  onKeys,
  children,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  /** Under the Back head (an item's flip arrows). */
  head?: ComponentChildren;
  footer?: ComponentChildren;
  focusBack?: boolean;
  /** Draws the Back head (Back and the title); off, the step starts with its content (Escape still goes back). */
  showHeader?: boolean;
  /** Keys the step takes before Escape does (an item's Left and Right flip). */
  onKeys?: ((event: KeyboardEvent) => void) | undefined;
  children: ComponentChildren;
}) {
  return (
    <PanelBody footer={footer}>
      <div
        class="wizard dr-stack ps-step"
        onKeyDown={(event) => {
          onKeys?.(event);
          onDrillKey(onBack)(event);
        }}
      >
        {showHeader && (
          <DrillHead title={title} backLabel={backLabel} onBack={onBack} focus={focusBack} />
        )}
        {head}
        {children}
      </div>
    </PanelBody>
  );
}
