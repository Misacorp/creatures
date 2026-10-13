import { ItemSprite } from '../GearArt';
import { partIcon } from '../gear-sprites';
import { glyphOrUnknown } from '../glyphs';
import type { IconRef } from '../icon-ref';
import { Sprite } from '../sprites/Sprite';
import { elementIcon } from '../sprites/element-icons';

/** One icon at one fixed size, whatever it is. Decoration: hidden from assistive technology. */
export function GameIcon({ icon, scale = 3 }: { icon: IconRef; scale?: number }) {
  switch (icon.kind) {
    case 'glyph':
    case 'supply':
      return <Sprite sprite={glyphOrUnknown(icon.id)} scale={scale} />;
    case 'part':
      return <Sprite sprite={partIcon(icon.part)} scale={scale} />;
    case 'gear':
      return <ItemSprite baseId={icon.baseId} scale={scale} />;
    case 'element':
      return (
        <Sprite sprite={elementIcon(icon.element) ?? glyphOrUnknown('unknown')} scale={scale} />
      );
  }
}
