import { RULES, content, createSeededRng, jackpotEssenceFor } from '@creatures/game';
import { simulateFight, type FightEvent } from '@creatures/engine';
import { describe, expect, it } from 'vitest';
import { LIVE_ROUND_MS, PRACTICE_LOBBY_MS } from '../src/raid-live';
import type { LiveSnapshot } from '../src/raid-live-view';
import { buildPhaseInput } from '../src/raid-resolve';
import { eventTimes } from '../src/raid-schedule';
import type { RaidView, ReplayView } from '../src/raid-view';
import actionFire from '../../activity/src/fixtures/action-fire.json';
import errorFixtures from '../../activity/src/fixtures/errors.json';
import liveDoneHit from '../../activity/src/fixtures/live-done-hit.json';
import liveLobby from '../../activity/src/fixtures/live-lobby.json';
import liveMid from '../../activity/src/fixtures/live-mid.json';
import liveNone from '../../activity/src/fixtures/live-none.json';
import collectionState from '../../activity/src/fixtures/collection-state.json';
import raidAutofire from '../../activity/src/fixtures/raid-autofire.json';
import raidFestival from '../../activity/src/fixtures/raid-festival.json';
import raidFestivalReveal from '../../activity/src/fixtures/raid-festival-reveal.json';
import raidReveal from '../../activity/src/fixtures/raid-reveal.json';
import requestBodies from '../../activity/src/fixtures/request-bodies.json';
import type { CoreContext } from './helpers';
import {
  HELSINKI,
  MINUTE,
  W02,
  count,
  forcePool,
  membersOf,
  raidLedger,
  rows,
  runRaid,
  scriptedThenSeeded,
  seedPlayer,
  storedRuns,
  weekPayout,
  type Seeded,
} from './raid-helpers';

type Ctx = CoreContext;

const FINALE = eventTimes(W02.id, HELSINKI).finale;
const ROUND = LIVE_ROUND_MS;
const ROUNDS = 12;
const BIG = 50_000_000;
/** Below the ability unlock level: every member brings the basic ability only. */
const BELOW_UNLOCK = RULES.abilities.unlockLevel - 1;
/** At the unlock level: every creature with an ability brings it. */
const UNLOCKED = RULES.abilities.unlockLevel;

/**
 * Seeds `n` players, opens the week and resolves phases 1 and 2. The finale is left for the test,
 * with the clock a few minutes before it and a boss pool that no party can empty (unless asked).
 */
function toFinale(
  ctx: Ctx,
  n = 2,
  options: { current?: number; level?: number; atk?: number } = {},
): Seeded[] {
  const players = Array.from({ length: n }, (_, i) =>
    seedPlayer(ctx, i + 1, { level: options.level ?? BELOW_UNLOCK }),
  );
  ctx.core.raid.currentWeek(HELSINKI);
  ctx.clock.t = W02.afterPhase2;
  ctx.core.raid.runDue(HELSINKI);
  expect(new Set(storedRuns(ctx.sql).map((r) => r.phase))).toEqual(new Set(['phase1', 'phase2']));
  forcePool(ctx.sql, BIG, options.current ?? BIG, options.atk ?? 1);
  ctx.clock.t = FINALE - 10 * MINUTE;
  return players;
}

/** The party's members as seeded players, in the engine's order (m1, m2, ...). */
function inOrder(ctx: Ctx, players: Seeded[], party = 1): Seeded[] {
  return membersOf(ctx.sql, party).map((id) => players.find((p) => p.id === id) as Seeded);
}

const at = (ctx: Ctx, offsetMs: number): void => {
  ctx.clock.t = FINALE + offsetMs;
};
/** The finale event runs on time (the alarm): the live fights start at 20:00 sharp. */
const begin = (ctx: Ctx): void => {
  at(ctx, 0);
  ctx.core.raid.runDue(HELSINKI);
  expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBeGreaterThan(0);
};
/** Within round `r` (1-based): one second after it starts. */
const inRound = (ctx: Ctx, r: number): void => at(ctx, (r - 1) * ROUND + 1000);

const snap = (ctx: Ctx, p: Seeded): LiveSnapshot => ctx.core.raid.liveSnapshot(p.id, HELSINKI);
/** The engine alias of a party member (`m1`, ...). */
const aliasOf = (ctx: Ctx, p: Seeded): string => {
  const party = rows<{ party: number }>(
    ctx.sql,
    'SELECT party FROM raid_party_members WHERE user_id = ?',
    p.id,
  )[0]?.party;
  return `m${membersOf(ctx.sql, party ?? 1).indexOf(p.id) + 1}`;
};
/** Fire, Hold or Unhold (the Auto fire toggle); without `key` it is the caller's basic ability. */
const act = (
  ctx: Ctx,
  p: Seeded,
  body: {
    action: 'fire' | 'hold' | 'unhold';
    zone?: 'front' | 'middle' | 'back';
    element?: 'tide';
    key?: string;
  },
) =>
  ctx.core.raid.liveAction(p.id, HELSINKI, {
    ...body,
    key: body.key ?? `${aliasOf(ctx, p)}:basic`,
  });
const pick = (ctx: Ctx, p: Seeded, abilityId: string): void => {
  expect(ctx.core.raid.setAbility(p.id, HELSINKI, abilityId)).toEqual({ ok: true, value: null });
};
const finaleRows = (ctx: Ctx) => count(ctx.sql, 'raid_results', "phase = 'finale'");
const abilityEvents = (events: readonly FightEvent[], alias: string) =>
  events.filter(
    (e): e is Extract<FightEvent, { t: 'ability' }> =>
      e.t === 'ability' && e.player === alias && e.key === `${alias}:basic`,
  );
const err = (outcome: { ok: boolean } & Record<string, unknown>) =>
  outcome.ok ? 'ok' : `${String(outcome['status'])} ${String(outcome['error'])}`;

describe('the live finale lifecycle', () => {
  it('uses 15 second rounds for a new fight, and keeps the round length a stored fight started with', async () => {
    expect(ROUND).toBe(15_000);
    await runRaid((ctx) => {
      const [a] = toFinale(ctx);
      const player = a as Seeded;
      begin(ctx);
      expect(rows(ctx.sql, 'SELECT DISTINCT round_ms FROM raid_live')).toEqual([
        { round_ms: 15_000 },
      ]);
      // 12 rounds are 3 minutes.
      expect(12 * ROUND).toBe(3 * MINUTE);
      at(ctx, 25_000);
      expect(snap(ctx, player)).toMatchObject({ roundMs: 15_000, round: 2 });

      // A fight stored under the old 10 second rounds keeps them: the snapshot and the clock use the
      // stored value, whatever the constant says now.
      ctx.sql.exec('UPDATE raid_live SET round_ms = 10000');
      expect(snap(ctx, player)).toMatchObject({ roundMs: 10_000, round: 3 });
    });
  });

  it('is quiet before the lobby, then lobby, then live with rounds from the clock', async () => {
    await runRaid((ctx) => {
      const [a] = toFinale(ctx);
      const player = a as Seeded;
      ctx.clock.t = W02.afterPhase2;
      expect(snap(ctx, player)).toMatchObject({ status: 'none', startsAt: null, events: [] });

      // The lobby opens five minutes before.
      at(ctx, -5 * MINUTE - 1);
      expect(snap(ctx, player).status).toBe('none');
      at(ctx, -4 * MINUTE);
      const lobby = snap(ctx, player);
      expect(lobby).toMatchObject({
        status: 'lobby',
        practice: false,
        week: W02.id,
        party: 1,
        startsAt: FINALE,
        roundMs: ROUND,
        rounds: ROUNDS,
        round: 0,
        serverNow: FINALE - 4 * MINUTE,
        events: [],
        loot: null,
        you: 'm1',
      });
      expect(lobby.boss.name).toBeTruthy();
      // The lobby already shows the stage: the row as it would fight now and the caller's abilities.
      expect(lobby.row).toHaveLength(9); // two players: guests fill the row
      expect(lobby.row.filter((c) => c.owner === 'm1')).toHaveLength(3);
      expect(lobby.names?.players?.['m1']).toBe(player.name);
      expect(lobby.abilities).toHaveLength(1); // below the unlock level: the basic ability only
      expect(lobby.abilities[0]).toMatchObject({
        key: 'm1:basic',
        alias: 'm1',
        creature: null,
        mode: 'default',
        autoFire: true,
        fired: false,
        firedAtRound: null,
        fireAtRound: null,
      });
      expect(lobby.boss.hpMax).toBe(BIG);
      expect(lobby.bossHp).toBe(BIG);
      expect(count(ctx.sql, 'raid_live')).toBe(0);

      // The finale event starts the fight.
      at(ctx, 0);
      const first = snap(ctx, player);
      expect(first).toMatchObject({ status: 'live', startsAt: FINALE, round: 1, you: 'm1' });
      expect(first.row).toHaveLength(9); // two players: guests fill the row
      expect(first.events.length).toBeGreaterThan(0);
      expect(first.events.every((e) => e.round <= 1)).toBe(true);
      expect(first.events.some((e) => e.t === 'round_end' && e.round === 1)).toBe(true);
      expect(first.bossHp).toBeLessThan(BIG);
      expect(rows(ctx.sql, 'SELECT status FROM raid_weeks')).toEqual([{ status: 'finale' }]);
      expect(count(ctx.sql, 'raid_live')).toBe(1);
      expect(finaleRows(ctx)).toBe(0);

      // Rounds advance with the clock, and every snapshot extends the one before.
      let before = first.events;
      for (const [offset, round] of [
        [ROUND - 1, 1],
        [ROUND, 2],
        [2 * ROUND + 5000, 3],
        [11 * ROUND, 12],
        [12 * ROUND - 1, 12],
      ] as const) {
        at(ctx, offset);
        const s = snap(ctx, player);
        expect(s.round).toBe(round);
        expect(s.status).toBe('live');
        expect(s.events.every((e) => e.round <= round)).toBe(true);
        expect(s.events.slice(0, before.length)).toEqual(before);
        before = s.events;
      }
      expect(Math.max(...before.map((e) => e.round))).toBe(12);
      expect(finaleRows(ctx)).toBe(0);
    });
  });

  it('keeps the fight going over a restart: the clock carries it on', async () => {
    await runRaid((ctx) => {
      const [a] = toFinale(ctx);
      begin(ctx);
      at(ctx, 5 * ROUND);
      const live = snap(ctx, a as Seeded);
      expect(live.round).toBe(6);
      // A fresh object (nothing in memory) shows the same fight.
      const again = snap(ctx, a as Seeded);
      expect(again.events).toEqual(live.events);
    });
  });

  it('never sends the seed before the fight has resolved, nor after in a live response', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      at(ctx, 0);
      const seen: unknown[] = [snap(ctx, a)];
      const seed = rows<{ seed: string }>(ctx.sql, 'SELECT seed FROM raid_live')[0]?.seed as string;
      expect(seed).toMatch(/^[0-9a-f]{32}$/);
      inRound(ctx, 2);
      expect(err(ctx.core.raid.setAbility(b.id, HELSINKI, 'rally'))).toBe('409 locked');
      seen.push(act(ctx, a, { action: 'fire' }), act(ctx, b, { action: 'hold' }));
      seen.push(snap(ctx, b), ctx.core.raid.view(a.id, HELSINKI));
      at(ctx, 12 * ROUND + 1);
      seen.push(snap(ctx, a), snap(ctx, b));
      expect(finaleRows(ctx)).toBe(1);
      for (const response of seen) {
        const text = JSON.stringify(response);
        expect(text).not.toContain(seed);
        expect(text).not.toMatch(/"seed"/);
      }
      // After the fight the seed is public in the replay, and it reproduces the fight.
      const run = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      expect(run?.seed).toBe(seed);
      expect(
        simulateFight(run?.input as NonNullable<typeof run>['input'], createSeededRng(seed)).events,
      ).toEqual(run?.result.events);
    });
  });
});

