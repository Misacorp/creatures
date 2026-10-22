import { afterEach, describe, expect, it, vi } from 'vitest';
import { DungeonMap } from './DungeonMap';
import { PopoverHost } from './PopoverHost';
import {
  SAMPLE_MAP,
  SAMPLE_MAP_VAULT,
  VAULT_MARK,
  sampleHistory,
  sampleState,
} from './dungeon-map-sample';
import { SAMPLE_CURSE, omitKey } from './dungeon-path-samples';
import { undercroftState, type UndercroftStage } from './dungeon-undercroft-sample';
import type { DungeonRunState } from './dungeon-types';
import {
  byClass,
  byName,
  byRole,
  createPage,
  visibleText,
  type FakeElement,
  type Page,
} from './test-dom';

let page: Page | null = null;

afterEach(() => {
  page?.unmount();
  page = null;
});

function first(list: FakeElement[]): FakeElement {
  const [el] = list;
  if (el === undefined) throw new Error('not found');
  return el;
}

/** A stage of the sample run (every stage but the preview has a run). */
function stageRun(stage: Parameters<typeof sampleState>[0]): DungeonRunState {
  const found = sampleState(stage);
  if (found === null) throw new Error('no run in this stage');
  return found;
}

function draw(vnode: Parameters<Page['draw']>[0]): Page {
  page = createPage();
  page.draw(vnode);
  return page;
}

