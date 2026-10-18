import { itemStat, type GearItem as RulesItem } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { GearItem } from '../gear-types';
import { rulesItemOf } from './compare-view';
import { pageScene } from './sample';

/** The client item as the rules read it: its own stats come out as the server listed them. */

function scene(kind: 'level 15') {
  return pageScene(kind);
}

describe('rulesItemOf', () => {
  it('gives the rules an item whose own stats are the ones the server listed, local lines included', () => {
    const { gear } = scene('level 15');
    for (const item of gear.items) {
      const rules = rulesItemOf(item);
      expect(rules, item.baseId).not.toBeNull();
      for (const stat of item.stats) {
        expect(itemStat(rules as RulesItem, stat.stat)?.value, `${item.baseId} ${stat.stat}`).toBe(
          stat.value,
        );
      }
    }
  });

  it('is null for a base the content does not have', () => {
    const { gear } = scene('level 15');
    const item = gear.items[0] as GearItem;
    expect(rulesItemOf({ ...item, baseId: 'no-such-base' })).toBeNull();
  });
});
