import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  buildBody,
  initialValues,
  type CreatureChoice,
  type Field,
  type ToolSpec,
  type Values,
} from './forms';

interface FieldInputProps {
  field: Field;
  value: string;
  choices: readonly CreatureChoice[];
  onInput: (value: string) => void;
}

/** One input: text, a whole number or a drop-down. Always text content, never raw HTML. */
function FieldInput({ field, value, choices, onInput }: FieldInputProps): JSX.Element {
  const change = (event: Event): void => {
    onInput((event.currentTarget as HTMLInputElement | HTMLSelectElement).value);
  };
  switch (field.kind) {
    case 'int':
      return (
        <input
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          value={value}
          placeholder={field.optional === true ? 'unchanged' : ''}
          onInput={change}
        />
      );
    case 'text':
      return <input type="text" autocomplete="off" value={value} onInput={change} />;
    case 'bool':
      return (
        <select value={value} onChange={change}>
          {field.optional === true && <option value="">unchanged</option>}
          <option value="true">yes</option>
          <option value="false">no</option>
        </select>
      );
    case 'creature':
      return (
        <select value={value} onChange={change}>
          {choices.length === 0 && <option value="">(no creatures)</option>}
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      );
    case 'select':
      return (
        <select value={value} onChange={change}>
          {field.optional === true && <option value="">unchanged</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
  }
}

/** The value a creature picker shows: the chosen one if it still exists, else the first creature. */
function creatureValue(value: string, choices: readonly CreatureChoice[]): string {
  return choices.some((c) => c.id === value) ? value : (choices[0]?.id ?? '');
}

export interface ToolFormProps {
  spec: ToolSpec;
  choices: readonly CreatureChoice[];
  busy: boolean;
  /** Runs the tool with a checked body. */
  onRun: (spec: ToolSpec, body: Record<string, unknown>) => void;
}

/** A tool as a button (no fields) or a small form (fields, then the button). */
export function ToolForm({ spec, choices, busy, onRun }: ToolFormProps): JSX.Element {
  const [values, setValues] = useState<Values>(() => initialValues(spec, choices));
  const [problem, setProblem] = useState<string | null>(null);

  const effective = (): Values => {
    const out: Record<string, string> = { ...values };
    for (const f of spec.fields) {
      if (f.kind === 'creature') out[f.key] = creatureValue(out[f.key] ?? '', choices);
    }
    return out;
  };

  const submit = (event: Event): void => {
    event.preventDefault();
    const built = buildBody(spec, effective());
    if (!built.ok) {
      setProblem(built.error);
      return;
    }
    setProblem(null);
    onRun(spec, built.body);
  };

  const button = (
    <button
      type="submit"
      class={spec.danger === true ? 'dev-btn dev-danger' : 'dev-btn'}
      disabled={busy}
    >
      {spec.fields.length === 0 || spec.danger === true ? spec.label : 'Apply'}
    </button>
  );

  if (spec.fields.length === 0) {
    return (
      <form class="dev-quick" onSubmit={submit}>
        {button}
      </form>
    );
  }
  const shown = effective();
  return (
    <form class="dev-form" onSubmit={submit}>
      <p class="dev-form-title">{spec.label}</p>
      <div class="dev-fields">
        {spec.fields.map((field) => (
          <label key={field.key} class="dev-field">
            <span>{field.label}</span>
            <FieldInput
              field={field}
              value={shown[field.key] ?? ''}
              choices={choices}
              onInput={(value) => {
                setValues((prev) => ({ ...prev, [field.key]: value }));
              }}
            />
          </label>
        ))}
      </div>
      {button}
      {spec.hint !== undefined && <p class="dev-hint">{spec.hint}</p>}
      {problem !== null && (
        <p class="dev-problem" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}
