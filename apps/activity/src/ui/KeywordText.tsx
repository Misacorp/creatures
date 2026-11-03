import { GLOSSARY_IDS } from '@creatures/game';
import { chipParts } from '../combat-v2-view';
import { Tag } from './Tag';

/**
 * A combat v2 text (a Knack's, a talent's) with its keywords as chips: a word the content puts in braces
 * (`{Mark}`, `{Reaction}`) is drawn as a `Tag`, with any letters that run on after it ("{Spend}s") inside the chip, and
 * the rest as plain words, all as text. A text with no braces is just its words, so v1 text passes through unchanged.
 * Put it inside the line it belongs to (a `.prose` paragraph, a choice's line); it adds no box of its own.
 *
 * A chip is tap-for-help like every other tag (the keyword's glossary entry opens in the popover, with a link to
 * How to play). A chip is a button, and a button must not sit inside another one, so a text drawn inside a button
 * (a choice in a picker, a slot that opens a drawer) passes `help={false}` and gets plain chips.
 */
export function KeywordText({ text, help = true }: { text: string; help?: boolean }) {
  return (
    <>
      {chipParts(text).map((part, index) =>
        part.keyword ? (
          <Tag
            key={index}
            {...(help && part.name !== undefined ? { entry: GLOSSARY_IDS.keyword(part.name) } : {})}
          >
            {part.text}
          </Tag>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
