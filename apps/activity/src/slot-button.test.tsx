import { afterEach, describe, expect, it } from 'vitest';
import { SlotButton, type SlotModel } from './ui/SlotButton';
import { byClass, createPage, type Page } from './test-dom';
import { dropOutcome } from './slot-outcome';
import { useDragDrop } from './use-drag-drop';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function slotOf(auto: boolean): SlotModel {
  return {
    index: 0,
    ariaLabel: 'Front, lane 1, Cindle level 4, you',
    hideNumber: true,
    occupant: {
      species: 'cindle',
      name: 'Cindle',
      level: 4,
      ownId: 'c1',
      mine: true,
      auto,
      owner: { colour: 0, initial: 'M' },
      element: 'ember',
    },
  };
}

function Tile(props: { auto: boolean }) {
  const drag = useDragDrop({
    disabled: false,
    stripRef: { current: null },
    onDrop: () => dropOutcome('none', null, null, ''),
  });
  return (
    <SlotButton
      slot={slotOf(props.auto)}
      scale={3}
      emptyLabel="Add"
      disabled={false}
      status={null}
      over={false}
      shaking={false}
      dragging={drag.drag?.creatureId ?? null}
      cue={undefined}
      onHover={undefined}
      onPointerDown={() => undefined}
      onTap={() => undefined}
    />
  );
}

function draw(auto: boolean): Page {
  page = createPage();
  page.draw(<Tile auto={auto} />);
  return page;
}

describe('a tile of a creature that joins by itself', () => {
  it('is marked auto with a class for the dashed outline and a small tag', () => {
    const { root } = draw(true);
    const button = byClass(root, 'party-slot')[0];
    expect(button?.getAttribute('class')).toContain('auto');
    const tag = byClass(root, 'slot-auto');
    expect(tag).toHaveLength(1);
    expect(tag[0]?.textContent).toBe('auto');
  });

  it('a placed tile has neither the class nor the tag', () => {
    const { root } = draw(false);
    expect(byClass(root, 'party-slot')[0]?.getAttribute('class')).not.toContain('auto');
    expect(byClass(root, 'slot-auto')).toHaveLength(0);
  });
});
