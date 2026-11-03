import type { GlossarySection } from '@creatures/game';
import { useEffect, useRef } from 'preact/hooks';
import { sectionDomId } from './glossary-ui';
import { pageSections, sectionOnPage } from './how-to-pages';
import { SectionArt } from './HowToPlayArt';
import { KeywordText } from './ui/KeywordText';

/**
 * The How to play page: a full-screen overlay (opened by the "?" in the header, or by a popover's
 * "More in How to play" link) with its sections in order, each with a small picture and a
 * few short lines. All text comes from the content (`howToPlay`, or while the server plays combat v2
 * `howToPlayV2` and the shipped sections it keeps, see `how-to-pages.ts`). A `{Keyword}` in a line is a chip
 * that opens the keyword's help. Escape or the Close button closes it. `section` scrolls to that section when the page opens or the link is used again
 * (`nonce` changes each time, so the same section can be asked for twice).
 */
export function HowToPlay({
  section,
  nonce,
  onClose,
  v2 = false,
}: {
  section: GlossarySection | null;
  nonce: number;
  onClose: () => void;
  /** The server plays combat v2 (`/api/config`'s `combatV2`): the combat v2 sections instead of the shipped combat ones. */
  v2?: boolean;
}) {
  const sections = pageSections(v2);
  const target = sectionOnPage(section, v2, sections);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Nothing behind the page is reachable while it is open, and the page behind does not scroll.
  useEffect(() => {
    document.body.classList.add('howto-open');
    return () => {
      document.body.classList.remove('howto-open');
    };
  }, []);

  useEffect(() => {
    if (target === null) {
      panelRef.current?.scrollTo(0, 0);
      closeRef.current?.focus();
      return;
    }
    const element = document.getElementById(sectionDomId(target));
    element?.scrollIntoView({ block: 'start' });
    element?.focus({ preventScroll: true });
  }, [target, nonce]);

  return (
    <div
      class="howto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="howto-title"
      ref={panelRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header class="howto-head">
        <h2 id="howto-title" class="pix">
          How to play
        </h2>
        <button type="button" ref={closeRef} class="howto-close" onClick={onClose}>
          Close
        </button>
      </header>
      <div class="howto-body">
        {sections.map((s, i) => (
          <section
            key={s.id}
            id={sectionDomId(s.id)}
            class="howto-section"
            aria-labelledby={`${sectionDomId(s.id)}-title`}
            tabIndex={-1}
          >
            <h3 id={`${sectionDomId(s.id)}-title`} class="pix">
              <span class="howto-num" aria-hidden="true">
                {i + 1}
              </span>
              {s.title}
            </h3>
            <div class="howto-art">
              <SectionArt id={s.id} />
            </div>
            <ul class="howto-lines">
              {s.lines.map((line, j) => (
                <li key={j}>
                  <KeywordText text={line} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p class="howto-end">
          <button type="button" class="primary" onClick={onClose}>
            Close
          </button>
        </p>
      </div>
    </div>
  );
}
