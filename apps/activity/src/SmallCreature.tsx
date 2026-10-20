import type { ComponentChildren } from 'preact';
import { creatureButtonLabel, type CreatureInfo } from './creature-info';
import { usePopoverTrigger, type CreatureAction } from './PopoverHost';
import { popupProps } from './ui/Popover';

/**
 * A small creature sprite (or a small group of marks around one) that opens the creature popover
 * when tapped: its name, level, role and element as tags, and a switch to a tag's glossary entry
 * inside the same popover (see `PopoverHost.tsx`). It is a real button, so Enter and Space open it
 * and Escape closes it or goes back. The popover lives in the app's popover layer, which makes it
 * work in the stage, in lists and in cards alike.
 *
 * Use it where a creature is only displayed. Do not put it inside another button, and leave it out
 * of rows that are dragged or tapped to select (a tap there already means something). Without the
 * popover host it is plain markup.
 */
export function SmallCreature(props: {
  info: CreatureInfo;
  /** Distinguishes this creature from another with the same look (its id). */
  id: string;
  class?: string;
  /** What assistive technology says instead of the default; keep the creature's name in it. */
  label?: string;
  /** Buttons under the creature's facts in the popover (each closes the popover first), for example "Move". */
  action?: CreatureAction | readonly CreatureAction[];
  children: ComponentChildren;
}) {
  const { host, ref, open } = usePopoverTrigger<HTMLButtonElement>();
  const classes = props.class === undefined ? 'small-creature' : `small-creature ${props.class}`;
  if (host === null) return <span class={props.class}>{props.children}</span>;
  return (
    <button
      ref={ref}
      type="button"
      class={classes}
      {...popupProps(open)}
      aria-label={props.label ?? creatureButtonLabel(props.info)}
      onClick={() => {
        if (ref.current === null) return;
        if (props.action === undefined) host.openCreature(props.id, props.info, ref.current);
        else host.openCreature(props.id, props.info, ref.current, props.action);
      }}
    >
      {props.children}
    </button>
  );
}
