import type { ComponentChildren } from 'preact';
import { DrillHead } from './DrillHead';
import { onDrillKey } from './drill-keys';
import type { Wizard } from './use-wizard';

/*
 * A step-by-step flow (Back / Next / finish). It is three separate pieces and none of them knows about a
 * drawer, a card or a page: where they sit is the caller's choice.
 *
 * - `useWizard(steps, { initial, onExit })` (`ui/use-wizard.ts`): the position and the moves.
 * - `WizardView`: the head (title and "‹ Back") and the current step's content. Escape goes one step back.
 * - `WizardFooter`: the always-visible reason and the gold button. Escape too.
 *
 * Usually it is placed inside a `Drawer`: head and body in the content, the footer in the `footer` slot so
 * the button stays pinned while the body scrolls (the place sheet's send flow does this):
 *
 *   const wizard = useWizard(STEPS, { onExit: backToThePlace });
 *   <Drawer open title="A place" onClose={close} footer={
 *     <WizardFooter wizard={wizard} blocked={whyNot(wizard.step)} onFinish={send} />
 *   }>
 *     <WizardView wizard={wizard}>{wizard.step === 'who' ? <Who /> : <Pack />}</WizardView>
 *   </Drawer>
 *
 * The caller owns validation: `blocked` is the reason the current step cannot go on (null when it can).
 *
 * Branching flows (2026-10-22; the dungeon camp): a step can name where Back and Next go (`back`,
 * `forward`) and be a `final` step, and a pick inside a step can open another with `wizard.goTo(id)`. A step
 * whose forward action is the pick itself simply has no footer. `WizardView`/`WizardHead` take `disabled`
 * (Back and Escape off while a request is out) and `level` 4 for a card's own heading; the camp's first
 * step (the choices) has no head and is drawn by the caller, the wizard still holds the position.
 */

/**
 * The top of the wizard: "‹ Back" and the current step's title (`ui/DrillHead`). Back goes one step back,
 * and from the first step it is the wizard's `onExit` (drawn disabled when there is none). `focus` gives
 * Back the focus when the head is drawn, as a drill-in does (the button that opened it is gone).
 */
export function WizardHead<Id extends string>({
  wizard,
  level = 3,
  focus = false,
  disabled = false,
}: {
  wizard: Wizard<Id>;
  level?: 3 | 4;
  focus?: boolean;
  /** Back is disabled while a request is out (the camp's acts). */
  disabled?: boolean;
}) {
  return (
    <DrillHead
      title={wizard.current.title}
      backLabel={wizard.current.backLabel}
      onBack={wizard.back}
      level={level}
      focus={focus}
      disabled={disabled || !wizard.canBack}
    />
  );
}

/**
 * The head and the current step's content (`children`; the caller draws the section of `wizard.step`).
 * Escape, pressed anywhere inside, goes one step back and does not reach what is around it.
 */
export function WizardView<Id extends string>({
  wizard,
  children,
  level = 3,
  focus = false,
  disabled = false,
  class: className,
}: {
  wizard: Wizard<Id>;
  children: ComponentChildren;
  level?: 3 | 4;
  focus?: boolean;
  /** Back and Escape do nothing (a request is out). */
  disabled?: boolean;
  /** An extra class on the wrapper (where it is used). */
  class?: string | undefined;
}) {
  return (
    <div
      class={className === undefined ? 'wizard dr-stack' : `wizard dr-stack ${className}`}
      onKeyDown={disabled ? undefined : onDrillKey(wizard.back)}
    >
      <WizardHead wizard={wizard} level={level} focus={focus} disabled={disabled} />
      {children}
    </div>
  );
}

/**
 * The pinned footer: the reason the button is disabled (always on the screen, never a silent grey button),
 * then the gold button. With a `wizard` the button reads the step's `next` label ("Next" by default) and
 * goes one step on; on the last step it is the finish: `onFinish`. Without a `wizard` it is the finish
 * alone (a form that shows every step at once). Escape goes one step back when there is a wizard.
 */
export function WizardFooter<Id extends string>({
  wizard,
  blocked = null,
  busy = false,
  disabled = false,
  label,
  onFinish,
  before,
  extra,
  badge,
  reasonShown = true,
}: {
  wizard?: Wizard<Id> | undefined;
  /** Why the current step cannot go on; null when it can. Disables the button and is said above it. */
  blocked?: string | null;
  /** A request is out: the button is disabled. */
  busy?: boolean;
  /** Disabled for a reason that is not said here. */
  disabled?: boolean;
  /** The button's words, instead of the step's `next` label ("Send Mossy to the Reef for 12 h"). Needed without a wizard. */
  label?: string | undefined;
  /** What the finish button does (the last step, or no wizard). */
  onFinish?: (() => void) | undefined;
  /** A line above the reason (the place's time rule). */
  before?: ComponentChildren;
  /** A line between the reason and the button (the full bag warning). */
  extra?: ComponentChildren;
  /** Content after the label, inside the button (a count badge). */
  badge?: ComponentChildren;
  /** False when `before` already says the reason: it is then not repeated, the button stays disabled. */
  reasonShown?: boolean;
}) {
  const words = label ?? wizard?.current.next ?? 'Next';
  const go = (): void => {
    if (wizard === undefined || wizard.last) onFinish?.();
    else wizard.next();
  };
  return (
    <div
      class="wizard-footer send-footer dr-stack"
      {...(wizard === undefined ? {} : { onKeyDown: onDrillKey(wizard.back) })}
    >
      {before}
      {blocked !== null && reasonShown && (
        <p class="reason" role="status">
          {blocked}
        </p>
      )}
      {extra}
      <button
        type="button"
        class="primary send-button"
        disabled={busy || disabled || blocked !== null}
        onClick={go}
      >
        <span>{words}</span>
        {badge}
      </button>
    </div>
  );
}