describe('Fire and Hold', () => {
  it('takes effect at the start of the next round, with the chosen zone', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'shield-wall');
      begin(ctx);
      inRound(ctx, 2);
      const outcome = act(ctx, a, { action: 'fire', zone: 'back' });
      expect(outcome.ok).toBe(true);
      const fired = outcome.ok ? outcome.value : null;
      // Round 2 is playing: the ability waits for round 3.
      expect(fired?.abilities[0]).toMatchObject({
        alias: 'm1',
        abilityId: 'shield-wall',
        mode: 'fired',
        fired: false,
        firedAtRound: null,
        fireAtRound: 3,
      });
      expect(abilityEvents(fired?.events ?? [], 'm1')).toEqual([]);
      inRound(ctx, 3);
      const later = snap(ctx, a);
      expect(abilityEvents(later.events, 'm1')).toEqual([
        {
          t: 'ability',
          round: 3,
          player: 'm1',
          ability: 'shield-wall',
          key: 'm1:basic',
          zone: 'back',
          byDefault: false,
        },
      ]);
      expect(later.abilities[0]).toMatchObject({ fired: true, firedAtRound: 3, fireAtRound: null });
    });
  });

  it('passes the element of Re-mark and rejects parameters the ability does not take', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 're-mark');
      pick(ctx, b, 'rally');
      begin(ctx);
      inRound(ctx, 1);
      expect(err(act(ctx, a, { action: 'fire', zone: 'front' }))).toBe('400 invalid_body');
      expect(err(act(ctx, b, { action: 'fire', element: 'tide' }))).toBe('400 invalid_body');
      expect(err(act(ctx, b, { action: 'fire', zone: 'front' }))).toBe('400 invalid_body');
      expect(err(act(ctx, a, { action: 'hold', element: 'tide' }))).toBe('400 invalid_body');
      // Nothing changed.
      expect(snap(ctx, a).abilities.map((x) => x.mode)).toEqual(['default', 'default']);
      expect(act(ctx, a, { action: 'fire', element: 'tide' }).ok).toBe(true);
      inRound(ctx, 2);
      expect(abilityEvents(snap(ctx, a).events, 'm1')[0]).toMatchObject({
        round: 2,
        ability: 're-mark',
        element: 'tide',
        byDefault: false,
      });
    });
  });

  it('holds past the default and fires an unused hold in the last round', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'purge'); // default round 2
      pick(ctx, b, 'rally'); // default round 6
      begin(ctx);
      inRound(ctx, 1);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      // Holding again is harmless.
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      inRound(ctx, 11);
      const s11 = snap(ctx, a);
      expect(abilityEvents(s11.events, 'm1')).toEqual([]); // purge held through round 2 and on
      expect(abilityEvents(s11.events, 'm2')[0]).toMatchObject({ round: 6, byDefault: true });
      expect(s11.abilities[0]).toMatchObject({ mode: 'held', fired: false });
      inRound(ctx, 12);
      const s12 = snap(ctx, a);
      expect(abilityEvents(s12.events, 'm1')).toEqual([
        expect.objectContaining({ round: 12, ability: 'purge', byDefault: false }),
      ]);
      expect(s12.abilities[0]).toMatchObject({ fired: true, firedAtRound: 12 });
    });
  });

  it('lets a held ability fire when its owner presses Fire', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally');
      begin(ctx);
      inRound(ctx, 4);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      inRound(ctx, 8);
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);
      inRound(ctx, 12);
      expect(abilityEvents(snap(ctx, a).events, 'm1')).toEqual([
        expect.objectContaining({ round: 9, ability: 'rally', byDefault: false }),
      ]);
    });
  });

  it('refuses Hold from the default round on, but allows it in the round before', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally'); // default round 6
      pick(ctx, b, 'purge'); // default round 2
      begin(ctx);
      inRound(ctx, 5);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      inRound(ctx, 2);
      expect(err(act(ctx, b, { action: 'hold' }))).toBe('409 hold_too_late');
      inRound(ctx, 3);
      expect(err(act(ctx, b, { action: 'hold' }))).toBe('409 hold_too_late');
    });
  });

  it('turns auto fire back on (Unhold) before the default round, and the ability fires by default again', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally'); // default round 6
      begin(ctx);
      inRound(ctx, 2);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      expect(snap(ctx, a).abilities[0]).toMatchObject({ mode: 'held' });
      inRound(ctx, 3);
      expect(act(ctx, a, { action: 'unhold' }).ok).toBe(true);
      expect(snap(ctx, a).abilities[0]).toMatchObject({ mode: 'default', fired: false });
      // It can be switched off and on again, as often as the round allows.
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      expect(act(ctx, a, { action: 'unhold' }).ok).toBe(true);
      inRound(ctx, 12);
      expect(abilityEvents(snap(ctx, a).events, 'm1')).toEqual([
        expect.objectContaining({ round: 6, ability: 'rally', byDefault: true }),
      ]);
    });
  });

  it('refuses Unhold from the default round on (hold_too_late), and when not held (not_held)', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally'); // default round 6
      pick(ctx, b, 'purge'); // default round 2
      begin(ctx);
      inRound(ctx, 1);
      expect(err(act(ctx, a, { action: 'unhold' }))).toBe('409 not_held');
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      expect(act(ctx, b, { action: 'hold' }).ok).toBe(true);
      expect(err(act(ctx, a, { action: 'unhold', element: 'tide' }))).toBe('400 invalid_body');
      inRound(ctx, 2);
      expect(err(act(ctx, b, { action: 'unhold' }))).toBe('409 hold_too_late');
      expect(act(ctx, a, { action: 'unhold' }).ok).toBe(true);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      inRound(ctx, 6);
      expect(err(act(ctx, a, { action: 'unhold' }))).toBe('409 hold_too_late');
      // Still held: it fires in the last round, as before.
      expect(snap(ctx, a).abilities[0]).toMatchObject({ mode: 'held', fired: false });
    });
  });

  it('fires by hand after Unhold, and refuses Unhold once fired', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally'); // default round 6
      begin(ctx);
      inRound(ctx, 2);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      expect(act(ctx, a, { action: 'unhold' }).ok).toBe(true);
      inRound(ctx, 3);
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);
      expect(err(act(ctx, a, { action: 'unhold' }))).toBe('409 already_fired');
      inRound(ctx, 12);
      expect(abilityEvents(snap(ctx, a).events, 'm1')).toEqual([
        expect.objectContaining({ round: 4, ability: 'rally', byDefault: false }),
      ]);
    });
  });

  it('refuses Fire twice, and after the default has fired (already_fired)', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally');
      pick(ctx, b, 'purge');
      begin(ctx);
      inRound(ctx, 2);
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);
      expect(err(act(ctx, a, { action: 'fire' }))).toBe('409 already_fired');
      // Even in the round it fires in, and with Hold.
      inRound(ctx, 3);
      expect(err(act(ctx, a, { action: 'fire' }))).toBe('409 already_fired');
      expect(err(act(ctx, a, { action: 'hold' }))).toBe('409 already_fired');
      // b's purge fired by itself at round 2.
      expect(err(act(ctx, b, { action: 'fire' }))).toBe('409 already_fired');
      // The stored state still has one fire for a, none for b.
      const abilities = snap(ctx, a).abilities;
      expect(abilities.map((x) => x.mode)).toEqual(['fired', 'default']);
    });
  });

  it('refuses Fire in the last round and after the end (too_late)', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally');
      pick(ctx, b, 'rally');
      begin(ctx);
      inRound(ctx, 3);
      expect(act(ctx, a, { action: 'hold' }).ok).toBe(true);
      inRound(ctx, 11);
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true); // fires in round 12
      inRound(ctx, 12);
      expect(err(act(ctx, b, { action: 'fire' }))).toBe('409 too_late');
      expect(err(act(ctx, b, { action: 'hold' }))).toBe('409 hold_too_late');
      expect(err(act(ctx, a, { action: 'fire' }))).toBe('409 too_late');
      at(ctx, 12 * ROUND + 1);
      expect(snap(ctx, b).status).toBe('done');
      expect(err(act(ctx, b, { action: 'fire' }))).toBe('409 too_late');
      expect(err(act(ctx, b, { action: 'hold' }))).toBe('409 hold_too_late');
    });
  });

  it('refuses Fire after the boss has fallen, before the ability fired', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { current: 1 });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally'); // default round 6: never reached
      begin(ctx);
      expect(snap(ctx, a).status).toBe('done');
      expect(err(act(ctx, a, { action: 'fire' }))).toBe('409 too_late');
      expect(err(act(ctx, a, { action: 'hold' }))).toBe('409 hold_too_late');
    });
  });

  it('answers not_in_fight outside a fight and for people who are not in it', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      // Lobby and before: no fight yet.
      at(ctx, -3 * MINUTE);
      expect(err(act(ctx, a, { action: 'fire' }))).toBe('409 not_in_fight');
      at(ctx, 1000);
      expect(err(act(ctx, outsider, { action: 'fire' }))).toBe('409 not_in_fight');
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);
    });
  });

  it('takes the round from the clock at the moment of the press, not from an earlier poll', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'rally');
      begin(ctx);
      inRound(ctx, 2);
      expect(snap(ctx, a).round).toBe(2);
      // The player did not poll again: the press at round 5 fires in round 6.
      inRound(ctx, 5);
      expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);
      inRound(ctx, 6);
      expect(abilityEvents(snap(ctx, a).events, 'm1')[0]).toMatchObject({ round: 6 });
    });
  });
});

describe('players who do nothing', () => {
  it('fire at the default round, at full strength, whoever is watching', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 3);
      const members = inOrder(ctx, players);
      const [a] = members as [Seeded];
      // Round-robin defaults for three members: rally, shield wall, re-mark.
      expect(members.map((m) => ctx.core.raid.view(m.id, HELSINKI).you.ability)).toEqual([
        { abilityId: 'rally', chosen: false },
        { abilityId: 'shield-wall', chosen: false },
        { abilityId: 're-mark', chosen: false },
      ]);
      begin(ctx);
      inRound(ctx, 12);
      // Only a ever looks at the fight.
      const events = snap(ctx, a).events;
      const byAlias = (alias: string) => abilityEvents(events, alias)[0];
      expect(byAlias('m1')).toMatchObject({ round: 6, ability: 'rally', byDefault: true });
      expect(byAlias('m2')).toMatchObject({ round: 3, ability: 'shield-wall', byDefault: true });
      expect(byAlias('m3')).toMatchObject({ round: 4, ability: 're-mark', byDefault: true });
    });
  });
});

describe('the end of the fight', () => {
  it('ends early when the boss falls, once, and pays from the live randomness at that moment', async () => {
    const seeds = [1, 2, 3, 4];
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 0, 9_999]);
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx);
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        // Leave the boss with exactly what rounds 1-2 deal, plus one: it falls in round 3.
        const week = ctx.core.raid.week(W02.id) as NonNullable<
          ReturnType<typeof ctx.core.raid.week>
        >;
        const built = buildPhaseInput(ctx.sql, week, 1, 'finale', { practice: true });
        if (built === null) throw new Error('no party');
        const big = simulateFight(built.input, createSeededRng('probe'));
        const roundEnd = (r: number) =>
          big.events.find((e) => e.t === 'round_end' && e.round === r) as Extract<
            FightEvent,
            { t: 'round_end' }
          >;
        const dealt = BIG - roundEnd(2).bossHp;
        forcePool(ctx.sql, BIG, dealt + 1, 1);

        const drawnBefore = rng.drawn();
        begin(ctx);
        inRound(ctx, 2);
        expect(snap(ctx, a).status).toBe('live');
        expect(finaleRows(ctx)).toBe(0);
        expect(rng.drawn()).toBe(drawnBefore + 4); // only the seed, drawn when the fight started

        inRound(ctx, 3);
        const done = snap(ctx, a);
        expect(done.status).toBe('done');
        expect(done.round).toBe(3);
        expect(done.bossHp).toBe(0);
        expect(done.events.at(-1)).toMatchObject({ t: 'round_end', round: 3, bossHp: 0 });
        expect(finaleRows(ctx)).toBe(1);
        // Jackpot rolls came from the live randomness now: one per member.
        expect(rng.drawn()).toBe(drawnBefore + 4 + 2);
        expect(done.loot).toMatchObject({ cleared: true });
        expect(done.loot?.essence).toBeGreaterThanOrEqual(RULES.raid.essence.flat.finale);
        // The jackpot is hidden: the loot is one combined Essence figure (a's roll hit, b's missed)
        // and carries neither the jackpot nor the pity counter.
        const other = snap(ctx, b);
        expect(other.status).toBe('done');
        const paidTo = (p: Seeded): number =>
          raidLedger(ctx.sql)
            .filter(
              (l) =>
                l.user_id === p.id &&
                (l.idempotency_key.endsWith(':finale') || l.idempotency_key.endsWith(':jackpot')),
            )
            .reduce((sum, l) => sum + l.amount, 0);
        expect(done.loot?.essence).toBe(paidTo(a));
        expect(other.loot?.essence).toBe(paidTo(b));
        // a's roll hit: the figure holds the jackpot Essence, and b's does not.
        expect(
          raidLedger(ctx.sql).filter(
            (l) => l.user_id === a.id && l.idempotency_key.endsWith(':jackpot'),
          ),
        ).toHaveLength(1);
        expect(paidTo(a) - jackpotEssenceFor(weekPayout(ctx.sql))).toBeGreaterThan(0);
        expect(Object.keys(done.loot ?? {}).sort()).toEqual([
          'cleared',
          'essence',
          'festivalGrant',
          'rankChange',
        ]);
        expect(JSON.stringify(done)).not.toMatch(/jackpot|pity/i);
        // Behind the scenes it is all still there.
        expect(
          rows(ctx.sql, 'SELECT user_id, counter FROM jackpot_pity ORDER BY user_id'),
        ).toHaveLength(2);

        // Reading again, later, changes nothing and draws nothing.
        const ledger = raidLedger(ctx.sql);
        const drawn = rng.drawn();
        at(ctx, 12 * ROUND + 5000);
        expect(snap(ctx, a).events).toEqual(done.events);
        expect(snap(ctx, a).round).toBe(3);
        expect(finaleRows(ctx)).toBe(1);
        expect(raidLedger(ctx.sql)).toEqual(ledger);
        expect(rng.drawn()).toBe(drawn);
      },
      { core: { raidRng: rng } },
    );
  });

  it('resolves from a read at the end of the last round, exactly once, and the alarm does nothing more', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      at(ctx, 0);
      expect(snap(ctx, a).status).toBe('live');
      at(ctx, 12 * ROUND - 1);
      expect(snap(ctx, a).status).toBe('live');
      expect(finaleRows(ctx)).toBe(0);
      at(ctx, 12 * ROUND);
      const done = snap(ctx, a);
      expect(done).toMatchObject({ status: 'done', round: 12 });
      expect(finaleRows(ctx)).toBe(1);
      const summary = () => ({
        results: count(ctx.sql, 'raid_results'),
        ledger: raidLedger(ctx.sql),
        pity: rows(ctx.sql, 'SELECT * FROM jackpot_pity ORDER BY user_id'),
        posts: count(ctx.sql, 'discord_posts'),
      });
      const before = summary();
      // This finale is lost, and pity counts wins only: nobody's counter was written.
      expect(before.pity).toEqual([]);
      await ctx.core.alarm();
      await ctx.core.alarm();
      snap(ctx, a);
      ctx.core.raid.settleDueLive();
      expect(summary()).toEqual(before);
    });
  });

  it('resolves from the guild alarm armed for the end of the last round, with nobody watching', async () => {
    await runRaid(async (ctx) => {
      toFinale(ctx);
      // The alarm before the finale is armed for the finale itself.
      await ctx.core.alarm();
      expect(await ctx.storage.getAlarm()).toBe(FINALE);
      at(ctx, 0);
      await ctx.core.alarm();
      expect(count(ctx.sql, 'raid_live')).toBe(1);
      expect(finaleRows(ctx)).toBe(0);
      expect(await ctx.storage.getAlarm()).toBe(FINALE + 12 * ROUND);
      at(ctx, 12 * ROUND);
      await ctx.core.alarm();
      expect(finaleRows(ctx)).toBe(1);
      expect(count(ctx.sql, 'raid_results')).toBe(3);
      // Next: Monday's week start, not another resolution.
      expect(await ctx.storage.getAlarm()).toBe(Date.parse('2027-01-18T11:37:00Z'));
      const before = {
        ledger: raidLedger(ctx.sql),
        pity: rows(ctx.sql, 'SELECT * FROM jackpot_pity'),
      };
      await ctx.core.alarm();
      expect({
        ledger: raidLedger(ctx.sql),
        pity: rows(ctx.sql, 'SELECT * FROM jackpot_pity'),
      }).toEqual(before);
    });
  });

  it('also resolves on any request after the end, without an alarm', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      at(ctx, 0);
      await ctx.request(secret, '/api/me');
      expect(count(ctx.sql, 'raid_live')).toBe(1);
      at(ctx, 12 * ROUND + 3 * MINUTE);
      // The session idled out in the meantime; a fresh one is a request like any other.
      const secret2 = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      await ctx.request(secret2, '/api/me');
      expect(finaleRows(ctx)).toBe(1);
    });
  });

  it('shows a replay that matches what the players watched, with the final fireAtRound values', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 3);
      const [a, b, c] = inOrder(ctx, players) as [Seeded, Seeded, Seeded];
      pick(ctx, a, 'rally');
      pick(ctx, b, 'shield-wall');
      pick(ctx, c, 'purge');
      const watched: LiveSnapshot[] = [];
      for (let r = 1; r <= ROUNDS; r++) {
        begin(ctx);
        inRound(ctx, r);
        if (r === 2) act(ctx, a, { action: 'fire' }); // rally fires in round 3
        if (r === 1) act(ctx, c, { action: 'hold' }); // purge waits for the last round
        if (r === 1) act(ctx, b, { action: 'fire', zone: 'middle' }); // shield wall in round 2
        watched.push(snap(ctx, a));
      }
      at(ctx, 12 * ROUND);
      const final = snap(ctx, a);
      expect(final.status).toBe('done');

      const replay = ctx.core.raid.replay(a.id, W02.id, 1, 'finale') as ReplayView;
      expect(replay).not.toBeNull();
      // Every snapshot the players saw is a prefix of the replay.
      for (const s of watched) {
        expect(replay.events.slice(0, s.events.length)).toEqual(s.events);
      }
      expect(replay.events).toEqual(final.events);
      expect(replay.row).toEqual(final.row);
      expect(replay.names).toEqual(final.names);
      expect(replay.you).toBe(final.you);

      const stored = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      const choices = stored?.input.finaleAbilities;
      expect(choices).toEqual([
        { playerId: 'm1', abilityId: 'rally', key: 'm1:basic', fireAtRound: 3 },
        {
          playerId: 'm2',
          abilityId: 'shield-wall',
          key: 'm2:basic',
          fireAtRound: 2,
          params: { zone: 'middle' },
        },
        { playerId: 'm3', abilityId: 'purge', key: 'm3:basic', fireAtRound: 12 },
      ]);
      // The replay's ability events are exactly those rounds.
      expect(
        replay.events.filter((e) => e.t === 'ability').map((e) => [e.player, e.round, e.byDefault]),
      ).toEqual([
        ['m2', 2, false],
        ['m1', 3, false],
        ['m3', 12, false],
      ]);
    });
  });

  it('keeps a default-timed ability marked as such in the stored input', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      begin(ctx);
      at(ctx, 12 * ROUND);
      snap(ctx, a);
      const stored = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      expect(stored?.input.finaleAbilities).toEqual([
        { playerId: 'm1', abilityId: 'rally', key: 'm1:basic' },
        { playerId: 'm2', abilityId: 'shield-wall', key: 'm2:basic' },
      ]);
    });
  });
});

