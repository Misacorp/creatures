import type { Control, Entry, Props, Value } from './types';

/** The input of one prop. Every input reports a value that `cleanProps` then checks again. */
function Field({
  id,
  name,
  control,
  value,
  onChange,
}: {
  id: string;
  name: string;
  control: Control;
  value: Value;
  onChange: (value: Value) => void;
}) {
  switch (control.kind) {
    case 'toggle':
      return (
        <label class="wb-field wb-field-toggle" for={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            onChange={(event) => {
              onChange(event.currentTarget.checked);
            }}
          />
          <span>{name}</span>
        </label>
      );
    case 'number':
      return (
        <div class="wb-field">
          <label for={id}>{name}</label>
          <div class="wb-number">
            <input
              type="range"
              aria-label={`${name} (slider)`}
              min={control.min}
              max={control.max}
              step={control.step ?? 1}
              value={typeof value === 'number' ? value : control.min}
              onInput={(event) => {
                onChange(event.currentTarget.valueAsNumber);
              }}
            />
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={control.min}
              max={control.max}
              step={control.step ?? 1}
              value={typeof value === 'number' ? value : control.min}
              onInput={(event) => {
                const next = event.currentTarget.valueAsNumber;
                if (!Number.isNaN(next)) onChange(next);
              }}
            />
          </div>
        </div>
      );
    case 'select':
      return (
        <div class="wb-field">
          <label for={id}>{name}</label>
          <select
            id={id}
            value={String(value)}
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
          >
            {control.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    case 'text':
      return (
        <div class="wb-field">
          <label for={id}>{name}</label>
          <input
            id={id}
            type="text"
            maxLength={control.maxLength ?? 80}
            value={String(value)}
            onInput={(event) => {
              onChange(event.currentTarget.value);
            }}
          />
        </div>
      );
  }
}

/** All the controls of a page, one per editable prop. */
export function PropControls({
  entry,
  props,
  onChange,
}: {
  entry: Entry;
  props: Props;
  onChange: (name: string, value: Value) => void;
}) {
  const names = Object.keys(entry.controls);
  if (names.length === 0) {
    return <p class="muted small">This component has no props to change.</p>;
  }
  return (
    <div class="wb-controls">
      {names.map((name) => {
        const control = entry.controls[name];
        const value = props[name];
        if (control === undefined || value === undefined) return null;
        return (
          <Field
            key={name}
            id={`wb-prop-${name}`}
            name={name}
            control={control}
            value={value}
            onChange={(next) => {
              onChange(name, next);
            }}
          />
        );
      })}
    </div>
  );
}
