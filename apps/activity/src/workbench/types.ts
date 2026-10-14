import type { ComponentChildren } from 'preact';

/** One value of a prop control. Everything a control can hold is one of these. */
export type Value = string | number | boolean;

/** The current props of a component page, by prop name. */
export type Props = Readonly<Record<string, Value>>;

/** How one prop is edited on the page. */
export type Control =
  | { kind: 'number'; min: number; max: number; step?: number }
  | { kind: 'select'; options: readonly string[] }
  | { kind: 'toggle' }
  | { kind: 'text'; maxLength?: number };

/** A named starting point for the props ("Empty", "Half", "Full"); it only sets what it names. */
export interface Preset {
  name: string;
  props: Props;
}

export const GROUPS = [
  'Bars',
  'Tags & chips',
  'Popovers',
  'Slots',
  'Loot & reveals',
  'Headings & banners',
  'Icons',
  'Controls',
  'Creatures & game pieces',
] as const;

export type Group = (typeof GROUPS)[number];

/** One component page of the workbench. */
export interface Entry {
  /** The component's name as written in code ("TimerBar"); also its id in the URL. */
  name: string;
  /** Where the component lives, relative to the repo root. */
  file: string;
  group: Group;
  /** One plain sentence: what it is, and where the player sees it. */
  description: string;
  /** The editable props. A prop that is not here cannot be changed on the page. */
  controls: Readonly<Record<string, Control>>;
  /** The props of the page when it opens; every control has one. */
  defaults: Props;
  presets: readonly Preset[];
  /** Exported names this page also shows (a small helper next to the main component). */
  covers?: readonly string[];
  /** Draws the component with these (already cleaned) props. Fixture data only. */
  render: (props: Props) => ComponentChildren;
}
