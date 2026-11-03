import { glyphOrUnknown } from './glyphs';
import { Sprite } from './sprites/Sprite';
import type { TalentView } from './talent-types';
import { talentTextParts } from './talent-view';
import { KeywordText } from './ui/KeywordText';

/**
 * The visible mark of a golden talent: the star glyph and the word "Golden", beside the gold look, so a golden talent reads without
 * colour (and a screen reader hears the word). Every place that shows a talent draws it for a golden one.
 */
export function GoldenMark() {
  return (
    <span class="golden-mark">
      <Sprite sprite={glyphOrUnknown('sparkle')} scale={1} />
      Golden
    </span>
  );
}

/**
 * One talent: its name, its effect in one phrase ("First pounce +14%") and, when asked, one plain sentence
 * about it. A golden talent has no frame: its title shimmers gold and so does the number golden
 * raised, and a star with the word "Golden" (`GoldenMark`) stands beside the title, so colour never carries it alone.
 * A talent that does nothing for the creature that holds it says so. Every word comes from the server's
 * view of the content and is drawn as text; a combat v2 talent's keywords (`{Mark}`) are chips (`KeywordText`).
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
        <strong class="talent-name pix">{talent.name}</strong>
        {talent.golden && <GoldenMark />}
        <span class="talent-text">
          {parts === null ? (
            <KeywordText text={talent.text} />
          ) : (
            <>
              <KeywordText text={parts.before} />
              {parts.value !== null && <span class="gold-shimmer">{parts.value}</span>}
              <KeywordText text={parts.after} />
            </>
          )}
        </span>
      </span>
      {about && <span class="talent-about muted">{talent.about}</span>}
      {talent.idle && <span class="talent-idle muted">Does nothing for this creature.</span>}
    </span>
  );
}
