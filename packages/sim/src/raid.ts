import {
  abilitiesFor,
  basicAbilities,
  contributionWeights,
  essenceForStage,
  jackpotChanceBp,
  rollJackpot,
  type BossDef,
  createSeededRng,
  type Element,
  type RaidStage,
  type Rng,
} from '@creatures/game';
import {
  autoPlace,
  fillWithGuests,
  makeSlot,
  resolveGuests,
  scaleBoss,
  simulateFight,
  type AbilityChoice,
  type ActiveAdaptation,
  type FightEvent,
  type FightInput,
  type FightSlot,
  type PlayerTotals,
} from '@creatures/engine';
import type { ArchetypeId } from './archetypes';
import { pickTeam, speciesOf, TEAM_SIZE } from './data';
import type { SimPlayer } from './state';

export const STAGES: readonly RaidStage[] = ['phase1', 'phase2', 'finale'];

export interface RaidPick {
  playerId: string;
  creatureId: string;
  line: string;
  element: Element;
  level: number;
}

export interface StageSummary {
  cleared: boolean;
  rounds: number;
  /** Boss HP left after the stage. */
  hpEnd: number;
  reactions: number;
}

export interface RaidWeek {
  boss: BossDef;
  /** Signed-up players in sign-up order. */
  players: SimPlayer[];
  /** The compact row, left to right (guests included). */
  row: FightSlot[];
  bossAtk: number;
  pool: { max: number; current: number };
  adaptation: ActiveAdaptation | null;
  avgLevel: number;
  /** Each player's basic ability (round-robin over the four). Creature abilities are added at the finale. */
  abilities: AbilityChoice[];
  picks: RaidPick[];
  stages: Partial<Record<RaidStage, StageSummary>>;
  /** Contribution totals per player, summed over the stages played. */
  perPlayer: Record<string, PlayerTotals>;
  /** Contribution per creature id, summed over the stages played (guests included). */
  perCreature: Record<string, number>;
  /** Essence earned this week per player id. */
  essence: Record<string, number>;
  jackpot: { rolls: number; hits: number; guaranteed: number };
  /** Finale event log, only kept when `keepFinale` is set. */
  finaleEvents: FightEvent[] | null;
  keepFinale: boolean;
  /** Measure what the abilities add to the finale (three extra finale runs); see `AbilityImpact`. */
  measureAbilities: boolean;
  abilityImpact: AbilityImpact | null;
}

/**
 * Damage the whole row deals in one finale against a boss with a pool that cannot run out (so all
 * rounds are played), with every ability, with only the basic abilities, and with none. The
 * difference is what abilities add; `creatureAbilities` is how many creature abilities were
 * brought (level 10 or above).
 */
export interface AbilityImpact {
  all: number;
  basicOnly: number;
  none: number;
  creatureAbilities: number;
}

function emptyTotals(): PlayerTotals {
  return { damage: 0, setupCredit: 0, supportCredit: 0, guardCredit: 0, contribution: 0 };
}

function slotFor(player: SimPlayer, creatureId: string): FightSlot {
  const c = player.creatures.find((x) => x.id === creatureId);
  if (c === undefined) throw new Error(`player ${player.id} lost creature ${creatureId}`);
  return makeSlot(speciesOf(c.speciesId), {
    id: c.id,
    ownerId: player.id,
    level: c.level,
    fusionCount: c.fusionCount,
  });
}

/**
 * Opens a raid week for the signed-up players (given in sign-up order) and boss: each player brings
 * their 3 highest-power creatures, `autoPlace` builds the row in sign-up order (guards front,
 * payoffs back), guests fill it when fewer than 3 players take part, and the boss is scaled with
 * the player count and the average level. Each player's basic ability goes round-robin over the
 * four; creature abilities (level 10 or above) are added when the finale is played, from the
 * creatures' levels and species at that time. All abilities fire at their default rounds.
 */
