import { CountBadge, type CountItem } from './CountBadge';

/** One thing a recipe takes: its badge (the amount is the number needed) and how many the player has. */
export type RecipeInput = CountItem & { amount: number; have: number };

export interface RecipeCardProps {
  /** What goes in, each with the amount needed and the amount held ("2 / 3"; short ones are marked). */
  inputs: readonly RecipeInput[];
  /** What comes out, as plain count badges. */
  outputs: readonly CountItem[];
  /** How long it takes, as a badge (`nominalDurationCountItem`); left out when there is no time. */
  duration?: CountItem | undefined;
  /** Why it cannot start (missing inputs, level too low); null or absent when it can. Shown as text. */
  disabledReason?: string | null | undefined;
  /** The words on the button ("Refine", "Recycle"). */
  actionLabel: string;
  /** Only the inputs, the arrow, the outputs and the time: no reason and no button (a preview above another picker). */
  compact?: boolean;
  /** True while any action runs. */
  busy?: boolean | undefined;
  /** The button was pressed (it is not called while disabled). */
  onStart: () => void;
}

/**
 * "Combine one or more things into one or more other things": the inputs with have / need, an arrow, the
 * outputs, the time and one action button, with the reason written under the row when it cannot start.
 * Built for every recipe (Workshop refine and recycle today, later currencies' recipes): it knows nothing
 * of supplies or parts, only badges. All text is rendered as text.
 */
export function RecipeCard({
  inputs,
  outputs,
  duration,
  disabledReason,
  actionLabel,
  compact = false,
  busy = false,
  onStart,
}: RecipeCardProps) {
  const reason = disabledReason ?? null;
  return (
    <div class="recipe-card dr-stack">
      <div class="recipe-row">
        <ul class="recipe-side gives" aria-label="Needs">
          {inputs.map(({ key, have, amount, ...badge }) => {
            const short = have < amount;
            return (
              <li key={key} class={short ? 'short' : undefined}>
                <CountBadge
                  {...badge}
                  amount={`${String(have)} / ${String(amount)}`}
                  spokenAmount={`have ${String(have)}, need ${String(amount)}`}
                />
                {short && <span class="visually-hidden"> (not enough)</span>}
              </li>
            );
          })}
        </ul>
        <span class="recipe-arrow" aria-hidden="true">
          →
        </span>
        <span class="visually-hidden">makes</span>
        <ul class="recipe-side gives" aria-label="Makes">
          {outputs.map(({ key, ...badge }) => (
            <li key={key}>
              <CountBadge {...badge} />
            </li>
          ))}
        </ul>
      </div>
      {duration !== undefined && (
        <p class="recipe-time muted">
          <CountBadge {...duration} />
        </p>
      )}
      {!compact && reason !== null && (
        <p class="reason" role="status">
          {reason}
        </p>
      )}
      {!compact && (
        <p class="actions">
          <button
            type="button"
            class="primary"
            disabled={busy || reason !== null}
            onClick={() => {
              if (!busy && reason === null) onStart();
            }}
          >
            {actionLabel}
          </button>
        </p>
      )}
    </div>
  );
}
