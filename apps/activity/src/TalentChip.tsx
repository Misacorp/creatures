import { Tag } from './ui/Tag';
import type { TalentView } from './talent-types';

/**
 * One talent: its name, its effect in one phrase ("First pounce +14%") and, when asked, one plain sentence
 * about it. A golden talent has a gold frame and also says "Golden", so colour never carries it alone.
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
  return (
    <span class={classes}>
      <span class="talent-line">
        <strong class="talent-name pix">{talent.name}</strong>
        <span class="talent-text">{talent.text}</span>
        {talent.golden && (
          <Tag kind="badge" tone="shiny" entry="golden-talent">
            Golden
          </Tag>
        )}
      </span>
      {about && <span class="talent-about muted">{talent.about}</span>}
      {talent.idle && <span class="talent-idle muted">Does nothing for this creature.</span>}
    </span>
  );
}
