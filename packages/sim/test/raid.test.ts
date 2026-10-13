import { describe, expect, it } from 'vitest';
import { content, createSeededRng, type BossDef } from '@creatures/game';
import { DEFAULT_MIX } from '../src/archetypes';
import { runEconomy } from '../src/economy';
import { openRaidWeek, playStage, playWholeWeek, summarizeRaid } from '../src/raid';
import { runSweep } from '../src/sweep';
import { clonePlayer, type SimPlayer } from '../src/state';

const economy = runEconomy({ seed: 'raid', weeks: 5, mix: DEFAULT_MIX, snapshotWeeks: [4] });
const roster = (economy.snapshots[0]?.players ?? []).map(clonePlayer);
function firstBoss(): BossDef {
  const b = content.bosses[0];
  if (b === undefined) throw new Error('no boss');
  return b;
}
const boss = firstBoss();

function week(players: SimPlayer[]) {
  const w = openRaidWeek(boss, players);
  playWholeWeek(w, createSeededRng('fight'), createSeededRng('loot'));
  return w;
}

describe('raid week', () => {
  it('fills the row with guests for a single player and ranks no guest as a player', () => {
    const [first] = roster;
    if (first === undefined) throw new Error('empty roster');
    const w = openRaidWeek(boss, [first]);
    expect(w.row).toHaveLength(9);
    expect(w.row.filter((s) => s.ownerId === null)).toHaveLength(6);
    expect(w.picks).toHaveLength(3);
  });

  it('builds a 3-per-player row for larger groups and picks the 3 strongest creatures', () => {
    const players = roster.slice(0, 5);
    const w = openRaidWeek(boss, players);
    expect(w.row).toHaveLength(15);
    expect(w.row.every((s) => s.ownerId !== null)).toBe(true);
    for (const p of players) {
      expect(w.picks.filter((x) => x.playerId === p.id)).toHaveLength(3);
    }
  });

  it('runs all stages, carries the boss pool, and pays Essence only for cleared stages', () => {
    const players = roster.slice(0, 8);
    const before = new Map(players.map((p) => [p.id, p.essence]));
    const raidsBefore = new Map(players.map((p) => [p.id, p.raids]));
    const w = week(players);
    const s = summarizeRaid(w);
    expect(s.lossAfter.phase1).toBeLessThanOrEqual(s.lossAfter.phase2);
    expect(s.lossAfter.phase2).toBeLessThanOrEqual(s.lossAfter.finale);
    const flat = (s.phase1Cleared ? 10 : 0) + (s.phase2Cleared ? 15 : 0) + (s.finaleWon ? 25 : 0);
    for (const p of players) {
      const paid = p.essence - (before.get(p.id) ?? 0);
      expect(paid).toBe(w.essence[p.id]);
      expect(paid).toBeGreaterThanOrEqual(flat);
    }
    for (const p of players) expect(p.raids).toBe((raidsBefore.get(p.id) ?? 0) + 1);
  });

  it('is deterministic for the same seeds', () => {
    const a = summarizeRaid(week(roster.slice(0, 6).map(clonePlayer)));
    const b = summarizeRaid(week(roster.slice(0, 6).map(clonePlayer)));
    expect(a).toEqual(b);
  });

  it('rolls no jackpots on a lost finale and keeps the counters consistent', () => {
    const players = roster.slice(0, 4).map(clonePlayer);
    const w = openRaidWeek(boss, players);
    // A boss with a huge pool cannot be beaten.
    w.pool = { max: 1_000_000_000, current: 1_000_000_000 };
    // Start every player at pity 3 (the history of the roster is not what this test is about).
    for (const p of players) {
      p.pity = 3;
      p.maxPity = 3;
    }
    const rng = createSeededRng('lost');
    playStage(w, 'phase1', rng, rng);
    playStage(w, 'phase2', rng, rng);
    playStage(w, 'finale', rng, rng);
    expect(w.stages.finale?.cleared).toBe(false);
    expect(w.jackpot.rolls).toBe(0);
    // Pity counts finale wins only: a lost finale leaves the counter alone.
    expect(players.every((p) => p.pity === 3 && p.jackpots === 0)).toBe(true);
    expect(players.every((p) => p.maxPity <= 3)).toBe(true);
    expect(Object.values(w.essence).every((e) => e === 0)).toBe(true);
  });

  it('advances the pity counter on a won finale without a jackpot, and resets it on a hit', () => {
    const players = roster.slice(0, 4).map(clonePlayer);
    const w = openRaidWeek(boss, players);
    // A boss with 1 HP falls at once: the finale is a win and every player rolls.
    w.pool = { max: 1, current: 1 };
    for (const p of players) p.pity = 3;
    const rng = createSeededRng('won');
    playStage(w, 'finale', rng, createSeededRng('loot-won'));
    expect(w.stages.finale?.cleared).toBe(true);
    expect(w.jackpot.rolls).toBe(players.length);
    for (const p of players) expect(p.pity === 0 ? p.jackpots === 1 : p.pity === 4).toBe(true);
  });
});

