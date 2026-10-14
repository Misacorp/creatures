import type { ComponentChildren } from 'preact';

/** Text only a screen reader hears, announced politely when it changes. */
export function LiveRegion({ children }: { children: ComponentChildren }) {
  return (
    <p class="visually-hidden" role="status" aria-live="polite">
      {children}
    </p>
  );
}
