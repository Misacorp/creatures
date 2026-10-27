import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

/**
 * The small menu a right click on a bag tile opens (decisions.md, 2026-10-27, "Bulk selection replaces
 * marking"): "Inspect" (open the item's card) and "Select" (start or change the selection; "Deselect" for an item
 * already chosen). It is an extra for a mouse, never the only way to either action. It sits at the pointer, kept
 * inside the window; a transparent layer under it takes any click or scroll outside as "close", Escape closes it
 * too, and Up and Down move between its two entries. The place is written as CSS custom properties, so no inline
 * style attribute is needed. `onClose` is told whether the focus should go back to the tile (Escape does; a
 * choice does not, since it moves the player on).
 */
export function ItemMenu({
  x,
  y,
  chosen,
  name,
  onInspect,
  onSelect,
  onClose,
}: {
  /** Where the pointer was, in window coordinates. */
  x: number;
  y: number;
  /** The item is in the selection now: the second entry reads "Deselect". */
  chosen: boolean;
  /** The item's name, for the menu's spoken label. */
  name: string;
  onInspect: () => void;
  onSelect: () => void;
  onClose: (returnFocus: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = menu.current;
    if (el == null) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const maxX = typeof window === 'undefined' ? x : window.innerWidth - width - 4;
    const maxY = typeof window === 'undefined' ? y : window.innerHeight - height - 4;
    el.style.setProperty('--menu-x', `${String(Math.max(4, Math.min(x, maxX)))}px`);
    el.style.setProperty('--menu-y', `${String(Math.max(4, Math.min(y, maxY)))}px`);
  }, [x, y]);
  useEffect(() => {
    menu.current
      ?.querySelector<HTMLElement>('button:not(:disabled)')
      ?.focus({ preventScroll: true });
    if (typeof window === 'undefined') return undefined;
    const close = (): void => {
      onClose(false);
    };
    window.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, []);
  return (
    <>
      <div
        class="item-menu-backdrop"
        onPointerDown={() => {
          onClose(false);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose(false);
        }}
      />
      <div
        ref={menu}
        class="item-menu pix-panel"
        role="menu"
        aria-label={`${name}: actions`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose(true);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const buttons = [
              ...(menu.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []),
            ];
            const at = buttons.findIndex((b) => b === document.activeElement);
            const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
            buttons[(next + buttons.length) % buttons.length]?.focus();
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onInspect();
          }}
        >
          Inspect
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect();
          }}
        >
          {chosen ? 'Deselect' : 'Select'}
        </button>
      </div>
    </>
  );
}
