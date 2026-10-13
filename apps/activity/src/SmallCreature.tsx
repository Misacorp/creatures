import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { creatureButtonLabel, type CreatureInfo } from './creature-popover';
import { useGlossary } from './Glossary';

/**
 * A small creature sprite (or a small group of marks around one) that opens the creature popover
 * when tapped: its name, level, role and element as tags, and a switch to a tag's glossary entry
 * inside the same popover (see `creature-popover.ts` and `Glossary.tsx`). It is a real button, so
 * Enter and Space open it and Escape closes it or goes back. The popover lives in the app's
 * glossary layer, which makes it work in the stage, in lists and in cards alike.
 *
 * Use it where a creature is only displayed. Do not put it inside another button, and leave it out
 * of rows that are dragged or tapped to select (a tap there already means something). Without the
 * glossary provider it is plain markup.
 */
export function SmallCreature(props: {
  info: CreatureInfo;
  /** Distinguishes this creature from another with the same look (its id). */
  id: string;
  class?: string;
  /** What assistive technology says instead of the default; keep the creature's name in it. */
  label?: string;
  children: ComponentChildren;
}) {
  const api = useGlossary();
  const ref = useRef<HTMLButtonElement>(null);
  const classes = props.class === undefined ? 'small-creature' : `small-creature ${props.class}`;
  if (api === null) return <span class={props.class}>{props.children}</span>;
  const open = api.creature !== null && api.creature.anchor === ref.current;
  return (
    <button
      ref={ref}
      type="button"
      class={classes}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={props.label ?? creatureButtonLabel(props.info)}
      onClick={() => {
        if (ref.current !== null) api.toggleCreature(props.id, props.info, ref.current);
      }}
    >
      {props.children}
    </button>
  );
}
