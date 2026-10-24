import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { GlossarySection } from '@creatures/game';

export interface HowToState {
  section: GlossarySection | null;
  nonce: number;
}

/**
 * The element focus goes back to when How to play closes: the one that had focus when it opened (a
 * glossary link, the Settings button), if it is still on the page; else the "?" (before a game), else the
 * HUD cog; else the main region itself.
 */
export function focusTarget(
  opener: HTMLElement | null,
  help: HTMLElement | null,
  main: HTMLElement | null,
): HTMLElement | null {
  if (opener !== null && opener.isConnected) return opener;
  if (help !== null && help.isConnected) return help;
  const cog = main?.querySelector<HTMLElement>('.hud-gear') ?? null;
  return cog ?? main;
}

/**
 * The How to play page's open state. Opening remembers where focus was; closing puts it back there, and
 * while the page is open `main` is inert so nothing behind it can be reached.
 */
export function useHowTo(
  mainRef: RefObject<HTMLElement | null>,
  helpRef: RefObject<HTMLElement | null>,
): {
  howTo: HowToState | null;
  open: (section: GlossarySection | null) => void;
  close: () => void;
} {
  const [howTo, setHowTo] = useState<HowToState | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const isOpen = howTo !== null;
    mainRef.current?.toggleAttribute('inert', isOpen);
    if (wasOpen.current && !isOpen) {
      focusTarget(opener.current, helpRef.current, mainRef.current)?.focus();
      opener.current = null;
    }
    wasOpen.current = isOpen;
  }, [howTo !== null]);

  return {
    howTo,
    open: (section) => {
      if (!wasOpen.current && opener.current === null) {
        // Tests run on a fake DOM without the `HTMLElement` class, so no `instanceof` here.
        opener.current = document.activeElement as HTMLElement | null;
      }
      setHowTo((current) => ({ section, nonce: (current?.nonce ?? 0) + 1 }));
    },
    close: () => {
      setHowTo(null);
    },
  };
}
