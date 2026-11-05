/**
 * A small whole-number control: a minus button, the number, a plus button. For "how many" where the number is small and exact (the
 * Forge's order of three pieces). Each button is a 44 px target; the number is announced as a status when it changes. `label` names the
 * group for assistive technology (the visible name is the row around it). It never goes below `min` or above `max`.
 */
export function CountStepper({
  label,
  value,
  min = 1,
  max,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div class="count-stepper" role="group" aria-label={label}>
      <button
        type="button"
        class="count-step"
        aria-label={`One fewer ${label}`}
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(Math.max(min, value - 1));
        }}
      >
        {'−'}
      </button>
      <output class="count-value pix" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        class="count-step"
        aria-label={`One more ${label}`}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(Math.min(max, value + 1));
        }}
      >
        +
      </button>
    </div>
  );
}