describe('starting the finale', () => {
  it('counts a start a moment late from the scheduled time, and a long delay from now', async () => {
    await runRaid((ctx) => {
      const [a] = toFinale(ctx);
      at(ctx, 400);
      snap(ctx, a as Seeded);
      expect(rows(ctx.sql, 'SELECT started_at FROM raid_live')).toEqual([{ started_at: FINALE }]);
    });
    await runRaid((ctx) => {
      const [a] = toFinale(ctx);
      at(ctx, 2 * MINUTE);
      snap(ctx, a as Seeded);
      expect(rows(ctx.sql, 'SELECT started_at FROM raid_live')).toEqual([
        { started_at: FINALE + 2 * MINUTE },
      ]);
    });
  });

  it('resolves instantly, with the picked abilities, when the object slept through the finale', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'purge');
      at(ctx, 11 * MINUTE);
      ctx.core.raid.runDue(HELSINKI);
      expect(count(ctx.sql, 'raid_live')).toBe(0);
      const stored = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      expect(stored?.input.finaleAbilities[0]).toEqual({
        playerId: 'm1',
        abilityId: 'purge',
        key: 'm1:basic',
      });
      expect(snap(ctx, a).status).toBe('none');
    });
  });

  it('uses the pick of each member, and the round-robin default for the rest', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 3);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded, Seeded];
      pick(ctx, b, 'purge');
      at(ctx, 0);
      expect(snap(ctx, a).abilities.map((x) => [x.alias, x.abilityId, x.defaultRound])).toEqual([
        ['m1', 'rally', 6],
        ['m2', 'purge', 2],
        ['m3', 're-mark', 4],
      ]);
    });
  });

  it('freezes the row: the team cannot change once the fight has started', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      at(ctx, 0);
      snap(ctx, a);
      const view = ctx.core.raid.view(a.id, HELSINKI);
      expect(view.status).toBe('finale');
      expect(view.you.canEdit).toBe(false);
      expect(err(ctx.core.raid.setTeam(a.id, HELSINKI, null))).toBe('409 locked');
    });
  });
});

describe('who is watching', () => {
  it('lists the display names of players who polled in the last 10 seconds', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 3);
      const [a, b, c] = inOrder(ctx, players) as [Seeded, Seeded, Seeded];
      at(ctx, -4 * MINUTE);
      expect(snap(ctx, a).watching).toEqual([a.name]);
      at(ctx, -4 * MINUTE + 3000);
      expect(snap(ctx, b).watching).toEqual([a.name, b.name]);
      at(ctx, -4 * MINUTE + 9000);
      expect(snap(ctx, a).watching).toEqual([a.name, b.name]);
      // b last polled 6 s ago, c never did; a polled just now.
      at(ctx, -4 * MINUTE + 12_000);
      expect(snap(ctx, a).watching).toEqual([a.name, b.name]);
      at(ctx, -4 * MINUTE + 14_000);
      expect(snap(ctx, a).watching).toEqual([a.name]);
      // The names are display names only.
      expect(JSON.stringify(snap(ctx, c).watching)).not.toContain(c.id);
      at(ctx, 1000);
      expect(snap(ctx, c).watching).toEqual([c.name]);
    });
  });
});

describe('two parties', () => {
  it('runs a fight per party with its own seed, abilities and resolution', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 17);
      const first = inOrder(ctx, players, 1);
      const second = inOrder(ctx, players, 2);
      expect(first.length + second.length).toBe(17);
      expect(second.length).toBeGreaterThan(0);
      const [a] = first as [Seeded];
      const [z] = second as [Seeded];
      at(ctx, 0);
      const sa = snap(ctx, a);
      const sz = snap(ctx, z);
      expect(sa.party).toBe(1);
      expect(sz.party).toBe(2);
      expect(count(ctx.sql, 'raid_live')).toBe(2);
      const seeds = rows<{ seed: string }>(ctx.sql, 'SELECT seed FROM raid_live').map(
        (r) => r.seed,
      );
      expect(new Set(seeds).size).toBe(2);
      expect(sa.row).toHaveLength(first.length * 3);
      expect(sz.row).toHaveLength(second.length * 3);
      // Watching lists only your own party.
      expect(sa.watching).toEqual([a.name]);
      expect(sz.watching).toEqual([z.name]);

      // An action changes only the caller's party.
      inRound(ctx, 2);
      expect(act(ctx, z, { action: 'hold' }).ok || act(ctx, z, { action: 'fire' }).ok).toBe(true);
      const modes = (party: number) =>
        (
          JSON.parse(
            rows<{ abilities: string }>(
              ctx.sql,
              'SELECT abilities FROM raid_live WHERE party = ?',
              party,
            )[0]?.abilities ?? '[]',
          ) as { mode: string }[]
        ).map((x) => x.mode);
      expect(modes(1).every((m) => m === 'default')).toBe(true);
      expect(modes(2).some((m) => m !== 'default')).toBe(true);
      expect(modes(2).filter((m) => m !== 'default')).toHaveLength(1);

      at(ctx, 12 * ROUND);
      expect(snap(ctx, a).status).toBe('done');
      expect(finaleRows(ctx)).toBe(1); // party 2 resolves on its own read or the alarm
      expect(snap(ctx, z).status).toBe('done');
      expect(finaleRows(ctx)).toBe(2);
      // Both hold their own results.
      expect(storedRuns(ctx.sql, W02.id).filter((r) => r.phase === 'finale')).toHaveLength(2);
    });
  });

  it('resolves both parties from the alarm when nobody reads', async () => {
    await runRaid(async (ctx) => {
      toFinale(ctx, 17);
      at(ctx, 0);
      await ctx.core.alarm();
      expect(count(ctx.sql, 'raid_live')).toBe(2);
      at(ctx, 12 * ROUND);
      await ctx.core.alarm();
      expect(finaleRows(ctx)).toBe(2);
    });
  });
});

describe('ability pick', () => {
  it('stores the pick per week and player, until the finale starts', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      expect(ctx.core.raid.view(a.id, HELSINKI).you.ability).toEqual({
        abilityId: 'rally',
        chosen: false,
      });
      pick(ctx, a, 'purge');
      pick(ctx, a, 'purge'); // idempotent
      expect(ctx.core.raid.view(a.id, HELSINKI).you.ability).toEqual({
        abilityId: 'purge',
        chosen: true,
      });
      pick(ctx, a, 're-mark');
      expect(rows(ctx.sql, 'SELECT week_id, ability_id FROM raid_abilities')).toEqual([
        { week_id: W02.id, ability_id: 're-mark' },
      ]);
      at(ctx, -1);
      pick(ctx, a, 'rally');
      at(ctx, 0);
      expect(err(ctx.core.raid.setAbility(a.id, HELSINKI, 'purge'))).toBe('409 locked');
      expect(ctx.core.raid.view(a.id, HELSINKI).you.ability).toEqual({
        abilityId: 'rally',
        chosen: true,
      });
    });
  });

  it('needs a place in the roster and a real ability', async () => {
    await runRaid((ctx) => {
      toFinale(ctx);
      const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
      expect(err(ctx.core.raid.setAbility(outsider.id, HELSINKI, 'rally'))).toBe(
        '409 not_in_roster',
      );
      expect(ctx.core.raid.view(outsider.id, HELSINKI).you.ability).toBeNull();
    });
  });
});

describe('the loot reveal', () => {
  const seeds = [1, 2, 3, 4];

  it('is offered to everyone who took part, privately, until marked seen', async () => {
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 0, 9_999]);
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx, 2, { current: 1 });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
        const revealOf = (p: Seeded) => ctx.core.raid.view(p.id, HELSINKI).you.reveal;
        at(ctx, -3 * MINUTE);
        expect(revealOf(a)).toBeNull();
        // A did not watch: the fight resolves from a read by b only.
        at(ctx, 0);
        expect(snap(ctx, b).status).toBe('done');
        expect(finaleRows(ctx)).toBe(1);

        const ra = revealOf(a);
        expect(ra).toMatchObject({ week: W02.id, cleared: true });
        expect(ra?.essence).toBeGreaterThanOrEqual(RULES.raid.essence.flat.finale);
        // One combined Essence figure: a's hidden jackpot roll hit, b's missed.
        const paidTo = (p: Seeded): number =>
          raidLedger(ctx.sql)
            .filter(
              (l) =>
                l.user_id === p.id &&
                (l.idempotency_key.endsWith(':finale') || l.idempotency_key.endsWith(':jackpot')),
            )
            .reduce((sum, l) => sum + l.amount, 0);
        expect(ra?.essence).toBe(paidTo(a));
        expect(revealOf(b)?.essence).toBe(paidTo(b));
        expect(
          raidLedger(ctx.sql).filter(
            (l) => l.user_id === a.id && l.idempotency_key.endsWith(':jackpot'),
          ),
        ).toHaveLength(1);
        expect(Object.keys(ra ?? {})).not.toContain('jackpot');
        expect(JSON.stringify(ra)).not.toMatch(/jackpot|pity/i);
        expect(revealOf(outsider)).toBeNull();
        // The reveal holds the player's own Essence, nothing else of anyone.
        expect(JSON.stringify(ra)).not.toContain(b.id);

        // Mark as seen: idempotent, per player.
        expect(ctx.core.raid.markRevealSeen(a.id, W02.id)).toEqual({ ok: true, value: null });
        expect(ctx.core.raid.markRevealSeen(a.id, W02.id)).toEqual({ ok: true, value: null });
        expect(revealOf(a)).toBeNull();
        expect(revealOf(b)).not.toBeNull();
        expect(count(ctx.sql, 'raid_reveal_seen')).toBe(1);
        // Not in that finale, or no such week: nothing is written.
        expect(err(ctx.core.raid.markRevealSeen(outsider.id, W02.id))).toBe('404 not_found');
        expect(err(ctx.core.raid.markRevealSeen(a.id, '2027-W03'))).toBe('404 not_found');
        expect(count(ctx.sql, 'raid_reveal_seen')).toBe(1);
      },
      { core: { raidRng: rng } },
    );
  });

  it('shows the latest finale only, and a lost one with no Essence', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      begin(ctx);
      at(ctx, 12 * ROUND);
      snap(ctx, a);
      expect(ctx.core.raid.view(a.id, HELSINKI).you.reveal).toEqual({
        week: W02.id,
        party: 1,
        cleared: false,
        essence: 0,
        // A lost finale keeps the rank, and a normal week has no Festival creature.
        rankChange: {
          before: weekPayout(ctx.sql).rank,
          after: weekPayout(ctx.sql).rank,
          festival: false,
          serverWon: false,
        },
        festivalGrant: null,
      });
    });
  });

  it('is served by the API with strict bodies', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx, 2, { current: 1 });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      at(ctx, 0);
      const get = async () => (await ctx.request(secret, '/api/raid')).json<RaidView>();
      expect((await get()).you.reveal?.week).toBe(W02.id);
      const post = (body: unknown) => ctx.request(secret, '/api/raid/reveal-seen', 'POST', body);
      expect((await post({ week: 'nope' })).status).toBe(400);
      expect((await post({ week: W02.id, extra: 1 })).status).toBe(400);
      expect((await post({})).status).toBe(400);
      expect((await post({ week: '2027-W09' })).status).toBe(404);
      expect((await post({ week: W02.id })).status).toBe(200);
      expect((await post({ week: W02.id })).status).toBe(200);
      expect((await get()).you.reveal).toBeNull();
    });
  });
});

