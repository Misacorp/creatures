import type { EventNames, FightEvent } from '@creatures/engine';
import { content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { LiveAbility, LiveFight, LiveNone } from './live-api';
import {
  abilityControls,
  abilityDef,
  abilityParamKind,
  abilityPlanText,
  abilityStateText,
  bannerText,
  buildAction,
  defaultRoundOf,
  earlierLines,
  errorRetryDelayMs,
  feedLines,
  finaleWindow,
  formatClock,
  GIVE_UP_MS,
  isKeyEvent,
  isRetryableStatus,
  LOBBY_MS,
  newestRound,
  nextBoundaryAt,
  nextPollDelay,
  pickNewer,
  progressText,
  revealSummary,
} from './live';

const START = 1_000_000;

function fightOf(over: Partial<LiveFight> = {}): LiveFight {
  return {
    status: 'live',
    practice: false,
    week: '2026-W41',
    party: 1,
    you: 'p1',
    startsAt: START,
    roundMs: 10_000,
    rounds: 12,
    round: 3,
    serverNow: START + 25_000,
    boss: { id: 'b', name: 'Tidal Colossus', element: 'tide', hpMax: 1000, hpStart: 1000 },
    row: [],
    names: { boss: 'Tidal Colossus', creatures: {} },
    abilities: [],
    events: [],
    bossHp: 900,
    watching: [],
    loot: null,
    ...over,
  };
}

function abilityOf(over: Partial<LiveAbility> = {}): LiveAbility {
  return {
    alias: 'p1',
    abilityId: 'rally',
    mode: 'default',
    fired: false,
    firedAtRound: null,
    ...over,
  };
}

describe('finaleWindow', () => {
  const finale = START;
  it('is before, lobby, live and after', () => {
    expect(finaleWindow(finale, 12, finale - LOBBY_MS - 1)).toBe('before');
    expect(finaleWindow(finale, 12, finale - LOBBY_MS)).toBe('lobby');
    expect(finaleWindow(finale, 12, finale - 1)).toBe('lobby');
    expect(finaleWindow(finale, 12, finale)).toBe('live');
    expect(finaleWindow(finale, 12, finale + 12 * 10_000)).toBe('live');
    expect(finaleWindow(finale, 12, finale + 12 * 10_000 + 30_000)).toBe('after');
  });
});

describe('formatClock and bannerText', () => {
  it.each([
    [0, '0:00'],
    [-4000, '0:00'],
    [1, '0:01'],
    [59_000, '0:59'],
    [252_000, '4:12'],
    [300_000, '5:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });

  it('words the banner', () => {
    expect(bannerText('lobby', START, START - 252_000)).toBe('Finale starts in 4:12');
    expect(bannerText('live', START, START + 1)).toBe('The finale is on now');
    expect(bannerText('before', START, 0)).toBe('');
  });
});

describe('nextBoundaryAt', () => {
  it('is the start before the fight and the end of each round after', () => {
    expect(nextBoundaryAt(START, 10_000, 12, START - 5)).toBe(START);
    expect(nextBoundaryAt(START, 10_000, 12, START)).toBe(START + 10_000);
    expect(nextBoundaryAt(START, 10_000, 12, START + 9_999)).toBe(START + 10_000);
    expect(nextBoundaryAt(START, 10_000, 12, START + 10_000)).toBe(START + 20_000);
    expect(nextBoundaryAt(START, 10_000, 12, START + 119_999)).toBe(START + 120_000);
  });

  it('is null after the last round', () => {
    expect(nextBoundaryAt(START, 10_000, 12, START + 120_000)).toBeNull();
  });
});

describe('nextPollDelay', () => {
  const live = fightOf();

  it('stops for none and done', () => {
    const none: LiveNone = { status: 'none', serverNow: 1 };
    expect(nextPollDelay(none, START)).toBeNull();
    expect(nextPollDelay(fightOf({ status: 'done' }), START + 130_000)).toBeNull();
  });

  it('polls every 2 s when no boundary is near', () => {
    expect(nextPollDelay(live, START + 10_500)).toBe(2000);
    expect(nextPollDelay(live, START + 12_000)).toBe(2000);
  });

  it('polls just after a round boundary', () => {
    // 1 s before the boundary at +20 s: wait for it, plus the slack.
    expect(nextPollDelay(live, START + 19_000)).toBe(1300);
    // 100 ms before the boundary.
    expect(nextPollDelay(live, START + 19_900)).toBe(400);
  });

  it('never polls faster than the minimum, even right at a boundary', () => {
    expect(nextPollDelay(live, START + 20_000 - 1)).toBeGreaterThanOrEqual(250);
    expect(nextPollDelay(live, START + 20_100)).toBe(2000);
  });

  it('waits for the start in the lobby', () => {
    const lobby = fightOf({ status: 'lobby', round: 0 });
    expect(nextPollDelay(lobby, START - 60_000)).toBe(2000);
    expect(nextPollDelay(lobby, START - 1_000)).toBe(1300);
  });

  it('keeps polling after the last round until "done" arrives, then gives up', () => {
    const end = START + 120_000;
    expect(nextPollDelay(live, end + 1_000)).toBe(2000);
    expect(nextPollDelay(live, end + GIVE_UP_MS + 1)).toBeNull();
  });
});

describe('retries', () => {
  it('backs off and caps', () => {
    expect([1, 2, 3, 4, 5, 50].map(errorRetryDelayMs)).toEqual([
      2000, 4000, 8000, 15000, 15000, 15000,
    ]);
    expect(errorRetryDelayMs(0)).toBe(2000);
  });

  it('retries network errors, 429 and 5xx only', () => {
    expect(isRetryableStatus(null)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('pickNewer', () => {
  it('keeps the fresher snapshot', () => {
    const a = fightOf({ serverNow: 100 });
    const b = fightOf({ serverNow: 200 });
    expect(pickNewer(null, a)).toBe(a);
    expect(pickNewer(a, b)).toBe(b);
    expect(pickNewer(b, a)).toBe(b);
    expect(pickNewer(a, fightOf({ serverNow: 100 }))).not.toBe(a);
  });

  it('takes a snapshot with no clock', () => {
    const none: LiveNone = { status: 'none', serverNow: null };
    expect(pickNewer(fightOf(), none)).toBe(none);
  });
});

describe('progressText', () => {
  it('counts the round and the time to the next one', () => {
    const fight = fightOf({ round: 3 });
    expect(progressText(fight, START + 25_000)).toEqual({
      headline: 'Round 3 of 12',
      countdown: 'Next round in 5s',
    });
  });

  it('counts down to the start in the lobby', () => {
    const lobby = fightOf({ status: 'lobby', round: 0 });
    expect(progressText(lobby, START - 252_000)).toEqual({
      headline: 'Waiting for the finale to start',
      countdown: 'Starts in 4:12',
    });
  });

  it('says when it is the last round and when it is over', () => {
    const last = fightOf({ round: 12 });
    expect(progressText(last, START + 115_000)).toEqual({
      headline: 'Last round (12 of 12)',
      countdown: 'Ends in 5s',
    });
    expect(progressText(fightOf({ status: 'done', round: 12 }), START + 200_000)).toEqual({
      headline: 'The fight is over',
      countdown: '',
    });
  });

  it('never shows a negative countdown', () => {
    expect(progressText(fightOf({ round: 3 }), START + 99_000).countdown).toBe('Next round in 0s');
  });
});

describe('ability texts', () => {
  it('describes the plan on the picker card', () => {
    const rally = abilityDef('rally');
    if (rally === undefined) throw new Error('rally is missing');
    expect(abilityPlanText(rally)).toBe(
      'Fires on its own in round 6 unless you take control in the live finale',
    );
    const wall = abilityDef('shield-wall');
    if (wall === undefined) throw new Error('shield-wall is missing');
    expect(abilityPlanText(wall)).toContain('first attacks a zone');
    expect(abilityPlanText(wall)).toContain('round 3');
  });

  it('says what each state means', () => {
    expect(abilityStateText(abilityOf({ firedAtRound: 6 }), 12, true)).toBe(
      'Fires on its own in round 6',
    );
    expect(abilityStateText(abilityOf(), 12, true)).toBe('Fires on its own in round 6');
    expect(abilityStateText(abilityOf({ mode: 'fired', firedAtRound: 7 }), 12, true)).toBe(
      'Fires at the start of round 7',
    );
    expect(abilityStateText(abilityOf({ mode: 'held' }), 12, true)).toBe(
      "Held: fires in the last round if you don't",
    );
    expect(abilityStateText(abilityOf({ mode: 'held' }), 12, false)).toContain('round 12');
    expect(
      abilityStateText(abilityOf({ mode: 'fired', fired: true, firedAtRound: 5 }), 12, true),
    ).toBe('Used in round 5');
    expect(abilityStateText(abilityOf({ fired: true }), 12, true)).toBe('Used');
  });

  it('falls back when the ability is unknown', () => {
    expect(abilityStateText(abilityOf({ abilityId: 'mystery' }), 12, true)).toBe(
      'Fires on its own',
    );
    expect(defaultRoundOf(abilityOf({ abilityId: 'mystery' }))).toBeNull();
  });

  it('knows which abilities ask for something', () => {
    expect(abilityParamKind('shield-wall')).toBe('zone');
    expect(abilityParamKind('re-mark')).toBe('element');
    expect(abilityParamKind('rally')).toBeNull();
    expect(abilityParamKind('purge')).toBeNull();
    expect(abilityParamKind('mystery')).toBeNull();
  });
});

describe('abilityControls', () => {
  it('offers Fire and Hold before the default round', () => {
    const c = abilityControls(fightOf({ round: 3 }), abilityOf({ firedAtRound: 6 }));
    expect(c).toEqual({ canFire: true, canHold: true, note: '' });
  });

  it('offers only Fire from the default round on', () => {
    const c = abilityControls(fightOf({ round: 6 }), abilityOf({ firedAtRound: 6 }));
    expect(c.canFire).toBe(true);
    expect(c.canHold).toBe(false);
  });

  it('offers only Fire to a held ability', () => {
    const c = abilityControls(fightOf({ round: 2 }), abilityOf({ mode: 'held' }));
    expect(c.canFire).toBe(true);
    expect(c.canHold).toBe(false);
  });

  it('offers nothing once it is fired or used', () => {
    const none = { canFire: false, canHold: false, note: '' };
    expect(abilityControls(fightOf(), abilityOf({ mode: 'fired', firedAtRound: 5 }))).toEqual(none);
    expect(abilityControls(fightOf(), abilityOf({ fired: true }))).toEqual(none);
    expect(abilityControls(fightOf({ status: 'done' }), abilityOf())).toEqual(none);
  });

  it('offers nothing in the lobby and explains why', () => {
    const c = abilityControls(fightOf({ status: 'lobby', round: 0 }), abilityOf());
    expect(c.canFire).toBe(false);
    expect(c.note).toContain('once the fight starts');
  });

  it('offers nothing in the last round', () => {
    const c = abilityControls(fightOf({ round: 12 }), abilityOf({ mode: 'held' }));
    expect(c.canFire).toBe(false);
    expect(c.note).toContain('too late');
  });
});

describe('buildAction', () => {
  it('sends Hold with nothing else', () => {
    expect(buildAction('rally', 'hold', 'front', 'ember')).toEqual({ action: 'hold' });
  });

  it('sends the zone only for Shield Wall', () => {
    expect(buildAction('shield-wall', 'fire', 'back', 'ember')).toEqual({
      action: 'fire',
      zone: 'back',
    });
    expect(buildAction('shield-wall', 'fire', '', 'ember')).toEqual({ action: 'fire' });
    expect(buildAction('shield-wall', 'fire', 'sideways', '')).toEqual({ action: 'fire' });
  });

  it('sends the element only for Re-mark, and only a real one', () => {
    const element = content.elements[0]?.id ?? '';
    expect(buildAction('re-mark', 'fire', 'front', element)).toEqual({ action: 'fire', element });
    expect(buildAction('re-mark', 'fire', '', 'not-an-element')).toEqual({ action: 'fire' });
  });

  it('sends a plain Fire for abilities without parameters', () => {
    expect(buildAction('rally', 'fire', 'front', 'tide')).toEqual({ action: 'fire' });
    expect(buildAction('purge', 'fire', 'front', 'tide')).toEqual({ action: 'fire' });
  });
});

describe('the event feed', () => {
  const names: EventNames = {
    boss: 'Colossus',
    creatures: { a: 'Alpha', b: 'Beta' },
    players: { p1: 'Misa' },
    abilities: { rally: 'Rally' },
  };
  const events: FightEvent[] = [
    { t: 'round_start', round: 1, bossHp: 100, mark: null },
    { t: 'turn', round: 1, creature: 'a' },
    {
      t: 'hit',
      round: 1,
      creature: 'a',
      damage: 10,
      matchupBp: 10_000,
      bonusBp: 0,
      mark: null,
      bossHp: 90,
    },
    { t: 'round_end', round: 1, bossHp: 90 },
    { t: 'round_start', round: 2, bossHp: 90, mark: null },
    { t: 'ability', round: 2, player: 'p1', ability: 'rally', byDefault: false },
    { t: 'turn', round: 2, creature: 'b' },
    { t: 'knockout', round: 2, creature: 'b' },
  ];

  it('finds the newest round', () => {
    expect(newestRound(events)).toBe(2);
    expect(newestRound([])).toBe(0);
  });

  it('lists the newest round newest first, without turn and round-end lines', () => {
    const lines = feedLines(events, names);
    expect(lines.map((l) => l.text)).toEqual([
      'Beta is knocked out.',
      'Misa uses Rally.',
      'Round 2: Colossus has 90 HP.',
    ]);
    expect(lines.map((l) => l.key)).toEqual([true, true, false]);
  });

  it('lists earlier rounds separately', () => {
    expect(earlierLines(events, names).map((l) => l.text)).toEqual([
      'Alpha hits Colossus for 10; 90 HP left.',
      'Round 1: Colossus has 100 HP.',
    ]);
    expect(feedLines([], names)).toEqual([]);
    expect(earlierLines([], names)).toEqual([]);
  });

  it('marks key moments', () => {
    expect(isKeyEvent({ t: 'knockout', round: 1, creature: 'a' })).toBe(true);
    expect(
      isKeyEvent({ t: 'ability', round: 1, player: 'p', ability: 'rally', byDefault: true }),
    ).toBe(true);
    expect(isKeyEvent({ t: 'gimmick', round: 1, gimmick: 'g', op: 'hit_zone' })).toBe(true);
    expect(isKeyEvent({ t: 'boss_hit', round: 1, source: 'attack', target: 'a', damage: 1 })).toBe(
      false,
    );
    expect(
      isKeyEvent({
        t: 'boss_hit',
        round: 1,
        source: 'attack',
        target: 'a',
        damage: 0,
        shielded: true,
      }),
    ).toBe(true);
    expect(isKeyEvent({ t: 'turn', round: 1, creature: 'a' })).toBe(false);
  });
});

describe('revealSummary', () => {
  it('shows a jackpot with the First on server flag', () => {
    const s = revealSummary(
      { cleared: true, essence: 40, jackpot: { essence: 100, firstOnServer: true } },
      0,
    );
    expect(s.outcome).toContain('cleared');
    expect(s.essence).toBe('You got 40 Essence');
    expect(s.jackpot).toEqual({ hit: true, text: 'Jackpot! +100 Essence', firstOnServer: true });
  });

  it('shows a jackpot that is not the first', () => {
    const s = revealSummary(
      { cleared: true, essence: 40, jackpot: { essence: 100, firstOnServer: false } },
      null,
    );
    expect(s.jackpot.firstOnServer).toBe(false);
    expect(s.jackpot.hit).toBe(true);
  });

  it('shows the pity counter on a miss', () => {
    const s = revealSummary({ cleared: false, essence: 5, jackpot: null }, 4);
    expect(s.cleared).toBe(false);
    expect(s.outcome).toContain('Not cleared');
    expect(s.jackpot).toEqual({
      hit: false,
      text: 'No jackpot this time (pity 4/10)',
      firstOnServer: false,
    });
  });

  it('leaves the pity out when it is not known', () => {
    const s = revealSummary({ cleared: true, essence: 0, jackpot: null }, null);
    expect(s.jackpot.text).toBe('No jackpot this time');
  });
});
