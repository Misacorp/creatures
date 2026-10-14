import type { Control, Entry, Props, Value } from './types';

const DEFAULT_TEXT_LIMIT = 80;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** One raw value made to fit its control: right type, in range, in the list, short enough. */
export function cleanValue(control: Control, raw: unknown, fallback: Value): Value {
  switch (control.kind) {
    case 'toggle':
      return typeof raw === 'boolean' ? raw : fallback;
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
      const value = clamp(raw, control.min, control.max);
      // Whole numbers unless the control has a fractional step.
      return (control.step ?? 1) < 1 ? value : Math.round(value);
    }
    case 'select':
      return typeof raw === 'string' && control.options.includes(raw) ? raw : fallback;
    case 'text':
      return typeof raw === 'string'
        ? [...raw].slice(0, control.maxLength ?? DEFAULT_TEXT_LIMIT).join('')
        : fallback;
  }
}

/**
 * The props of a page: the defaults, with every raw value that fits its control laid over them.
 * Unknown names and values of the wrong kind are dropped, so a bad link cannot break a page.
 */
export function cleanProps(entry: Entry, raw: Readonly<Record<string, unknown>>): Props {
  const out: Record<string, Value> = {};
  for (const [name, control] of Object.entries(entry.controls)) {
    const fallback = entry.defaults[name];
    if (fallback === undefined) continue;
    out[name] = cleanValue(control, raw[name], fallback);
  }
  return out;
}

/** Only the props that differ from the defaults (what goes in a shared link). */
export function changedProps(entry: Entry, props: Props): Props {
  const out: Record<string, Value> = {};
  for (const [name, value] of Object.entries(props)) {
    if (entry.defaults[name] !== value) out[name] = value;
  }
  return out;
}

/** A preset laid over the defaults. */
export function presetProps(entry: Entry, preset: { props: Props }): Props {
  return cleanProps(entry, { ...entry.defaults, ...preset.props });
}

/** Number prop `name`. Pages clean props first; the fallback only keeps the types honest. */
export function num(props: Props, name: string): number {
  const value = props[name];
  return typeof value === 'number' ? value : 0;
}

export function str(props: Props, name: string): string {
  const value = props[name];
  return typeof value === 'string' ? value : '';
}

export function bool(props: Props, name: string): boolean {
  return props[name] === true;
}