describe('the live routes', () => {
  it('serve the snapshot and actions with strict schemas, and the rate limit allows 2 s polling', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      const call = (method: string, path: string, body?: unknown) =>
        ctx.request(secret, path, method, body);

      at(ctx, 1000);
      const res = await call('GET', '/api/raid/live');
      expect(res.status).toBe(200);
      const seed = rows<{ seed: string }>(ctx.sql, 'SELECT seed FROM raid_live')[0]?.seed as string;
      const text = await res.text();
      expect(text).not.toContain(seed);
      expect((JSON.parse(text) as LiveSnapshot).status).toBe('live');
      expect((await call('POST', '/api/raid/live')).status).toBe(405);

      const bad: unknown[] = [
        {},
        { key: 'm1:basic', action: 'jump' },
        { action: 'fire', extra: true },
        { action: 'fire', zone: 'sideways' },
        { action: 'fire', element: 'plasma' },
        { action: 'fire', zone: 7 },
        [],
      ];
      for (const body of bad) {
        const r = await call('POST', '/api/raid/live/action', body);
        expect(r.status).toBe(400);
        expect(await r.json()).toEqual({ error: 'invalid_body' });
      }
      const ok = await call('POST', '/api/raid/live/action', { key: 'm1:basic', action: 'hold' });
      expect(ok.status).toBe(200);
      const after = await ok.json<LiveSnapshot>();
      expect(after.abilities[0]?.mode).toBe('held');
      const dup = await call('POST', '/api/raid/live/action', { key: 'm1:basic', action: 'fire' });
      expect(dup.status).toBe(200);
      const twice = await call('POST', '/api/raid/live/action', {
        key: 'm1:basic',
        action: 'fire',
      });
      expect(twice.status).toBe(409);
      expect(await twice.json()).toEqual({ error: 'already_fired' });

      // The ability route.
      const pickRes = await call('PUT', '/api/raid/ability', { abilityId: 'nope' });
      expect(pickRes.status).toBe(400);
      expect((await call('PUT', '/api/raid/ability', { abilityId: 'rally', x: 1 })).status).toBe(
        400,
      );
      const locked = await call('PUT', '/api/raid/ability', { abilityId: 'rally' });
      expect(locked.status).toBe(409);
      expect(await locked.json()).toEqual({ error: 'locked' });

      // Polling every 2 seconds for the whole fight and then some never hits the rate limit.
      for (let i = 0; i < 100; i++) {
        ctx.clock.t += 2000;
        const poll = await call('GET', '/api/raid/live');
        expect(poll.status).toBe(200);
      }
      // A burst of 30 is fine too (the bucket), the 31st within the same second is not.
      let limited = 0;
      for (let i = 0; i < 40; i++) {
        if ((await call('GET', '/api/raid/live')).status === 429) limited++;
      }
      expect(limited).toBeGreaterThan(0);
    });
  });
});

describe('the practice finale', () => {
  const live = { raidPractice: true };

  it('does not exist unless RAID_PRACTICE is on: the route answers 404', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx);
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      ctx.clock.t = W02.afterPhase2;
      const res = await ctx.request(secret, '/api/raid/practice', 'POST');
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
      expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('404 not_found');
      expect(count(ctx.sql, 'raid_live')).toBe(0);
    });
  });

  it('starts a practice fight now: full HP, no adaptation, the current picks, and pays nothing', async () => {
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx, 2, { current: 1234 });
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        pick(ctx, a, 'purge');
        ctx.clock.t = W02.afterPhase2 + 5000; // Saturday, well before the finale
        // The real boss has 1234 HP left and a counter-move from phase 1: practice has neither.
        expect(rows(ctx.sql, 'SELECT hp_current FROM raid_parties')).toEqual([
          { hp_current: 1234 },
        ]);
        expect(
          rows<{ adaptation_description: string | null }>(
            ctx.sql,
            'SELECT adaptation_description FROM raid_parties',
          )[0]?.adaptation_description,
        ).toBeTruthy();

        const start = await ctx.request(secret, '/api/raid/practice', 'POST');
        expect(start.status).toBe(200);
        const lobby = await start.json<LiveSnapshot>();
        const asked = ctx.clock.t;
        // It starts after a 30 second lobby: until then the party sees the stage as a preview.
        const t0 = asked + PRACTICE_LOBBY_MS;
        expect(lobby).toMatchObject({
          status: 'lobby',
          practice: true,
          startsAt: t0,
          round: 0,
          serverNow: asked,
          events: [],
          you: 'm1',
          party: 1,
        });
        expect(lobby.row).toHaveLength(9);
        expect(lobby.abilities.map((x) => x.abilityId)).toEqual(['purge']); // the caller's own
        expect(lobby.boss.hpStart).toBe(lobby.boss.hpMax);
        ctx.clock.t = t0 - 1;
        expect(snap(ctx, a)).toMatchObject({ status: 'lobby', events: [] });
        ctx.clock.t = t0;
        const first = snap(ctx, a);
        expect(first).toMatchObject({
          status: 'live',
          practice: true,
          startsAt: t0,
          round: 1,
          you: 'm1',
          party: 1,
        });
        expect(first.boss.hpStart).toBe(first.boss.hpMax);
        expect(first.boss.hpMax).toBeGreaterThan(1234);
        expect(first.abilities.map((x) => x.abilityId)).toEqual(['purge', 'shield-wall']);
        expect(first.events.some((e) => e.t === 'adaptation')).toBe(false);
        const stored = rows<{ input: string }>(ctx.sql, 'SELECT input FROM raid_live')[0];
        expect(JSON.parse(stored?.input ?? '{}')).toMatchObject({ adaptation: null });

        // It runs through the same endpoints, with the same rules.
        ctx.clock.t = t0 + 2 * ROUND + 100;
        const late = await ctx.request(secret, '/api/raid/live/action', 'POST', {
          key: 'm1:basic',
          action: 'hold',
        });
        expect(late.status).toBe(409); // purge's default round (2) has come
        expect(await late.json()).toEqual({ error: 'hold_too_late' });
        const poll = await ctx.request(secret, '/api/raid/live');
        const later = await poll.json<LiveSnapshot>();
        expect(later).toMatchObject({ status: 'live', practice: true, round: 3 });
        expect(later.abilities[0]).toMatchObject({
          abilityId: 'purge',
          fired: true,
          firedAtRound: 2,
        });
      },
      { core: live },
    );
  });

  it('runs to the end without paying, storing a result or queueing a post', async () => {
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx, 2, { current: 1 });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        ctx.sql.exec('UPDATE guild_meta SET announce_channel_id = ?', '555555555555555555');
        ctx.clock.t = W02.afterPhase2 + 5000;
        const poolBefore = rows(ctx.sql, 'SELECT hp_max, hp_current, boss_atk FROM raid_parties');
        const posts = count(ctx.sql, 'discord_posts');
        const ledger = raidLedger(ctx.sql);
        const pity = rows(ctx.sql, 'SELECT * FROM jackpot_pity');
        const results = count(ctx.sql, 'raid_results');

        const started = ctx.core.raid.startPractice(a.id, HELSINKI);
        expect(started.ok).toBe(true);
        const t0 = ctx.clock.t + PRACTICE_LOBBY_MS;
        // The practice boss has full HP, whatever the real pool is.
        const first = started.ok ? started.value : null;
        expect(first?.boss.hpStart).toBe(first?.boss.hpMax);
        expect(first?.boss.hpMax).toBeGreaterThan(1);

        // Fire in practice.
        ctx.clock.t = t0 + ROUND + 100;
        expect(act(ctx, a, { action: 'fire' }).ok).toBe(true);

        ctx.clock.t = t0 + 12 * ROUND;
        const end = snap(ctx, a);
        expect(end).toMatchObject({ status: 'done', practice: true });
        expect(end.loot).toMatchObject({ essence: 0 });
        expect(snap(ctx, b).loot).toMatchObject({ essence: 0 });
        await ctx.core.alarm();
        expect(rows(ctx.sql, 'SELECT hp_max, hp_current, boss_atk FROM raid_parties')).toEqual(
          poolBefore,
        );
        expect(count(ctx.sql, 'discord_posts')).toBe(posts);
        expect(raidLedger(ctx.sql)).toEqual(ledger);
        expect(rows(ctx.sql, 'SELECT * FROM jackpot_pity')).toEqual(pity);
        expect(count(ctx.sql, 'raid_results')).toBe(results);
        expect(ctx.core.raid.view(a.id, HELSINKI).you.reveal).toBeNull();
      },
      { core: live },
    );
  });

  it('allows one practice per party per 10 minutes', async () => {
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx);
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        ctx.clock.t += 10 * MINUTE - 1;
        // Anyone in the party counts: the limit is per party.
        expect(err(ctx.core.raid.startPractice(b.id, HELSINKI))).toBe('409 practice_cooldown');
        expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('409 practice_cooldown');
        ctx.clock.t += 1;
        const again = ctx.core.raid.startPractice(b.id, HELSINKI);
        expect(again.ok).toBe(true);
        expect(count(ctx.sql, 'raid_live')).toBe(1); // replaced, not piled up
        expect(again.ok ? again.value.startsAt : 0).toBe(ctx.clock.t + PRACTICE_LOBBY_MS);
        // A practice fight stops being shown once the limit has passed.
        ctx.clock.t += 10 * MINUTE;
        expect(snap(ctx, a).status).toBe('none');
      },
      { core: live },
    );
  });

  it('takes no payload: a body with anything in it is refused', async () => {
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx);
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        const secret = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        ctx.clock.t = W02.afterPhase2 + 5000;
        for (const body of [{ x: 1 }, [], 'text', 7]) {
          const res = await ctx.request(secret, '/api/raid/practice', 'POST', body);
          expect(res.status).toBe(400);
        }
        expect(count(ctx.sql, 'raid_live')).toBe(0);
        const ok = await ctx.request(secret, '/api/raid/practice', 'POST', {});
        expect(ok.status).toBe(200);
        expect((await ctx.request(secret, '/api/raid/practice', 'GET')).status).toBe(405);
      },
      { core: live },
    );
  });

  it('needs a party in the current week', async () => {
    await runRaid(
      (ctx) => {
        toFinale(ctx);
        const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(err(ctx.core.raid.startPractice(outsider.id, HELSINKI))).toBe('409 not_in_roster');
        expect(count(ctx.sql, 'raid_live')).toBe(0);
      },
      { core: live },
    );
  });

  it('is refused from 30 minutes before the finale until it has resolved, and the real finale wins', async () => {
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx);
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        at(ctx, -31 * MINUTE);
        expect(ctx.core.raid.startPractice(a.id, HELSINKI).ok).toBe(true);
        at(ctx, -31 * MINUTE + PRACTICE_LOBBY_MS);
        expect(snap(ctx, a)).toMatchObject({ status: 'live', practice: true });
        // 31 minutes before: allowed, and it is over (and out of the way) long before the lobby.
        at(ctx, -30 * MINUTE);
        expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('409 practice_blocked');
        at(ctx, -29 * MINUTE);
        expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('409 practice_blocked');
        at(ctx, -4 * MINUTE);
        expect(snap(ctx, a).status).toBe('lobby');
        expect(snap(ctx, a).practice).toBe(false);
        at(ctx, 1000);
        const real = snap(ctx, a);
        expect(real).toMatchObject({ status: 'live', practice: false });
        expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('409 practice_blocked');
        at(ctx, 12 * ROUND - 1);
        expect(err(ctx.core.raid.startPractice(a.id, HELSINKI))).toBe('409 practice_blocked');
        expect(count(ctx.sql, 'raid_live', 'practice = 1')).toBe(1);
        expect(count(ctx.sql, 'raid_live', 'practice = 0')).toBe(1);

        // Resolved: practice is allowed again and then shown instead of the finished finale.
        at(ctx, 12 * ROUND);
        expect(snap(ctx, a)).toMatchObject({ status: 'done', practice: false });
        expect(finaleRows(ctx)).toBe(1);
        const results = storedRuns(ctx.sql, W02.id).length;
        const practice = ctx.core.raid.startPractice(a.id, HELSINKI);
        expect(practice.ok).toBe(true);
        expect(practice.ok ? practice.value : null).toMatchObject({
          status: 'lobby',
          practice: true,
        });
        // The real result is untouched, and comes back after the practice window.
        expect(storedRuns(ctx.sql, W02.id)).toHaveLength(results);
        ctx.clock.t += 11 * MINUTE;
        expect(snap(ctx, a)).toMatchObject({ status: 'done', practice: false });
      },
      { core: live },
    );
  });
});

