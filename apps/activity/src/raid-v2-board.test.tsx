/**
 * The combat v2 raid tab's screens: the grid and its words, a tile's extras, the cues of a tapped move, the swap words, the strict
 * reading of the week's v2 part, the boss card (a row with nothing is not drawn), the move tile, the track strip and the swap
 * answers. Built on the workbench's sample week (the shipped content and the engine's own targeting).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopoverHost } from './PopoverHost';
import { BossCardV2, RuleCards, boardTurnSteps, stageTicks, strengthPips } from './BossCardV2';
import { moveGlyphId } from './combat-glyphs';
import { moveHelp } from './move-help';
import { parseRaidView } from './raid-api';
import {
  boardCuesV2,
  boardSlotV2,
  swapActionSpecs,
  swapMarkText,
  swapMarks,
  creaturesBySlot,
  everyShort,
  gridRowsV2,
  incomingText,
  litMove,
  outgoingText,
  placeOfV2,
  placeTextV2,
  slotAtV2,
  swapNoticeText,
} from './raid-board-v2';
import { isRaidV2View } from './raid-v2-api';
import { SwapOutcomes, SwapRequests } from './SwapRequests';
import { markSwapSeen, seenSwapIds, settledText, unseenSwaps } from './swap-outcome';
import { byClass, byName, createPage, visibleText, type Page } from './test-dom';
import { MoveTile } from './ui/MoveTile';
import { TrackStrip } from './ui/TrackStrip';
import { raidV2Sample, trackOf, V2_NAMES, type V2SampleOptions } from './workbench/raid-v2-sample';
import { foeCard } from './workbench/dungeon-v2-sample';
import type { RaidView } from './raid-api';

let page: Page | null = null;
afterEach(() => {
  page?.unmount();
  page = null;
  vi.unstubAllGlobals();
});

const WEEK: V2SampleOptions = {
  slot: 1,
  players: 4,
  stagesPlayed: 0,
  mine: 3,
  bestShareBp: 0,
  knockedOut: false,
  swaps: 'none',
};
const sample = (over: Partial<V2SampleOptions> = {}): RaidView =>
  raidV2Sample({ ...WEEK, ...over }).view;
const v2Of = (view: RaidView) => {
  if (view.v2 === undefined) throw new Error('not v2');
  return view.v2;
};

describe('the grid', () => {
  it('numbers slots column by column, so a wider board never renumbers a slot', () => {
    const grid = { rows: 3, cols: 4 };
    expect(slotAtV2(0, 0, grid)).toBe(0);
    expect(slotAtV2(2, 1, grid)).toBe(5);
    expect(placeOfV2(5, grid)).toEqual({ row: 2, col: 1 });
    expect(slotAtV2(1, 1, { rows: 3, cols: 9 })).toBe(4);
  });

  it('draws the boss rows by the party columns, front first', () => {
    const rows = gridRowsV2({ rows: 2, cols: 4 });
    expect(rows.map((r) => r.zone)).toEqual(['front', 'back']);
    expect(rows[0]?.slots).toEqual([0, 2, 4, 6]);
    expect(rows[1]?.slots).toEqual([1, 3, 5, 7]);
  });

  it('names a place in words and nothing for a slot off the board', () => {
    expect(placeTextV2(5, { rows: 3, cols: 4 })).toBe('Row 3, lane 2');
    expect(placeTextV2(12, { rows: 3, cols: 4 })).toBe('');
  });
});

describe('a v2 tile', () => {
  it('carries the role, the Knack, the carried HP and the swap mark', () => {
    const view = sample({ stagesPlayed: 1, swaps: 'asked' });
    const v2 = v2Of(view);
    const party = view.party;
    if (party === null) throw new Error('no party');
    const ctx = {
      grid: { rows: v2.rows, cols: v2.cols },
      creatures: creaturesBySlot(v2.creatures),
      swaps: swapMarks(v2.swaps, party.row),
    };
    const theirs = party.row.find((s) => s.creature !== null && !s.creature.mine);
    const asked = [...ctx.swaps.keys()].find((k) => party.row[k]?.creature?.mine === false);
    expect(asked).toBeDefined();
    const model = boardSlotV2(party.row[asked ?? 0] ?? party.row[0]!, ctx, V2_NAMES, true);
    expect(model.swap).toBe(true);
    expect(model.badge).toBeUndefined();
    expect(model.occupant?.v2?.carried).not.toBeNull();
    expect(model.occupant?.v2?.knack).not.toBeNull();
    expect(model.occupant?.ownId).toBeNull();
    expect(model.ariaLabel).toContain('you asked to swap');
    expect(theirs).toBeDefined();
  });

  it('shows no carried HP before the first stage', () => {
    const view = sample();
    const v2 = v2Of(view);
    const mine = view.party?.row.find((s) => s.creature?.mine === true);
    if (mine === undefined) throw new Error('none of mine');
    const model = boardSlotV2(
      mine,
      {
        grid: { rows: v2.rows, cols: v2.cols },
        creatures: creaturesBySlot(v2.creatures),
        swaps: new Map(),
      },
      V2_NAMES,
      true,
    );
    expect(model.occupant?.v2?.carried).toBeNull();
    expect(model.occupant?.ownId).not.toBeNull();
  });
});

describe('the swap mark', () => {
  it('marks both creatures of an open request, for the asker and the asked, and none without one', () => {
    for (const kind of ['asked', 'incoming'] as const) {
      const view = sample({ swaps: kind });
      const v2 = v2Of(view);
      const row = view.party?.row ?? [];
      const marks = swapMarks(v2.swaps, row);
      const request = v2.swaps.outgoing[0] ?? v2.swaps.incoming[0];
      expect([...marks.keys()].sort()).toEqual([request?.slotA, request?.slotB].sort());
      const line = swapMarkText(marks.get(request?.slotA ?? 0)!, { rows: v2.rows, cols: v2.cols });
      expect(line).toContain(kind === 'asked' ? 'Waiting for' : 'asks to swap');
      expect(line).toContain('Seats: Row');
    }
    const none = sample({ swaps: 'none' });
    expect(swapMarks(v2Of(none).swaps, none.party?.row ?? []).size).toBe(0);
  });

  it('offers Cancel request to the asker only, and Accept and Decline to the asked only', () => {
    const askerView = sample({ swaps: 'asked' });
    const asker = v2Of(askerView);
    const request = asker.swaps.outgoing[0]!;
    const askerMark = swapMarks(asker.swaps, askerView.party?.row ?? []).get(request.slotA)!;
    expect(swapActionSpecs(askerMark)).toEqual([
      { id: request.id, kind: 'cancel', label: 'Cancel request' },
    ]);
    const askedView = sample({ swaps: 'incoming' });
    const asked = v2Of(askedView);
    const incoming = asked.swaps.incoming[0]!;
    const askedMark = swapMarks(asked.swaps, askedView.party?.row ?? []).get(incoming.slotA)!;
    expect(swapActionSpecs(askedMark).map((a) => a.kind)).toEqual(['accept', 'decline']);
  });

  it('shows no "Asked" strip: the mark is the circling icon', () => {
    const view = sample({ swaps: 'asked' });
    const v2 = v2Of(view);
    const row = view.party?.row ?? [];
    const ctx = {
      grid: { rows: v2.rows, cols: v2.cols },
      creatures: creaturesBySlot(v2.creatures),
      swaps: swapMarks(v2.swaps, row),
    };
    const slot = row.find((s) => ctx.swaps.has(s.slot))!;
    expect(boardSlotV2(slot, ctx, V2_NAMES, true)).toMatchObject({ swap: true });
  });
});

describe('the tapped move', () => {
  it("lights exactly the slots the server previewed, in the move's own picture, and marks the plain target", () => {
    const view = sample();
    const v2 = v2Of(view);
    const undertow = v2.card.moves.find((m) => m.id === 'undertow');
    if (undertow === undefined) throw new Error('no undertow');
    const lit = litMove(v2.preview, undertow);
    expect(lit.slots).toEqual(v2.preview?.moves['undertow']);
    expect(lit.glyph).toBe('sweep');
    const cues = boardCuesV2(v2.preview, lit);
    expect(
      [...cues.entries()]
        .filter(([, c]) => c.hit !== undefined)
        .map(([s]) => s)
        .sort(),
    ).toEqual([...(lit.slots ?? [])].sort());
    // One marker for the plain attack.
    expect([...cues.values()].filter((c) => c.plain === true)).toHaveLength(1);
  });

  it('lights nothing for a Wind-up move, which is aimed when it comes', () => {
    const v2 = v2Of(sample());
    const riptide = v2.card.moves.find((m) => m.windUp);
    if (riptide === undefined) throw new Error('no wind-up');
    const lit = litMove(v2.preview, riptide);
    expect(lit.slots).toBeNull();
    const cues = boardCuesV2(v2.preview, lit);
    expect([...cues.values()].some((c) => c.hit !== undefined)).toBe(false);
  });

  it('picks the picture of a move from its shape', () => {
    const pic = (shape: string, silences = false, oneShot = false) =>
      moveGlyphId({ shape, silences, oneShot });
    expect(pic('columns')).toBe('shape-lance');
    expect(pic('line3')).toBe('shape-slam');
    expect(pic('rowEnds')).toBe('shape-pincer');
    expect(pic('rowEnds', true)).toBe('silence_ends');
    expect(pic('single', false, true)).toBe('shape-one-shot');
    expect(pic('nonsense')).toBe('unknown');
    expect(moveGlyphId({ shape: 'all', silences: false, oneShot: false, fizzles: true })).toBe(
      'reflect_first_reaction',
    );
  });
});

describe('swap words', () => {
  it('say who asks and which creatures, as text', () => {
    const view = sample({ swaps: 'both' });
    const v2 = v2Of(view);
    const grid = { rows: v2.rows, cols: v2.cols };
    const incoming = v2.swaps.incoming[0];
    const outgoing = v2.swaps.outgoing[0];
    if (incoming === undefined || outgoing === undefined) throw new Error('no requests');
    expect(incomingText(incoming, grid)).toMatch(/^Mira asks to swap \S+ for \S+\.$/);
    expect(outgoingText(outgoing, grid)).toMatch(/^Waiting for Mira: \S+ for \S+\.$/);
    expect(swapNoticeText([incoming], grid)).toMatch(/^Mira asks to swap \S+ for \S+$/);
    expect(swapNoticeText([incoming, incoming], grid)).toBe('2 swap requests');
    expect(swapNoticeText([], grid)).toBeNull();
  });

  it('names the place for a request to move into an empty slot', () => {
    const request = {
      id: 'x',
      from: 'Mira',
      to: 'You',
      slotA: 3,
      slotB: 7,
      creatureA: { species: 'cindle', name: 'Cindle', level: 3 },
      creatureB: null,
      createdAt: 1,
    };
    expect(incomingText(request, { rows: 3, cols: 4 })).toBe(
      'Mira asks to move Cindle to Row 2, lane 3.',
    );
  });
});

describe('reading the week', () => {
  const json = (view: RaidView): unknown => JSON.parse(JSON.stringify(view));

  it('reads a v2 view with its stage results named as the events they happen at', () => {
    const view = sample({ stagesPlayed: 1 });
    const data = json(view) as Record<string, unknown>;
    const party = data['party'] as { results: unknown[] };
    party.results = [
      {
        phase: 'stage1',
        at: 1,
        cleared: true,
        rounds: 8,
        bossHpMax: 10,
        bossHpStart: 10,
        bossHpEnd: 5,
        damage: 5,
        reactions: 0,
        top: [],
        essence: 3,
        rankChange: null,
        festivalGrant: null,
      },
    ];
    const parsed = parseRaidView(data);
    expect(parsed.rules).toBe(2);
    expect(parsed.party?.results[0]?.phase).toBe('phase1');
  });

  it('refuses a v2 view without a readable v2 part, and a v2 part without the rules key', () => {
    const data = json(sample()) as Record<string, unknown>;
    expect(() => parseRaidView({ ...data, v2: undefined })).toThrow();
    expect(() => parseRaidView({ ...data, rules: 1 })).toThrow();
    expect(() => parseRaidView({ ...data, rules: undefined })).toThrow();
    const v2 = data['v2'] as Record<string, unknown>;
    expect(isRaidV2View({ ...v2, rows: 0 })).toBe(false);
    expect(isRaidV2View({ ...v2, card: { ...(v2['card'] as object), moves: [{}] } })).toBe(false);
    expect(isRaidV2View(v2)).toBe(true);
  });

  it('keeps a v1 view as it is: no rules key, no v2 part', () => {
    const data = json(sample()) as Record<string, unknown>;
    delete data['rules'];
    delete data['v2'];
    // The sample is a v2 week; with the keys gone it reads as v1 (its shared fields are the v1 shape).
    const parsed = parseRaidView(data);
    expect(parsed.rules).toBeUndefined();
    expect(parsed.v2).toBeUndefined();
  });
});

describe('a dungeon foe on the map', () => {
  const draw = (card: ReturnType<typeof foeCard>) => {
    page = createPage();
    page.draw(<RuleCards card={card} />);
    return page;
  };

  it("shows a foe's Escalating meter (the Puddle Imp's Rising Puddle) in the rule card row the boss card uses", () => {
    const p = draw(foeCard('puddle-imp', 1));
    expect(visibleText(p.root)).toContain('Rising Puddle');
    expect(byClass(p.root, 'escalating')).toHaveLength(1);
  });

  it("shows a foe's rule card by name with its strength as pips (the Moss Lurker's Grudge)", () => {
    const p = draw(foeCard('moss-lurker', 1));
    const cards = byClass(p.root, 'rule-card');
    expect(cards).toHaveLength(1);
    expect(visibleText(cards[0]!)).toContain('Grudge');
  });

  it('draws nothing for a foe with neither', () => {
    const p = draw(foeCard('flicker-swarm', 1));
    expect(byClass(p.root, 'boss-rules')).toHaveLength(0);
  });
});

describe('the boss card', () => {
  const draw = (
    view: RaidView,
    lit: string | null = null,
    onLit: (id: string | null) => void = () => undefined,
  ) => {
    page = createPage();
    page.draw(<BossCardV2 view={view} lit={lit} onLit={onLit} />);
    return page;
  };

  it('shows no rule card row and no Escalating meter for the tutorial boss', () => {
    const p = draw(sample());
    expect(byClass(p.root, 'boss-rules')).toHaveLength(0);
    expect(byClass(p.root, 'escalating')).toHaveLength(0);
    expect(byClass(p.root, 'move-tile').length).toBeGreaterThan(0);
  });

  it('shows the rule cards with their strength and the Escalating meter of a later boss', () => {
    const p = draw(sample({ slot: 8, players: 6 }));
    expect(byClass(p.root, 'rule-card').length).toBeGreaterThan(0);
    expect(byClass(p.root, 'escalating')).toHaveLength(1);
  });

  it('says "Stage 2 / 3" and "Back again" for a returning boss between stages, and never calls a boss harder', () => {
    const p = draw(sample({ slot: 2, stagesPlayed: 1, bestShareBp: 4000 }));
    const text = visibleText(p.root);
    expect(text).toContain('Stage 2 / 3');
    expect(text).toContain('Back again');
    expect(text.toLowerCase()).not.toMatch(/wall|harder|hardest/);
  });

  it('has no "Back again" tag for a boss that has not been here before', () => {
    expect(visibleText(draw(sample()).root)).not.toContain('Back again');
  });

  it('shows Determination as a tappable chip with its bonus, and none before there is any', () => {
    expect(visibleText(draw(sample()).root)).not.toContain('Determination');
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <BossCardV2
          view={sample({ slot: 6, determinationBp: 1500 })}
          lit={null}
          onLit={() => undefined}
        />
      </PopoverHost>,
    );
    const chip = byName(page.root, 'button', /^Determination/)[0];
    expect(chip).toBeDefined();
    expect(visibleText(chip!)).toContain('+15%');
    page.click(chip!);
    expect(visibleText(page.root)).toContain(
      'little stronger each time the server fails this boss',
    );
  });

  it('draws no "Aimed when it comes" line, and a tap opens a popover that explains the move and its keywords', () => {
    const view = sample();
    const windUp = v2Of(view).card.moves.find((m) => m.windUp)!;
    expect(visibleText(draw(view, windUp.id).root)).not.toContain('Aimed when it comes');
    page?.unmount();
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    page = createPage();
    page.draw(
      <PopoverHost onOpenHowTo={() => undefined}>
        <BossCardV2 view={view} lit={null} onLit={() => undefined} />
      </PopoverHost>,
    );
    const tiles = byClass(page.root, 'move-tile');
    const index = v2Of(view).card.moves.findIndex((m) => m.id === windUp.id);
    page.click(tiles[index]!);
    const text = visibleText(page.root);
    expect(text).toContain(moveHelp(windUp).what);
    expect(text).toContain(moveHelp(windUp).rhythm);
    // The hourglass word is a tag that opens the game's own keyword help.
    expect(byName(page.root, 'button', /^Wind-up/).length).toBeGreaterThan(0);
  });

  it('taps a move tile to select it and again to let go', () => {
    const view = sample();
    const first = v2Of(view).card.moves[0];
    const onLit = vi.fn();
    const p = draw(view, null, onLit);
    p.click(byClass(p.root, 'move-tile')[0]!);
    expect(onLit).toHaveBeenCalledWith(first?.id);
    page?.unmount();
    const again = vi.fn();
    const q = draw(view, first?.id ?? null, again);
    q.click(byClass(q.root, 'move-tile')[0]!);
    expect(again).toHaveBeenCalledWith(null);
  });

  it('turns strength into one to five pips and the stages into ticks', () => {
    expect(strengthPips(0)).toBe(0);
    expect(strengthPips(1833)).toBe(1);
    expect(strengthPips(6500)).toBe(3);
    expect(strengthPips(10_000)).toBe(5);
    expect(stageTicks()).toEqual([0.7, 0.15]);
  });

  it('reads one round as row, boss, row, boss, with the moves on the step they land on', () => {
    const v2 = v2Of(sample());
    const steps = boardTurnSteps(v2.card, v2.rows);
    expect(steps.map((s) => s.label)).toEqual(['Row 1', 'Boss', 'Row 2', 'Boss', 'Row 3', 'Boss']);
    const bossMoves = steps.flatMap((s) => s.boss?.moves ?? []);
    expect(bossMoves).toHaveLength(v2.card.moves.filter((m) => !m.later).length);
    expect(steps[0]?.boss).toBeUndefined();
  });
});

describe('how often a move comes', () => {
  it('is said in words, short enough for a tile', () => {
    expect(everyShort(1)).toBe('Every round');
    expect(everyShort(3)).toBe('Every 3');
  });
});

describe('the move tile', () => {
  it('lights the cells of its slots in the arena and shows the picture of an unaimed move', () => {
    const v2 = v2Of(sample());
    const move = v2.card.moves.find((m) => m.id === 'undertow');
    if (move === undefined) throw new Error('no undertow');
    page = createPage();
    page.draw(
      <MoveTile
        move={move}
        arena={{ rows: v2.rows, cols: v2.cols }}
        lit={v2.preview?.moves['undertow'] ?? null}
        selected={false}
        onToggle={() => undefined}
      />,
    );
    const lit = byClass(page.root, 'on');
    expect(lit).toHaveLength(v2.preview?.moves['undertow']?.length ?? -1);
    expect(byClass(page.root, 'move-arena-icon')).toHaveLength(0);
    page.unmount();
    page = createPage();
    page.draw(
      <MoveTile
        move={move}
        arena={{ rows: 3, cols: 4 }}
        lit={null}
        selected
        onToggle={() => undefined}
      />,
    );
    expect(byClass(page.root, 'move-arena-icon')).toHaveLength(1);
    expect(byClass(page.root, 'selected')).toHaveLength(1);
  });
});

describe('the track strip', () => {
  it("lights this week's boss, ticks the beaten ones and says the Boss Rank", () => {
    const track = trackOf(8);
    page = createPage();
    page.draw(<TrackStrip order={track.order} index={track.index} rank={8} />);
    expect(visibleText(page.root)).toContain('Boss Rank 8');
    expect(byClass(page.root, 'now')).toHaveLength(1);
    expect(byClass(page.root, 'beaten')).toHaveLength(2);
    expect(byClass(page.root, 'track-tick')).toHaveLength(2);
    expect(visibleText(page.root).toLowerCase()).not.toMatch(/wall|harder/);
  });
});

describe('the swap requests asked of you', () => {
  it('draws one note per request with Accept and Decline, and answers by id', () => {
    const view = sample({ swaps: 'incoming' });
    const v2 = v2Of(view);
    const onAnswer = vi.fn();
    page = createPage();
    page.draw(
      <SwapRequests
        requests={v2.swaps.incoming}
        grid={{ rows: v2.rows, cols: v2.cols }}
        busy={false}
        onAnswer={onAnswer}
      />,
    );
    expect(visibleText(page.root)).toContain('Mira asks to swap');
    page.click(byName(page.root, 'button', 'Accept')[0]!);
    page.click(byName(page.root, 'button', 'Decline')[0]!);
    const id = v2.swaps.incoming[0]?.id;
    expect(onAnswer).toHaveBeenNthCalledWith(1, id, 'accept');
    expect(onAnswer).toHaveBeenNthCalledWith(2, id, 'decline');
  });

  it('draws nothing without a request', () => {
    page = createPage();
    page.draw(
      <SwapRequests
        requests={[]}
        grid={{ rows: 3, cols: 4 }}
        busy={false}
        onAnswer={() => undefined}
      />,
    );
    expect(byClass(page.root, 'swap-requests')).toHaveLength(0);
  });
});

describe('how your swap requests went', () => {
  const grid = { rows: 3, cols: 4 };
  const settled = (status: 'accepted' | 'declined' | 'ended') => {
    const view = sample({ swaps: 'settled' });
    const request = v2Of(view).swaps.settled[0]!;
    return { ...request, status };
  };

  it('says each outcome in a line, naming the creatures as they were asked', () => {
    expect(settledText(settled('accepted'), grid)).toMatch(
      /^Mira accepted: .+ and .+ swapped places\.$/,
    );
    expect(settledText(settled('declined'), grid)).toMatch(
      /^Mira declined your swap of .+ for .+\.$/,
    );
    expect(settledText(settled('ended'), grid)).toContain('Your request to Mira ended');
    expect(settledText({ ...settled('accepted'), creatureB: null }, grid)).toContain(
      'moved to Row',
    );
  });

  it('shows an outcome once: closing it remembers it', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const one = settled('accepted');
    expect(unseenSwaps([one], seenSwapIds(storage))).toHaveLength(1);
    expect(markSwapSeen(one.id, storage)).toBe(true);
    expect(unseenSwaps([one], seenSwapIds(storage))).toEqual([]);
    expect(seenSwapIds({ getItem: () => 'not json', setItem: () => undefined }).size).toBe(0);
  });

  it('draws a note for a settled request and nothing without one', () => {
    page = createPage();
    page.draw(<SwapOutcomes settled={[settled('accepted')]} grid={grid} />);
    expect(visibleText(page.root)).toContain('Mira accepted');
    page.unmount();
    page = createPage();
    page.draw(<SwapOutcomes settled={[]} grid={grid} />);
    expect(byClass(page.root, 'swap-requests')).toHaveLength(0);
  });
});

describe('the words of a move', () => {
  const base = {
    id: 'x',
    name: 'Judgement Bolt',
    label: 'One-shot',
    shape: 'single',
    silences: false,
    oneShot: true,
    fizzles: false,
    every: 4,
    turn: 1,
    windUp: false,
    later: false,
  };

  it('reads the rhythm, the turn and the keywords the glossary already has', () => {
    const help = moveHelp({ ...base, oneShot: false, shape: 'scatter', windUp: true });
    expect(help.rhythm).toBe('Every 4: it comes every 4 rounds, after row 2.');
    expect(help.keywords.map((k) => k.name)).toEqual(['Wind-up', 'Barrage']);
    expect(moveHelp({ ...base, every: 1, oneShot: false }).rhythm).toContain('Every round');
  });

  it('explains One-shot in a line, since the glossary has no entry for it', () => {
    const help = moveHelp(base);
    expect(help.notes[0]).toContain('One-shot');
    expect(help.keywords).toEqual([]);
  });

  it('puts Area hit on a move that hits several slots and Silenced on Hush', () => {
    expect(moveHelp({ ...base, oneShot: false, shape: 'row' }).keywords.map((k) => k.name)).toEqual(
      ['Area hit'],
    );
    const hush = moveHelp({ ...base, oneShot: false, shape: 'rowEnds', silences: true });
    expect(hush.keywords.map((k) => k.name)).toEqual(['Silenced', 'Row end', 'Area hit']);
  });
});
