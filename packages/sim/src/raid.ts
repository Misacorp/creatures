import {
  abilitiesFor,
  basicAbilities,
  content,
  contributionWeights,
  essenceForStage,
  jackpotChanceBp,
  placementRank,
  rollJackpot,
  type BossDef,
  createSeededRng,
  type Element,
  type LuckConfig,
  type RaidStage,
  type Rng,
} from '@creatures/game';
import {
  autoPlace,
  fillWithGuests,
  makeSlot,
  phaseFloorHp,
  raidEnrage,
  resolveGuests,
  scaleBoss,
  simulateFight,
  type AbilityChoice,
  type ActiveAdaptation,
  type FightEvent,
  type FightInput,
  type FightRules,
  type FightSlot,
  type PlayerTotals,
} from '@creatures/engine';
import type { ArchetypeId } from './archetypes';
import { neutralSupport, studyRules, type RoleStudy } from './role-study';
import { foldedCreature, pickTeam, speciesOf, TEAM_SIZE } from './data';
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
  /** The rank the boss fights at (the eased rank in a Festival week). */
  rank: number;
  /** What this week's payouts scale with: the server's rank and whether it is a Festival week. */
  reward: { rank: number; festival: boolean };
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
  /** Luck settings for every fight of the week; absent: the shipped rules (all off). */
  luck: LuckConfig | undefined;
  /** The stages that roll luck (all three unless limited). */
  luckStages: readonly RaidStage[];
  /** Finale ability timings that replace the default rounds, by ability key (the luck study). */
  timings: Readonly<Record<string, number>>;
  /** Measure what the abilities add to the finale (three extra finale runs); see `AbilityImpact`. */
  measureAbilities: boolean;
  abilityImpact: AbilityImpact | null;
  /** Study switches (docs/design/luck.md): see `openRaidWeek`. */
  dropShield: boolean;
  neutralGuards: boolean;
  /** Study: Supports lose the Support role (`RoleStudy`). */
  neutralSupports: boolean;
  /** The combat rules of every fight of the week: the live rules, less any study override. */
  rules: FightRules;
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

/** True if a finale ability has a Shield Wall effect. */
export function hasShieldWall(abilityId: string): boolean {
  return (
    content.finaleAbilities
      .find((a) => a.id === abilityId)
      ?.effects.some((e) => e.op === 'shield_wall') === true
  );
}

/**
 * The slot of a guard with the guard role taken away (study): it fights as a plain payoff, whose
 * only difference is a bonus on reactions, so it loses the extra HP and the interception.
 */
export function neutralGuard(slot: FightSlot): FightSlot {
  return { ...slot, role: 'payoff' };
}

function emptyTotals(): PlayerTotals {
  return { damage: 0, setupCredit: 0, supportCredit: 0, guardCredit: 0, contribution: 0 };
}

export function slotFor(player: SimPlayer, creatureId: string): FightSlot {
  const c = player.creatures.find((x) => x.id === creatureId);
  if (c === undefined) throw new Error(`player ${player.id} lost creature ${creatureId}`);
  const slot = makeSlot(speciesOf(c.speciesId), {
    id: c.id,
    ownerId: player.id,
    level: c.level,
    fusionCount: c.fusionCount,
  });
  if (c.item === undefined || c.item === null) return slot;
  // Gear folds into the stats and the crit bonus, as the worker's `slotFor` does (apps/worker/src/raid-resolve.ts).
  const folded = foldedCreature(c);
  const withGear: FightSlot = { ...slot, stats: folded.stats };
  if (folded.crit === undefined) delete withGear.crit;
  else withGear.crit = folded.crit;
  return withGear;
}

/**
 * Opens a raid week for the signed-up players (given in sign-up order) and boss: each player brings
 * their 3 highest-power creatures, `autoPlace` builds the row in sign-up order (guards front,
 * payoffs back), guests fill it when fewer than 3 players take part, and the boss is scaled with
 * the player count and a rank (given, or the old rule's equivalent for these creatures). Each player's basic ability goes round-robin over the
 * four; creature abilities (level 10 or above) are added when the finale is played, from the
 * creatures' levels and species at that time. All abilities fire at their default rounds.
 */