describe('DungeonMap', () => {
  it('draws every room as a labelled button and every path in one SVG', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    const buttons = byClass(p.root, 'dmap-node');
    expect(buttons).toHaveLength(SAMPLE_MAP.nodes.length);
    for (const b of buttons) {
      expect(b.localName).toBe('button');
      expect(b.getAttribute('aria-label')).toMatch(/Show details$/);
    }
    const paths = byClass(p.root, 'dmap-edge');
    expect(paths).toHaveLength(SAMPLE_MAP.nodes.reduce((n, r) => n + r.next.length, 0));
    expect(byName(p.root, 'button', /^Floor boss: Coil Baron/)).toHaveLength(1);
  });

  it('marks the rooms by where the run stands', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} />);
    const status = (label: RegExp): string =>
      first(byName(p.root, 'button', label)).getAttribute('class') ?? '';
    expect(status(/Fight: Ember Mite/)).toContain('s-current');
    expect(first(byName(p.root, 'button', /Fight: Ember Mite/)).getAttribute('aria-current')).toBe(
      'step',
    );
    expect(status(/Fight: Drift Wisp/)).toContain('s-reachable');
    expect(status(/Fight: Ash Sprite/)).toContain('s-visited');
    // Still ahead (only not next): the normal dim. No path leads to it any more: greyed out.
    expect(status(/^Camp/)).toContain('s-locked');
    expect(status(/Fierce Moss Lurker/)).toContain('s-unreachable');
    expect(status(/Fight: Puddle Imp/)).toContain('s-unreachable');
    expect(byClass(p.root, 'dmap-edge').map((e) => e.getAttribute('class'))).toContain(
      'dmap-edge taken',
    );
  });

  it('opens the drawer on a tap, and Go closes it and calls onGo for a reachable room', () => {
    const onGo = vi.fn();
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={onGo} />);
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(visibleText(dialog)).toContain('Drift Wisp');
    expect(visibleText(dialog)).toContain('HP 380');
    expect(visibleText(dialog)).toContain('Echoing');
    p.click(first(byName(p.root, 'button', /^Go to /)));
    expect(onGo).toHaveBeenCalledWith('f2l1');
    expect(byRole(p.root, 'dialog')).toHaveLength(0);
  });

  it('has no Go in the preview, and says a room off the path is not on it', () => {
    const preview = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    preview.click(first(byName(preview.root, 'button', /^Fight: Puddle Imp/)));
    expect(byName(preview.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(preview.root)).not.toContain('Further ahead.');
    preview.unmount();

    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Camp/)));
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('Further ahead.');
    expect(visibleText(first(byRole(p.root, 'dialog')))).not.toContain("can't reach");
  });

  it('says a room no path leads to any more cannot be reached, and still shows what is there', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} />);
    expect(byClass(p.root, 'dmap-edge').map((e) => e.getAttribute('class'))).toContain(
      'dmap-edge unreachable',
    );
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
    expect(text).toContain("You can't reach this room any more.");
    expect(text).toContain('Fierce Moss Lurker');
    expect(text).toContain('HP 640');
    expect(
      first(byName(p.root, 'button', /^Fierce Moss Lurker/)).getAttribute('aria-label'),
    ).toContain('Out of reach');
  });

  it('greys nothing in the preview or in a finished run, and says a room the run skipped was not visited', () => {
    const preview = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    expect(byClass(preview.root, 's-unreachable')).toHaveLength(0);
    expect(byClass(preview.root, 'dmap-edge').map((e) => e.getAttribute('class'))).not.toContain(
      'dmap-edge unreachable',
    );
    preview.unmount();
    const done = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('finished')} />);
    expect(byClass(done.root, 's-unreachable')).toHaveLength(0);
    done.click(first(byName(done.root, 'button', /^Fierce Moss Lurker/)));
    expect(visibleText(first(byRole(done.root, 'dialog')))).toContain('Your run did not go here.');
  });

  it('waits on Go while busy', () => {
    const p = draw(
      <DungeonMap map={SAMPLE_MAP} state={sampleState('midway')} onGo={vi.fn()} busy />,
    );
    p.click(first(byName(p.root, 'button', /Fight: Drift Wisp/)));
    expect(first(byName(p.root, 'button', /^Go to /)).getAttribute('disabled')).not.toBeNull();
  });

  it('says what a mystery room, a cache and the camp are, with no Go while the camp waits', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState('camp')} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    expect(visibleText(p.root)).toContain("Something stirs. You'll see when you step in.");
    // An unvisited mystery room does not name its scene.
    expect(visibleText(first(byRole(p.root, 'dialog')))).not.toContain('The Singing Well');
    expect(byClass(p.root, 'dnd-event')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Cache/)));
    expect(visibleText(p.root)).toContain('Free loot: Bait and scrap for your pack.');
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Camp/)));
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain('The camp is waiting.');
    expect(byName(p.root, 'button', /^Go/)).toHaveLength(0);
  });

  it('puts a room\'s "?" right after the drawer title, not below the text', () => {
    const p = draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <DungeonMap map={SAMPLE_MAP} state={sampleState('camp')} onGo={vi.fn()} />
      </PopoverHost>,
    );
    for (const [label, title] of [
      [/^Mystery room/, 'Mystery room'],
      [/^Cache/, 'Cache'],
      [/^Camp/, 'Camp'],
    ] as const) {
      p.click(first(byName(p.root, 'button', label)));
      const dialog = first(byRole(p.root, 'dialog'));
      const heading = first(byClass(dialog, 'drawer-heading'));
      expect(first(byClass(heading, 'drawer-title')).textContent).toBe(title);
      const second = heading.childNodes[1] as { getAttribute?: (n: string) => string | null };
      expect(second.getAttribute?.('class') ?? '').toContain('gtag-help');
      // The dialog is named by the title alone, and the body has no "?" of its own.
      expect(byClass(first(byClass(dialog, 'dnd-plain')), 'gtag-help')).toHaveLength(0);
      p.click(first(byName(p.root, 'button', 'Close')));
    }
  });

  it('shows an elite as Fierce, with an Elite tag', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'dnd-name')[0]?.textContent).toBe('Fierce Moss Lurker');
    expect(visibleText(dialog)).toContain('Elite');
    expect(visibleText(dialog)).toContain('Thorns');
  });
});

