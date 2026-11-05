/**
 * The track's journey pass: after the slot tuner (`trackTuner.ts`) has set each slot for the dedicated roster at the expected speed, this
 * pass plays the v2 journey (`journey.ts`: the game's rules and the habits, `HABITS`, Determination on, the mixed server at the slow
 * roster speed) on the table and eases the slots where servers get stuck (more than `STUCK_WEEKS` weekends on one boss) until the
 * stuck share is at most `JOURNEY_AIM`. The target does not move: `STUCK_SHARE_MAX` (the gate's, 10%) with a margin, because the gate
 * reads only 40 servers.
 *
 * Why a pass beside the slot tuner and not a new objective inside it: the slot tuner measures one slot at one week on the dedicated
 * roster, in parallel on the pool. A slow server arrives at slot k later and with weaker creatures than that roster, and what makes it
 * stuck is the habits (replacement, casual rows, rolled talents), which only the journey plays. Easing a slot's HP and Attack together
 * (`EASE_STEP` of the tuned value a round, never below `EASE_FLOOR` of it) moves one number the journey is sensitive to and keeps the
 * slot's shape. The journey is synchronous and fast (about 30 ms a server), so the pass runs in this process, without the pool.
 *
 * The pass only eases. A slot that is not stuck keeps its tuned numbers, so a track that already meets the aim is left as it is.
 */
import { HABITS } from './habits';
import { JOURNEY_SERVERS, journeyOf, type JourneyServer } from './journey';
import { STUCK_SHARE_MAX, STUCK_WEEKS } from './path';
import { ROSTER_SPEEDS, type RosterSpeed } from './roster';
import type { SlotTable } from './track';

/** The stuck share the pass aims at: under the gate's limit, so the gate's 40 servers do not miss on luck. */
export const JOURNEY_AIM = STUCK_SHARE_MAX * 0.7;
/** How much of a slot's HP and Attack one round takes off, as a share of the tuned value. */
export const EASE_STEP = 0.015;
/** The lowest a slot may be eased to, as a share of its tuned HP and Attack. */
export const EASE_FLOOR = 0.75;
/** A slot is eased in a round when at least this share of the servers got stuck on it. */
export const EASE_SLOT_MIN = 0.02;
export const JOURNEY_MAX_ROUNDS = 60;
/** The server kind the pass reads and the speed it drives on. */
export const JOURNEY_KIND = 'mixed';
export const JOURNEY_SPEED: RosterSpeed = 'slow';

/** The servers of a pass: the gate's seeds (0 to 39) and more (`servers`), so the aim holds beyond the gate's luck. */
export const journeyPassServers = (quick: boolean): number => (quick ? 24 : 120);

/** What one table does: per speed, the servers stuck, and where. */
export interface JourneyProbe {
  readonly speed: RosterSpeed;
  readonly servers: number;
  readonly stuck: number;
  /** Servers stuck on each slot (the first slot a server took more than `STUCK_WEEKS` weekends to kill). */
  readonly stuckAt: Readonly<Record<number, number>>;
  /** Servers that killed the slot in their first weekend there, per slot. */
  readonly oneWeekend: Readonly<Record<number, number>>;
  /** Servers that fought the slot at all, per slot. */
  readonly reached: Readonly<Record<number, number>>;
}

