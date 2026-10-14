import type { ComponentChildren } from 'preact';
import { TAG_ATTRIBUTE, resolveTag, type TagRef } from './glossary-ui';
import { usePopoverTrigger } from './PopoverHost';
import { popupProps } from './ui/Popover';

type TagProps = (
  { entry: string; ability?: undefined } | { ability: string; entry?: undefined }
) & {
  /**
   * `text`: a dotted underline under the words. `chip`: the element is already a pixel chip or tag
   * (give it the chip's own classes with `class`), and gets a small "?" after its text. `help`: a
   * tiny "?" button on its own, for things that are buttons themselves (children are ignored).
   */
  look?: 'text' | 'chip' | 'help';
  /** What assistive technology says instead of the visible text. */
  label?: string;
  /** With `look="chip"`: a tag without the "?" (a mark, a modifier icon, a streak). */
  bare?: boolean;
  class?: string;
  children?: ComponentChildren;
};

/**
 * A tag that explains itself: tapping it (or Enter or Space) opens a popover with a short text, a
 * picture and a link to the How to play page; Escape or a tap elsewhere closes it. It is a real
 * button, so it never takes part in drag and drop (the drag code ignores presses that start on a
 * tag), and it must not be placed inside another button. Without a provider, or for an id the
 * content does not know, it is plain text.
 */
export function GlossaryTag(props: TagProps) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const target: TagRef =
    props.ability === undefined ? { entry: props.entry } : { ability: props.ability };
  const view = resolveTag(target);
  const look = props.look ?? 'text';
  const plainClass = props.class;
  if (host === null || view === undefined) {
    return look === 'help' ? null : <span class={plainClass}>{props.children}</span>;
  }
  const classes = [
    'gtag',
    look === 'text' ? '' : `gtag-${look}`,
    look === 'chip' && props.bare === true ? 'gtag-bare' : '',
    plainClass ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = props.label ?? (look === 'help' ? `What is ${view.title}?` : undefined);
  const attributes = { [TAG_ATTRIBUTE]: '' };
  return (
    <button
      ref={ref}
      type="button"
      class={classes}
      {...popupProps(open)}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...attributes}
      onClick={() => {
        if (ref.current !== null) host.openTag(target, ref.current);
      }}
    >
      {look === 'help' ? '?' : props.children}
    </button>
  );
}
