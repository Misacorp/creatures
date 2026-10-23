import type { ComponentChildren, Ref } from 'preact';

export interface WideLayoutProps {
  /** At `WIDE_QUERY` and up (`useWide`): the panel sits beside the main area, and the app card widens. */
  wide: boolean;
  /** The main area (a map, the show's arena). It is full width while there is no panel. */
  main: ComponentChildren;
  /** The side panel (`SidePanel`), shown beside the main area only while `wide`; null or absent: none. */
  panel?: ComponentChildren | null | undefined;
  /** Extra classes on the root and on the main area (the screen's own styles). */
  class?: string | undefined;
  mainClass?: string | undefined;
  rootRef?: Ref<HTMLDivElement> | undefined;
  /** Anything after the panel that takes no column (a phone sheet, a live region). */
  children?: ComponentChildren;
}

/**
 * A screen's main area with a side panel beside it on a wide screen (the Expeditions world map's layout,
 * Misa 2026-10-23: "the side drawer is undoubtedly the same"): full width while there is no panel; with
 * one, two columns, the main area (narrower, keeping its own scale) and the panel (24 rem) on the right,
 * sticky and no taller than the screen. Narrow screens never get the panel: the screen shows its content
 * under the main area or in a sheet instead.
 */
export function WideLayout({
  wide,
  main,
  panel,
  class: extra,
  mainClass,
  rootRef,
  children,
}: WideLayoutProps) {
  const withPanel = wide && panel !== null && panel !== undefined && panel !== false;
  const classes = ['side-layout', extra ?? '', wide ? 'wide' : '', withPanel ? 'with-panel' : '']
    .filter((c) => c !== '')
    .join(' ');
  return (
    <div {...(rootRef === undefined ? {} : { ref: rootRef })} class={classes}>
      <div class={mainClass === undefined ? 'side-layout-main' : `side-layout-main ${mainClass}`}>
        {main}
      </div>
      {withPanel && panel}
      {children}
    </div>
  );
}