describe('the engine and the stored fight agree', () => {
  it('shows exactly what simulateFight gives for the stored input and the final abilities', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 're-mark');
      begin(ctx);
      inRound(ctx, 3);
      act(ctx, a, { action: 'fire', element: 'tide' });
      inRound(ctx, 4);
      act(ctx, b, { action: 'hold' });
      at(ctx, 12 * ROUND);
      const final = snap(ctx, a);
      const stored = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      const seed = stored?.seed as string;
      const again = simulateFight(
        stored?.input as NonNullable<typeof stored>['input'],
        createSeededRng(seed),
      );
      expect(again.events).toEqual(final.events);
      expect(content.finaleAbilities.length).toBeGreaterThan(0);
    });
  });
});

/**
 * The contract with the client. The client parses real server responses saved in
 * `apps/activity/src/fixtures` (see `live-api.test.ts` and `raid-api.test.ts` there). These tests pin
 * the shape of what the server sends, so a change here fails the build and points at the fixtures:
 * update them (and the client parsers in `live-api.ts` and `raid-api.ts`) together with the server.
 */
describe('the API contract with the client', () => {
  const UPDATE =
    'the server shape changed: update apps/activity/src/fixtures and the client parsers';
  const keys = (value: unknown): string[] => Object.keys(value as object).sort();

  const SNAPSHOT_KEYS = [
    'abilities',
    'boss',
    'bossHp',
    'events',
    'loot',
    'names',
    'party',
    'practice',
    'round',
    'roundMs',
    'rounds',
    'row',
    'serverNow',
    'startsAt',
    'status',
    'watching',
    'week',
    'you',
  ];
  const BOSS_KEYS = ['element', 'hpMax', 'hpStart', 'id', 'name'];
  const ABILITY_KEYS = [
    'abilityId',
    'alias',
    'autoFire',
    'creature',
    'defaultRound',
    'fireAtRound',
    'fired',
    'firedAtRound',
    'key',
    'mode',
  ];
  const PREVIEW_KEYS = [
    'abilityId',
    'autoFire',
    'creatureId',
    'key',
    'species',
    'unlockLevel',
    'unlocked',
  ];
  const ROW_KEYS = ['element', 'id', 'level', 'name', 'owner', 'position', 'role', 'species'];
  const LOOT_KEYS = ['cleared', 'essence', 'festivalGrant', 'rankChange'];
  const RANK_CHANGE_KEYS = ['after', 'before', 'festival', 'serverWon'];
  const GRANT_KEYS = ['firstOnServer', 'outcome', 'species'];
  const SEASON_KEYS = ['index', 'week'];
  const RESULT_KEYS = [
    'at',
    'bossHpEnd',
    'bossHpMax',
    'bossHpStart',
    'cleared',
    'damage',
    'essence',
    'festivalGrant',
    'phase',
    'rankChange',
    'reactions',
    'rounds',
    'top',
  ];
  /** The Raid view as `GET /api/raid` sends it (the channel block is added by the route). */
  const RAID_KEYS = [
    'bestRank',
    'boss',
    'channel',
    'effectiveRank',
    'festival',
    'festivalCreature',
    'next',
    'parties',
    'party',
    'rank',
    'roster',
    'schedule',
    'season',
    'serverNow',
    'status',
    'timezone',
    'weekId',
    'you',
  ];
  const PARTY_KEYS = [
    'adaptation',
    'bossHp',
    'guests',
    'party',
    'readiness',
    'results',
    'row',
    'rowLength',
  ];
  const REVEAL_KEYS = ['cleared', 'essence', 'festivalGrant', 'party', 'rankChange', 'week'];

  const get = async (ctx: Ctx, secret: string, path = '/api/raid/live') => {
    const res = await ctx.request(secret, path);
    expect(res.status).toBe(200);
    return res.json<Record<string, unknown>>();
  };

  /** The shape every status shares, checked on one response (and on its saved fixture). */
  function expectShape(value: Record<string, unknown>, label: string): void {
    expect(keys(value), `${label}: ${UPDATE}`).toEqual(SNAPSHOT_KEYS);
    expect(keys(value['boss']), `${label}.boss: ${UPDATE}`).toEqual(BOSS_KEYS);
    for (const a of value['abilities'] as unknown[]) {
      expect(keys(a), `${label}.abilities: ${UPDATE}`).toEqual(ABILITY_KEYS);
    }
    // One entry per use, so keys are unique.
    const useKeys = (value['abilities'] as { key: string }[]).map((a) => a.key);
    expect(new Set(useKeys).size, `${label}.abilities keys`).toBe(useKeys.length);
    for (const r of value['row'] as unknown[]) {
      expect(keys(r), `${label}.row: ${UPDATE}`).toEqual(ROW_KEYS);
    }
    if (value['loot'] !== null) {
      expect(keys(value['loot']), `${label}.loot: ${UPDATE}`).toEqual(LOOT_KEYS);
      const loot = value['loot'] as { rankChange: unknown; festivalGrant: unknown };
      if (loot.rankChange !== null) {
        expect(keys(loot.rankChange), `${label}.loot.rankChange: ${UPDATE}`).toEqual(
          RANK_CHANGE_KEYS,
        );
      }
      if (loot.festivalGrant !== null) {
        expect(keys(loot.festivalGrant), `${label}.loot.festivalGrant: ${UPDATE}`).toEqual(
          GRANT_KEYS,
        );
      }
    }
  }

  it('sends the same keys in every status, with nulls where there is nothing yet', async () => {
    const seeds = [1, 2, 3, 4];
    const rng = scriptedThenSeeded([...seeds, ...seeds, ...seeds, 0, 9_999]);
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx, 2, { current: 1 });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        const sa = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        const sb = await ctx.core.createSession(ctx.guildId, { id: b.id, displayName: b.name });

        const none = await get(ctx, sa);
        expectShape(none, 'none');
        expect(none).toMatchObject({
          status: 'none',
          startsAt: null,
          names: null,
          bossHp: null,
          row: [],
          events: [],
          abilities: [],
          loot: null,
          boss: { hpMax: null, hpStart: null },
        });

        at(ctx, -4 * MINUTE);
        const lobby = await get(ctx, sa);
        expectShape(lobby, 'lobby');
        expect(lobby).toMatchObject({
          status: 'lobby',
          party: 1,
          startsAt: FINALE,
          you: 'm1',
          events: [],
          loot: null,
        });
        // The lobby previews the stage: the row, the names, the pool and the caller's abilities.
        expect(typeof (lobby['boss'] as { hpMax: unknown }).hpMax).toBe('number');
        expect(typeof lobby['bossHp']).toBe('number');
        expect((lobby['row'] as unknown[]).length).toBeGreaterThan(0);
        expect(keys(lobby['names'])).toEqual(keys(liveDoneHit.names));
        expect((lobby['abilities'] as unknown[]).length).toBeGreaterThan(0);

        // The fixtures were saved from these same states.
        expectShape(liveNone, 'fixture live-none');
        expectShape(liveLobby, 'fixture live-lobby');
        expectShape(liveMid, 'fixture live-mid');
        expectShape(liveDoneHit, 'fixture live-done-hit');
        expectShape(actionFire, 'fixture action-fire');

        // A fight that ends at once: both players see the end, each with their own loot.
        at(ctx, 0);
        const done = await get(ctx, sa);
        expectShape(done, 'done');
        expect(done).toMatchObject({ status: 'done', practice: false, you: 'm1' });
        expect(typeof done['bossHp']).toBe('number');
        expect(typeof (done['names'] as { boss: unknown }).boss).toBe('string');
        expect(keys(done['names'])).toEqual(keys(liveDoneHit.names));
        // The jackpot and the pity counter are never sent, anywhere in the snapshot.
        expect(JSON.stringify(done)).not.toMatch(/jackpot|pity/i);
        const other = await get(ctx, sb);
        expect(JSON.stringify(other)).not.toMatch(/jackpot|pity/i);

        // The Raid view carries the ability and the reveal.
        const raid = await get(ctx, sa, '/api/raid');
        const you = raid['you'] as Record<string, unknown>;
        // No jackpot or pity in the Raid view either (the result list, the reveal), nor in the state.
        expect(JSON.stringify(raid)).not.toMatch(/jackpot|pity/i);
        expect(keys(you['ability']), UPDATE).toEqual(['abilityId', 'chosen']);
        // What the player brings: the basic ability, then each team creature's (locked ones lack a key).
        const preview = you['abilities'] as Record<string, unknown>[];
        expect(preview.length, UPDATE).toBeGreaterThan(1);
        for (const entry of preview) {
          expect(keys(entry), UPDATE).toEqual(
            entry['unlocked'] === true ? PREVIEW_KEYS : PREVIEW_KEYS.filter((k) => k !== 'key'),
          );
        }
        // The fixture has both kinds: unlocked with a key, and a locked one without.
        expect(raidReveal.you.abilities.some((e) => !e.unlocked)).toBe(true);
        for (const entry of raidReveal.you.abilities) {
          expect(keys(entry), UPDATE).toEqual(
            entry.unlocked ? PREVIEW_KEYS : PREVIEW_KEYS.filter((k) => k !== 'key'),
          );
        }

        // The Collection's creature view carries the ability (and the fixture has the same keys).
        const state = await get(ctx, sa, '/api/state');
        expect(JSON.stringify(state)).not.toMatch(/jackpot|pity/i);
        const creature = (state['creatures'] as Record<string, unknown>[])[0] as Record<
          string,
          unknown
        >;
        const fixtureCreature = collectionState.creatures[0] as Record<string, unknown>;
        expect(keys(creature), UPDATE).toEqual(keys(fixtureCreature));
        expect(keys(creature['ability']), UPDATE).toEqual(keys(fixtureCreature['ability']));
        expect(keys(creature['ability']), UPDATE).toEqual([
          'id',
          'nextId',
          'unlockLevel',
          'unlocked',
        ]);
        expect(keys(state), UPDATE).toEqual(keys(collectionState));
        expect(keys(you['reveal']), UPDATE).toEqual(REVEAL_KEYS);
        expect(keys(raidReveal.you.reveal), UPDATE).toEqual(REVEAL_KEYS);
        // The ladder: rank, season and the band are in the view, the rank change is in the reveal.
        expect(keys(raid), UPDATE).toEqual(RAID_KEYS);
        expect(keys(raid['season']), UPDATE).toEqual(SEASON_KEYS);
        expect(keys((you['reveal'] as { rankChange: unknown }).rankChange), UPDATE).toEqual(
          RANK_CHANGE_KEYS,
        );
        expect(keys(raidReveal), UPDATE).toEqual(RAID_KEYS);
        expect(keys(raidReveal.party), UPDATE).toEqual(PARTY_KEYS);
        const results = (raid['party'] as { results: unknown[] }).results;
        expect(results.length, UPDATE).toBe(3);
        for (const result of [...results, ...raidReveal.party.results]) {
          expect(keys(result), UPDATE).toEqual(RESULT_KEYS);
        }
        // Only the finale carries the ladder's move and the Festival creature.
        expect(
          (results as { phase: string; rankChange: unknown }[]).map((r) => [
            r.phase,
            r.rankChange !== null,
          ]),
        ).toEqual([
          ['phase1', false],
          ['phase2', false],
          ['finale', true],
        ]);
        // The view with Auto fire turned off for some abilities has the same keys, and the flag.
        expect(keys(raidAutofire), UPDATE).toEqual(RAID_KEYS);
        expect(keys(raidAutofire.you), UPDATE).toEqual(keys(raidReveal.you));
        expect(raidAutofire.you.abilities.map((e) => e.autoFire)).toEqual([
          false,
          true,
          false,
          true,
        ]);
        for (const entry of raidAutofire.you.abilities) {
          expect(keys(entry), UPDATE).toEqual(
            entry.unlocked ? PREVIEW_KEYS : PREVIEW_KEYS.filter((k) => k !== 'key'),
          );
        }
        // The Festival fixtures (a Monday view with the band, and the reveal of a won Festival).
        expect(keys(raidFestival), UPDATE).toEqual(RAID_KEYS);
        expect(keys(raidFestival.party), UPDATE).toEqual(PARTY_KEYS);
        expect(keys(raidFestivalReveal), UPDATE).toEqual(RAID_KEYS);
        expect(keys(raidFestivalReveal.you.reveal), UPDATE).toEqual(REVEAL_KEYS);
        expect(keys(raidFestivalReveal.you.reveal.rankChange), UPDATE).toEqual(RANK_CHANGE_KEYS);
        expect(keys(raidFestivalReveal.you.reveal.festivalGrant), UPDATE).toEqual(GRANT_KEYS);
        expect(keys(raidFestival.season), UPDATE).toEqual(SEASON_KEYS);
        expect(['long_shot', 'even', 'likely', 'strong']).toContain(raidFestival.party.readiness);
        expect(keys(raid), UPDATE).toEqual(keys(raidReveal));
        expect(keys(you), UPDATE).toEqual(keys(raidReveal.you));
        expect(keys(raid['party']), UPDATE).toEqual(keys(raidReveal.party));
      },
      { core: { raidRng: rng } },
    );
  });

  it('sends the live state and the action result in the same shape, with the ability state', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'shield-wall');
      pick(ctx, b, 'rally');
      const sa = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
      const sb = await ctx.core.createSession(ctx.guildId, { id: b.id, displayName: b.name });
      begin(ctx);
      inRound(ctx, 2);
      const fire = await ctx.request(sa, '/api/raid/live/action', 'POST', {
        key: 'm1:basic',
        action: 'fire',
        zone: 'back',
      });
      const hold = await ctx.request(sb, '/api/raid/live/action', 'POST', {
        key: 'm2:basic',
        action: 'hold',
      });
      expect([fire.status, hold.status]).toEqual([200, 200]);
      const fired = await fire.json<LiveSnapshot>();
      expectShape(fired as unknown as Record<string, unknown>, 'action fire');
      expect(fired.abilities[0]).toMatchObject({ mode: 'fired', fired: false, fireAtRound: 3 });
      inRound(ctx, 4);
      const live = await get(ctx, sb);
      expectShape(live, 'live');
      expect(live).toMatchObject({ status: 'live', round: 4, you: 'm2', loot: null });
      expect(live['abilities']).toMatchObject([
        { alias: 'm1', mode: 'fired', fired: true, firedAtRound: 3, fireAtRound: null },
        { alias: 'm2', mode: 'held', fired: false, firedAtRound: null, fireAtRound: null },
      ]);
    });
  });

  it('answers every error of the live, ability, practice and reveal routes as { error }', async () => {
    // The saved bodies are the ones the client has texts for (see `game.ts`).
    for (const entry of errorFixtures) {
      expect(keys(entry.body), `${entry.route}: ${UPDATE}`).toEqual(['error']);
      expect(typeof entry.body.error).toBe('string');
    }
    await runRaid(async (ctx) => {
      const players = toFinale(ctx, 2);
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
      const open = (p: Seeded) =>
        ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const sa = await open(a);
      const sb = await open(b);
      const so = await open(outsider);
      const seen: string[] = [];
      const expectError = async (
        label: string,
        res: Response,
        status: number,
        error: string,
      ): Promise<void> => {
        expect([label, res.status, await res.json()]).toEqual([label, status, { error }]);
        seen.push(`${String(status)} ${error}`);
      };
      const post = (secret: string, path: string, body: unknown, method = 'POST') =>
        ctx.request(secret, path, method, body);
      await expectError(
        'ability invalid',
        await post(sa, '/api/raid/ability', { abilityId: 'nope' }, 'PUT'),
        400,
        'invalid_body',
      );
      await expectError(
        'ability outsider',
        await post(so, '/api/raid/ability', { abilityId: 'rally' }, 'PUT'),
        409,
        'not_in_roster',
      );
      pick(ctx, a, 'purge');
      pick(ctx, b, 'rally');
      await expectError(
        'auto fire for a creature that is not yours',
        await post(sa, '/api/raid/autofire', { target: b.creatureIds[0], on: false }, 'PUT'),
        409,
        'not_your_creature',
      );
      await expectError(
        'auto fire body',
        await post(sa, '/api/raid/autofire', { target: 'basic' }, 'PUT'),
        400,
        'invalid_body',
      );
      at(ctx, -3 * MINUTE);
      await expectError(
        'action in the lobby',
        await post(sa, '/api/raid/live/action', { key: 'm1:basic', action: 'fire' }),
        409,
        'not_in_fight',
      );
      begin(ctx);
      inRound(ctx, 3);
      await expectError(
        'bad action',
        await post(sa, '/api/raid/live/action', { action: 'jump' }),
        400,
        'invalid_body',
      );
      await expectError(
        'ability of someone else',
        await post(sa, '/api/raid/live/action', { key: 'm2:basic', action: 'fire' }),
        409,
        'not_your_ability',
      );
      await expectError(
        'zone for purge',
        await post(sa, '/api/raid/live/action', { key: 'm1:basic', action: 'fire', zone: 'back' }),
        400,
        'invalid_body',
      );
      await expectError(
        'hold after the default round',
        await post(sa, '/api/raid/live/action', { key: 'm1:basic', action: 'hold' }),
        409,
        'hold_too_late',
      );
      await expectError(
        'unhold when not held',
        await post(sa, '/api/raid/live/action', { key: 'm1:basic', action: 'unhold' }),
        409,
        'not_held',
      );
      await expectError(
        'ability after the start',
        await post(sb, '/api/raid/ability', { abilityId: 'purge' }, 'PUT'),
        409,
        'locked',
      );
      await expectError(
        'auto fire after the start',
        await post(sb, '/api/raid/autofire', { target: 'basic', on: false }, 'PUT'),
        409,
        'locked',
      );
      expect(
        (await post(sb, '/api/raid/live/action', { key: 'm2:basic', action: 'fire' })).status,
      ).toBe(200);
      await expectError(
        'fire twice',
        await post(sb, '/api/raid/live/action', { key: 'm2:basic', action: 'fire' }),
        409,
        'already_fired',
      );
      inRound(ctx, 12);
      await expectError(
        'an outsider fires',
        await post(so, '/api/raid/live/action', { key: 'm1:basic', action: 'fire' }),
        409,
        'not_in_fight',
      );
      await expectError(
        'fire too late',
        await post(sa, '/api/raid/live/action', { key: 'm1:basic', action: 'fire' }),
        409,
        'too_late',
      );
      await expectError(
        'reveal of a bad week',
        await post(sa, '/api/raid/reveal-seen', { week: 'nope' }),
        400,
        'invalid_body',
      );
      await expectError(
        'reveal of a week not played',
        await post(sa, '/api/raid/reveal-seen', { week: '2027-W09' }),
        404,
        'not_found',
      );
      await expectError('practice off', await post(sa, '/api/raid/practice', {}), 404, 'not_found');
      await expectError(
        'bad session',
        await post('not-a-session', '/api/raid/live', undefined, 'GET'),
        401,
        'invalid_session',
      );

      // Every one of those is in the saved errors, which the client has friendly texts for.
      const saved = new Set(errorFixtures.map((e) => `${String(e.status)} ${e.body.error}`));
      for (const line of seen) expect(saved.has(line), `${line}: ${UPDATE}`).toBe(true);
    });
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx);
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        const sa = await ctx.core.createSession(ctx.guildId, { id: a.id, displayName: a.name });
        const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
        const so = await ctx.core.createSession(ctx.guildId, {
          id: outsider.id,
          displayName: outsider.name,
        });
        const code = async (secret: string, body: unknown = {}) => {
          const res = await ctx.request(secret, '/api/raid/practice', 'POST', body);
          return [res.status, await res.json()];
        };
        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(await code(so)).toEqual([409, { error: 'not_in_roster' }]);
        expect(await code(sa, { x: 1 })).toEqual([400, { error: 'invalid_body' }]);
        expect((await code(sa))[0]).toBe(200);
        expect(await code(sa)).toEqual([409, { error: 'practice_cooldown' }]);
        // The practice fight is in its lobby: Fire is for the fight (Auto fire is set with the preference).
        const early = await ctx.request(sa, '/api/raid/live/action', 'POST', {
          key: 'm1:basic',
          action: 'fire',
        });
        expect([early.status, await early.json()]).toEqual([409, { error: 'not_started' }]);
        at(ctx, -20 * MINUTE);
        expect(await code(sa)).toEqual([409, { error: 'practice_blocked' }]);
      },
      { core: { raidPractice: true } },
    );
  });

  it('accepts the request bodies the client sends (apps/activity/src/fixtures/request-bodies.json)', async () => {
    await runRaid(
      async (ctx) => {
        const players = toFinale(ctx, 3, { level: UNLOCKED });
        const [a, b, c] = inOrder(ctx, players) as [Seeded, Seeded, Seeded];
        const open = (p: Seeded) =>
          ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
        const [sa, sb, sc] = [await open(a), await open(b), await open(c)] as [
          string,
          string,
          string,
        ];
        const send = async (
          secret: string,
          entry: { method: string; path: string; body: unknown },
        ) => (await ctx.request(secret, entry.path, entry.method, entry.body)).status;

        // The pick, and a practice start that the rules refuse (not the schema).
        expect(await send(sa, requestBodies['ability'])).toBe(200);
        // The Auto fire preference: the basic ability, and a creature of the caller (the fixture's
        // id is a placeholder: only the shape matters, so the player's own creature stands in).
        expect(await send(sa, requestBodies['autofire-basic'])).toBe(200);
        const own = (ctx.core.raid.view(a.id, HELSINKI).you.team?.creatures ?? [])[0];
        const creatureBody = requestBodies['autofire-creature'];
        expect(Object.keys(creatureBody.body).sort()).toEqual(['on', 'target']);
        expect(
          await send(sa, {
            ...creatureBody,
            body: { ...creatureBody.body, target: own?.creatureId },
          }),
        ).toBe(200);
        expect(creatureBody.body.target).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
        expect(await send(sa, requestBodies['practice'])).toBe(409); // blocked 10 minutes before
        pick(ctx, a, 'shield-wall');
        pick(ctx, b, 're-mark');
        pick(ctx, c, 'rally');
        begin(ctx);
        inRound(ctx, 2);
        expect(await send(sa, requestBodies['action-fire-zone'])).toBe(200);
        expect(await send(sb, requestBodies['action-fire-element'])).toBe(200);
        expect(await send(sc, requestBodies['action-hold'])).toBe(200);
        expect(await send(sc, requestBodies['action-unhold'])).toBe(200);
        expect(await send(sc, requestBodies['action-hold'])).toBe(200);
        expect(await send(sc, requestBodies['action-fire'])).toBe(200);
        // Creature abilities have their own keys (the level-10 creatures of this test).
        expect(await send(sa, requestBodies['action-hold-creature'])).toBe(200);
        expect(await send(sa, requestBodies['action-unhold-creature'])).toBe(200);
        expect(await send(sa, requestBodies['action-hold-creature'])).toBe(200);
        expect(await send(sa, requestBodies['action-fire-creature'])).toBe(200);
        at(ctx, 12 * ROUND);
        expect(await send(sa, requestBodies['reveal-seen'])).toBe(200);
        // The week of the bodies is the week of these tests.
        expect(requestBodies['reveal-seen'].body.week).toBe(W02.id);
      },
      { core: { raidPractice: true } },
    );
  });
});