describe('DungeonMap: what happened in a room the run has been through', () => {
  function open(stage: Parameters<typeof sampleState>[0], label: RegExp): string {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={sampleState(stage)} onGo={vi.fn()} />);
    p.click(first(byName(p.root, 'button', label)));
    return visibleText(first(byRole(p.root, 'dialog')));
  }

  it('tells a cleared fight: the foe, "HP 0 / max", Cleared, the rounds, the loot and the supply', () => {
    const text = open('midway', /^Fight: Ash Sprite/);
    expect(text).toContain('Ash Sprite');
    expect(text).toContain('HP 0 / 330');
    expect(text).toContain('Cleared');
    expect(text).toContain('Won in 4 rounds.');
    expect(text).toContain('Into your pack:');
    expect(text).toContain("Earned the run's supply.");
    expect(text).not.toContain('Defeat');
  });

  it('gives the standing room the same account (and no supply when an earlier fight earned it)', () => {
    const text = open('midway', /^Fight: Ember Mite/);
    expect(text).toContain('HP 0 / 360');
    expect(text).toContain('Cleared');
    expect(text).not.toContain("Earned the run's supply.");
  });

  it('gives an elite its keepsake', () => {
    const text = open('after-elite', /Fierce Moss Lurker/);
    expect(text).toContain('Cleared');
    expect(text).toContain('Lantern Moth');
    expect(text).toContain('Your creatures crit 5 points more often.');
    expect(text).not.toContain('Win it to earn a');
  });

  it('tells a lost fight in red words: Defeat and the HP the foe had left', () => {
    const lost: DungeonRunState = {
      ...stageRun('midway'),
      status: 'done',
      outcome: 'defeat',
      reachable: [],
      history: sampleHistory(SAMPLE_MAP, ['f0l1', 'f1l2'], { lostLast: true }),
    };
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={lost} />);
    p.click(first(byName(p.root, 'button', /^Fight: Ember Mite/)));
    const dialog = first(byRole(p.root, 'dialog'));
    const text = visibleText(dialog);
    expect(text).toContain('Defeat');
    expect(text).toContain('HP 108 / 360');
    expect(text).toContain('Your team fell after 5 rounds.');
    expect(byClass(dialog, 'bad').map((t) => visibleText(t))).toContain('Defeat');
    expect(text).toContain('Nothing went into the pack.');
  });

  it('tells a cache, a mystery room and the camp what they gave and what was picked', () => {
    const map = SAMPLE_MAP;
    const history = sampleHistory(map, ['f0l1', 'f1l1', 'f2l1', 'f3l1']);
    const base = stageRun('past-camp');
    const walked: DungeonRunState = { ...base, path: ['f0l1', 'f1l1', 'f2l1', 'f3l1'], history };
    const p = draw(<DungeonMap map={map} state={walked} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    let text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('The Singing Well');
    expect(text).toContain('You picked: Take one coin.');
    expect(text).toContain('You gain 1 scrap.');
    expect(text).not.toContain("Something stirs. You'll see when you step in.");
    p.click(first(byName(p.root, 'button', 'Close')));
    p.click(first(byName(p.root, 'button', /^Camp/)));
    text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('Rested: standing creatures recovered 40% HP.');
    expect(text).not.toContain('Rest, swap a creature');
    p.unmount();

    const cacheRun: DungeonRunState = {
      ...base,
      path: ['f0l1', 'f1l2', 'f2l2', 'f3l1'],
      history: sampleHistory(map, ['f0l1', 'f1l2', 'f2l2', 'f3l1']),
    };
    const q = draw(<DungeonMap map={map} state={cacheRun} />);
    q.click(first(byName(q.root, 'button', /^Cache/)));
    text = visibleText(first(byRole(q.root, 'dialog')));
    expect(text).toContain('Into your pack:');
    expect(text).not.toContain('Free loot: Bait and scrap for your pack.');
    expect(byClass(first(byRole(q.root, 'dialog')), 'part-count')).toHaveLength(2);
  });

  it('says what is still waiting in a mystery room or at the camp', () => {
    const waiting = (path: string[]): DungeonRunState => ({
      ...stageRun('camp'),
      path,
      history: sampleHistory(SAMPLE_MAP, path, { pendingLast: true }),
    });
    const camp = draw(
      <DungeonMap map={SAMPLE_MAP} state={waiting(['f0l1', 'f1l2', 'f2l1', 'f3l1'])} />,
    );
    camp.click(first(byName(camp.root, 'button', /^Camp/)));
    expect(visibleText(first(byRole(camp.root, 'dialog')))).toContain('The camp is waiting.');
    camp.unmount();
    const mystery = draw(
      <DungeonMap map={SAMPLE_MAP} state={{ ...waiting(['f0l1', 'f1l1']), at: 'f1l1' }} />,
    );
    mystery.click(first(byName(mystery.root, 'button', /^Mystery room/)));
    expect(visibleText(first(byRole(mystery.root, 'dialog')))).toContain(
      'A choice is waiting here.',
    );
  });

  it('shows the plain account of a room when the server sent no history', () => {
    const bare = omitKey(stageRun('midway'), 'history');
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={bare} />);
    p.click(first(byName(p.root, 'button', /^Fight: Ash Sprite/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('HP 330');
    expect(text).not.toContain('Cleared');
  });
});

describe('DungeonMap with the Undercroft', () => {
  const drawStage = (stage: UndercroftStage, props: { initialOpen?: string } = {}) => {
    const run = undercroftState(stage);
    return draw(
      <DungeonMap
        map={run.map}
        undercroft={run.undercroft?.maps}
        depth={run.depth}
        state={run}
        onGo={() => undefined}
        {...(props.initialOpen === undefined ? {} : { initialOpen: props.initialOpen })}
      />,
    );
  };
  const dialogText = (p: Page): string => visibleText(first(byRole(p.root, 'dialog')));

  it('draws the day alone as before, with no band, when there is nothing to show', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    expect(byClass(p.root, 'dmap-label')).toHaveLength(0);
    expect(byClass(p.root, 'dmap-uband')).toHaveLength(0);
  });

  it('has no band or text below the boss before the run goes down, and no extra room', () => {
    const p = drawStage('locked');
    expect(byClass(p.root, 'dmap-label')).toHaveLength(0);
    expect(byClass(p.root, 'dmap-uband')).toHaveLength(0);
    expect(visibleText(p.root)).not.toContain('beat the boss to descend');
    expect(byClass(p.root, 'dmap-node')).toHaveLength(undercroftState('locked').map.nodes.length);
  });

  it('stacks the level with its label, the rooms in the darker style, and lights across levels', () => {
    const run = undercroftState('entrance');
    const p = drawStage('entrance');
    expect(byClass(p.root, 'dmap-label').map((l) => visibleText(l))).toEqual([
      run.undercroft?.maps[0]?.label,
    ]);
    const nodes = byClass(p.root, 'dmap-node');
    const deep = nodes.filter((n) => /\bu\b/.test(n.getAttribute('class') ?? ''));
    expect(deep).toHaveLength(run.undercroft?.maps[0]?.nodes.length ?? -1);
    // The keeper is a crown of its own, not the floor boss's.
    const keeper = first(byName(p.root, 'button', /^Undercroft floor boss: Slag Tyrant/));
    expect(keeper.getAttribute('class')).toContain('k-boss');
    expect(keeper.getAttribute('class')).not.toContain('cracked');
    expect(byClass(keeper, 'dmap-crack')).toHaveLength(0);
    // The entrance floor of the level is what the run may go to; the day's boss is behind it.
    const reachable = nodes.filter((n) => (n.getAttribute('class') ?? '').includes('s-reachable'));
    expect(reachable).toHaveLength(2);
    expect(
      first(byName(p.root, 'button', /^Floor boss: Slag Tyrant/)).getAttribute('class'),
    ).toContain('s-visited');
    // A path of the level is drawn in its own colours.
    expect(
      byClass(p.root, 'dmap-edge').filter((e) => (e.getAttribute('class') ?? '').includes(' u')),
    ).not.toHaveLength(0);
  });

  it('marks a keeper on a cracked floor on the map and in its label and drawer', () => {
    const p = drawStage('cracked');
    const keeper = first(byName(p.root, 'button', /^Undercroft floor boss: Slag Tyrant/));
    expect(keeper.getAttribute('class')).toContain('cracked');
    expect(byClass(keeper, 'dmap-crack')).toHaveLength(1);
    expect(keeper.getAttribute('aria-label')).toContain('Cracked floor');
    p.click(keeper);
    expect(dialogText(p)).toContain(
      'A cracked floor: beat the floor boss to go down another floor.',
    );
    // The title says it is the Undercroft's floor boss once: no "Floor boss" tag, no "The Undercroft." line.
    const dialog = first(byRole(p.root, 'dialog'));
    expect(dialogText(p)).toContain('Undercroft floor boss');
    expect(dialogText(p)).not.toContain('The Undercroft.');
    expect(byClass(dialog, 'dnd-tags')[0]?.textContent ?? '').not.toContain('Floor boss');
    // The chest is badges, not a sentence.
    expect(dialogText(p)).toContain('Chest:');
    expect(byClass(dialog, 'part-count').map(visibleText)).toEqual(['2', '7', '80%']);
  });

  it('an uncracked keeper has no cracked-floor line', () => {
    const plain = drawStage('keeper', { initialOpen: 'u1f3l1' });
    expect(dialogText(plain)).not.toContain('cracked floor');
    expect(dialogText(plain)).toContain('Chest:');
  });

  it('stacks a second level below the first, whose floor boss stands on a cracked floor', () => {
    const p = drawStage('cracked-deeper');
    expect(byClass(p.root, 'dmap-label')).toHaveLength(2);
    const labels = byClass(p.root, 'dmap-label').map((l) => visibleText(l));
    expect(labels[0]).toContain('Undercroft 1');
    expect(labels[0]).toContain('The floor boss stands on a cracked floor.');
    expect(labels[1]).toContain('Undercroft 2');
    const lit = byClass(p.root, 'dmap-node').filter((n) =>
      (n.getAttribute('class') ?? '').includes('s-reachable'),
    );
    expect(lit).toHaveLength(2);
  });

  it('opens a carved door that says what it could add, with its glossary tag and a Go', () => {
    const p = drawStage('door-ahead', { initialOpen: 'f5l1' });
    const text = dialogText(p);
    expect(text).toContain('Carved door');
    expect(text).toContain(
      'Step through to add one room to the first Undercroft floor: a fight, an elite fight, a mystery room, a cache, a camp or an epic fight. You find out which when you descend.',
    );
    expect(byName(first(byRole(p.root, 'dialog')), 'button', /^Go to Carved door/)).toHaveLength(1);
  });

  it('says what a door did once walked through', () => {
    const walked = drawStage('door-walked', { initialOpen: 'f5l1' });
    expect(dialogText(walked)).toContain('Added a room to the first Undercroft floor.');
    expect(dialogText(walked)).not.toContain('Step through');
  });

  it('says "Nothing more to add." for a door past the limit', () => {
    const none = undercroftState('door-walked');
    page = draw(
      <DungeonMap
        map={none.map}
        state={{
          ...none,
          history: (none.history ?? []).map((e) =>
            e.result === 'door' ? { ...e, added: false } : e,
          ),
        }}
        initialOpen="f5l1"
      />,
    );
    expect(dialogText(page)).toContain('Nothing more to add.');
  });

  it('a door below depth 8 looks like any unvisited mystery room, and says it was quiet once walked into', () => {
    const quiet = drawStage('quiet-room', { initialOpen: 'f5l1' });
    expect(dialogText(quiet)).not.toContain('Quiet room');
    expect(dialogText(quiet)).toContain("Something stirs. You'll see when you step in.");
  });

  it('says a quiet room was quiet after the run stepped into it', () => {
    const run = undercroftState('quiet-room');
    page = draw(
      <DungeonMap
        map={run.map}
        state={{ ...run, at: 'f5l1', path: [...run.path, 'f5l1'], reachable: [] }}
        initialOpen="f5l1"
      />,
    );
    expect(dialogText(page)).toContain('Nothing stirred here. It was a quiet room.');
    expect(dialogText(page)).not.toContain('Something stirs');
  });

  it('opens an epic fight as an Epic, with its loot and no Elite tag', () => {
    const p = drawStage('epic', { initialOpen: 'u1f2l1' });
    const text = dialogText(p);
    expect(text).toContain('Epic fight');
    expect(text).toContain('Fierce Ember Mite');
    expect(text).toContain('Epic');
    expect(text).not.toContain('Elite');
    expect(text).toContain('One fierce foe at boss strength.');
    expect(text).toContain('Win:');
    const dialog = first(byRole(p.root, 'dialog'));
    expect(byClass(dialog, 'part-count').map(visibleText)).toEqual(['1', '5']);
    expect(text).toContain('Keepsake');
    // The Undercroft tag says where it is; there is no second line saying it.
    expect(text).toContain('Undercroft');
    expect(text).not.toContain('The Undercroft.');
  });

  it('tells the story of a boss that fell and went down: the fight, the chest and the way down', () => {
    const run = undercroftState('entrance');
    const p = draw(
      <DungeonMap map={run.map} undercroft={run.undercroft?.maps} state={run} initialOpen="f6l1" />,
    );
    const text = dialogText(p);
    expect(text).toContain('Won in 5 rounds.');
    expect(text).toContain('The boss chest opened.');
    expect(text).toContain('Banked at once');
    expect(text).toContain('Cinder Charm');
    expect(text).toContain('You went down into Undercroft 1.');
    // The chest entry only holds what the chest added, and the fight shows its own loot.
    expect(text).not.toContain('Nothing went into the pack.');
  });

  it("shows the main boss's own loot on its fight and the chest's extras on its chest", () => {
    const run = undercroftState('entrance');
    const p = draw(
      <DungeonMap map={run.map} undercroft={run.undercroft?.maps} state={run} initialOpen="f6l1" />,
    );
    const rows = byClass(first(byRole(p.root, 'dialog')), 'dnd-loot').map(visibleText);
    // The fight added 1 Essence, 3 scrap and a shard, the chest 2 and 2 more (the landmark's): two rows, none hidden.
    expect(rows).toHaveLength(2);
    // (A row's text is its amounts: Essence then scrap.)
    expect(rows[0]).toBe('Into your pack:131');
    expect(rows[1]).toBe('Into your pack:22');
    // The loot list is not the replay's indented bullet list (`plain-list`): no bullet over the label.
    const lists = byClass(first(byRole(p.root, 'dialog')), 'dnd-loot-items');
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list.getAttribute('class')).not.toContain('plain-list');
  });

  it("tells the story of a floor boss that fell: the fight and the floor boss's chest", () => {
    const done = undercroftState('done');
    page = draw(
      <DungeonMap
        map={done.map}
        undercroft={done.undercroft?.maps}
        state={done}
        initialOpen="u1f3l1"
      />,
    );
    expect(dialogText(page)).toContain("The floor boss's chest opened.");
  });
});