export function openRaidWeek(
  boss: BossDef,
  players: readonly SimPlayer[],
  options: {
    keepFinale?: boolean;
    measureAbilities?: boolean;
    /**
     * Boss Rank the boss fights at. Absent: the rank the old per-level rule would have chosen for
     * these creatures (`placementRank`), which is what the raid sweep calibrates the bosses at.
     */
    rank?: number;
    /** The server's rank and Festival flag for payouts. Absent: the same rank, no Festival. */
    reward?: { rank: number; festival: boolean };
    luck?: LuckConfig;
    luckStages?: readonly RaidStage[];
    timings?: Readonly<Record<string, number>>;
    /** Study: boss Attack in basis points of the shipped value (10000: shipped), for every stage. */
    bossAtkBp?: number;
    /** Study: boss HP pool in basis points of the shipped value (10000: shipped). */
    hpScaleBp?: number;
    /** Study: no Shield Wall effect anywhere (abilities with that effect are left out). */
    dropShield?: boolean;
    /** Study: guards lose the guard role (no extra HP, no intercepting) and fight as plain payoffs. */
    neutralGuards?: boolean;
    /** Study: Supports lose the Support role and fight as plain payoffs (no buff, no effect). */
    neutralSupports?: boolean;
    /** Study: per-element override of the Support effects (`RoleStudy.supportFx`). */
    supportFx?: RoleStudy['supportFx'];
  } = {},
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

  const rank = options.rank ?? placementRank(levels);
  const shipped = scaleBoss(boss, players.length, rank);
  const scaled = {
    atk: Math.max(1, Math.floor((shipped.atk * (options.bossAtkBp ?? 10_000)) / 10_000)),
    maxHp: Math.max(1, Math.floor((shipped.maxHp * (options.hpScaleBp ?? 10_000)) / 10_000)),
  };
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
    rank,
    reward: options.reward ?? { rank, festival: false },
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
    luck: options.luck,
    luckStages: options.luckStages ?? STAGES,
    timings: options.timings ?? {},
    measureAbilities: options.measureAbilities === true,
    abilityImpact: null,
    dropShield: options.dropShield === true,
    neutralGuards: options.neutralGuards === true,
    neutralSupports: options.neutralSupports === true,
    rules: studyRules(options.supportFx === undefined ? {} : { supportFx: options.supportFx }),
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
    const slot = owner === undefined ? s : slotFor(owner, s.id);
    if (week.neutralGuards && slot.role === 'guard') return neutralGuard(slot);
    if (week.neutralSupports && slot.role === 'support') return neutralSupport(slot);
    return slot;
  });
  const creatureAbilities = stage === 'finale' ? creatureAbilityChoices(week, row) : [];
  const floor = phaseFloorHp(week.pool.max, stage);
  const enrage = raidEnrage(stage);
  const fight: FightInput = {
    boss: week.boss,
    bossAtk: week.bossAtk,
    phase: stage,
    bossHpPool: { max: week.pool.max, current: week.pool.current },
    adaptation: stage === 'phase1' ? null : week.adaptation,
    row,
    players: week.players.map((p) => p.id),
    finaleAbilities:
      stage === 'finale'
        ? [...week.abilities, ...creatureAbilities]
            .filter((a) => !week.dropShield || !hasShieldWall(a.abilityId))
            .map((a) => {
              const at = week.timings[a.key];
              return at === undefined ? a : { ...a, fireAtRound: at };
            })
        : [],
    ...(week.luck === undefined || !week.luckStages.includes(stage) ? {} : { luck: week.luck }),
    rules: week.rules,
    // As live play builds it: a phase's floor (a boss that reaches it retreats), the finale's enrage.
    ...(floor > 0 ? { bossHpFloor: floor } : {}),
    ...(enrage === undefined ? {} : { enrage }),
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
    const paid = essenceForStage(stage, ids, contributionWeights(contribution), week.reward);
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
  // Against a boss that cannot fall the base rounds are what is measured: no floor, no enrage.
  const plain: FightInput = { ...fight };
  delete plain.enrage;
  delete plain.bossHpFloor;
  const run = (abilities: readonly AbilityChoice[]): number =>
    damageDealt(
      simulateFight(
        { ...plain, bossHpPool: unbeatable, finaleAbilities: abilities },
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
  /** The rank the boss fought at, and whether it was a Festival week. */
  rank: number;
  festival: boolean;
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
    rank: week.rank,
    festival: week.reward.festival,
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
