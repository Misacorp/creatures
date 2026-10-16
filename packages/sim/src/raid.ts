import {
  abilitiesFor,
  basicAbilities,
  bossAtRank,
  bossAttacksAtRank,
  content,
  contributionWeights,
  essenceForStage,
  jackpotChanceBp,
  jackpotEssenceFor,
  luckAtRank,
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
import { arrangeRow, arrangeRowPartial, type Setup } from './formations';
import { sweepRank } from './sweep-rank';
import { neutralSupport, studyRules, type RoleStudy } from './role-study';
import {
  activeTalentsOf,
  byPowerDesc,
  foldedCreature,
  pickTeam,
  speciesOf,
  TEAM_SIZE,
  type OwnedCreature,
} from './data';
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
  /** Boss HP the pool had when the stage began, and left after it. */
  hpStart: number;
  hpEnd: number;
  reactions: number;
  /** The boss retreated at the phase floor (a phase) and enrage rounds were played (the finale). */
  retreated: boolean;
  enraged: boolean;
  /** Creatures in the row and how many of them were knocked out during the stage. */
  creatures: number;
  knockedOut: number;
  /** The ids of the creatures knocked out during the stage. */
  knockedOutIds: string[];
  /** Barrage volleys of the stage, and those that hit a creature the gimmick's previous volley hit. */
  volleys: number;
  /** Volleys that broke the no-repeat rule, and those that repeated a victim because too few others stood. */
  repeatVolleys: number;
  forcedRepeatVolleys: number;
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

/**
 * Barrage volleys in an event log, and how many of them hit a creature that the same gimmick's
 * previous volley had hit. The fairness rule (docs/design/attack-patterns.md 4.5) is "never the same
 * creature in two volleys running unless fewer creatures than the volley's size are left that the
 * previous volley did not hit": a repeat that the rule allows is `forced`, any other is a `repeat`
 * and means the rule is broken (it should be zero). A plain barrage is a `gimmick` event with the
 * `barrage` op; a charged one is the `charge` event of its announcement (its marks are the volley,
 * picked then). Picks are compared, not the creatures finally hit, because the rule is about
 * picking. `rowSize` is the number of creatures in the fight; knock-outs are read from the log.
 */
export function volleyRepeats(
  events: readonly FightEvent[],
  rowSize: number,
): { volleys: number; repeats: number; forced: number } {
  const last = new Map<string, readonly string[]>();
  const down = new Set<string>();
  let volleys = 0;
  let repeats = 0;
  let forced = 0;
  for (const e of events) {
    if (e.t === 'knockout') {
      down.add(e.creature);
      continue;
    }
    let id: string;
    let picks: readonly string[];
    if (e.t === 'gimmick' && e.op === 'barrage' && e.targets !== undefined) {
      id = e.gimmick;
      picks = e.targets;
    } else if (e.t === 'charge' && e.op === 'barrage') {
      id = e.gimmick;
      picks = e.marks;
    } else {
      continue;
    }
    volleys += 1;
    const before = last.get(id);
    if (before !== undefined && picks.some((c) => before.includes(c))) {
      // Creatures standing now that the previous volley did not hit.
      const others = rowSize - down.size - before.filter((c) => !down.has(c)).length;
      if (others >= picks.length) repeats += 1;
      else forced += 1;
    }
    last.set(id, picks);
  }
  return { volleys, repeats, forced };
}

/**
 * Study: moves the Guards of a row to evenly spaced places (Guard k of g stands at the middle of the
 * k-th g-th of the row), keeping every other creature in its order. The attack-pattern study found
 * a spread formation worth about 12 win points over `autoPlace`'s clumped front slots, and it is the
 * formation in which a Guard's cover and intercept can be seen.
 */
export function spreadGuards(row: readonly FightSlot[]): FightSlot[] {
  const guards = row.filter((s) => s.role === 'guard');
  if (guards.length === 0 || guards.length === row.length) return [...row];
  const rest = row.filter((s) => s.role !== 'guard');
  const out: (FightSlot | undefined)[] = new Array<FightSlot | undefined>(row.length).fill(
    undefined,
  );
  for (const [k, g] of guards.entries()) {
    out[Math.floor(((2 * k + 1) * row.length) / (2 * guards.length))] = g;
  }
  let next = 0;
  return out.map((slot) => slot ?? (rest[next++] as FightSlot));
}

/**
 * Study: the creatures a player brings when every player brings a Guard and a Support if they own
 * one (the attack-pattern study's "both" population): the 3 strongest, with the weakest of them
 * swapped for the best Guard, then the best Support, when the team has none.
 */
export function pickRoleTeam(creatures: readonly OwnedCreature[]): OwnedCreature[] {
  const team = pickTeam(creatures);
  const ranked = byPowerDesc(creatures);
  const roleOf = (c: OwnedCreature): string => speciesOf(c.speciesId).role;
  for (const role of ['guard', 'support']) {
    if (team.some((c) => roleOf(c) === role)) continue;
    const best = ranked.find((c) => roleOf(c) === role);
    if (best === undefined) continue;
    // The team is strongest first: swap out the weakest creature that is neither a Guard nor a Support.
    for (let i = team.length - 1; i >= 0; i--) {
      const t = team[i];
      if (t !== undefined && roleOf(t) !== 'guard' && roleOf(t) !== 'support') {
        team[i] = best;
        break;
      }
    }
  }
  return team;
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
 * only difference is a bonus on reactions, so it loses the extra HP, the armor, the interception
 * (of aimed hits and of reflects) and the cover. The engine keys all of these on the `guard` role,
 * so this one switch turns them all off.
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
  return slotOfCreature(c, player.id);
}

/** The fight slot of an owned creature: its stats with the worn items folded in, and its sheet. */
export function slotOfCreature(c: OwnedCreature, ownerId: string): FightSlot {
  const slot = makeSlot(speciesOf(c.speciesId), {
    id: c.id,
    ownerId,
    level: c.level,
    fusionCount: c.fusionCount,
  });
  if (c.items === undefined && activeTalentsOf(c).length === 0) {
    if (c.mods !== undefined) slot.mods = c.mods;
    return slot;
  }
  // Gear and talents fold into the stats, the crit bonus and the modifier sheet, as the worker's `slotFor` does
  // (apps/worker/src/raid-resolve.ts): both come from the one pure fold in `@creatures/game`.
  const folded = foldedCreature(c);
  const withGear: FightSlot = { ...slot, stats: folded.stats };
  if (folded.crit === undefined) delete withGear.crit;
  else withGear.crit = folded.crit;
  const mods = c.mods ?? folded.mods;
  if (mods !== undefined) withGear.mods = mods;
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
     * these creatures (`sweepRank`), which is what the raid sweep calibrates the bosses at.
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
    /** Study: guards lose the guard role (no extra HP, armor, intercepting or cover) and fight as plain payoffs. */
    neutralGuards?: boolean;
    /** Study: Supports lose the Support role and fight as plain payoffs (no buff, no effect). */
    neutralSupports?: boolean;
    /** Study: per-element override of the Support effects (`RoleStudy.supportFx`). */
    supportFx?: RoleStudy['supportFx'];
    /**
     * Study: `spread` puts the Guards at evenly spaced places (`spreadGuards`); `auto` is `autoPlace`'s row;
     * `greedy` and `protected` are the setup study's arrangements (`formations.ts`).
     */
    formation?: 'auto' | 'spread' | Setup;
    /**
     * Players who arrange their own places (the journey profiles' raid row): each group's creatures are
     * rearranged among the places the group stands in, for the group's setup, in the order given;
     * everybody else keeps the `autoPlace` row. Used when `formation` is absent.
     */
    arranged?: readonly { setup: Setup; playerIds: ReadonlySet<string> }[];
    /** Study: every player brings a Guard and a Support when they own one (`pickRoleTeam`). */
    bringRoles?: boolean;
  } = {},
): RaidWeek {
  if (players.length === 0) throw new RangeError('a raid needs at least one player');
  const picks: RaidPick[] = [];
  const unplaced = new Map<string, FightSlot[]>();
  for (const p of players) {
    const team = options.bringRoles === true ? pickRoleTeam(p.creatures) : pickTeam(p.creatures);
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
  const compact = sparse.filter((s): s is FightSlot => s !== null);
  let row =
    options.formation === 'spread'
      ? spreadGuards(compact)
      : options.formation === 'greedy' || options.formation === 'protected'
        ? arrangeRow(compact, options.formation, boss.turnOrder)
        : compact;
  if (options.formation === undefined || options.formation === 'auto') {
    for (const group of options.arranged ?? []) {
      row = arrangeRowPartial(
        row,
        (slot) => slot.ownerId !== null && group.playerIds.has(slot.ownerId),
        group.setup,
        boss.turnOrder,
      );
    }
  }

  const rank = options.rank ?? sweepRank(levels);
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
    boss: bossAtRank(boss, rank),
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
  const bossAttacks = bossAttacksAtRank(week.rank);
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
    // As live play builds it: the curve's boss attacks and boss crit bonus for the rank.
    ...(bossAttacks > 1 ? { bossAttacks } : {}),
    ...(week.luck === undefined || !week.luckStages.includes(stage)
      ? {}
      : { luck: luckAtRank(week.luck, week.rank) }),
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
  const hpStart = week.pool.current;
  week.pool.current = result.bossHpEnd;
  const volleys = volleyRepeats(result.events, fight.row.length);
  week.stages[stage] = {
    cleared: result.cleared,
    rounds: result.rounds,
    hpStart,
    hpEnd: result.bossHpEnd,
    reactions: result.reactions.total,
    retreated: result.retreated,
    enraged: result.enraged,
    creatures: fight.row.length,
    knockedOut: Object.values(result.perCreature).filter((c) => c.knockedOutRound !== null).length,
    knockedOutIds: Object.entries(result.perCreature)
      .filter(([, c]) => c.knockedOutRound !== null)
      .map(([id]) => id),
    volleys: volleys.volleys,
    repeatVolleys: volleys.repeats,
    forcedRepeatVolleys: volleys.forced,
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
          // The worker credits the jackpot's Essence (`RULES.raid.jackpotEssence` x the rank multiplier).
          const bonus = jackpotEssenceFor(week.reward);
          p.essence += bonus;
          p.week.essenceEarned += bonus;
          week.essence[p.id] = (week.essence[p.id] ?? 0) + bonus;
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
  /** The finale as played: what the boss pool had left when it began (share of the maximum), and so on. */
  finale: {
    startShare: number;
    /** Rounds the finale lasted (the boss's `finaleRounds` plus any enrage rounds). */
    rounds: number;
    creatures: number;
    knockedOut: number;
    enraged: boolean;
    /** Barrage volleys of the whole week, and those that repeated a victim of the previous one. */
    volleys: number;
    repeatVolleys: number;
    forcedRepeatVolleys: number;
  };
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
    finale: {
      startShare: max === 0 ? 0 : (stage('finale')?.hpStart ?? max) / max,
      rounds: stage('finale')?.rounds ?? 0,
      creatures: stage('finale')?.creatures ?? 0,
      knockedOut: stage('finale')?.knockedOut ?? 0,
      enraged: stage('finale')?.enraged === true,
      volleys: STAGES.reduce((n, st) => n + (stage(st)?.volleys ?? 0), 0),
      repeatVolleys: STAGES.reduce((n, st) => n + (stage(st)?.repeatVolleys ?? 0), 0),
      forcedRepeatVolleys: STAGES.reduce((n, st) => n + (stage(st)?.forcedRepeatVolleys ?? 0), 0),
    },
    players,
    jackpot: { ...week.jackpot },
  };
}
