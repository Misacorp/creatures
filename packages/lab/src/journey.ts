/**
 * The journey on the game's raid rules (phase 5, `docs/design/combat/balance.md` section 2, items 1 and 2).
 *
 * The path simulator (`path.ts`) used to play its weekend with the lab's own rules: one column of creatures a player, a shared bench
 * that any owner's knocked-out creature draws from, and a boss sized by the server's columns. This module plays the weekend the way the
 * worker plays it, with the engine's `stageV2` and its carry:
 *
 * - **Seats.** A player brings as many creatures as their arena piece has seats (`piece.rows` in raid-bosses.json: the Storm Sovereign's
 *   is 2, the Cinder Wyrm's 4), one piece (a column) each.
 * - **The lock.** The party is the players at stage 1, and the weekend's HP and the board's width are set from them once (`partyBoss`);
 *   nobody joins or leaves after.
 * - **Spares.** Between stages each player replaces their own knocked-out creatures from their own spares: their next-strongest creatures
 *   by the roster profile (the ranks after the seats), each used once, never one that is out. No shared bench.
 * - **Locked once fought.** A creature keeps the Knack and talents it fought with (nothing is re-picked between stages).
 *
 * Real party sizes: servers of 5, 8 and 15 players (the valley's coverage servers, `mixed5` `mixed8` `mixed15`) and a party of one to
 * three. **Known gap:** the engine's `trackBoss` fights a party under four at four columns (guests fill the rest); a smaller boss for small
 * parties is another agent's change (Misa, 2026-11-04). `partyBoss` is the one seam: it takes the engine's boss for the party once that
 * lands, and the small-party results are only as good as that (the report prints them, nothing asserts them).
 *
 * `journeyOf` walks a server week by week with this weekend (`walkPath`), `planJourney` runs many seeded servers on the job pool and
 * lays the lab's rules beside the game's.
 */
import { createSeededRng } from '@creatures/game';
import { combatV2 } from '@creatures/game/combat-v2';
import {
  stageV2,
  startCarry,
  wideBoss,
  type FighterSpec,
  type FightResult,
  type StageCarry,
  type StageInputV2,
} from '@creatures/engine/v2';
import { raidBench } from './bosses';
import { world, resolvePlacement } from './fight';
import type { JobResults, JobSpec, Plan } from './jobs';
import {
  BUILDERS,
  DEDICATED,
  FESTIVAL_EVERY,
  MIXED,
  STUCK_SHARE_MAX,
  STUCK_WEEKS,
  determinationOf,
  pathOf,
  playerColumns,
  summarisePath,
  walkPath,
  weekendKill,
  type PathPlayer,
  type PathRun,
  type PathSummary,
  type ServerPath,
} from './path';
import { MIXED_ORDERS, type PlayerKind } from './raidMeasure';
import { ROSTER_SPEEDS, type RosterProfile, type RosterSpeed } from './roster';
import { MIXED_KILL_MIN } from './targets';
import { SLOT_WEEKS, slotBoss, trackSlot } from './track';
import type { BossDef, Placement } from './types';
import { VALLEY_ROSTER } from './valley';

// ---------- the servers ----------

/** A server of the journey: a name and its players (a new player says the week they join). */
export interface JourneyServer {
  readonly id: string;
  readonly players: readonly PathPlayer[];
}

/** The week a server's new player joins (a caught-up player of the valley's `newPlayer` profile). */
export const NEW_PLAYER_JOIN_WEEK = 4;

/**
 * A mixed server of the valley's coverage (5, 8 or 15 players): the min-maxers and builders are daily players, the casual players weekly
 * ones, and the last casual player is a new player who joins in week `NEW_PLAYER_JOIN_WEEK` (so a server's first weeks are one player
 * short). The kinds of player follow `MIXED_ORDERS` (a fifth min-maxers, three tenths builders, half casual); 8 players is the same
 * mix at that size.
 */
export function coverageServer(players: 5 | 8 | 15): JourneyServer {
  const order: readonly PlayerKind[] = MIXED_ORDERS_JOURNEY[players];
  const lastCasual = order.lastIndexOf('c');
  return {
    id: `mixed${players}`,
    players: order.map((k, i): PathPlayer => {
      if (k === 'm') return { role: 'prepared', roster: 'daily' };
      if (k === 'b') return { role: 'builder', roster: 'daily' };
      return i === lastCasual
        ? { role: 'casual', roster: 'new', joinWeek: NEW_PLAYER_JOIN_WEEK }
        : { role: 'casual', roster: 'weekly' };
    }),
  };
}

