import { elementName } from '../game';
import { elementIcon } from './element-icons';
import { Sprite } from './Sprite';

/** An element's icon and name, plus the role when it is known. Colour is never the only cue. */
export function ElementChip({ element, role }: { element: string; role?: string }) {
  const icon = elementIcon(element);
  const safe = /^[a-z-]+$/.test(element) ? element : 'unknown';
  return (
    <span class={`chip t-${safe}`}>
      {icon !== undefined && <Sprite sprite={icon} scale={2} />}
      <span class="chip-text">
        {elementName(element)}
        {role !== undefined && role !== '' && ` · ${role}`}
      </span>
    </span>
  );
}
