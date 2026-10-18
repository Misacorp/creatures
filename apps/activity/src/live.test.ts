import type { EventNames, FightEvent } from '@creatures/engine';
import { RULES, content } from '@creatures/game';
import { describe, expect, it } from 'vitest';
import type { LiveAbility, LiveLobby, LiveNone, LiveRunning } from './live-api';
import type { AbilityPreview, RaidReveal } from './raid-api';
import {
  abilityControls,
  abilityDef,
  abilityEffectLine,
  abilityTitle,
  createKeyLock,
  creatureAbilityRows,
  otherUsage,
  otherUsageText,
  othersSummary,
  ownAbilities,
  type OtherUsage,
  abilityParamKind,
  abilityPlanText,
  abilityStateText,
  autoFireTarget,
  noAbilityText,
  bannerText,
  buildAction,
  defaultRoundOf,
  earlierLines,
  errorRetryDelayMs,
  feedLines,
  finaleWindow,
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

function fightOf(over: Partial<LiveRunning> = {}): LiveRunning {
  return {
    status: 'live',
    practice: false,
    week: '2026-W41',
    party: 1,
    you: 'p1',
    startsAt: START,
    roundMs: null,
    rounds: 12,
    round: 3,
    // Rounds are as long as their content: these three are 9 s, 11 s and 10 s long.
    roundStarts: [START, START + 9_000, START + 20_000],
    nextRoundAt: START + 30_000,
    serverNow: START + 25_000,
    boss: { id: 'b', name: 'Tidal Colossus', element: 'tide', hpMax: 1000, hpStart: 1000 },
    row: [],
    rules: { guardHpBp: 0, guardArmorBp: 2_500 },
    board: null,
    names: { boss: 'Tidal Colossus', creatures: {} },
    abilities: [],
    events: [],
    bossHp: 900,
    watching: [],
    loot: null,
    ...over,
  };
}

function lobbyOf(over: Partial<LiveLobby> = {}): LiveLobby {
  return {
    status: 'lobby',
    practice: false,
    week: '2026-W41',
    party: 1,
    you: null,
    startsAt: START,
    roundMs: null,
    rounds: 12,
    round: 0,
    roundStarts: [],
    nextRoundAt: START,
    serverNow: START - 60_000,
    boss: { id: 'b', name: 'Tidal Colossus', element: 'tide', hpMax: null, hpStart: null },
    row: [],
    rules: null,
    board: null,
    names: null,
    abilities: [],
    events: [],
    bossHp: null,
    watching: [],
    loot: null,
    ...over,
  };
}

function abilityOf(over: Partial<LiveAbility> = {}): LiveAbility {
  return {
    key: 'p1:basic',
    alias: 'p1',
    abilityId: 'rally',
    creature: null,
    mode: 'default',
    autoFire: over.mode !== 'held',
    fired: false,
    firedAtRound: null,
    fireAtRound: null,
    defaultRound: 6,
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
    // The longest finale is 12 rounds of 22 s.
    expect(finaleWindow(finale, 12, finale + 12 * 22_000)).toBe('live');
    expect(finaleWindow(finale, 12, finale + 12 * 22_000 + 30_000)).toBe('after');
  });
});

describe('bannerText', () => {
  it('words the banner', () => {
    expect(bannerText('lobby', START, START - 252_000)).toBe('Finale starts in 4:12');
    expect(bannerText('live', START, START + 1)).toBe('The finale is on now');
    expect(bannerText('before', START, 0)).toBe('');
  });
});