describe('DungeonMap start markers', () => {
  it('draws a green triangle under each entrance room in the preview, aria-hidden inside the picture', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    const marks = byClass(p.root, 'dmap-start');
    expect(marks).toHaveLength(SAMPLE_MAP.nodes.filter((n) => n.floor === 0).length);
    const svg = first(byClass(p.root, 'dmap-svg'));
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(byClass(svg, 'dmap-start')).toHaveLength(marks.length);
  });

  it('keeps them until the first move, then takes them away', () => {
    const entrance = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('entrance')} />);
    expect(byClass(entrance.root, 'dmap-start')).toHaveLength(3);
    page?.unmount();
    const midway = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('midway')} />);
    expect(byClass(midway.root, 'dmap-start')).toHaveLength(0);
    page?.unmount();
    const done = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('defeated')} />);
    expect(byClass(done.root, 'dmap-start')).toHaveLength(0);
  });

  it('marks the entrance of an Undercroft level the run has just gone down into', () => {
    const run = undercroftState('entrance');
    const p = draw(<DungeonMap map={run.map} undercroft={run.undercroft?.maps} state={run} />);
    expect(byClass(p.root, 'dmap-start').length).toBeGreaterThan(0);
  });
});

describe('DungeonMap way-down badge', () => {
  it('puts a down arrow on the floor boss from depth 8 and says so in its drawer', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={null} depth={8} />);
    const boss = first(byName(p.root, 'button', /^Floor boss/));
    expect(byClass(boss, 'dmap-descend')).toHaveLength(1);
    expect(byClass(p.root, 'dmap-descend')).toHaveLength(1);
    p.click(boss);
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain(
      'Beat it to descend into the Undercroft.',
    );
  });

  it('has none below depth 8, or when no depth is given', () => {
    const below = draw(<DungeonMap map={SAMPLE_MAP} state={null} depth={7} />);
    expect(byClass(below.root, 'dmap-descend')).toHaveLength(0);
    page?.unmount();
    const none = draw(<DungeonMap map={SAMPLE_MAP} state={null} />);
    expect(byClass(none.root, 'dmap-descend')).toHaveLength(0);
    page?.unmount();
    const opened = draw(<DungeonMap map={SAMPLE_MAP} state={null} depth={7} initialOpen="f6l1" />);
    expect(visibleText(first(byRole(opened.root, 'dialog')))).not.toContain('descend');
  });

  it('is on a cracked keeper, which keeps its cracked-floor line, and not on a plain one', () => {
    const cracked = undercroftState('cracked');
    const p = draw(
      <DungeonMap
        map={cracked.map}
        undercroft={cracked.undercroft?.maps}
        state={cracked}
        depth={cracked.depth}
        initialOpen="u1f3l1"
      />,
    );
    const keeper = first(byName(p.root, 'button', /^Undercroft floor boss/));
    expect(byClass(keeper, 'dmap-descend')).toHaveLength(1);
    expect(byClass(keeper, 'dmap-crack')).toHaveLength(1);
    expect(visibleText(first(byRole(p.root, 'dialog')))).toContain(
      'A cracked floor: beat the floor boss to go down another floor.',
    );
    page?.unmount();
    const plain = undercroftState('keeper');
    const q = draw(
      <DungeonMap
        map={plain.map}
        undercroft={plain.undercroft?.maps}
        state={plain}
        depth={plain.depth}
      />,
    );
    const plainKeeper = first(byName(q.root, 'button', /^Undercroft floor boss/));
    expect(byClass(plainKeeper, 'dmap-descend')).toHaveLength(0);
  });
});