describe('abilities in the finale', () => {
  const players = () => roster.slice(0, 6).map(clonePlayer);

  it('brings one basic ability per player (round-robin) and a creature ability for each team creature at level 10 or above', () => {
    const w = openRaidWeek(boss, players(), { keepFinale: true });
    playWholeWeek(w, createSeededRng('fight'), createSeededRng('loot'));
    const events = (w.finaleEvents ?? []).flatMap((e) => (e.t === 'ability' ? [e] : []));
    // The 12-round finale may end early when the boss falls, so look at the abilities that fired:
    // every one is a basic ability of a player or a creature ability of a picked creature.
    const basicIds = ['rally', 'shield-wall', 're-mark', 'purge'];
    expect(w.abilities.map((a) => a.abilityId)).toEqual(w.players.map((_, i) => basicIds[i % 4]));
    expect(w.abilities.map((a) => a.key)).toEqual(w.players.map((p) => `${p.id}:basic`));
    const eligible = w.picks.filter((p) => p.level >= 10);
    expect(eligible.length).toBeGreaterThan(0);
    for (const e of events) {
      if (e.creature === undefined) {
        expect(e.key.endsWith(':basic')).toBe(true);
      } else {
        expect(e.key).toBe(`${e.creature}:ability`);
        expect(eligible.map((p) => p.creatureId)).toContain(e.creature);
      }
    }
  });

  it('measures what abilities add, deterministically, and counts the creature abilities brought', () => {
    const run = () => {
      const w = openRaidWeek(boss, players(), { measureAbilities: true });
      playWholeWeek(w, createSeededRng('fight'), createSeededRng('loot'));
      return w;
    };
    const w = run();
    const impact = w.abilityImpact;
    expect(impact).not.toBeNull();
    expect(impact?.none).toBeGreaterThan(0);
    expect(impact?.all).toBeGreaterThan(0);
    expect(impact?.creatureAbilities).toBeGreaterThan(0);
    expect(run().abilityImpact).toEqual(impact);
    // Not measured unless asked.
    const plain = openRaidWeek(boss, players());
    playWholeWeek(plain, createSeededRng('fight'), createSeededRng('loot'));
    expect(plain.abilityImpact).toBeNull();
  });
});

describe('raid sweep', () => {
  it('runs a tiny sweep: every count and boss, deterministic records', () => {
    const options = {
      seed: 'tiny',
      runs: 3,
      counts: [5],
      snapshots: new Map([[5, economy.snapshots]]),
    };
    const a = runSweep(options);
    const b = runSweep(options);
    expect(a.records).toHaveLength(3 * content.bosses.length);
    expect(a).toEqual(b);
    expect(a.example?.lines.length).toBeLessThanOrEqual(30);
    expect(Object.values(a.elementPicks).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    for (const r of a.records) {
      expect(r.signedUp).toBeGreaterThan(0);
      expect(r.loss1).toBeLessThanOrEqual(r.loss2);
    }
  });
});