/**
 * Auto fire preferences (`PUT /api/raid/autofire`, table `raid_autofire`): the default Auto fire
 * setting of each ability for the week's finale, applied at the live start (and at the instant late
 * finale and the practice start), locked once the finale has started.
 */
describe('Auto fire preferences', () => {
  const teamIds = (ctx: Ctx, p: Seeded): string[] =>
    (ctx.core.raid.view(p.id, HELSINKI).you.team?.creatures ?? []).map((c) => c.creatureId);
  const setAuto = (ctx: Ctx, p: Seeded, target: string, on: boolean) =>
    ctx.core.raid.setAutofire(p.id, HELSINKI, target, on);
  const ownAbilities = (s: LiveSnapshot, alias = 'm1') =>
    s.abilities.filter((x) => x.alias === alias);
  const prefOf = (ctx: Ctx, p: Seeded, target: string): boolean | undefined =>
    ctx.core.raid
      .view(p.id, HELSINKI)
      .you.abilities.find((x) => (x.creatureId ?? 'basic') === target)?.autoFire;
  const firedRoundOf = (events: readonly FightEvent[], key: string): number | undefined =>
    events.find((e) => e.t === 'ability' && e.key === key)?.round;
  const live = { raidPractice: true };

  it('is on for every ability until the player turns it off, and shows in the Raid view', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const [c0, c1] = teamIds(ctx, a) as [string, string, string];
      const view = ctx.core.raid.view(a.id, HELSINKI);
      expect(view.you.abilities.map((x) => x.autoFire)).toEqual([true, true, true, true]);

      expect(setAuto(ctx, a, 'basic', false)).toEqual({ ok: true, value: null });
      expect(setAuto(ctx, a, c1, false)).toEqual({ ok: true, value: null });
      expect(ctx.core.raid.view(a.id, HELSINKI).you.abilities.map((x) => x.autoFire)).toEqual([
        false,
        true,
        false,
        true,
      ]);
      // Idempotent, and back on again.
      expect(setAuto(ctx, a, 'basic', false).ok).toBe(true);
      expect(count(ctx.sql, 'raid_autofire')).toBe(2);
      expect(setAuto(ctx, a, c1, true).ok).toBe(true);
      expect(prefOf(ctx, a, c1)).toBe(true);
      expect(prefOf(ctx, a, c0)).toBe(true);
      expect(prefOf(ctx, a, 'basic')).toBe(false);
      // It is the player's own: another player's view is untouched.
      expect(ctx.core.raid.view(b.id, HELSINKI).you.abilities.every((x) => x.autoFire)).toBe(true);
    });
  });

  it('is changed over the API with a strict body, for the session user only', async () => {
    await runRaid(async (ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
      const open = (p: Seeded) =>
        ctx.core.createSession(ctx.guildId, { id: p.id, displayName: p.name });
      const sa = await open(a);
      const so = await open(outsider);
      const [c0] = teamIds(ctx, a) as [string];
      const put = async (secret: string, body: unknown) => {
        const res = await ctx.request(secret, '/api/raid/autofire', 'PUT', body);
        return [res.status, await res.json<Record<string, unknown>>()] as const;
      };

      const ok = await put(sa, { target: 'basic', on: false });
      expect(ok[0]).toBe(200);
      // It answers with the Raid view, so the toggle shows the new state at once.
      expect((ok[1]['you'] as RaidView['you']).abilities[0]).toMatchObject({ autoFire: false });
      expect((await put(sa, { target: c0, on: false }))[0]).toBe(200);

      const invalid = [
        {},
        { target: 'basic' },
        { on: true },
        { target: 'basic', on: 'yes' },
        { target: 'basic', on: 1 },
        { target: 'Basic', on: true },
        { target: 'not-an-id', on: true },
        { target: '', on: true },
        { target: 'm1:basic', on: true },
        { target: c0.toUpperCase().replace(/-/g, ''), on: true },
        { target: c0, on: true, userId: b.id },
        { target: 'basic', on: true, extra: 1 },
        [],
        'text',
        null,
      ];
      for (const body of invalid) {
        expect(await put(sa, body), JSON.stringify(body)).toEqual([400, { error: 'invalid_body' }]);
      }
      expect((await ctx.request(sa, '/api/raid/autofire', 'POST', {})).status).toBe(405);
      expect(await put(so, { target: 'basic', on: false })).toEqual([
        409,
        { error: 'not_in_roster' },
      ]);
      // Only the caller's own rows were written, whatever the body said.
      expect(
        rows(ctx.sql, 'SELECT user_id, target, auto_fire FROM raid_autofire ORDER BY target'),
      ).toEqual(
        [
          { user_id: a.id, target: 'basic', auto_fire: 0 },
          { user_id: a.id, target: c0, auto_fire: 0 },
        ].sort((x, y) => (x.target < y.target ? -1 : 1)),
      );
    });
  });

  it('refuses a creature that is not in the caller team', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 2 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: UNLOCKED, creatures: i === 0 ? 4 : 3 }),
      );
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      forcePool(ctx.sql, BIG, BIG, 1);
      ctx.clock.t = FINALE - 10 * MINUTE;
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const team = new Set(teamIds(ctx, a));
      // The caller's fourth creature is theirs but not in this week's team.
      const benched = a.creatureIds.find((id) => !team.has(id)) as string;
      expect(benched).toBeDefined();
      expect(err(setAuto(ctx, a, benched, false))).toBe('409 not_your_creature');
      // Someone else's creature, and one that does not exist.
      expect(err(setAuto(ctx, a, b.creatureIds[0] as string, false))).toBe('409 not_your_creature');
      expect(err(setAuto(ctx, a, '3f2504e0-4f89-41d3-9a0c-0305e82c3301', false))).toBe(
        '409 not_your_creature',
      );
      expect(count(ctx.sql, 'raid_autofire')).toBe(0);
    });
  });

  it('sets the first mode of each ability at the live start: off is held, with the last-round safety net', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const [c0, c1] = teamIds(ctx, a) as [string, string, string];
      pick(ctx, a, 'purge');
      expect(setAuto(ctx, a, 'basic', false).ok).toBe(true);
      expect(setAuto(ctx, a, c1, false).ok).toBe(true);

      // The lobby already shows the settings, for the caller only.
      at(ctx, -3 * MINUTE);
      const lobby = snap(ctx, a);
      expect(lobby.status).toBe('lobby');
      expect(ownAbilities(lobby).map((x) => [x.key, x.mode, x.autoFire])).toEqual([
        ['m1:basic', 'held', false],
        ['m1:c0', 'default', true],
        ['m1:c1', 'held', false],
        ['m1:c2', 'default', true],
      ]);
      expect(lobby.abilities.every((x) => x.alias === 'm1')).toBe(true);
      expect(ownAbilities(snap(ctx, b), 'm2').map((x) => x.autoFire)).toEqual([
        true,
        true,
        true,
        true,
      ]);

      begin(ctx);
      const first = snap(ctx, a);
      expect(ownAbilities(first).map((x) => [x.key, x.mode, x.autoFire])).toEqual([
        ['m1:basic', 'held', false],
        ['m1:c0', 'default', true],
        ['m1:c1', 'held', false],
        ['m1:c2', 'default', true],
      ]);
      expect(ownAbilities(first, 'm2').every((x) => x.mode === 'default' && x.autoFire)).toBe(true);
      // The stored fight has them too, so a restart changes nothing.
      const stored = rows<{ abilities: string }>(ctx.sql, 'SELECT abilities FROM raid_live')[0];
      const modes = (JSON.parse(stored?.abilities as string) as { key: string; mode: string }[])
        .filter((x) => x.key.startsWith('m1:'))
        .map((x) => x.mode);
      expect(modes).toEqual(['held', 'default', 'held', 'default']);

      // Held abilities wait for the last round; the others fire at their default round.
      at(ctx, 12 * ROUND - 1);
      const end = snap(ctx, a);
      const defaults = new Map(end.abilities.map((x) => [x.key, x.defaultRound]));
      expect(firedRoundOf(end.events, 'm1:basic')).toBe(12);
      expect(firedRoundOf(end.events, 'm1:c1')).toBe(12);
      expect(firedRoundOf(end.events, 'm1:c0')).toBe(defaults.get('m1:c0'));
      expect(firedRoundOf(end.events, 'm1:c2')).toBe(defaults.get('m1:c2'));
      expect(c0).toBeTruthy();
    });
  });

  it('turns an ability on again in the live fight with the usual actions, and Fire still works on a held one', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const [, c1] = teamIds(ctx, a) as [string, string, string];
      expect(setAuto(ctx, a, 'basic', false).ok).toBe(true);
      expect(setAuto(ctx, a, c1, false).ok).toBe(true);
      begin(ctx);
      at(ctx, 500);
      // Held at the start, so it can be turned on (before its default round) and fired by hand.
      expect(act(ctx, a, { action: 'unhold' }).ok).toBe(true);
      expect(ownAbilities(snap(ctx, a))[0]).toMatchObject({ mode: 'default', autoFire: true });
      expect(act(ctx, a, { key: 'm1:c1', action: 'fire' }).ok).toBe(true);
      expect(ownAbilities(snap(ctx, a))[2]).toMatchObject({ mode: 'fired', fireAtRound: 2 });
    });
  });

  it('is locked once the finale has started (409 locked), also in the minute before the event runs', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const [c0] = teamIds(ctx, a) as [string];
      at(ctx, -1);
      expect(setAuto(ctx, a, 'basic', false).ok).toBe(true);
      // The finale time has come, whether or not the event has run yet.
      at(ctx, 0);
      expect(err(setAuto(ctx, a, 'basic', true))).toBe('409 locked');
      begin(ctx);
      at(ctx, 5 * ROUND);
      expect(err(setAuto(ctx, a, c0, false))).toBe('409 locked');
      at(ctx, 12 * ROUND);
      expect(err(setAuto(ctx, a, 'basic', true))).toBe('409 locked');
      // Nothing changed after the start: the stored preference is the one from before.
      expect(rows(ctx.sql, 'SELECT target, auto_fire FROM raid_autofire')).toEqual([
        { target: 'basic', auto_fire: 0 },
      ]);
      // Over HTTP it is the same refusal.
    });
  });

  it('ignores a preference for a creature that left the team', async () => {
    await runRaid((ctx) => {
      const players = Array.from({ length: 2 }, (_, i) =>
        seedPlayer(ctx, i + 1, { level: UNLOCKED, creatures: i === 0 ? 4 : 3 }),
      );
      ctx.core.raid.currentWeek(HELSINKI);
      ctx.clock.t = W02.afterPhase2;
      ctx.core.raid.runDue(HELSINKI);
      forcePool(ctx.sql, BIG, BIG, 1);
      ctx.clock.t = FINALE - 10 * MINUTE;
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const before = teamIds(ctx, a);
      const leaving = before[0] as string;
      expect(setAuto(ctx, a, leaving, false).ok).toBe(true);
      expect(setAuto(ctx, a, before[1] as string, false).ok).toBe(true);
      // Swap the first creature for the fourth: the preference stays in the table but is never read.
      const fourth = a.creatureIds.find((id) => !before.includes(id)) as string;
      expect(
        ctx.core.raid.setTeam(a.id, HELSINKI, [fourth, before[1] as string, before[2] as string])
          .ok,
      ).toBe(true);
      expect(count(ctx.sql, 'raid_autofire')).toBe(2);
      const view = ctx.core.raid.view(a.id, HELSINKI);
      expect(view.you.abilities.map((x) => x.creatureId)).toEqual([
        null,
        fourth,
        before[1],
        before[2],
      ]);
      expect(view.you.abilities.map((x) => x.autoFire)).toEqual([true, true, false, true]);

      begin(ctx);
      const s = snap(ctx, a);
      expect(ownAbilities(s).map((x) => [x.creature, x.mode])).toEqual([
        [null, 'default'],
        [fourth, 'default'],
        [before[1], 'held'],
        [before[2], 'default'],
      ]);
      expect(ownAbilities(s).some((x) => x.creature === leaving)).toBe(false);
    });
  });

  it('applies to the instant late finale too: held abilities fire in the last round', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const [c0] = teamIds(ctx, a) as [string];
      expect(setAuto(ctx, a, c0, false).ok).toBe(true);
      expect(setAuto(ctx, a, 'basic', false).ok).toBe(true);
      // The event runs far too late for anyone to watch: it resolves at once.
      ctx.clock.t = FINALE + 11 * MINUTE;
      ctx.core.raid.runDue(HELSINKI);
      const run = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      const events = run?.result.events ?? [];
      const rounds = run?.input.boss.finaleRounds as number;
      expect(firedRoundOf(events, 'm1:c0')).toBe(rounds);
      expect(firedRoundOf(events, 'm1:basic')).toBe(rounds);
      // The others fire at their default round, well before.
      expect(firedRoundOf(events, 'm1:c1')).toBeLessThan(rounds);
      expect(firedRoundOf(events, 'm2:basic')).toBeLessThan(rounds);
      // The stored input carries the last round, so the replay shows the same fight.
      const stored = run?.input.finaleAbilities.find((x) => x.key === 'm1:c0');
      expect(stored?.fireAtRound).toBe(rounds);
    });
  });

  it('applies to a practice fight: at its start, and in its lobby; the fight then runs as usual', async () => {
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx, 2, { level: UNLOCKED });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        const [c0, c1] = teamIds(ctx, a) as [string, string, string];
        ctx.clock.t = W02.afterPhase2 + 5000;
        expect(setAuto(ctx, a, c0, false).ok).toBe(true);
        const started = ctx.core.raid.startPractice(a.id, HELSINKI);
        expect(started.ok ? started.value.status : null).toBe('lobby');
        expect(ownAbilities(snap(ctx, a)).map((x) => x.autoFire)).toEqual([
          true,
          false,
          true,
          true,
        ]);

        // A change in the 30 second lobby is picked up by the practice fight; the other party
        // member's lobby is theirs alone.
        expect(setAuto(ctx, a, c1, false).ok).toBe(true);
        expect(setAuto(ctx, a, c0, true).ok).toBe(true);
        expect(ownAbilities(snap(ctx, a)).map((x) => [x.key, x.autoFire])).toEqual([
          ['m1:basic', true],
          ['m1:c0', true],
          ['m1:c1', false],
          ['m1:c2', true],
        ]);
        expect(ownAbilities(snap(ctx, b), 'm2').every((x) => x.autoFire)).toBe(true);

        ctx.clock.t += PRACTICE_LOBBY_MS;
        const first = snap(ctx, a);
        expect(first.status).toBe('live');
        expect(ownAbilities(first).map((x) => [x.key, x.mode])).toEqual([
          ['m1:basic', 'default'],
          ['m1:c0', 'default'],
          ['m1:c1', 'held'],
          ['m1:c2', 'default'],
        ]);
        // A practice fight has no real finale to lock against, and once it runs the live actions
        // apply: the preference no longer touches it.
        ctx.clock.t += 500;
        expect(setAuto(ctx, a, c1, true).ok).toBe(true);
        expect(ownAbilities(snap(ctx, a))[2]).toMatchObject({ mode: 'held', autoFire: false });
        expect(act(ctx, a, { key: 'm1:c1', action: 'unhold' }).ok).toBe(true);
        expect(ownAbilities(snap(ctx, a))[2]).toMatchObject({ mode: 'default', autoFire: true });
      },
      { core: live },
    );
  });
});