export function openRaidWeek(
  boss: BossDef,
  players: readonly SimPlayer[],
  options: { keepFinale?: boolean; measureAbilities?: boolean } = {},
): RaidWeek {
  if (players.length === 0) throw new RangeError('a raid needs at least one player');
  const picks: RaidPick[] = [];
  const unplaced = new Map<string, FightSlot[]>();
  for (const p of players) {
    const team = pickTeam(p.creatures);
    unplaced.set(
      p.id,
      team.map((c) => {
        picks.push({
          playerId: p.id,
          creatureId: c.id,
          line: c.line,
          element: speciesOf(c.speciesId).element,
          level: c.level,
        });
        return slotFor(p, c.id);
      }),
    );
  }
  const levels = picks.map((p) => p.level);
  const avgLevel = Math.max(1, Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length));

  const length = players.length < 3 ? 9 : players.length * TEAM_SIZE;
  let sparse = autoPlace(new Array<FightSlot | null>(length).fill(null), unplaced);
  if (players.length < 3) sparse = fillWithGuests(sparse, resolveGuests(), avgLevel);
  const row = sparse.filter((s): s is FightSlot => s !== null);

  const scaled = scaleBoss(boss, players.length, avgLevel);
  const basics = basicAbilities();
  const abilities = players.map((p, i): AbilityChoice => {
    const def = basics[i % basics.length];
    if (def === undefined) throw new Error('content has no basic abilities');
    return { playerId: p.id, abilityId: def.id, key: `${p.id}:basic` };
  });
  const perPlayer: Record<string, PlayerTotals> = {};
  const essence: Record<string, number> = {};
  for (const p of players) {
    perPlayer[p.id] = emptyTotals();
    essence[p.id] = 0;
  }
  return {
    boss,
    players: [...players],
    row,
    bossAtk: scaled.atk,
    pool: { max: scaled.maxHp, current: scaled.maxHp },
    adaptation: null,
    avgLevel,
    abilities,
    picks,
    stages: {},
    perPlayer,
    perCreature: {},
    essence,
    jackpot: { rolls: 0, hits: 0, guaranteed: 0 },
    finaleEvents: null,
    keepFinale: options.keepFinale === true,
    measureAbilities: options.measureAbilities === true,
    abilityImpact: null,
  };
}

/**
 * The fight input of a stage with the creatures' current stats (training between phases changes
 * them, so the row is rebuilt from the players' creatures). In the finale it carries the basic
 * abilities and `creatureAbilities`, the creature abilities brought.
 */
export function fightFor(
  week: RaidWeek,
  stage: RaidStage,
): { fight: FightInput; creatureAbilities: AbilityChoice[] } {
  const byId = new Map(week.players.map((p) => [p.id, p]));
  const row = week.row.map((s) => {
    const owner = s.ownerId === null ? undefined : byId.get(s.ownerId);
    return owner === undefined ? s : slotFor(owner, s.id);
  });
  const creatureAbilities = stage === 'finale' ? creatureAbilityChoices(week, row) : [];
  const fight: FightInput = {
    boss: week.boss,
    bossAtk: week.bossAtk,
    phase: stage,
    bossHpPool: { max: week.pool.max, current: week.pool.current },
    adaptation: stage === 'phase1' ? null : week.adaptation,
    row,
    players: week.players.map((p) => p.id),
    finaleAbilities: stage === 'finale' ? [...week.abilities, ...creatureAbilities] : [],
  };
  return { fight, creatureAbilities };
}

/**
 * Plays one stage: runs the fight with the creatures' current stats, carries the boss HP pool,
 * sets the Phase 2 adaptation after Phase 1, pays Essence for a cleared stage and, after the
 * finale, rolls jackpots (on a win) and advances every player's pity counter.
 */
export function playStage(week: RaidWeek, stage: RaidStage, fightRng: Rng, lootRng: Rng): void {
  const ids = week.players.map((p) => p.id);
  const { fight, creatureAbilities } = fightFor(week, stage);
  const result = simulateFight(fight, fightRng);
  if (stage === 'finale' && week.measureAbilities) {
    week.abilityImpact = measureAbilities(week, fight, creatureAbilities.length);
  }
  week.pool.current = result.bossHpEnd;
  week.stages[stage] = {
    cleared: result.cleared,
    rounds: result.rounds,
    hpEnd: result.bossHpEnd,
    reactions: result.reactions.total,
  };
  if (stage === 'phase1') {
    const s = result.adaptationSuggestion;
    week.adaptation = s !== null && s.target !== null ? { rule: s.rule, target: s.target } : null;
  }
  if (stage === 'finale' && week.keepFinale) week.finaleEvents = result.events;

  const contribution: Record<string, number> = {};
  for (const id of ids) {
    const t = result.perPlayer[id];
    const into = week.perPlayer[id];
    if (t === undefined || into === undefined) continue;
    contribution[id] = t.contribution;
    into.damage += t.damage;
    into.setupCredit += t.setupCredit;
    into.supportCredit += t.supportCredit;
    into.guardCredit += t.guardCredit;
    into.contribution += t.contribution;
  }
  for (const [id, t] of Object.entries(result.perCreature)) {
    week.perCreature[id] = (week.perCreature[id] ?? 0) + t.contribution;
  }

  if (result.cleared) {
    const paid = essenceForStage(stage, ids, contributionWeights(contribution));
    for (const p of week.players) {
      const amount = paid[p.id] ?? 0;
      p.essence += amount;
      p.week.essenceEarned += amount;
      week.essence[p.id] = (week.essence[p.id] ?? 0) + amount;
    }
  }

  if (stage === 'finale') {
    for (const p of week.players) {
      p.raids += 1;
      // Pity counts finale wins only: a lost finale rolls nothing and leaves the counter alone.
      if (result.cleared) {
        week.jackpot.rolls += 1;
        const guaranteed = jackpotChanceBp(p.pity) >= 10_000;
        const roll = rollJackpot(lootRng, p.pity);
        if (roll.hit) {
          p.jackpots += 1;
          week.jackpot.hits += 1;
          if (guaranteed) week.jackpot.guaranteed += 1;
        }
        p.pity = roll.newCounter;
      }
      p.maxPity = Math.max(p.maxPity, p.pity);
    }
  }
}