const MIXED_ORDERS_JOURNEY: Readonly<Record<5 | 8 | 15, readonly PlayerKind[]>> = {
  5: MIXED_ORDERS[5] as readonly PlayerKind[],
  8: ['m', 'c', 'b', 'c', 'm', 'c', 'b', 'c'],
  15: MIXED_ORDERS[15] as readonly PlayerKind[],
};

/** A small party: one to three daily players, each on the slot's prepared line (the tool's columns first). */
export const smallParty = (players: 1 | 2 | 3): JourneyServer => ({
  id: `small${players}`,
  players: Array.from({ length: players }, () => ({ role: 'prepared', roster: 'daily' }) as const),
});

export const JOURNEY_SERVERS: readonly JourneyServer[] = [
  DEDICATED,
  MIXED,
  BUILDERS,
  coverageServer(5),
  coverageServer(8),
  coverageServer(15),
  smallParty(1),
  smallParty(2),
  smallParty(3),
];

/** The players who are there in `week` (a new player is not before their join week). */
export const presentIn = (server: JourneyServer, week: number): JourneyServer => ({
  id: server.id,
  players: server.players.filter((p) => p.joinWeek === undefined || week >= p.joinWeek),
});

// ---------- the weekend ----------

/** The seats of one player's piece at a slot: what the boss's arena piece holds (`piece.rows`). */
export function seatsOf(slot: number): number {
  const bossId = trackSlot(slot).bossId;
  const own = Object.hasOwn(combatV2.raidBosses, bossId) ? combatV2.raidBosses[bossId] : undefined;
  if (!own) throw new Error(`unknown raid boss ${bossId}`);
  return own.piece.rows;
}

/**
 * The boss a party of `players` fights, the weekend HP set at stage 1 (R14.1): the slot's four-player boss, widened with the players over
 * four (the engine's `wideBoss`, what `trackBoss` does). **Known gap:** a party under four fights at four columns, as the engine's
 * `trackBoss` does today; Misa's smaller boss for small parties (2026-11-04) lands there, and this function then calls it.
 */
export const partyBoss = (base: BossDef, players: number): BossDef =>
  players <= base.cols ? base : wideBoss(base, players);

/** One player's creatures in a weekend. */
export interface JourneyPlayer {
  readonly owner: string;
  /** The seats' creatures, front to back, in the player's column. */
  readonly team: Placement[];
  /** The next-strongest creatures, in the order they step in. */
  readonly spares: Placement[];
}

export interface JourneyWeekend {
  readonly boss: BossDef;
  /** The players at stage 1: they set the weekend's HP. */
  readonly party: number;
  readonly seats: number;
  readonly players: JourneyPlayer[];
}

/** A key of a creature in the carry: its owner and its seat (a spare: its number). */
const seatKey = (owner: string, row: number): string => `${owner}:seat${row}`;
const spareKey = (owner: string, j: number): string => `${owner}:spare${j}`;

/**
 * The weekend a server plays in `week` at `slot`: the party at stage 1, the boss its size sets, and each player's seats and spares at their
 * roster's levels. A player brings `seats` creatures (`seatsOf`) and has the next ranks of their roster as spares (a smaller roster, fewer).
 */
export function journeyWeekend(
  server: JourneyServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
): JourneyWeekend {
  const base = slotBoss(slot, run.table ? { table: run.table } : {});
  const seats = seatsOf(slot);
  const present = presentIn(server, week);
  const party = present.players.length;
  const boss = partyBoss(base, party);
  const players = playerColumns(present, base, slot, week, speed, seed, profile, run, seats).map(
    ({ column, levels }, c): JourneyPlayer => {
      const owner = `p${c + 1}`;
      const team = column.slice(0, seats).map((pick, r): Placement => ({
        owner,
        formId: pick.formId,
        level: pick.level ?? 1,
        knack: pick.knack,
        ...(pick.talents ? { talents: pick.talents } : {}),
        row: r,
        col: c,
      }));
      // The spares are the ranks after the seats; the profile's roster size limits how many there are.
      const spares = levels
        .slice(seats)
        .flatMap((level) => raidBench(1, level).map((x): Placement => ({ ...x, owner })));
      return { owner, team, spares };
    },
  );
  return { boss, party, seats, players };
}

/** What a played weekend says. */
export interface JourneyResult {
  readonly won: boolean;
  readonly stages: readonly FightResult[];
  /** Knocked-out creatures that a spare replaced between stages. */
  readonly replacements: number;
  /** The share of the boss's HP removed over the weekend, 0 to 1. */
  readonly share: number;
}