const serverOf = (id: string): JourneyServer => {
  const s = JOURNEY_SERVERS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown journey server ${id}`);
  return s;
};

/** Plays `servers` servers of the kind at the speed on the table, as the gate does (game rules, `HABITS`, Determination on). */
export function probeJourney(
  table: SlotTable,
  speed: RosterSpeed,
  servers: number,
  kind: string = JOURNEY_KIND,
): JourneyProbe {
  const server = serverOf(kind);
  const stuckAt: Record<number, number> = {};
  const oneWeekend: Record<number, number> = {};
  const reached: Record<number, number> = {};
  let stuck = 0;
  for (let i = 0; i < servers; i++) {
    const p = journeyOf(server, speed, i, undefined, { table }, HABITS);
    p.attempts.forEach((a, k) => {
      reached[k + 1] = (reached[k + 1] ?? 0) + 1;
      if (a === 1) oneWeekend[k + 1] = (oneWeekend[k + 1] ?? 0) + 1;
    });
    if (p.longestRun > STUCK_WEEKS) {
      stuck++;
      const slot = p.attempts.findIndex((a) => a > STUCK_WEEKS) + 1;
      stuckAt[slot] = (stuckAt[slot] ?? 0) + 1;
    }
  }
  return { speed, servers, stuck, stuckAt, oneWeekend, reached };
}

/** One round of the pass. */
export interface JourneyRound {
  readonly round: number;
  readonly stuck: number;
  readonly eased: readonly number[];
}

export interface JourneyPassResult {
  readonly table: SlotTable;
  readonly start: SlotTable;
  readonly rounds: readonly JourneyRound[];
  /** Whether the stuck share reached `JOURNEY_AIM`. */
  readonly reached: boolean;
  /** The slots held at `EASE_FLOOR` that were still stuck on at the end: the blockers, content problems for the report. */
  readonly atFloor: readonly number[];
  /** Every speed, before (the table the pass was given) and after. */
  readonly before: readonly JourneyProbe[];
  readonly after: readonly JourneyProbe[];
}

/** The slot's numbers with HP and Attack scaled by `f` (HP to the tuner's 100, Attack to a whole number). */
const scaled = (n: SlotTable[number] | undefined, f: number): SlotTable[number] => ({
  ...n,
  ...(n?.hp !== undefined ? { hp: Math.round((n.hp * f) / 100) * 100 } : {}),
  ...(n?.atk !== undefined ? { atk: Math.round(n.atk * f) } : {}),
});

/** Eases the slots of `first` to `last` where mixed servers at the slow speed get stuck, until the stuck share is at most `JOURNEY_AIM`. */
export function journeyPass(
  start: SlotTable,
  o: { first: number; last: number; quick: boolean; servers?: number },
): JourneyPassResult {
  const servers = o.servers ?? journeyPassServers(o.quick);
  const probeAll = (t: SlotTable): JourneyProbe[] =>
    ROSTER_SPEEDS.map((s) => probeJourney(t, s, servers));
  const before = probeAll(start);
  let table: SlotTable = start;
  const rounds: JourneyRound[] = [];
  const factor: Record<number, number> = {};
  let probe = before.find((p) => p.speed === JOURNEY_SPEED) as JourneyProbe;
  for (let round = 1; round <= JOURNEY_MAX_ROUNDS; round++) {
    // Only stuck servers on slots the pass may ease count towards the aim.
    const easable = Object.entries(probe.stuckAt)
      .filter(([s]) => Number(s) >= o.first && Number(s) <= o.last)
      .map(([s, n]) => [Number(s), n] as const);
    const easableStuck = easable.reduce((n, [, c]) => n + c, 0);
    if (easableStuck / servers <= JOURNEY_AIM) {
      rounds.push({ round, stuck: probe.stuck, eased: [] });
      break;
    }
    const eased: number[] = [];
    const next: Record<number, SlotTable[number]> = { ...table };
    for (const [slot, count] of easable) {
      const f = factor[slot] ?? 1;
      if (count / servers < EASE_SLOT_MIN || f <= EASE_FLOOR) continue;
      factor[slot] = Math.max(EASE_FLOOR, f - EASE_STEP);
      next[slot] = scaled(start[slot], factor[slot]);
      eased.push(slot);
    }
    rounds.push({ round, stuck: probe.stuck, eased });
    if (eased.length === 0) break;
    table = next;
    probe = probeJourney(table, JOURNEY_SPEED, servers);
  }
  const after = probeAll(table);
  const last = after.find((p) => p.speed === JOURNEY_SPEED) as JourneyProbe;
  const reached =
    Object.entries(last.stuckAt)
      .filter(([s]) => Number(s) >= o.first && Number(s) <= o.last)
      .reduce((n, [, c]) => n + c, 0) /
      servers <=
    JOURNEY_AIM;
  const atFloor = Object.keys(last.stuckAt)
    .map(Number)
    .filter((s) => (factor[s] ?? 1) <= EASE_FLOOR);
  return { table, start, rounds, reached, atFloor, before, after };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** The pass as report lines: the rounds, the slots that moved and the stuck and one-weekend shares before and after. */
export function journeyPassSummary(r: JourneyPassResult, first: number, last: number): string[] {
  const out = [
    '### Journey pass (mixed server, game rules, habits, Determination on)',
    '',
    `Aim: the stuck share at the ${JOURNEY_SPEED} speed at most ${pct(JOURNEY_AIM)} (the gate's limit is ${pct(STUCK_SHARE_MAX)} on 40 servers), by easing HP and Attack of a slot ${pct(EASE_STEP)} a round, never below ${pct(EASE_FLOOR)} of the tuned value. ${r.reached ? 'Reached.' : '**Not reached.**'}`,
    '',
  ];
  for (const x of r.rounds)
    out.push(
      `- Round ${x.round}: ${x.stuck} stuck${x.eased.length ? `, eased slots ${x.eased.join(', ')}` : ', nothing eased'}.`,
    );
  if (r.atFloor.length) out.push('', `Still stuck at the floor: slots ${r.atFloor.join(', ')}.`);
  out.push(
    '',
    '| Slot | HP before | HP after | Attack before | Attack after |',
    '| --- | --- | --- | --- | --- |',
  );
  for (let s = first; s <= last; s++) {
    const a = r.start[s];
    const b = r.table[s];
    if (!a || !b || (a.hp === b.hp && a.atk === b.atk)) continue;
    out.push(`| ${s} | ${a.hp} | ${b.hp} | ${a.atk} | ${b.atk} |`);
  }
  out.push('', '| Speed | Stuck before | Stuck after |', '| --- | --- | --- |');
  for (const speed of ROSTER_SPEEDS) {
    const a = r.before.find((p) => p.speed === speed) as JourneyProbe;
    const b = r.after.find((p) => p.speed === speed) as JourneyProbe;
    out.push(`| ${speed} | ${pct(a.stuck / a.servers)} | ${pct(b.stuck / b.servers)} |`);
  }
  const ex = (rs: readonly JourneyProbe[]): JourneyProbe =>
    rs.find((p) => p.speed === 'expected') as JourneyProbe;
  out.push(
    '',
    'Mixed expected speed, share of the servers reaching a slot that kill it in one weekend, before / after:',
    '',
    '| Slot | Before | After |',
    '| --- | --- | --- |',
  );
  for (let s = first; s <= last; s++) {
    const a = ex(r.before);
    const b = ex(r.after);
    if (!a.reached[s]) continue;
    const share = (p: JourneyProbe): string => pct((p.oneWeekend[s] ?? 0) / (p.reached[s] || 1));
    out.push(`| ${s} | ${share(a)} | ${share(b)} |`);
  }
  return out;
}
