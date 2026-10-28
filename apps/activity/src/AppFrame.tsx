import type { ComponentChildren } from 'preact';

/**
 * The game's frame inside `main.card`: the head (the HUD and, on a wide window, the living room band; or the
 * title row before a game), then the navigation (the dock on a phone, the rail on a wide window) beside or
 * under the screen. `Game` draws the game in it and the workbench's `GameScreens` page draws fixture screens in
 * it, so a screenshot of the page cannot drift from the game's markup.
 */
export function AppFrame({
  head,
  nav,
  children,
}: {
  head: ComponentChildren;
  nav: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <>
      {head}
      <div class="nav-shell">
        {nav}
        <div class="nav-screen">{children}</div>
      </div>
    </>
  );
}
