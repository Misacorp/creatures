import { content, createSeededRng, type Element } from '@creatures/game';
import { buildNames, describeEvent, type EventNames } from '@creatures/engine';
import type { ArchetypeId } from './archetypes';
import { ARCHETYPES } from './archetypes';
import { chooseSignUps, type Snapshot } from './economy';
import { playWholeWeek, openRaidWeek, summarizeRaid, type RaidWeek } from './raid';
import { clonePlayer } from './state';

/** The numbers kept from one simulated raid week. */
export interface RunRecord {
  count: number;
  boss: string;
  snapshotWeek: number;
  signedUp: number;
  avgLevel: number;
  phase1: boolean;
  phase2: boolean;
  win: boolean;
  /** Share of the boss pool lost after each stage (0 to 1). */
  loss1: number;
  loss2: number;
  lossFinale: number;
  rounds: number;
  reactions: number;
  /** The biggest player's share of the week's total contribution; null if nothing was dealt. */
  topShare: number | null;
  setup: number;
  contribution: number;
  jackpotRolls: number;
  jackpotHits: number;
  jackpotGuaranteed: number;
}

export interface CreatureAggregate {
  appearances: number;
  contribution: number;
  levelSum: number;
}

export interface ArchetypeAggregate {
  /** Sum over player-weeks (groups of 5+) of the player's share of total contribution. */
  shareSum: number;
  playerWeeks: number;
  essenceSum: number;
}

export interface ExampleFight {
  boss: string;
  count: number;
  snapshotWeek: number;
  won: boolean;
  /** The first 30 events of the finale, described in plain English. */
  lines: string[];
}

export interface SweepResult {
  records: RunRecord[];
  elementPicks: Record<Element, number>;
  creatures: Record<string, CreatureAggregate>;
  archetypes: Record<ArchetypeId, ArchetypeAggregate>;
  /** Essence earned per signed-up player and week, by server size. */
  essenceByCount: Record<string, number[]>;
  example: ExampleFight | null;
}

export interface SweepOptions {
  seed: string;
  /** Simulated raid weeks per player count and boss. */
  runs: number;
  counts: readonly number[];
  /** Roster snapshots per player count (from the economy sims at weeks 4 and 8). */
  snapshots: ReadonlyMap<number, readonly Snapshot[]>;
}

function describeFinale(week: RaidWeek, labels: Record<string, string>): string[] {
  const base = buildNames({ boss: week.boss, row: week.row }, labels, content);
  const creatures: Record<string, string> = {};
  for (const s of week.row) {
    creatures[s.id] = s.ownerId === null ? s.name : `${s.name} (${labels[s.ownerId] ?? s.ownerId})`;
  }
  const names: EventNames = { ...base, creatures };
  return (week.finaleEvents ?? []).slice(0, 30).map((e) => describeEvent(e, names));
}

/**
 * The raid sweep: for every player count and boss, `runs` simulated raid weeks on rosters taken
 * from the economy snapshots (cycling through them). Sign-ups follow the archetype rules again
 * (casuals 70%), sign-up order is shuffled, and every run has its own seeded streams.
 */
export function runSweep(options: SweepOptions): SweepResult {
  const records: RunRecord[] = [];
  const elementPicks: Record<Element, number> = { tide: 0, ember: 0, grove: 0, spark: 0 };
  const creatures: Record<string, CreatureAggregate> = {};
  const archetypes = Object.fromEntries(
    ARCHETYPES.map((a) => [a, { shareSum: 0, playerWeeks: 0, essenceSum: 0 }]),
  ) as Record<ArchetypeId, ArchetypeAggregate>;
  const essenceByCount: Record<string, number[]> = {};
  let example: ExampleFight | null = null;
  const exampleCount = options.counts.includes(10)
    ? 10
    : (options.counts.find((c) => c >= 5) ?? options.counts[0]);

  for (const count of options.counts) {
    const snaps = options.snapshots.get(count) ?? [];
    if (snaps.length === 0) continue;
    for (const boss of content.bosses) {
      for (let i = 0; i < options.runs; i++) {
        const snap = snaps[i % snaps.length] as Snapshot;
        const base = `${options.seed}:sweep:${count}:${boss.id}:${i}`;
        const players = snap.players.map(clonePlayer);
        const signed = chooseSignUps(
          players,
          createSeededRng(`${base}:signup`),
          createSeededRng(`${base}:order`),
        );
        if (signed.length === 0) continue;
        const wantExample =
          example === null && count === exampleCount && boss === content.bosses[0];
        const week = openRaidWeek(boss, signed, { keepFinale: wantExample });
        playWholeWeek(week, createSeededRng(`${base}:fight`), createSeededRng(`${base}:loot`));
        const s = summarizeRaid(week);

        const total = Object.values(s.players).reduce((n, p) => n + p.contribution, 0);
        const top = Object.values(s.players).reduce((n, p) => Math.max(n, p.contribution), 0);
        const setup = Object.values(s.players).reduce((n, p) => n + p.setupCredit, 0);
        records.push({
          count,
          boss: boss.id,
          snapshotWeek: snap.week,
          signedUp: s.signedUp,
          avgLevel: s.avgLevel,
          phase1: s.phase1Cleared,
          phase2: s.phase2Cleared,
          win: s.finaleWon,
          loss1: s.lossAfter.phase1,
          loss2: s.lossAfter.phase2,
          lossFinale: s.lossAfter.finale,
          rounds: s.rounds,
          reactions: s.reactions,
          topShare: total === 0 ? null : top / total,
          setup,
          contribution: total,
          jackpotRolls: s.jackpot.rolls,
          jackpotHits: s.jackpot.hits,
          jackpotGuaranteed: s.jackpot.guaranteed,
        });

        for (const pick of week.picks) {
          elementPicks[pick.element] += 1;
          const agg = (creatures[pick.line] ??= { appearances: 0, contribution: 0, levelSum: 0 });
          agg.appearances += 1;
          agg.contribution += week.perCreature[pick.creatureId] ?? 0;
          agg.levelSum += pick.level;
        }
        const essence = (essenceByCount[String(count)] ??= []);
        for (const p of Object.values(s.players)) {
          essence.push(p.essence);
          const a = archetypes[p.archetype];
          a.essenceSum += p.essence;
          if (s.signedUp >= 5 && total > 0) {
            a.shareSum += p.contribution / total;
            a.playerWeeks += 1;
          }
        }
        if (wantExample && week.finaleEvents !== null) {
          const labels = Object.fromEntries(week.players.map((p) => [p.id, p.label]));
          example = {
            boss: boss.name,
            count,
            snapshotWeek: snap.week,
            won: s.finaleWon,
            lines: describeFinale(week, labels),
          };
        }
      }
    }
  }
  return { records, elementPicks, creatures, archetypes, essenceByCount, example };
}