describe('DungeonMap lost room', () => {
  it('shows a red cross on the room where the run was lost, and ticks on the cleared ones', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('defeated')} />);
    expect(byClass(p.root, 'dmap-lost')).toHaveLength(1);
    // The run stands on the lost room (its last), so only the two before it are ticked.
    expect(byClass(p.root, 'dmap-check')).toHaveLength(2);
    const lost = byClass(p.root, 'dmap-node').filter((n) => byClass(n, 'dmap-lost').length > 0);
    expect(lost).toHaveLength(1);
    expect(lost[0]?.getAttribute('class')).toContain('lost');
    expect(lost[0]?.getAttribute('aria-label')).toContain('You were defeated here');
    expect(byClass(first(lost), 'dmap-check')).toHaveLength(0);
  });

  it('has no cross on a run that was not lost', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('finished')} />);
    expect(byClass(p.root, 'dmap-lost')).toHaveLength(0);
    // Every room but the one the run stands on (the boss) is ticked.
    expect(byClass(p.root, 'dmap-check')).toHaveLength(6);
  });
});

describe('DungeonMap room marks', () => {
  it('draws the badge text on a marked room and nowhere else, hidden from a screen reader', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP_VAULT} state={stageRun('vault-broken')} />);
    const badges = byClass(p.root, 'room-mark');
    expect(badges).toHaveLength(2);
    for (const badge of badges) {
      expect(visibleText(badge)).toBe('x2');
      expect(badge.getAttribute('class')).toContain('pix');
    }
    const marked = byClass(p.root, 'dmap-node').filter((n) => byClass(n, 'room-mark').length > 0);
    expect(marked).toHaveLength(2);
    expect(byClass(marked[0] as FakeElement, 'room-marks')[0]?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('says the mark in the room’s spoken label, and only for a marked room', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP_VAULT} state={stageRun('vault-broken')} />);
    // A marked room is told as the epic fight it will be, with the mark's own line after it.
    const elite = first(byName(p.root, 'button', /^Fierce Moss Lurker \(epic fight\)/));
    expect(elite.getAttribute('aria-label')).toContain(VAULT_MARK.label);
    const fight = first(byName(p.root, 'button', /^Fierce Drift Wisp \(epic fight\)/));
    expect(fight.getAttribute('aria-label')).toContain(VAULT_MARK.label);
    const plain = first(byName(p.root, 'button', /^Fight: Ash Sprite/));
    expect(plain.getAttribute('aria-label')).not.toContain('Sealed Vault');
    const none = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('midway')} />);
    expect(byClass(none.root, 'room-mark')).toHaveLength(0);
  });

  it('explains the badge in the room’s drawer, as an epic fight rather than an elite', () => {
    const p = draw(
      <DungeonMap map={SAMPLE_MAP_VAULT} state={stageRun('vault-broken')} onGo={vi.fn()} />,
    );
    p.click(first(byName(p.root, 'button', /^Fierce Moss Lurker/)));
    const dialog = first(byRole(p.root, 'dialog'));
    const text = visibleText(dialog);
    expect(text).toContain('Epic fight');
    expect(text).toContain('x2');
    expect(text).toContain(VAULT_MARK.label);
    expect(text).toContain('Epic');
    expect(text).not.toContain('Elite');
    expect(text).not.toContain('A fiercer fight.');
    expect(byClass(dialog, 'dnd-mark')).toHaveLength(1);
  });

  it('lists both keepsakes of a marked elite in its drawer', () => {
    const run = stageRun('vault-fought');
    const history = (run.history ?? []).map((h) =>
      h.node === 'f2l1' && h.result === 'fight'
        ? {
            ...h,
            kind: 'elite' as const,
            keepsake: { id: 'a', name: 'Lantern Moth', description: 'Your creatures crit more.' },
            bonusKeepsake: { id: 'b', name: 'Tide Pearl', description: 'Tide hits harder.' },
          }
        : h,
    );
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={{ ...run, history }} />);
    p.click(first(byName(p.root, 'button', /^Fight: Drift Wisp/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain('Lantern Moth');
    expect(text).toContain('Tide Pearl');
    expect(text).toContain('Tide hits harder.');
  });

  it('shows the curse a mystery room gave as a keepsake line with the curse chip', () => {
    const path = ['f0l1', 'f1l1', 'f2l1', 'f3l1'];
    const history = sampleHistory(SAMPLE_MAP, path).map((h) =>
      h.result === 'event' ? { ...h, curse: SAMPLE_CURSE } : h,
    );
    const walked: DungeonRunState = { ...stageRun('past-camp'), path, history };
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={walked} />);
    p.click(first(byName(p.root, 'button', /^Mystery room/)));
    const dialog = first(byRole(p.root, 'dialog'));
    const line = first(byClass(dialog, 'dnd-keepsake'));
    expect(visibleText(line)).toContain(SAMPLE_CURSE.name);
    expect(visibleText(line)).toContain(SAMPLE_CURSE.description);
  });

  it('says a fight the run fought as a sealed room was epic, from its log entry (the mark is gone)', () => {
    const p = draw(<DungeonMap map={SAMPLE_MAP} state={stageRun('vault-fought')} />);
    expect(byClass(p.root, 'room-mark')).toHaveLength(0);
    p.click(first(byName(p.root, 'button', /^Fight: Drift Wisp/)));
    const text = visibleText(first(byRole(p.root, 'dialog')));
    expect(text).toContain(VAULT_MARK.label);
    expect(text).toContain('Epic');
  });

  describe('the moves of the foe, listed before the fight', () => {
    const slagRun = (landmark: boolean): DungeonRunState => {
      const run = stageRun('past-camp');
      return {
        ...run,
        landmark,
        map: {
          ...run.map,
          nodes: run.map.nodes.map((n) =>
            n.id === 'f6l1' && n.foe !== undefined
              ? {
                  ...n,
                  foe: { ...n.foe, id: 'slag-tyrant', name: 'Slag Tyrant', element: 'ember' },
                }
              : n,
          ),
        },
      };
    };
    const open = (landmark: boolean) => {
      const run = slagRun(landmark);
      const p = draw(
        <DungeonMap map={run.map} state={run} landmark={landmark} initialOpen="f6l1" />,
      );
      return visibleText(first(byRole(p.root, 'dialog')));
    };

    it('names every move of the Slag Tyrant, Molten Shell included', () => {
      const text = open(false);
      expect(text).toContain('Anvil Fall');
      expect(text).toContain('Molten Shell');
      expect(text).toContain('May reflect a reaction');
      expect(text).not.toContain('Slag Spill');
    });

    it('puts the signature first at a landmark, then every regular move', () => {
      const text = open(true);
      const at = (name: string) => text.indexOf(name);
      expect(at('Slag Spill')).toBeGreaterThan(-1);
      expect(at('Slag Spill')).toBeLessThan(at('Molten Shell'));
      expect(at('Molten Shell')).toBeLessThan(at('Anvil Fall'));
    });
  });
});
