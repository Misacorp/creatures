import type { TalentView } from './talent-types';
import { talentTextParts } from './talent-view';

/**
 * One talent: its name, its effect in one phrase ("First pounce +14%") and, when asked, one plain sentence
 * about it. A golden talent has no frame: its title shimmers gold and so does the number golden
 * raised; screen readers hear "golden" after the title, so colour never carries it alone.
 * A talent that does nothing for the creature that holds it says so. Every word comes from the server's
 * view of the content and is drawn as text.
 */
export function TalentChip({
  talent,
  about = false,
  class: extra,
}: {
  talent: TalentView;
  /** Also show the sentence about what it does. */
  about?: boolean;
  class?: string;
}) {
  const classes = ['talent-chip', talent.golden ? 'golden' : '', talent.idle ? 'idle' : '', extra]
    .filter((c) => c !== undefined && c !== '')
    .join(' ');
  const parts = talent.golden ? talentTextParts(talent.text) : null;
  return (
    <span class={classes}>
      <span class="talent-line">
        <strong class="talent-name pix">
          {talent.name}
          {talent.golden && <span class="visually-hidden"> (golden)</span>}
        </strong>
        <span class="talent-text">
          {parts === null ? (
            talent.text
          ) : (
            <>
              {parts.before}
              {parts.value !== null && <span class="gold-shimmer">{parts.value}</span>}
              {parts.after}
            </>
          )}
        </span>
      </span>
      {about && <span class="talent-about muted">{talent.about}</span>}
      {talent.idle && <span class="talent-idle muted">Does nothing for this creature.</span>}
    </span>
  );
}