const STAGES = 3;

/**
 * Plays a weekend with `stageV2` and its carry, as the worker does: stage by stage, the party fixed at stage 1, each knocked-out creature
 * replaced by its owner's next spare before the next stage. Nothing about a creature's Knack or talents changes after it has fought.
 */
export function playJourneyWeekend(
  w: JourneyWeekend,
  salt: string,
  determinationBp = 0,
): JourneyResult {
  const rng = createSeededRng(`weekend:${salt}:0`);
  const next = new Map<string, number>(w.players.map((p) => [p.owner, 0]));
  const spec = (p: Placement, key: string): FighterSpec => ({
    ...resolvePlacement(p),
    uid: key,
    key,
  });
  let current: { key: string; p: Placement }[] = w.players.flatMap((pl) =>
    pl.team.map((p) => ({ key: seatKey(pl.owner, p.row), p })),
  );
  let carry: StageCarry = startCarry(w.boss);
  const stages: FightResult[] = [];
  let replacements = 0;
  while (carry.stage < STAGES && carry.bossHp > 0) {
    const input: StageInputV2 = {
      ...world,
      boss: w.boss,
      fighters: current.map((c) => spec(c.p, c.key)),
      options: determinationBp > 0 ? { determinationBp } : {},
    };
    const played = stageV2(input, carry, rng);
    carry = played.carry;
    stages.push(played.result);
    if (carry.bossHp <= 0) break;
    const out = new Set(carry.out);
    current = current.flatMap((c) => {
      if (!out.has(c.key)) return [c];
      const pl = w.players.find((x) => x.owner === c.p.owner);
      const j = next.get(c.p.owner) ?? 0;
      const spare = pl?.spares[j];
      if (!spare) return [];
      next.set(c.p.owner, j + 1);
      replacements++;
      return [{ key: spareKey(c.p.owner, j), p: { ...spare, row: c.p.row, col: c.p.col } }];
    });
  }
  return {
    won: carry.bossHp <= 0,
    stages,
    replacements,
    share: Math.max(0, Math.min(1, 1 - Math.max(0, carry.bossHp) / w.boss.hp)),
  };
}

/** Whether the server killed the boss of `slot` in one weekend of `week` on the game's rules (seeded like `weekendKill`: the same luck). */
export function journeyKill(
  server: JourneyServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
  stacks = 0,
): boolean {
  const w = journeyWeekend(server, slot, week, speed, seed, profile, run);
  const dial = determinationOf(run);
  const determinationBp = dial && slot >= dial.fromSlot ? stacks * dial.stackBp : 0;
  return playJourneyWeekend(w, `path:${seed}:w${week}`, determinationBp).won;
}

/** One server of the kind on the game's rules, seeded by its index (the seeds of `pathOf`). */
export function journeyOf(
  server: JourneyServer,
  speed: RosterSpeed,
  index: number,
  profile: RosterProfile = VALLEY_ROSTER,
  run: PathRun = {},
): ServerPath {
  const seed = `${server.id}:${index}`;
  const dial = determinationOf(run);
  return walkPath(
    (slot, week, stacks) => journeyKill(server, slot, week, speed, seed, profile, run, stacks),
    dial ? { determinationStacks: dial.maxStacks, determinationFromSlot: dial.fromSlot } : {},
  );
}

// ---------- the plan ----------

export type JourneyRules = 'lab' | 'game';

/** One job: a whole server's 24 weeks, or (with `slot`) one weekend of the mixed server at the slot's arrival week. */
export interface JourneyJobArgs {
  readonly rules: JourneyRules;
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly determination: 'on' | 'off';
  readonly index: number;
  /** A single weekend at this slot, at the week it arrives (`SLOT_WEEKS`), no Determination. */
  readonly slot?: number;
}

export const journeyJobId = (a: JourneyJobArgs): string =>
  `journey:${a.rules}:${a.server}:${a.speed}:${a.determination}:${a.slot ?? 'path'}:${a.index}`;

