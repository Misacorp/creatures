import type { RefObject } from 'preact';
import { Sprite } from '../sprites/Sprite';
import { creatureSpriteOrFallback } from '../sprites/creature-sprites';

/**
 * What follows the pointer while a creature is dragged. `ghostRef` is the drag hook's: it moves the
 * element with CSS custom properties. Nothing is drawn when no creature is carried.
 */
export function DragGhost({
  ghostRef,
  creature,
}: {
  ghostRef: RefObject<HTMLDivElement | null>;
  creature: { species: string; name: string } | undefined;
}) {
  if (creature === undefined) return null;
  return (
    <div ref={ghostRef} class="drag-ghost" aria-hidden="true">
      <Sprite sprite={creatureSpriteOrFallback(creature.species)} scale={4} />
      <span class="drag-ghost-name">{creature.name}</span>
    </div>
  );
}