describe('nextBoundaryAt', () => {
  it("is the start before the fight and the server's next round start after", () => {
    const live = fightOf();
    expect(nextBoundaryAt(live, START - 5)).toBe(START);
    expect(nextBoundaryAt(live, START)).toBe(START + 30_000);
    expect(nextBoundaryAt(live, START + 29_999)).toBe(START + 30_000);
  });

  it('is null when the server has nothing to wait for', () => {
    expect(nextBoundaryAt(fightOf({ nextRoundAt: null }), START + 130_000)).toBeNull();
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

  it('polls just after the round start the server announced (nextRoundAt), however long the round is', () => {
    // 1 s before the boundary at +30 s: wait for it, plus the slack.
    expect(nextPollDelay(live, START + 29_000)).toBe(1300);
    // 100 ms before the boundary.
    expect(nextPollDelay(live, START + 29_900)).toBe(400);
    // A short round: the boundary is where the server says.
    const short = fightOf({ nextRoundAt: START + 26_000 });
    expect(nextPollDelay(short, START + 25_000)).toBe(1300);
  });

  it('never polls faster than the minimum, and does not hammer a stale snapshot', () => {
    expect(nextPollDelay(live, START + 30_000 - 1)).toBeGreaterThanOrEqual(250);
    // Just past the boundary and still no news: ask again quickly.
    expect(nextPollDelay(live, START + 30_100)).toBe(250);
    // Long past it (a stale snapshot, a clock estimate that is off): back to every 2 s.
    expect(nextPollDelay(live, START + 33_000)).toBe(2000);
  });

  it('waits for the start in the lobby', () => {
    const lobby = lobbyOf();
    expect(nextPollDelay(lobby, START - 60_000)).toBe(2000);
    expect(nextPollDelay(lobby, START - 1_000)).toBe(1300);
  });

  it('keeps polling after the last round until "done" arrives, then gives up after the longest finale', () => {
    const ended = fightOf({ round: 12, nextRoundAt: null });
    const end = START + 12 * 22_000;
    expect(nextPollDelay(ended, end - 100_000)).toBe(2000);
    expect(nextPollDelay(ended, end + 1_000)).toBe(2000);
    expect(nextPollDelay(ended, end + GIVE_UP_MS + 1)).toBeNull();
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

  it('takes a snapshot of another kind when it is not older', () => {
    const none: LiveNone = { status: 'none', serverNow: START + 30_000 };
    expect(pickNewer(fightOf(), none)).toBe(none);
  });
});

describe('progressText', () => {
  it("counts the round and the time to the next one, from the server's schedule", () => {
    const fight = fightOf({ round: 3 });
    expect(progressText(fight, START + 25_000)).toEqual({
      headline: 'Round 3 / 12',
      countdown: 'Next round in 5s',
    });
    // A shorter round counts down to its own end.
    expect(progressText(fightOf({ nextRoundAt: START + 27_500 }), START + 25_000).countdown).toBe(
      'Next round in 3s',
    );
  });

  it('counts down to the start in the lobby', () => {
    const lobby = lobbyOf();
    expect(progressText(lobby, START - 252_000)).toEqual({
      headline: 'Waiting for the finale to start',
      countdown: 'Starts in 4:12',
    });
  });

  it('says when it is the last round and when it is over', () => {
    const last = fightOf({ round: 12, nextRoundAt: START + 120_000 });
    expect(progressText(last, START + 115_000)).toEqual({
      headline: 'Last round (12 / 12)',
      countdown: 'Ends in 5s',
    });
    expect(progressText(fightOf({ status: 'done', round: 12 }), START + 200_000)).toEqual({
      headline: 'The fight is over',
      countdown: '',
    });
  });

  it('calls the round the boss has fallen in the last one, and says nothing without a next time', () => {
    const fell = fightOf({ round: 5, bossHp: 0, nextRoundAt: START + 60_000 });
    expect(progressText(fell, START + 55_000)).toEqual({
      headline: 'Last round (5 / 12)',
      countdown: 'Ends in 5s',
    });
    expect(progressText(fightOf({ round: 12, nextRoundAt: null }), START + 55_000).countdown).toBe(
      '',
    );
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
    expect(abilityStateText(abilityOf(), 12, true)).toBe('Fires on its own in round 6');
    expect(abilityStateText(abilityOf({ mode: 'fired', fireAtRound: 7 }), 12, true)).toBe(
      'Fires at the start of round 7',
    );
    expect(abilityStateText(abilityOf({ mode: 'fired' }), 12, true)).toBe(
      'Fires at the start of the next round',
    );
    expect(abilityStateText(abilityOf({ mode: 'held' }), 12, true)).toBe(
      "Auto fire is off: it fires in the last round if you don't",
    );
    expect(abilityStateText(abilityOf({ mode: 'held' }), 12, false)).toContain('round 12');
    expect(
      abilityStateText(abilityOf({ mode: 'fired', fired: true, firedAtRound: 5 }), 12, true),
    ).toBe('Used in round 5');
    expect(abilityStateText(abilityOf({ fired: true }), 12, true)).toBe('Used');
  });

  it('falls back when the ability is unknown', () => {
    const unknown = abilityOf({ abilityId: 'mystery', defaultRound: 0 });
    expect(abilityStateText(unknown, 12, true)).toBe('Fires on its own');
    expect(defaultRoundOf(unknown)).toBeNull();
  });

  it("uses the server's default round, not the content's", () => {
    // Shield Wall's default depends on the boss: the content says 3, the server says 5.
    const wall = abilityOf({ abilityId: 'shield-wall', defaultRound: 5 });
    expect(defaultRoundOf(wall)).toBe(5);
    expect(abilityStateText(wall, 12, true)).toBe('Fires on its own in round 5');
    expect(abilityControls(fightOf({ round: 4 }), wall).canToggle).toBe(true);
    expect(abilityControls(fightOf({ round: 5 }), wall).canToggle).toBe(false);
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
  it('offers Fire and the Auto fire toggle (on) before the default round', () => {
    const c = abilityControls(fightOf({ round: 3 }), abilityOf());
    expect(c).toEqual({ canFire: true, canToggle: true, autoOn: true, note: '' });
  });

  it('offers only Fire from the default round on', () => {
    const c = abilityControls(fightOf({ round: 6 }), abilityOf());
    expect(c.canFire).toBe(true);
    expect(c.canToggle).toBe(false);
  });

  it('offers the toggle both ways: a held ability can be turned back on before its default round', () => {
    const early = abilityControls(fightOf({ round: 2 }), abilityOf({ mode: 'held' }));
    expect(early).toEqual({ canFire: true, canToggle: true, autoOn: false, note: '' });
    const late = abilityControls(fightOf({ round: 6 }), abilityOf({ mode: 'held' }));
    expect(late.canFire).toBe(true);
    expect(late.canToggle).toBe(false);
    expect(late.autoOn).toBe(false);
  });

  it('offers nothing once it is fired or used', () => {
    const none = { canFire: false, canToggle: false, autoOn: true, note: '' };
    expect(abilityControls(fightOf(), abilityOf({ mode: 'fired', fireAtRound: 5 }))).toEqual(none);
    expect(abilityControls(fightOf(), abilityOf({ fired: true }))).toEqual(none);
    expect(abilityControls(fightOf({ status: 'done' }), abilityOf())).toEqual(none);
  });

  it('offers only the Auto fire toggle in the lobby, as the preference for the start', () => {
    const on = abilityControls(lobbyOf(), abilityOf());
    expect(on).toEqual({ canFire: false, canToggle: true, autoOn: true, note: '' });
    const off = abilityControls(lobbyOf(), abilityOf({ mode: 'held' }));
    expect(off).toEqual({ canFire: false, canToggle: true, autoOn: false, note: '' });
    // Also for an ability whose default round is not known to the client.
    expect(abilityControls(lobbyOf(), abilityOf({ defaultRound: 0 })).canToggle).toBe(true);
  });

  it('offers nothing in the last round', () => {
    const c = abilityControls(fightOf({ round: 12 }), abilityOf({ mode: 'held' }));
    expect(c.canFire).toBe(false);
    expect(c.canToggle).toBe(false);
    expect(c.note).toContain('too late');
  });
});

describe('buildAction', () => {
  it('names the ability by its key in every request', () => {
    expect(buildAction('m1:c2', 'flare-strike', 'fire', '', '')).toEqual({
      key: 'm1:c2',
      action: 'fire',
    });
    expect(buildAction('m1:c2', 'flare-strike', 'hold', '', '')).toEqual({
      key: 'm1:c2',
      action: 'hold',
    });
    expect(buildAction('m1:c2', 'flare-strike', 'unhold', '', '')).toEqual({
      key: 'm1:c2',
      action: 'unhold',
    });
  });

  it('sends the auto fire toggle with nothing else', () => {
    for (const action of ['hold', 'unhold'] as const) {
      expect(buildAction('m1:basic', 'rally', action, 'front', 'ember')).toEqual({
        key: 'm1:basic',
        action,
      });
    }
  });

  it('sends the zone only for Shield Wall', () => {
    expect(buildAction('m1:basic', 'shield-wall', 'fire', 'back', 'ember')).toEqual({
      key: 'm1:basic',
      action: 'fire',
      zone: 'back',
    });
    expect(buildAction('m1:basic', 'shield-wall', 'fire', '', 'ember')).toEqual({
      key: 'm1:basic',
      action: 'fire',
    });
    expect(buildAction('m1:basic', 'shield-wall', 'fire', 'sideways', '')).toEqual({
      key: 'm1:basic',
      action: 'fire',
    });
  });

  it('sends the element only for Re-mark, and only a real one', () => {
    const element = content.elements[0]?.id ?? '';
    expect(buildAction('m1:basic', 're-mark', 'fire', 'front', element)).toEqual({
      key: 'm1:basic',
      action: 'fire',
      element,
    });
    expect(buildAction('m1:basic', 're-mark', 'fire', '', 'not-an-element')).toEqual({
      key: 'm1:basic',
      action: 'fire',
    });
  });

  it('sends a plain Fire for abilities without parameters, creature abilities included', () => {
    expect(buildAction('m1:basic', 'rally', 'fire', 'front', 'tide')).toEqual({
      key: 'm1:basic',
      action: 'fire',
    });
    expect(buildAction('m1:basic', 'purge', 'fire', 'front', 'tide')).toEqual({
      key: 'm1:basic',
      action: 'fire',
    });
    // Whatever zone or element was picked on another ability never leaks into a creature ability.
    expect(buildAction('m1:c0', 'tidal-mark', 'fire', 'back', 'tide')).toEqual({
      key: 'm1:c0',
      action: 'fire',
    });
  });
});

describe('the key lock (double-tap protection per ability)', () => {
  it('lets the first tap through and refuses the second until released', () => {
    const lock = createKeyLock();
    expect(lock.acquire('m1:basic')).toBe(true);
    expect(lock.has('m1:basic')).toBe(true);
    expect(lock.acquire('m1:basic')).toBe(false);
    lock.release('m1:basic');
    expect(lock.acquire('m1:basic')).toBe(true);
  });

  it('does not block another ability while one is in flight', () => {
    const lock = createKeyLock();
    expect(lock.acquire('m1:basic')).toBe(true);
    expect(lock.acquire('m1:c0')).toBe(true);
    expect(lock.acquire('m1:c0')).toBe(false);
    lock.release('m1:basic');
    expect(lock.has('m1:c0')).toBe(true);
    expect(lock.has('m1:basic')).toBe(false);
  });
});

describe('ability texts', () => {
  const names = { creatures: { 'cid-1': 'Cindle', 'cid-2': 'Rex' } };

  it('labels a creature ability with its creature and a basic ability as basic', () => {
    expect(abilityTitle({ abilityId: 'flare-strike', creature: 'cid-1' }, names)).toBe(
      "Cindle's Flare Strike",
    );
    expect(abilityTitle({ abilityId: 'rally', creature: null }, names)).toBe('Rally (basic)');
    // An unknown creature or ability still reads sensibly.
    expect(abilityTitle({ abilityId: 'flare-strike', creature: 'gone' }, names)).toBe(
      'Flare Strike',
    );
    expect(abilityTitle({ abilityId: 'mystery', creature: null }, names)).toBe('mystery (basic)');
  });

  it('has a one-line effect from the content', () => {
    expect(abilityEffectLine('flare-strike')).toContain('220%');
    expect(abilityEffectLine('nope')).toBe('');
  });

  it('keeps names as plain text: markup in a creature name stays markup text', () => {
    const odd = { creatures: { x: '<img src=x onerror=alert(1)>' } };
    expect(abilityTitle({ abilityId: 'flare-strike', creature: 'x' }, odd)).toBe(
      "<img src=x onerror=alert(1)>'s Flare Strike",
    );
  });

  it('lists only the caller own abilities', () => {
    const list = [
      abilityOf({ key: 'm1:basic', alias: 'm1' }),
      abilityOf({ key: 'm1:c0', alias: 'm1', abilityId: 'flare-strike', creature: 'cid-1' }),
      abilityOf({ key: 'm2:basic', alias: 'm2' }),
    ];
    expect(ownAbilities(list, 'm1').map((a) => a.key)).toEqual(['m1:basic', 'm1:c0']);
    expect(ownAbilities(list, null)).toEqual([]);
  });

  it('summarises other players: used of total, and the latest used', () => {
    const list = [
      abilityOf({ key: 'm1:basic', alias: 'm1' }),
      abilityOf({ key: 'm2:basic', alias: 'm2', fired: true, firedAtRound: 2 }),
      abilityOf({
        key: 'm2:c0',
        alias: 'm2',
        abilityId: 'flare-strike',
        creature: 'cid-2',
        fired: true,
        firedAtRound: 5,
      }),
      abilityOf({ key: 'm2:c1', alias: 'm2', abilityId: 'flare-strike', creature: 'cid-1' }),
      abilityOf({ key: 'm3:basic', alias: 'm3' }),
    ];
    const usage = otherUsage(list, 'm1');
    expect(usage.map((u) => [u.alias, u.used, u.total])).toEqual([
      ['m2', 2, 3],
      ['m3', 0, 1],
    ]);
    expect(otherUsageText(usage[0] as OtherUsage, names)).toBe(
      "2 / 3 used. Latest: Rex's Flare Strike (round 5)",
    );
    expect(otherUsageText(usage[1] as OtherUsage, names)).toBe('0 / 1 used');
    expect(othersSummary(usage)).toBe("Others' abilities (2 / 4 used)");
    expect(othersSummary([])).toBe("Others' abilities (0 / 0 used)");
  });

  it('lists creature abilities for the Raid tab, locked ones with the level they need', () => {
    const team = [
      { creatureId: 'a', species: 'cindle', name: 'Cindle', level: 12, slot: null },
      { creatureId: 'b', species: 'splashet', name: 'Bubbles', level: 7, slot: 3 },
    ];
    const preview: AbilityPreview[] = [
      {
        key: 'm1:basic',
        abilityId: 'rally',
        creatureId: null,
        species: null,
        unlocked: true,
        unlockLevel: 1,
        autoFire: true,
      },
      {
        key: 'm1:c0',
        abilityId: 'flare-strike',
        creatureId: 'a',
        species: 'cindle',
        unlocked: true,
        unlockLevel: 10,
        autoFire: false,
      },
      {
        abilityId: 'tidal-mark',
        creatureId: 'b',
        species: 'splashet',
        unlocked: false,
        unlockLevel: 10,
        autoFire: true,
      },
    ];
    const rows = creatureAbilityRows(preview, team);
    expect(rows).toHaveLength(2); // the basic ability is the picker's
    expect(rows[0]).toMatchObject({
      creatureId: 'a',
      abilityId: 'flare-strike',
      title: "Cindle's Flare Strike",
      unlocked: true,
      status: 'Ready for the finale',
      autoFire: false,
    });
    expect(rows[1]).toMatchObject({
      autoFire: true,
      title: "Bubbles's Tidal Mark",
      unlocked: false,
      status: 'Unlocks at level 10 (now level 7)',
    });
    expect(rows[1]?.effect).toContain('Soaked');
  });
});

describe('the Auto fire preference target', () => {
  it('is the creature id for a creature ability and "basic" for the basic ability', () => {
    expect(autoFireTarget(abilityOf())).toBe('basic');
    expect(autoFireTarget(abilityOf({ creature: 'c-1' }))).toBe('c-1');
  });
});

describe('what a tap on a creature with no ability says', () => {
  const unlock = RULES.abilities.unlockLevel;
  it('says when the ability unlocks for a creature below the unlock level', () => {
    expect(noAbilityText('cindle', unlock - 3)).toBe(
      `Its ability unlocks at level ${String(unlock)}. It is level ${String(unlock - 3)} now.`,
    );
  });

  it('says so when the species has no finale ability, and when the ability is just not here', () => {
    const none = content.creatures.find((c) => c.ability === undefined);
    if (none !== undefined) {
      expect(noAbilityText(none.id, unlock)).toBe('This creature has no finale ability.');
    }
    expect(noAbilityText('no-such-species', 1)).toBe('This creature has no finale ability.');
    expect(noAbilityText('cindle', unlock)).toBe('Its ability is not part of this fight.');
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
    { t: 'ability', round: 2, player: 'p1', ability: 'rally', key: 'p1:basic', byDefault: false },
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

  it("reads creature abilities by creature, and a strike hit as the ability's hit", () => {
    const named: EventNames = {
      ...names,
      creatures: { ...names.creatures, c: 'Cindle' },
      abilities: { rally: 'Rally', 'flare-strike': 'Flare Strike' },
    };
    const round: FightEvent[] = [
      {
        t: 'ability',
        round: 3,
        player: 'p1',
        ability: 'flare-strike',
        key: 'p1:c0',
        creature: 'c',
        byDefault: false,
      },
      {
        t: 'hit',
        round: 3,
        creature: 'c',
        ability: 'flare-strike',
        key: 'p1:c0',
        damage: 88,
        matchupBp: 10_000,
        bonusBp: 0,
        mark: null,
        bossHp: 2,
      },
    ];
    expect(feedLines(round, named).map((l) => l.text)).toEqual([
      "Cindle's Flare Strike hits Colossus for 88; 2 HP left.",
      "Misa uses Cindle's Flare Strike.",
    ]);
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
      isKeyEvent({
        t: 'ability',
        round: 1,
        player: 'p',
        ability: 'rally',
        key: 'p:basic',
        byDefault: true,
      }),
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
  it('shows one Essence figure and the outcome, and nothing about a jackpot or pity', () => {
    const s = revealSummary({ cleared: true, essence: 140 });
    expect(s.outcome).toContain('cleared');
    expect(s.essence).toBe('You got 140 Essence');
    expect(Object.keys(s).sort()).toEqual(['cleared', 'essence', 'festival', 'outcome', 'rank']);
    expect(JSON.stringify(s)).not.toMatch(/jackpot|pity/i);
    const lost = revealSummary({ cleared: false, essence: 5 });
    expect(lost.cleared).toBe(false);
    expect(lost.outcome).toContain('Not cleared');
    expect(JSON.stringify(lost)).not.toMatch(/jackpot|pity/i);
  });

  it('says where the server’s rank went, and nothing before the ladder has moved', () => {
    const base = { cleared: true, essence: 1 };
    expect(revealSummary(base).rank).toBeNull();
    expect(revealSummary({ ...base, rankChange: null, festivalGrant: null }).rank).toBeNull();
    const change = (before: number, after: number, festival = false) =>
      revealSummary({ ...base, rankChange: { before, after, festival, serverWon: true } }).rank;
    expect(change(4, 5)).toBe('The server climbs to Rank 5.');
    expect(change(4, 4)).toBe('Rank 4 stays.');
    expect(change(4, 3, true)).toBe('The Festival is over. The server eases to Rank 3.');
  });

  it('says what the Festival creature did, with the First on server flag', () => {
    const base = { cleared: true, essence: 1 };
    expect(revealSummary(base).festival).toBeNull();
    const grant = (g: NonNullable<RaidReveal['festivalGrant']>) =>
      revealSummary({ ...base, festivalGrant: g }).festival;
    expect(grant({ species: 'hearthshell', outcome: 'new', firstOnServer: true })).toEqual({
      text: 'You won Hearthshell! A new level 1 creature for your collection.',
      firstOnServer: true,
    });
    expect(
      grant({ species: 'lanternfin', outcome: 'fused', fusionCount: 2, firstOnServer: false })
        ?.text,
    ).toBe('You won Lanternfin again: it fused with yours (fusion 2 / 5).');
    expect(
      grant({ species: 'lanternfin', outcome: 'converted', bait: 80, firstOnServer: false })?.text,
    ).toBe('You already had a fully fused Lanternfin: +80 Bait instead.');
  });
});