/** Creature abilities: what each member brings, the keys, per-ability Fire and Hold, legacy rows. */
describe('creature abilities in the live finale', () => {
  const ability = (id: string) => content.finaleAbilities.find((a) => a.id === id);
  const abilityOfSpecies = (species: string): string =>
    content.creatures.find((s) => s.id === species)?.ability?.id as string;
  const teamOf = (ctx: Ctx, p: Seeded) => {
    const team = ctx.core.raid.view(p.id, HELSINKI).you.team;
    return team?.creatures ?? [];
  };
  const setLevel = (ctx: Ctx, creatureId: string, level: number): void => {
    ctx.sql.exec('UPDATE creatures SET level = ? WHERE id = ?', level, creatureId);
  };

  it('brings the basic pick plus one ability per unlocked team creature, keyed by team slot', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'purge');
      const team = teamOf(ctx, a);
      expect(team).toHaveLength(3);
      begin(ctx);
      const s = snap(ctx, a);
      expect(s.abilities.filter((x) => x.alias === 'm1').map((x) => x.key)).toEqual([
        'm1:basic',
        'm1:c0',
        'm1:c1',
        'm1:c2',
      ]);
      expect(s.abilities.filter((x) => x.alias === 'm2')).toHaveLength(4);
      expect(new Set(s.abilities.map((x) => x.key)).size).toBe(8);
      const basic = s.abilities[0];
      expect(basic).toMatchObject({ key: 'm1:basic', abilityId: 'purge', creature: null });
      team.forEach((creature, n) => {
        const entry = s.abilities.find((x) => x.key === `m1:c${n}`);
        expect(entry).toMatchObject({
          alias: 'm1',
          abilityId: abilityOfSpecies(creature.species),
          creature: creature.creatureId,
          mode: 'default',
          fired: false,
          fireAtRound: null,
        });
        expect(entry?.defaultRound).toBeGreaterThan(0);
        // Every creature of the ability stands in the frozen row.
        expect(s.row.some((slot) => slot.id === creature.creatureId)).toBe(true);
      });
      // No raw creature id is ever in a key.
      for (const x of s.abilities) {
        for (const id of [...a.creatureIds, ...b.creatureIds]) expect(x.key).not.toContain(id);
      }
      // Every use fires on its own at its default round, and the events name the creature.
      at(ctx, 8 * ROUND);
      const later = snap(ctx, a);
      const fired = later.events.filter(
        (e): e is Extract<FightEvent, { t: 'ability' }> => e.t === 'ability',
      );
      expect(fired.map((e) => e.key).sort()).toEqual(later.abilities.map((x) => x.key).sort());
      expect(fired.every((e) => e.byDefault)).toBe(true);
      expect(later.abilities.every((x) => x.fired && x.firedAtRound !== null)).toBe(true);
      for (const e of fired) {
        const use = later.abilities.find((x) => x.key === e.key);
        expect(e.creature ?? null).toBe(use?.creature ?? null);
        expect(e.round).toBe(use?.firedAtRound);
      }
      // The stored fight remembers the creature of each use.
      const stored = JSON.parse(
        rows<{ abilities: string }>(ctx.sql, 'SELECT abilities FROM raid_live')[0]
          ?.abilities as string,
      ) as { key: string; creatureId: string | null }[];
      expect(stored.find((x) => x.key === 'm1:c1')?.creatureId).toBe(team[1]?.creatureId);
    });
  });

  it('skips creatures below the unlock level, and the end of the fight keeps the keys', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      const team = teamOf(ctx, a);
      setLevel(ctx, team[1]?.creatureId as string, UNLOCKED - 1);
      begin(ctx);
      const mine = snap(ctx, a).abilities.filter((x) => x.alias === 'm1');
      // The slot index follows the team, so the locked creature leaves a gap in the keys.
      expect(mine.map((x) => x.key)).toEqual(['m1:basic', 'm1:c0', 'm1:c2']);
      at(ctx, 12 * ROUND);
      expect(snap(ctx, a).status).toBe('done');
      const run = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      const stored = run?.input.finaleAbilities.filter((x) => x.playerId === 'm1');
      expect(stored?.map((x) => x.key)).toEqual(['m1:basic', 'm1:c0', 'm1:c2']);
      expect(stored?.[1]?.creatureId).toBe(team[0]?.creatureId);
      // The saved replay is exactly what was fought.
      const replay = ctx.core.raid.replay(a.id, W02.id, 1, 'finale') as ReplayView;
      expect(replay.events.filter((e) => e.t === 'ability' && e.player === 'm1')).toHaveLength(3);
    });
  });

  it('fires and holds each ability on its own key, only for its owner', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      begin(ctx);
      inRound(ctx, 2);
      expect(act(ctx, a, { key: 'm1:c0', action: 'fire' }).ok).toBe(true);
      let s = snap(ctx, a);
      const use = (key: string) => s.abilities.find((x) => x.key === key);
      expect(use('m1:c0')).toMatchObject({ mode: 'fired', fired: false, fireAtRound: 3 });
      for (const key of ['m1:basic', 'm1:c1', 'm1:c2', 'm2:basic', 'm2:c0']) {
        expect(use(key)).toMatchObject({ mode: 'default', fireAtRound: null });
      }
      expect(err(act(ctx, a, { key: 'm1:c0', action: 'fire' }))).toBe('409 already_fired');
      expect(err(act(ctx, a, { key: 'm1:c0', action: 'hold' }))).toBe('409 already_fired');
      // A second use of the same player is unaffected, and Hold works per key.
      const defaultRound = (key: string) => use(key)?.defaultRound as number;
      const holdable = ['m1:basic', 'm1:c1', 'm1:c2'].find((k) => defaultRound(k) > 2);
      expect(holdable).toBeDefined();
      expect(act(ctx, a, { key: holdable as string, action: 'hold' }).ok).toBe(true);
      s = snap(ctx, a);
      expect(use(holdable as string)).toMatchObject({ mode: 'held' });
      expect(use('m1:c1')?.mode === 'held' ? 1 : 0).toBe(holdable === 'm1:c1' ? 1 : 0);

      // Someone else's key, and a key that does not exist, are both refused the same way.
      expect(err(act(ctx, a, { key: 'm2:basic', action: 'fire' }))).toBe('409 not_your_ability');
      expect(err(act(ctx, b, { key: 'm1:c1', action: 'fire' }))).toBe('409 not_your_ability');
      expect(err(act(ctx, a, { key: 'm1:c7', action: 'fire' }))).toBe('409 not_your_ability');
      expect(err(act(ctx, a, { key: 'm9:basic', action: 'hold' }))).toBe('409 not_your_ability');
      // Nothing of theirs changed.
      s = snap(ctx, b);
      expect(s.abilities.filter((x) => x.alias === 'm2').every((x) => x.mode === 'default')).toBe(
        true,
      );

      // The press takes effect next round, as that creature's ability.
      inRound(ctx, 3);
      s = snap(ctx, a);
      expect(use('m1:c0')).toMatchObject({ fired: true, firedAtRound: 3, fireAtRound: null });
      const event = s.events.find((e) => e.t === 'ability' && e.key === 'm1:c0');
      expect(event).toMatchObject({ round: 3, byDefault: false });
    });
  });

  it('accepts zone and element only for abilities whose effects choose', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      pick(ctx, a, 'shield-wall');
      // No shipped creature ability chooses a zone or an element.
      for (const def of content.finaleAbilities.filter((d) => d.kind === 'creature')) {
        expect(
          def.effects.some(
            (e) =>
              (e.op === 'shield_wall' && e.zone === 'choose') ||
              (e.op === 're_mark' && e.element === 'choose'),
          ),
        ).toBe(false);
      }
      begin(ctx);
      inRound(ctx, 2);
      expect(err(act(ctx, a, { key: 'm1:c0', action: 'fire', zone: 'back' }))).toBe(
        '400 invalid_body',
      );
      expect(err(act(ctx, a, { key: 'm1:c0', action: 'fire', element: 'tide' }))).toBe(
        '400 invalid_body',
      );
      expect(snap(ctx, a).abilities.find((x) => x.key === 'm1:c0')?.mode).toBe('default');
      // The basic Shield Wall still takes its zone.
      expect(act(ctx, a, { key: 'm1:basic', action: 'fire', zone: 'back' }).ok).toBe(true);
      expect(ability('shield-wall')?.effects[0]).toMatchObject({ zone: 'choose' });
    });
  });

  it('previews what the caller will bring, with locked entries for creatures below the unlock level', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
      const outsider = seedPlayer(ctx, 50, { lastSeenAt: ctx.clock.t - 30 * 86_400_000 });
      pick(ctx, a, 're-mark');
      const team = teamOf(ctx, a);
      setLevel(ctx, team[2]?.creatureId as string, 7);
      const view = ctx.core.raid.view(a.id, HELSINKI);
      const preview = view.you.abilities;
      expect(preview).toHaveLength(4);
      expect(preview[0]).toEqual({
        key: 'm1:basic',
        abilityId: 're-mark',
        creatureId: null,
        species: null,
        unlocked: true,
        unlockLevel: 1,
        autoFire: true,
      });
      expect(preview[1]).toEqual({
        key: 'm1:c0',
        abilityId: abilityOfSpecies(team[0]?.species as string),
        creatureId: team[0]?.creatureId,
        species: team[0]?.species,
        unlocked: true,
        unlockLevel: RULES.abilities.unlockLevel,
        autoFire: true,
      });
      // A locked entry has no key: it will not be in the fight.
      const locked = preview[3] as NonNullable<(typeof preview)[number]>;
      expect(locked).toEqual({
        abilityId: abilityOfSpecies(team[2]?.species as string),
        creatureId: team[2]?.creatureId,
        species: team[2]?.species,
        unlocked: false,
        unlockLevel: RULES.abilities.unlockLevel,
        autoFire: true,
      });
      expect('key' in locked).toBe(false);
      // The preview is the player's own: another player's differs, and a non-member has none.
      expect(ctx.core.raid.view(b.id, HELSINKI).you.abilities[0]?.key).toBe('m2:basic');
      expect(ctx.core.raid.view(outsider.id, HELSINKI).you.abilities).toEqual([]);
      // What the preview promised is what the fight brings.
      begin(ctx);
      expect(
        snap(ctx, a)
          .abilities.filter((x) => x.alias === 'm1')
          .map((x) => x.key),
      ).toEqual(preview.flatMap((x) => (x.key === undefined ? [] : [x.key])));
    });
  });

  it('builds the same abilities for the instant late finale and for a practice fight', async () => {
    await runRaid((ctx) => {
      const players = toFinale(ctx, 2, { level: UNLOCKED });
      const [a] = inOrder(ctx, players) as [Seeded, Seeded];
      // The event runs far too late for anyone to watch: it resolves at once.
      ctx.clock.t = FINALE + 11 * MINUTE;
      ctx.core.raid.runDue(HELSINKI);
      const run = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
      expect(run?.input.finaleAbilities.map((x) => x.key)).toEqual([
        'm1:basic',
        'm1:c0',
        'm1:c1',
        'm1:c2',
        'm2:basic',
        'm2:c0',
        'm2:c1',
        'm2:c2',
      ]);
      const events = run?.result.events.filter((e) => e.t === 'ability') ?? [];
      expect(events).toHaveLength(8);
      expect(ctx.core.raid.replay(a.id, W02.id, 1, 'finale')).not.toBeNull();
    });
    await runRaid(
      (ctx) => {
        const players = toFinale(ctx, 2, { level: UNLOCKED });
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        ctx.clock.t = W02.afterPhase2 + 5000;
        const started = ctx.core.raid.startPractice(a.id, HELSINKI);
        expect(started.ok).toBe(true);
        const lobby = snap(ctx, a);
        expect(lobby).toMatchObject({ status: 'lobby', practice: true });
        expect(lobby.abilities).toHaveLength(4);
        // Fire is for the fight: in the lobby it is refused.
        expect(err(act(ctx, a, { key: 'm1:c2', action: 'fire' }))).toBe('409 not_started');
        ctx.clock.t += PRACTICE_LOBBY_MS;
        const s = snap(ctx, a);
        expect(s.practice).toBe(true);
        expect(s.abilities.filter((x) => x.alias === 'm1')).toHaveLength(4);
        expect(act(ctx, a, { key: 'm1:c2', action: 'fire' }).ok).toBe(true);
      },
      { core: { raidPractice: true } },
    );
  });

  /** A copy of `value` without the named fields (how rows looked before they existed). */
  const omit = (value: Record<string, unknown>, ...fields: string[]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(value).filter(([field]) => !fields.includes(field)));

  describe('a fight stored before creature abilities', () => {
    /** Rewrites a stored fight's abilities into the old shape: no key, no creature. */
    function makeLegacy(ctx: Ctx, extra: Record<string, unknown>[] = []): void {
      const stored = rows<{ abilities: string }>(ctx.sql, 'SELECT abilities FROM raid_live')[0];
      const legacy = (JSON.parse(stored?.abilities as string) as Record<string, unknown>[])
        .filter((x) => x['creatureId'] === null)
        .map((x) => omit(x, 'key', 'creatureId'));
      ctx.sql.exec('UPDATE raid_live SET abilities = ?', JSON.stringify([...legacy, ...extra]));
    }

    it('keeps playing: legacy choices become <alias>:basic and the fight resolves', async () => {
      await runRaid((ctx) => {
        const players = toFinale(ctx, 2, { level: UNLOCKED });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        pick(ctx, a, 'shield-wall');
        pick(ctx, b, 'rally');
        begin(ctx);
        makeLegacy(ctx);
        inRound(ctx, 2);
        const s = snap(ctx, a);
        expect(s.status).toBe('live');
        expect(s.abilities.map((x) => [x.key, x.abilityId, x.creature])).toEqual([
          ['m1:basic', 'shield-wall', null],
          ['m2:basic', 'rally', null],
        ]);
        // Fire and Hold work on the mapped key, and write the new shape back.
        expect(act(ctx, a, { key: 'm1:basic', action: 'fire', zone: 'back' }).ok).toBe(true);
        expect(err(act(ctx, a, { key: 'm2:basic', action: 'fire' }))).toBe('409 not_your_ability');
        expect(act(ctx, b, { key: 'm2:basic', action: 'hold' }).ok).toBe(true);
        const written = JSON.parse(
          rows<{ abilities: string }>(ctx.sql, 'SELECT abilities FROM raid_live')[0]
            ?.abilities as string,
        ) as { key: string; mode: string }[];
        expect(written.map((x) => [x.key, x.mode])).toEqual([
          ['m1:basic', 'fired'],
          ['m2:basic', 'held'],
        ]);
        at(ctx, 12 * ROUND);
        expect(snap(ctx, a).status).toBe('done');
        expect(finaleRows(ctx)).toBe(1);
        const run = storedRuns(ctx.sql, W02.id).find((r) => r.phase === 'finale');
        expect(run?.input.finaleAbilities.map((x) => x.key)).toEqual(['m1:basic', 'm2:basic']);
        expect(ctx.core.raid.replay(a.id, W02.id, 1, 'finale')).not.toBeNull();
      });
    });

    it('drops what the content no longer has instead of throwing', async () => {
      await runRaid((ctx) => {
        const players = toFinale(ctx, 2, { level: UNLOCKED });
        const [a, b] = inOrder(ctx, players) as [Seeded, Seeded];
        begin(ctx);
        const old = (alias: string, abilityId: string) => ({
          alias,
          abilityId,
          mode: 'default',
          fireAtRound: null,
          params: null,
        });
        // An ability id that was removed, a second choice for the same member, a creature
        // ability that has lost its creature and one that cannot exist without one.
        makeLegacy(ctx, [
          old('m1', 'gone-ability'),
          old('m2', 'rally'),
          { ...old('m2', 'flare-strike'), key: 'm2:c0', creatureId: 'no-such-creature' },
          old('m2', 'flare-strike'),
        ]);
        inRound(ctx, 4);
        const s = snap(ctx, b);
        expect(s.status).toBe('live');
        expect(s.abilities.map((x) => x.key)).toEqual(['m1:basic', 'm2:basic']);
        at(ctx, 12 * ROUND);
        expect(snap(ctx, a).status).toBe('done');
        expect(finaleRows(ctx)).toBe(1);
      });
    });

    it('reads a stored replay from before creature abilities', async () => {
      await runRaid((ctx) => {
        const players = toFinale(ctx, 2);
        const [a] = inOrder(ctx, players) as [Seeded, Seeded];
        begin(ctx);
        at(ctx, 12 * ROUND);
        expect(snap(ctx, a).status).toBe('done');
        // Strip the keys and creature ids from the stored result, as old rows had them.
        const row = rows<{ input: string; result: string }>(
          ctx.sql,
          "SELECT input, result FROM raid_results WHERE phase = 'finale'",
        )[0];
        const input = JSON.parse(row?.input as string) as {
          finaleAbilities: Record<string, unknown>[];
        };
        input.finaleAbilities = input.finaleAbilities.map((x) => omit(x, 'key'));
        const result = JSON.parse(row?.result as string) as { events: Record<string, unknown>[] };
        result.events = result.events.map((e) => {
          return e['t'] === 'ability' ? omit(e, 'key') : e;
        });
        ctx.sql.exec(
          "UPDATE raid_results SET input = ?, result = ? WHERE phase = 'finale'",
          JSON.stringify(input),
          JSON.stringify(result),
        );
        const replay = ctx.core.raid.replay(a.id, W02.id, 1, 'finale') as ReplayView;
        expect(replay.events.filter((e) => e.t === 'ability')).toHaveLength(2);
        expect(replay.names.abilities).toBeDefined();
      });
    });
  });
});
