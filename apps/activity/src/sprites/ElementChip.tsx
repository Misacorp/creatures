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

interface ElementChipProps {
  element: string;
  /** A role id (`guard`...): shows the role as a second chip. */
  role?: string | undefined;
  /**
   * `tag` (default): chips that open their own glossary popover, so this must not be placed inside
   * another button. `button`: plain buttons that call `onOpen` with the glossary entry instead (the
   * creature popover shows the entry itself, in the same popover).
   */
  as?: 'tag' | 'button';
  onOpen?: (entry: string) => void;
}

/** An element's icon and name as a chip, plus the role as a second one when it is known. Colour is never the only cue. */
export function ElementChip({ element, role, as = 'tag', onOpen }: ElementChipProps) {
  const safe = elementSlug(element);
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
          onClick={open(GLOSSARY_IDS.element(safe))}
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
  return (
    <>
      <Tag kind="chip" tone={`t-${safe}`} entry={GLOSSARY_IDS.element(safe)} icon={icon}>
        {elementName(element)}
      </Tag>
      {role !== undefined && role !== '' && <RoleChip role={role} />}
    </>
  );
}