/**
 * The creature abilities of every team in the finale: each team creature at level 10 or above
 * (`abilitiesFor`), from the creatures' current species and level (they may have trained or evolved
 * since the week opened). Fired at their default rounds.
 */
function creatureAbilityChoices(week: RaidWeek, row: readonly FightSlot[]): AbilityChoice[] {
  const out: AbilityChoice[] = [];
  for (const p of week.players) {
    const team = row
      .filter((s) => s.ownerId === p.id)
      .map((s) => ({ id: s.id, speciesId: s.speciesId, level: s.level }));
    for (const a of abilitiesFor(team, (c) => c.level)) {
      out.push({
        playerId: p.id,
        abilityId: a.abilityId,
        key: `${a.creatureId}:ability`,
        creatureId: a.creatureId,
      });
    }
  }
  return out;
}

/** Total damage of the hit events of a fight. */
function damageDealt(events: readonly FightEvent[]): number {
  let total = 0;
  for (const e of events) if (e.t === 'hit') total += e.damage;
  return total;
}

/** See `AbilityImpact`: replays the finale three times against a boss that cannot fall. */
function measureAbilities(
  week: RaidWeek,
  fight: FightInput,
  creatureAbilities: number,
): AbilityImpact {
  const unbeatable = { max: 1_000_000_000_000, current: 1_000_000_000_000 };
  const basicKeys = new Set(week.abilities.map((a) => a.key));
  const run = (abilities: readonly AbilityChoice[]): number =>
    damageDealt(
      simulateFight(
        { ...fight, bossHpPool: unbeatable, finaleAbilities: abilities },
        // The fights draw no randomness; this stream is never read.
        createSeededRng('ability-impact'),
      ).events,
    );
  return {
    all: run(fight.finaleAbilities),
    basicOnly: run(fight.finaleAbilities.filter((a) => basicKeys.has(a.key))),
    none: run([]),
    creatureAbilities,
  };
}

/** Plays all three stages back to back (used by the raid sweep). */
export function playWholeWeek(week: RaidWeek, fightRng: Rng, lootRng: Rng): void {
  for (const stage of STAGES) playStage(week, stage, fightRng, lootRng);
}

export interface PlayerRaidResult {
  archetype: ArchetypeId;
  damage: number;
  setupCredit: number;
  contribution: number;
  essence: number;
}

/** Compact outcome of a raid week (no event logs). */
export interface RaidSummary {
  boss: string;
  signedUp: number;
  avgLevel: number;
  bossMaxHp: number;
  phase1Cleared: boolean;
  phase2Cleared: boolean;
  finaleWon: boolean;
  /** Share of the boss pool lost after each stage, 0 to 1. */
  lossAfter: { phase1: number; phase2: number; finale: number };
  rounds: number;
  reactions: number;
  players: Record<string, PlayerRaidResult>;
  jackpot: { rolls: number; hits: number; guaranteed: number };
}

export function summarizeRaid(week: RaidWeek): RaidSummary {
  const max = week.pool.max;
  const stage = (s: RaidStage): StageSummary | undefined => week.stages[s];
  const loss = (s: RaidStage): number => {
    const st = stage(s);
    return st === undefined ? 0 : (max - st.hpEnd) / max;
  };
  const players: Record<string, PlayerRaidResult> = {};
  for (const p of week.players) {
    const t = week.perPlayer[p.id] ?? emptyTotals();
    players[p.id] = {
      archetype: p.archetype,
      damage: t.damage,
      setupCredit: t.setupCredit,
      contribution: t.contribution,
      essence: week.essence[p.id] ?? 0,
    };
  }
  let rounds = 0;
  let reactions = 0;
  for (const s of STAGES) {
    rounds += stage(s)?.rounds ?? 0;
    reactions += stage(s)?.reactions ?? 0;
  }
  return {
    boss: week.boss.id,
    signedUp: week.players.length,
    avgLevel: week.avgLevel,
    bossMaxHp: max,
    phase1Cleared: stage('phase1')?.cleared === true,
    phase2Cleared: stage('phase2')?.cleared === true,
    finaleWon: stage('finale')?.cleared === true,
    lossAfter: { phase1: loss('phase1'), phase2: loss('phase2'), finale: loss('finale') },
    rounds,
    reactions,
    players,
    jackpot: { ...week.jackpot },
  };
}
