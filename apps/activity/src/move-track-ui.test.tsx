import type { EventNames, FightEvent } from '@creatures/engine';
import { content } from '@creatures/game';
import { afterEach, describe, expect, it } from 'vitest';
import live from './fixtures/live-mid.json';
import { moveTrack } from './move-track';
import type { ReplayRowEntry } from './raid-api';
import { Stage } from './Stage';
import { MoveTrack } from './stage/MoveTrack';
import { byClass, createPage, visibleText, type FakeElement, type Page } from './test-dom';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
});

const tidal = content.bosses.find((b) => b.id === 'tidal-colossus');
if (tidal === undefined) throw new Error('no Tidal Colossus');

describe('the move track, a row per round', () => {
  it('puts each round in a row, this round on top, its moves side by side', () => {
    page = createPage();
    page.draw(<MoveTrack track={moveTrack(tidal, 4, 12)} round={4} />);
    const rows = byClass(page.root, 'track-round');
    const row = (k: number): FakeElement => {
      const r = rows[k];
      if (r === undefined) throw new Error(`no row ${String(k)}`);
      return r;
    };
    const labels = rows.map((r) => byClass(r, 'track-round-label')[0]);
    // This round: a pointer, no words; then the rounds to go.
    expect(labels[0] && byClass(labels[0], 'track-now-mark')).toHaveLength(1);
    expect(labels.slice(1).map((l) => (l === undefined ? '' : visibleText(l)))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    // Round 4: Riptide strikes and Great Wave marks (faint); round 5: Great Wave lands.
    expect(byClass(row(0), 'track-move')).toHaveLength(2);
    expect(byClass(row(0), 'marking')).toHaveLength(1);
    expect(byClass(row(1), 'track-move')).toHaveLength(1);
    expect(byClass(row(1), 'marking')).toHaveLength(0);
  });
});

describe('the stage around the boss', () => {
  const NAMES = live.names as unknown as EventNames;
  const ROW = live.row.slice(0, 4) as ReplayRowEntry[];
  const events: FightEvent[] = [
    { t: 'round_start', round: 12, bossHp: 1000, mark: null },
    { t: 'gimmick', round: 12, gimmick: 'backdraft', op: 'reflect_first_reaction' },
    { t: 'round_end', round: 12, bossHp: 900 },
  ];
  const draw = (index: number) => {
    page?.unmount();
    page = createPage();
    page.draw(
      <Stage
        boss={{ id: 'cinder-wyrm', name: 'Cinder Wyrm', element: 'ember' }}
        hpMax={1000}
        hpStart={1000}
        rounds={12}
        row={ROW}
        mineIds={new Set<string>()}
        names={NAMES}
        events={events}
        index={index}
        anim={null}
      />,
    );
    return page.root;
  };

  it('raises a barrier over the boss while Backdraft is armed', () => {
    expect(byClass(draw(1), 'barrier')).toHaveLength(0);
    const up = byClass(draw(2), 'barrier');
    expect(up).toHaveLength(1);
    expect(up[0]?.getAttribute('class')).toContain('th-fire');
  });

  it('shows the track until the fight is over, and none after the last round', () => {
    expect(byClass(draw(2), 'move-track')).toHaveLength(1);
    expect(byClass(draw(3), 'move-track')).toHaveLength(0);
  });

  it('writes no acting order under the creatures (the move track says what comes)', () => {
    const first = ROW[0];
    if (first === undefined) throw new Error('no creature');
    page?.unmount();
    page = createPage();
    const turns: FightEvent[] = [
      { t: 'round_start', round: 1, bossHp: 1000, mark: null },
      { t: 'turn', round: 1, creature: first.id },
    ];
    page.draw(
      <Stage
        boss={{ id: 'cinder-wyrm', name: 'Cinder Wyrm', element: 'ember' }}
        hpMax={1000}
        hpStart={1000}
        rounds={12}
        row={ROW}
        mineIds={new Set<string>()}
        names={NAMES}
        events={turns}
        // The round has begun; its order is known from its first beat.
        index={1}
        anim={null}
      />,
    );
    expect(visibleText(page.root)).not.toMatch(/\b\d+(st|nd|rd|th)\b/);
    expect(byClass(page.root, 'unit-slot')).toHaveLength(0);
  });
});