const serverOf = (id: string): JourneyServer => {
  const s = JOURNEY_SERVERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown journey server ${id}`);
  return s;
};

/** What a `journey-server` job runs: a `ServerPath`, or for a slot job `{ won }`. */
export function runJourneyJob(args: unknown): ServerPath | { won: boolean } {
  const a = args as JourneyJobArgs;
  const server = serverOf(a.server);
  const run: PathRun = a.determination === 'off' ? { determination: 'off' } : {};
  if (a.slot !== undefined) {
    const week = SLOT_WEEKS[a.slot - 1] ?? 1;
    const seed = `${a.server}:${a.index}`;
    const won =
      a.rules === 'game'
        ? journeyKill(server, a.slot, week, a.speed, seed, VALLEY_ROSTER, run)
        : weekendKillLab(server, a.slot, week, a.speed, seed, run);
    return { won };
  }
  return a.rules === 'game'
    ? journeyOf(server, a.speed, a.index, VALLEY_ROSTER, run)
    : pathOf(labServer(server), a.speed, a.index, VALLEY_ROSTER, run);
}

/** The three servers the lab's rules know (`PathServer`): a journey server of another size has no lab twin. */
function labServer(server: JourneyServer): typeof DEDICATED {
  const known = [DEDICATED, MIXED, BUILDERS].find((s) => s.id === server.id);
  if (!known) throw new Error(`the lab's rules have no ${server.id} server`);
  return known;
}

const weekendKillLab = (
  server: JourneyServer,
  slot: number,
  week: number,
  speed: RosterSpeed,
  seed: string,
  run: PathRun,
): boolean => weekendKill(labServer(server), slot, week, speed, seed, VALLEY_ROSTER, run, 0);

/** The kinds of server compared on both rules, at the three speeds. */
export const COMPARED_SERVERS = ['dedicated', 'mixed', 'builders'] as const;
/** The party sizes (game rules only, expected speed). */
export const SIZE_SERVERS = ['mixed5', 'mixed8', 'mixed15', 'small1', 'small2', 'small3'] as const;
/** The slots of the mixed server's one-weekend kill (the track's three misses). */
export const MIXED_KILL_SLOTS = [8, 11, 14] as const;

export interface JourneyPlanOptions {
  readonly quick: boolean;
  /** Servers of each kind (default 8 quick, 40 full). */
  readonly servers?: number;
  readonly speeds?: readonly RosterSpeed[];
  readonly compared?: readonly (typeof COMPARED_SERVERS)[number][];
  readonly sizes?: readonly (typeof SIZE_SERVERS)[number][];
  readonly slots?: readonly number[];
}

/** A summary of one cell. */
export interface JourneyCell {
  readonly rules: JourneyRules;
  readonly determination: 'on' | 'off';
  readonly summary: PathSummary;
}

/** A cell as the report's JSON keeps it: the numbers of the tables, not every server's walk. */
export interface JourneyCellData {
  readonly rules: JourneyRules;
  readonly determination: 'on' | 'off';
  readonly server: string;
  readonly speed: RosterSpeed;
  readonly servers: number;
  readonly stuckShare: number;
  readonly longestRun: PathSummary['longestRun'];
  /** Per slot (index 0 is slot 1): the share of servers that reached it and the median weekends spent on it. */
  readonly reachedShare: readonly number[];
  readonly weekendsMedian: readonly number[];
}

const compact = (c: JourneyCell): JourneyCellData => ({
  rules: c.rules,
  determination: c.determination,
  server: c.summary.server,
  speed: c.summary.speed,
  servers: c.summary.servers,
  stuckShare: c.summary.stuckShare,
  longestRun: c.summary.longestRun,
  reachedShare: c.summary.slots.map((x) => x.reachedShare),
  weekendsMedian: c.summary.slots.map((x) => x.weekends.median),
});

export interface JourneyReport {
  readonly md: string[];
  readonly data: {
    readonly cells: readonly JourneyCellData[];
    readonly mixedKill: readonly {
      rules: JourneyRules;
      slot: number;
      week: number;
      kill: number;
    }[];
  };
}

export const journeyServers = (quick: boolean): number => (quick ? 8 : 40);

const pct = (x: number): string => `${Math.round(100 * x)}%`;

/** The weekends a slot took: median, with the mean beside it (a slot never reached: a dash). */
const slotCell = (s: PathSummary, slot: number): string => {
  const x = s.slots[slot - 1];
  if (!x || x.reachedShare === 0) return '-';
  return `${x.weekends.median} (${x.weekendsMean.toFixed(1)})${x.reachedShare < 1 ? ` ${pct(x.reachedShare)}` : ''}`;
};

/**
 * The plan: servers as jobs. The three compared kinds are played at each speed with and without Determination on the lab's rules and the
 * game's; the party sizes on the game's rules at the expected speed; the mixed server's one-weekend kill at the three missed slots on both.
 */
