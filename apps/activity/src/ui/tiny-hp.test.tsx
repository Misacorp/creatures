import type { EventNames, FightEvent } from '@creatures/engine';
import { afterEach, describe, expect, it } from 'vitest';
import live from '../fixtures/live-mid.json';
import type { ReplayRowEntry } from '../raid-api';
import { Stage } from '../Stage';
import { byClass, createPage, type Page } from '../test-dom';
import { hpShare } from '../hp-share';
import { TinyHp } from './TinyHp';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

describe('the tiny HP bar', () => {
  const classOf = (current: number, max: number): string => {
    page?.unmount();
    page = createPage();
    page.draw(<TinyHp current={current} max={max} />);
    return byClass(page.root, 'tiny-hp')[0]?.getAttribute('class') ?? '';
  };

  it('is green when healthy, red at 30% or less, and faded at 0', () => {
    expect(classOf(700, 1000)).toBe('tiny-hp');
    expect(classOf(300, 1000)).toBe('tiny-hp low');
    expect(classOf(0, 1000)).toBe('tiny-hp low empty');
  });

  it('fills by the share of HP left, clamped to the bar', () => {
    expect(hpShare(250, 1000)).toBe(0.25);
    expect(hpShare(1500, 1000)).toBe(1);
    expect(hpShare(-5, 1000)).toBe(0);
    expect(hpShare(10, 0)).toBe(0);
  });
});

describe('the raid stage with HP', () => {
  const NAMES = live.names as unknown as EventNames;
  const BASE = live.row.slice(0, 3) as ReplayRowEntry[];
  const first = BASE[0];
  if (first === undefined) throw new Error('no creature');
  const events: FightEvent[] = [
    { t: 'round_start', round: 1, bossHp: 1000, mark: null },
    { t: 'boss_hit', round: 1, source: 'attack', target: first.id, damage: 80 },
  ];
  const draw = (row: ReplayRowEntry[]) => {
    page = createPage();
    page.draw(
      <Stage
        boss={{ id: 'old-bogback', name: 'Old Bogback', element: 'mire' }}
        hpMax={1000}
        hpStart={1000}
        rounds={12}
        row={row}
        mineIds={new Set<string>()}
        names={NAMES}
        events={events}
        index={events.length}
        anim={null}
      />,
    );
    return page.root;
  };

  it('draws a tiny bar under each creature once the row carries HP, and the hit lowers it', () => {
    const bars = byClass(
      draw(BASE.map((c) => ({ ...c, hp: { start: 100, max: 100 } }))),
      'tiny-hp',
    );
    expect(bars).toHaveLength(3);
    // The first took 80 of its 100: red. The others are untouched.
    expect(bars.map((b) => b.getAttribute('class'))).toEqual(['tiny-hp low', 'tiny-hp', 'tiny-hp']);
  });

  it('draws none before the fight (no HP in the row)', () => {
    expect(byClass(draw(BASE), 'tiny-hp')).toHaveLength(0);
  });
});
