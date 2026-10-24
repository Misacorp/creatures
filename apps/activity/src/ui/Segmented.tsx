import { ToggleButton } from './ToggleButton';

/**
 * A short row of exclusive choices ("Flat / Leaning / Swaying"): one `ToggleButton` each, the chosen one gold and
 * spoken as pressed, inside a named group. Choosing the chosen one again changes nothing. `label` names the
 * group for assistive technology (the visible name is the row around it). The words are the game's own: text.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div class="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <ToggleButton
          key={option.id}
          pressed={option.id === value}
          onToggle={() => {
            if (option.id !== value) onChange(option.id);
          }}
        >
          {option.label}
        </ToggleButton>
      ))}
    </div>
  );
}
