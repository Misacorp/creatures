import { chipParts } from '../combat-v2-view';
import { Tag } from './Tag';

/**
 * A combat v2 text (a Knack's, a talent's) with its keywords as chips: a word the content puts in braces
 * (`{Mark}`, `{Reaction}`) is drawn as a `Tag`, with any letters that run on after it ("{Spend}s") inside the chip, and the rest as plain words, all as text. A text with no braces
 * is just its words, so v1 text passes through unchanged. Put it inside the line it belongs to (a `.prose`
 * paragraph, a choice's line); it adds no box of its own.
 */
export function KeywordText({ text }: { text: string }) {
  return (
    <>
      {chipParts(text).map((part, index) =>
        part.keyword ? <Tag key={index}>{part.text}</Tag> : part.text,
      )}
    </>
  );
}
