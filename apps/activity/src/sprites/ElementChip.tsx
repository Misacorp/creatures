import { GLOSSARY_IDS } from '@creatures/game';
import { elementSlug } from '../art';
import { capitalize, elementName } from '../game';
import type { IconRef } from '../icon-ref';
import { Tag } from '../ui/Tag';
import { elementIcon } from './element-icons';
import { GameIcon } from '../ui/GameIcon';

/** The role of a creature as a chip (`role` is the role id, `guard` and so on). */
export function RoleChip({ role }: { role: string }) {
  return (
    <Tag kind="chip" tone="role-chip" entry={GLOSSARY_IDS.role(role)}>
      {capitalize(role)}
    </Tag>
  );
}

/**
 * Whose element it is, which decides what tapping it explains: a creature's (who it beats), a boss's or a
 * room boss's (who hits it hardest), an expedition place's (who lives there, what is found) or an item's (its
 * lines lean that way).
 */
export type ElementContext = 'creature' | 'boss' | 'place' | 'gear';

/** The glossary entry of an element in one context. */
export function elementEntry(element: string, context: ElementContext): string {
  switch (context) {
    case 'creature':
      return GLOSSARY_IDS.element(element);
    case 'boss':
      return GLOSSARY_IDS.bossElement(element);
    case 'place':
      return GLOSSARY_IDS.placeElement(element);
    case 'gear':
      return GLOSSARY_IDS.gearTag(element);
  }
}

interface ElementChipProps {
  element: string;
  /** Whose element it is (default a creature's): the entry a tap opens. */
  context?: ElementContext;
  /** A role id (`guard`...): shows the role as a second chip. */
  role?: string | undefined;
  /**
   * `tag` (default): chips that open their own glossary popover, so this must not be placed inside
   * another button. `button`: plain buttons that call `onOpen` with the glossary entry instead (the
   * creature popover shows the entry itself, in the same popover). `plain`: the same chips as
   * text only, with no tap, for inside a button or a list option (the roster picker).
   */
  as?: 'tag' | 'button' | 'plain';
  onOpen?: (entry: string) => void;
}

/** An element's icon and name as a chip, plus the role as a second one when it is known. Colour is never the only cue. */
export function ElementChip({
  element,
  context = 'creature',
  role,
  as = 'tag',
  onOpen,
}: ElementChipProps) {
  const safe = elementSlug(element);
  const entry = elementEntry(safe, context);
  const icon: IconRef | undefined =
    elementIcon(element) === undefined ? undefined : { kind: 'element', element };
  if (as === 'button') {
    const open = (entry: string) => () => {
      onOpen?.(entry);
    };
    return (
      <>
        <button
          type="button"
          class={`gtag gtag-chip chip t-${safe}`}
          aria-haspopup="dialog"
          onClick={open(entry)}
        >
          {icon !== undefined && <GameIcon icon={icon} scale={2} />}
          <span class="chip-text">{elementName(element)}</span>
        </button>
        {role !== undefined && (
          <button
            type="button"
            class="gtag gtag-chip chip role-chip"
            aria-haspopup="dialog"
            onClick={open(GLOSSARY_IDS.role(role))}
          >
            <span class="chip-text">{capitalize(role)}</span>
          </button>
        )}
      </>
    );
  }
  if (as === 'plain') {
    return (
      <>
        <Tag kind="chip" tone={`t-${safe}`} icon={icon}>
          {elementName(element)}
        </Tag>
        {role !== undefined && role !== '' && (
          <Tag kind="chip" tone="role-chip">
            {capitalize(role)}
          </Tag>
        )}
      </>
    );
  }
  return (
    <>
      <Tag kind="chip" tone={`t-${safe}`} entry={entry} icon={icon}>
        {elementName(element)}
      </Tag>
      {role !== undefined && role !== '' && <RoleChip role={role} />}
    </>
  );
}