export function planJourney(options: JourneyPlanOptions): Plan<JourneyReport> {
  const n = options.servers ?? journeyServers(options.quick);
  const speeds = options.speeds ?? ROSTER_SPEEDS;
  const compared = options.compared ?? COMPARED_SERVERS;
  const sizes = options.sizes ?? SIZE_SERVERS;
  const slots = options.slots ?? MIXED_KILL_SLOTS;
  const dials = ['on', 'off'] as const;
  const rulesBoth = ['lab', 'game'] as const;
  const full: JourneyJobArgs[] = [
    ...rulesBoth.flatMap((rules) =>
      compared.flatMap((server) =>
        speeds.flatMap((speed) =>
          dials.map((determination) => ({ rules, server, speed, determination, index: 0 })),
        ),
      ),
    ),
    ...sizes.flatMap((server) =>
      dials.map((determination) => ({
        rules: 'game' as const,
        server,
        speed: 'expected' as const,
        determination,
        index: 0,
      })),
    ),
  ];
  const kills: JourneyJobArgs[] = rulesBoth.flatMap((rules) =>
    slots.map((slot) => ({
      rules,
      server: 'mixed',
      speed: 'expected' as const,
      determination: 'off' as const,
      index: 0,
      slot,
    })),
  );
  const each = (a: JourneyJobArgs): JourneyJobArgs[] =>
    Array.from({ length: n }, (_, index) => ({ ...a, index }));
  const jobs: JobSpec[] = [...full, ...kills].flatMap(each).map((args) => ({
    id: journeyJobId(args),
    section: `Journey: ${args.rules} rules, ${args.server}`,
    kind: 'journey-server',
    args,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults): JourneyReport => {
      const cells: JourneyCell[] = full.map((a) => ({
        rules: a.rules,
        determination: a.determination,
        summary: summarisePath(
          a.server,
          a.speed,
          Array.from(
            { length: n },
            (_, index) => results.get(journeyJobId({ ...a, index })) as ServerPath,
          ),
        ),
      }));
      const mixedKill = kills.map((a) => {
        const won = Array.from(
          { length: n },
          (_, index) => (results.get(journeyJobId({ ...a, index })) as { won: boolean }).won,
        );
        return {
          rules: a.rules,
          slot: a.slot as number,
          week: SLOT_WEEKS[(a.slot as number) - 1] ?? 1,
          kill: won.filter(Boolean).length / n,
        };
      });
      return {
        md: journeyMarkdown(cells, mixedKill, n, slots),
        data: { cells: cells.map(compact), mixedKill },
      };
    },
  };
}

function journeyMarkdown(
  cells: readonly JourneyCell[],
  mixedKill: JourneyReport['data']['mixedKill'],
  n: number,
  slots: readonly number[],
): string[] {
  const cell = (rules: JourneyRules, server: string, speed: RosterSpeed, det: 'on' | 'off') =>
    cells.find(
      (c) =>
        c.rules === rules &&
        c.summary.server === server &&
        c.summary.speed === speed &&
        c.determination === det,
    )?.summary;
  const md: string[] = [
    "## Journey on the game's rules",
    '',
    `The path simulator played with the game's raid rules (\`journey.ts\`): a player brings the seats of the boss's arena piece (Storm Sovereign 2, Cinder Wyrm 4, the others 3), the party is locked at stage 1 and sets the weekend's HP, and between stages each player replaces their own knocked-out creatures from their own spares (their next-strongest creatures by the roster profile, each once). Every stage is the engine's \`stageV2\` with its carry, as the worker plays it. "Lab" is the rules the path used before (a column of creatures each, one shared bench). ${n} servers of each kind, the same seeds on both rules. Nothing is tuned: the numbers measure how far the game's rules move the track.`,
    '',
  ];
  const kinds = [...new Set(cells.filter((c) => c.rules === 'lab').map((c) => c.summary.server))];
  const speeds = [...new Set(cells.map((c) => c.summary.speed))].filter((s) =>
    cells.some((c) => c.rules === 'lab' && c.summary.speed === s),
  );
  for (const det of ['on', 'off'] as const) {
    md.push(
      `### Stuck share and the longest run, ${det === 'on' ? 'with' : 'without'} Determination`,
      '',
      `Stuck is more than ${STUCK_WEEKS} weekends on one boss; the target is at most ${pct(STUCK_SHARE_MAX)}. Slots reached is the median server's furthest slot at week 24.`,
      '',
      '| Server | Speed | Stuck: lab | Stuck: game | Longest run: lab (median / worst) | Longest run: game | Slots reached: lab | Slots reached: game |',
      '| --- | --- | ---: | ---: | --- | --- | ---: | ---: |',
    );
    for (const k of kinds)
      for (const sp of speeds) {
        const a = cell('lab', k, sp, det);
        const b = cell('game', k, sp, det);
        if (!a || !b) continue;
        const reach = (s: PathSummary) => s.slots.filter((x) => x.reachedShare >= 0.5).length;
        md.push(
          `| ${k} | ${sp} | ${pct(a.stuckShare)} | ${pct(b.stuckShare)} | ${a.longestRun.median} / ${a.longestRun.max} | ${b.longestRun.median} / ${b.longestRun.max} | ${reach(a)} | ${reach(b)} |`,
        );
      }
    md.push('');
  }
  for (const k of kinds)
    for (const sp of speeds) {
      const a = cell('lab', k, sp, 'on');
      const b = cell('game', k, sp, 'on');
      if (!a || !b) continue;
      const top = Math.max(a.slots.length, b.slots.length);
      md.push(
        `### Weekends to a kill per slot: ${k}, ${sp} roster speed, with Determination`,
        '',
        "Median weekends fought against the slot (mean in brackets; the share of servers that reached it when under all). Lab rules, then the game's.",
        '',
        '| Slot | Boss | Lab | Game | Game: week first fought |',
        '| ---: | --- | ---: | ---: | ---: |',
      );
      for (let s = 1; s <= top; s++) {
        const g = b.slots[s - 1];
        md.push(
          `| ${s} | ${trackSlot(s).bossId} | ${slotCell(a, s)} | ${slotCell(b, s)} | ${g && g.reachedShare > 0 ? g.week.median : '-'} |`,
        );
      }
      md.push('');
    }
  md.push(
    "### The mixed server: one weekend at the slot's week (the track's three misses)",
    '',
    `The share of mixed servers that kill the boss in one weekend at the week the slot is tuned for (\`SLOT_WEEKS\`), expected speed, no Determination. The target is at least ${pct(MIXED_KILL_MIN)} (slot 1 asks 80%).`,
    '',
    '| Slot | Boss | Week | Lab | Game |',
    '| ---: | --- | ---: | ---: | ---: |',
  );
  for (const s of slots) {
    const lab = mixedKill.find((m) => m.rules === 'lab' && m.slot === s);
    const game = mixedKill.find((m) => m.rules === 'game' && m.slot === s);
    md.push(
      `| ${s} | ${trackSlot(s).bossId} | ${lab?.week ?? '-'} | ${lab ? pct(lab.kill) : '-'} | ${game ? pct(game.kill) : '-'} |`,
    );
  }
  md.push('');
  const sizeKinds = [
    ...new Set(cells.filter((c) => c.rules === 'game').map((c) => c.summary.server)),
  ].filter((k) => !kinds.includes(k));
  if (sizeKinds.length) {
    md.push(
      '### Real party sizes (game rules, expected speed)',
      '',
      `Servers of 5, 8 and 15 players are the valley's coverage servers; the last casual player is a new player who joins in week ${NEW_PLAYER_JOIN_WEEK}, so the first weeks are one player short. Small parties are one to three daily players on the prepared line. **Known gap:** under four players the engine's \`trackBoss\` still fights at four columns (guests fill the rest); the smaller boss for small parties is another change, and these rows are information until it lands. The Festival is every ${FESTIVAL_EVERY}th week as on the path.`,
      '',
      '| Server | Determination | Stuck share | Longest run (median / worst) | Slots reached | Weekends: slots 1-5 / 6-10 / 11-15 (median per slot) |',
      '| --- | --- | ---: | --- | ---: | --- |',
    );
    for (const k of sizeKinds)
      for (const det of ['on', 'off'] as const) {
        const s = cell('game', k, 'expected', det);
        if (!s) continue;
        const band = (from: number, to: number) => {
          const xs = s.slots.slice(from - 1, to).filter((x) => x.reachedShare > 0);
          return xs.length ? xs.map((x) => x.weekends.median).join(' ') : '-';
        };
        md.push(
          `| ${k} | ${det} | ${pct(s.stuckShare)} | ${s.longestRun.median} / ${s.longestRun.max} | ${s.slots.filter((x) => x.reachedShare >= 0.5).length} | ${band(1, 5)} / ${band(6, 10)} / ${band(11, 15)} |`,
        );
      }
    md.push('');
  }
  return md;
}
