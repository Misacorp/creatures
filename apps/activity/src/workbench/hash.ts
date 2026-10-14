import { changedProps, cleanProps } from './props';
import type { Entry, Props } from './types';

/** The widths of the width switcher (`full` fills the window). */
export const WIDTHS = ['360', '390', 'full'] as const;
export type Width = (typeof WIDTHS)[number];

/** The backgrounds of the background switcher: the colours the app puts its panels on. */
export const BACKGROUNDS = ['night', 'dusk', 'raised', 'ink'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const BACKGROUND_LABELS: Readonly<Record<Background, string>> = {
  night: 'Page',
  dusk: 'Card',
  raised: 'Raised',
  ink: 'Ink',
};

/** What the address says: which component, its props, and how the preview is framed. */
export interface View {
  component: string | null;
  /** Raw (not yet cleaned) props from the link. */
  props: Record<string, unknown>;
  width: Width;
  background: Background;
}

const MAX_HASH = 4000;

export const DEFAULT_VIEW: View = { component: null, props: {}, width: '390', background: 'dusk' };

function isWidth(value: string | null): value is Width {
  return WIDTHS.some((w) => w === value);
}

function isBackground(value: string | null): value is Background {
  return BACKGROUNDS.some((b) => b === value);
}

function parseProps(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
}

/** Reads `#c=Name&p={json}&w=390&bg=dusk`. Anything wrong or too long gives the defaults. */
export function parseHash(hash: string): View {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (text.length > MAX_HASH) return DEFAULT_VIEW;
  const params = new URLSearchParams(text);
  const width = params.get('w');
  const background = params.get('bg');
  return {
    component: params.get('c'),
    props: parseProps(params.get('p')),
    width: isWidth(width) ? width : DEFAULT_VIEW.width,
    background: isBackground(background) ? background : DEFAULT_VIEW.background,
  };
}

/** Writes a view as a hash (with the `#`). The index page is the empty hash. */
export function formatHash(
  entry: Entry | null,
  props: Props,
  width: Width,
  background: Background,
): string {
  if (entry === null) return '';
  const params = new URLSearchParams();
  params.set('c', entry.name);
  const changed = changedProps(entry, props);
  if (Object.keys(changed).length > 0) params.set('p', JSON.stringify(changed));
  params.set('w', width);
  params.set('bg', background);
  return `#${params.toString()}`;
}

/** The props a view asks for on `entry`, cleaned. */
export function viewProps(entry: Entry, view: View): Props {
  return cleanProps(entry, view.props);
}
