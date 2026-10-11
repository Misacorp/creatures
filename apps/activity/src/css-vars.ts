/**
 * Sets CSS custom properties on an element through the CSS object model (`style.setProperty`), which
 * the Activity's CSP allows. Inline `style="..."` attributes are not used anywhere. Use it as a
 * `ref`: `<span ref={cssVars({ '--pct': '60%' })} />`; the stylesheet reads `var(--pct)`.
 */
export function cssVars(vars: Readonly<Record<string, string | number>>) {
  return (el: HTMLElement | null): void => {
    if (el === null) return;
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, String(value));
  };
}
