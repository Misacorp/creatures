import { GLOSSARY_IDS } from '@creatures/game';
import { elementName } from '../game';
import { GlossaryTag } from '../Glossary';
import { elementIcon } from './element-icons';
import { Sprite } from './Sprite';

/**
 * An element's icon and name as a tag, plus the role as a second tag when it is known. Colour is
 * never the only cue. Each one opens its glossary popover when tapped, so this must not be placed
 * inside another button.
 */
export function ElementChip({ element, role }: { element: string; role?: string }) {
  const icon = elementIcon(element);
  const safe = /^[a-z-]+$/.test(element) ? element : 'unknown';
  const roleId = role === undefined ? '' : role.toLowerCase();
  return (
    <>
      <GlossaryTag entry={GLOSSARY_IDS.element(safe)} look="chip" class={`chip t-${safe}`}>
        {icon !== undefined && <Sprite sprite={icon} scale={2} />}
        <span class="chip-text">{elementName(element)}</span>
      </GlossaryTag>
      {roleId !== '' && (
        <GlossaryTag entry={GLOSSARY_IDS.role(roleId)} look="chip" class="chip role-chip">
          <span class="chip-text">{role}</span>
        </GlossaryTag>
      )}
    </>
  );
}
