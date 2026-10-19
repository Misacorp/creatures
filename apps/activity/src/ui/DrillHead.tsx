import { useEffect, useRef } from 'preact/hooks';

/**
 * The top of a drill-in view (a choice that opens inside the same drawer or card, never a layer over it): "‹ Back"
 * at the top left, then the view's title. `backLabel` is what Back goes back to, said only to screen readers
 * ("to the item": the button is then "‹ Back to the item"). Put the Escape handling on the view around it
 * (`onDrillKey`): the head only draws. `level` is the title's heading level (3 in a drawer; 4 under a card's
 * own heading). `scroll` brings the head to the top of the screen when the view opens (a drawer view that
 * was entered scrolled down); `focus` puts the focus on Back (the button that opened the view is gone, so
 * Escape would otherwise have nothing to hear it). The title is text.
 */
export function DrillHead({
  title,
  onBack,
  backLabel,
  level = 3,
  scroll = false,
  focus = false,
  disabled = false,
}: {
  title: string;
  onBack: () => void;
  backLabel: string;
  level?: 3 | 4;
  scroll?: boolean;
  focus?: boolean;
  disabled?: boolean;
}) {
  const head = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (scroll) head.current?.scrollIntoView?.({ block: 'start' });
    if (focus) back.current?.focus({ preventScroll: true });
  }, []);
  const Title = level === 3 ? 'h3' : 'h4';
  return (
    <div ref={head} class="drill-head">
      <button
        ref={back}
        type="button"
        class="ghost cp-back drill-back"
        disabled={disabled}
        onClick={onBack}
      >
        <span aria-hidden="true">‹</span> Back
        <span class="visually-hidden"> {backLabel}</span>
      </button>
      <Title class="drill-title">{title}</Title>
    </div>
  );
}
