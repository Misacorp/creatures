import type { ComponentChildren } from 'preact';

/**
 * The game's frame inside `main.card`: the head (the HUD and, on a wide window, the living room band; or the
 * title row before a game), then the navigation (the dock on a phone, the rail on a wide window) beside or
 * under the screen. `Game` draws the game in it and the workbench's `GameScreens` page draws fixture screens in
 * it, so a screenshot of the page cannot drift from the game's markup.
 */
export function AppFrame({
  place,
  head,
  nav,
  children,
}: {
  /** The place on screen (a `TABS` id or "home"), as `data-place` so a look can style a place's scenery. */
  place: string;
  head: ComponentChildren;
  nav: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <>
      {head}
      <div class="nav-shell" data-place={place}>
        {nav}
        <div class="nav-screen">{children}</div>
      </div>
    </>
  );
}
