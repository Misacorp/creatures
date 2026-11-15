/**
 * What the finale's actions are worth (`docs/design/combat/balance.md` sections 2 and 4, "the finale's actions: what each is worth, so
 * none is worth more than its intent").
 *
 * The measure plays the same weekend of one server at a track slot (its tuned week, the habits' players, seeded like `journeyKill`) with
 * different finale inputs and compares them against the same weekend with none. The inputs are one action by one player (Rally, Shield
 * Wall on the front row, Purge), the party's three kinds at once, Shield Walls on every row, the worker's default (`auto`) and the
 * policy of a player who reads the boss card (`best`, `bestAbilityFor`). A Rally is one switch (more than one player pressing it changes
 * nothing) and a Purge too, so one press is what the party gets from a kind; Shield Walls on different rows are the one that adds up.
 * What is measured: the share of weekends that kill the boss, and the finale stage's damage as a share of the boss's HP over the weekends that reach it (a smoother number than a kill; an action cannot
 * matter before the finale), both on the same seeds.
 */
import type { FinaleActionKind } from '@creatures/engine/v2';
import { HABITS, type FinalePolicy } from './habits';
import {
  JOURNEY_SERVERS,
  journeyWeekend,
  playJourneyWeekend,
  seatsOf,
  type JourneyPlayer,
} from './journey';
import type { JobResults, JobSpec, Plan } from './jobs';
import { VALLEY_ROSTER } from './valley';
import { SLOT_WEEKS, trackSlot } from './track';

/** The settings compared: a name and the finale policy of each player (by place in the party; the rest have none). */
export const WORTH_SETTINGS = [
  'none',
  'rally',
  'shieldWall',
  'purge',
  'allThree',
  'walls',
  'auto',
  'best',
] as const;
export type WorthSetting = (typeof WORTH_SETTINGS)[number];

/** The three actions, one press each: what a setting is worth is the change against `none`. */
export const SINGLE_ACTIONS: readonly FinaleActionKind[] = ['rally', 'shieldWall', 'purge'];

const NONE: FinalePolicy = { kind: 'none' };

/** Each player's finale policy under a setting (`players` in the party, `seats` rows in a piece). */
export function policiesOf(setting: WorthSetting, players: number, seats: number): FinalePolicy[] {
  const only = (first: FinalePolicy): FinalePolicy[] =>
    Array.from({ length: players }, (_, i) => (i === 0 ? first : NONE));
  switch (setting) {
    case 'none':
      return only(NONE);
    case 'rally':
    case 'shieldWall':
    case 'purge':
      return only({ kind: 'fixed', ability: setting });
    case 'allThree':
      return Array.from({ length: players }, (_, i): FinalePolicy => {
        const ability = SINGLE_ACTIONS[i];
        return ability ? { kind: 'fixed', ability } : NONE;
      });
    case 'walls':
      return Array.from({ length: players }, (_, i): FinalePolicy =>
        i < seats ? { kind: 'fixed', ability: 'shieldWall', row: i } : NONE,
      );
    case 'auto':
      return Array.from({ length: players }, (): FinalePolicy => ({ kind: 'auto' }));
    case 'best':
      return Array.from({ length: players }, (): FinalePolicy => ({ kind: 'best' }));
  }
}

export interface WorthJobArgs {
  readonly server: string;
  readonly slot: number;
  readonly index: number;
  readonly settings: readonly WorthSetting[];
}

export interface WorthPlay {
  readonly won: boolean;
  /** Whether the weekend got to the finale (stage 3): before that no action is played, and the settings play the same. */
  readonly reached: boolean;
  /** The finale stage's damage as a share of the boss's HP (0 when the weekend ended before it), and its knock-outs. */
  readonly finale: number;
  readonly out: number;
}

export const worthJobId = (a: WorthJobArgs): string =>
  `finale-worth:${a.server}:s${a.slot}:${a.index}:${a.settings.join('+')}`;

/** One server's weekend at the slot's week under each setting, on the same seed. */
export function runWorthJob(args: unknown): Record<string, WorthPlay> {
  const a = args as WorthJobArgs;
  const server = JOURNEY_SERVERS.find((s) => s.id === a.server);
  if (!server) throw new Error(`unknown journey server ${a.server}`);
  const week = SLOT_WEEKS[a.slot - 1] ?? 1;
  const seed = `${a.server}:${a.index}`;
  const w = journeyWeekend(server, a.slot, week, 'expected', seed, VALLEY_ROSTER, {}, HABITS);
  const out: Record<string, WorthPlay> = {};
  for (const setting of a.settings) {
    const policies = policiesOf(setting, w.players.length, seatsOf(a.slot));
    const played = playJourneyWeekend(
      {
        ...w,
        players: w.players.map((p, i): JourneyPlayer => ({ ...p, finale: policies[i] ?? NONE })),
      },
      `path:${seed}:w${week}`,
    );
    const fin = played.stages[2];
    out[setting] = {
      won: played.won,
      reached: played.stages.length === 3,
      finale: fin ? fin.damage / w.boss.hp : 0,
      out: fin ? fin.knockouts : 0,
    };
  }
  return out;
}

export interface WorthOptions {
  readonly quick: boolean;
  readonly servers?: number;
  readonly serverIds?: readonly string[];
  readonly slots?: readonly number[];
}

export interface WorthCell {
  readonly server: string;
  readonly slot: number;
  readonly bossId: string;
  readonly kill: Readonly<Record<string, number>>;
  /** The share of weekends that reached the finale. */
  readonly reached: number;
  /** Per setting: the finale's damage as a share of the boss's HP, and its knock-outs, the mean over the weekends that reached it. */
  readonly share: Readonly<Record<string, number>>;
  readonly out: Readonly<Record<string, number>>;
}

export interface WorthReport {
  readonly md: string[];
  readonly data: { readonly cells: readonly WorthCell[]; readonly servers: number };
}

const pct = (x: number): string => `${Math.round(100 * x)}%`;
const signed = (x: number): string => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`;

/** The compared servers: the mixed one and the dedicated one (the extremes of who plays), and the fifteen-player coverage server. */
export const WORTH_SERVERS = ['mixed', 'dedicated', 'mixed15'] as const;
export const WORTH_SLOTS: readonly number[] = Array.from({ length: 15 }, (_, i) => i + 1);

export function planWorth(options: WorthOptions): Plan<WorthReport> {
  const n = options.servers ?? (options.quick ? 8 : 40);
  const serverIds = options.serverIds ?? WORTH_SERVERS;
  const slots = options.slots ?? WORTH_SLOTS;
  const args: WorthJobArgs[] = serverIds.flatMap((server) =>
    slots.flatMap((slot) =>
      Array.from({ length: n }, (_, index) => ({ server, slot, index, settings: WORTH_SETTINGS })),
    ),
  );
  const jobs: JobSpec[] = args.map((a) => ({
    id: worthJobId(a),
    section: `Finale worth: ${a.server}`,
    kind: 'finale-worth',
    args: a,
    needs: [],
  }));
  return {
    jobs,
    assemble: (results: JobResults): WorthReport => {
      const cells: WorthCell[] = serverIds.flatMap((server) =>
        slots.map((slot) => {
          const plays = Array.from(
            { length: n },
            (_, index) =>
              results.get(worthJobId({ server, slot, index, settings: WORTH_SETTINGS })) as Record<
                string,
                WorthPlay
              >,
          );
          const mean = (f: (p: WorthPlay) => number, s: string) =>
            plays.reduce((t, p) => t + f(p[s] as WorthPlay), 0) / n;
          const reached = plays.filter((p) => (p.none as WorthPlay).reached);
          const meanOf = (xs: typeof plays, f: (p: WorthPlay) => number, s: string) =>
            xs.length ? xs.reduce((t, p) => t + f(p[s] as WorthPlay), 0) / xs.length : 0;
          return {
            server,
            slot,
            bossId: trackSlot(slot).bossId,
            kill: Object.fromEntries(
              WORTH_SETTINGS.map((s) => [s, mean((p) => (p.won ? 1 : 0), s)]),
            ),
            reached: reached.length / n,
            share: Object.fromEntries(
              WORTH_SETTINGS.map((s) => [s, meanOf(reached, (p) => p.finale, s)]),
            ),
            out: Object.fromEntries(
              WORTH_SETTINGS.map((s) => [s, meanOf(reached, (p) => p.out, s)]),
            ),
          };
        }),
      );
      return { md: worthMarkdown(cells, n), data: { cells, servers: n } };
    },
  };
}

/** Which of the three single actions removes the most boss HP in a cell (within a tenth of a point of the next: a tie). */
export function bestSingle(c: WorthCell): FinaleActionKind | 'tie' {
  const ranked = [...SINGLE_ACTIONS].sort((a, b) => (c.share[b] ?? 0) - (c.share[a] ?? 0));
  const [top, next] = ranked as [FinaleActionKind, FinaleActionKind, FinaleActionKind];
  return (c.share[top] ?? 0) - (c.share[next] ?? 0) < 0.001 ? 'tie' : top;
}

export function worthMarkdown(cells: readonly WorthCell[], n: number): string[] {
  const md: string[] = [
    '## The finale actions: what each is worth',
    '',
    `The same weekend (${n} servers per cell, the habits' players, the slot's tuned week, \`finaleWorth.ts\`) played with one finale input and with none. A cell is the change against no action in points of the boss's HP dealt in the finale stage, over the weekends that reach it (the change in kill chance, over all weekends, in brackets). Rally, Shield Wall (front row) and Purge are one press by one player; "all three" is the three kinds by three players; "walls" is a Shield Wall on every row; "auto" is the worker's default (every player's ability dealt by place, at its default round); "best" is every player reading the boss card.`,
    '',
  ];
  for (const server of [...new Set(cells.map((c) => c.server))]) {
    md.push(
      `### ${server}`,
      '',
      '| Slot | Boss | Reach finale | No action: finale damage (kill) | Rally | Shield Wall | Purge | All three | Walls | Auto | Best | Best single |',
      '| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    );
    for (const c of cells.filter((x) => x.server === server)) {
      const d = (s: string) =>
        `${signed((c.share[s] ?? 0) - (c.share.none ?? 0))} (${signed((c.kill[s] ?? 0) - (c.kill.none ?? 0))})`;
      md.push(
        `| ${c.slot} | ${c.bossId} | ${pct(c.reached)} | ${pct(c.share.none ?? 0)} (${pct(c.kill.none ?? 0)}) | ${d('rally')} | ${d('shieldWall')} | ${d('purge')} | ${d('allThree')} | ${d('walls')} | ${d('auto')} | ${d('best')} | ${bestSingle(c)} |`,
      );
    }
    md.push('');
  }
  const bosses = [...new Set(cells.map((c) => c.bossId))];
  md.push(
    '### By boss (all servers and slots)',
    '',
    'Mean change against no action, over every cell of the boss: points of finale damage, and points of kill chance; the right column counts the cells where each action is the best single one.',
    '',
    '| Boss | Rally | Shield Wall | Purge | Best | Best single (cells won) | Kill chance: Rally / Shield Wall / Purge / Best | Knock-outs avoided: Rally / Shield Wall / Purge |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
  );
  for (const boss of bosses) {
    const own = cells.filter((c) => c.bossId === boss);
    const mean = (s: string) =>
      own.reduce((t, c) => t + ((c.share[s] ?? 0) - (c.share.none ?? 0)), 0) / own.length;
    const kill = (s: string) =>
      signed(own.reduce((t, c) => t + ((c.kill[s] ?? 0) - (c.kill.none ?? 0)), 0) / own.length);
    const saved = (s: string) =>
      (own.reduce((t, c) => t + ((c.out.none ?? 0) - (c.out[s] ?? 0)), 0) / own.length).toFixed(2);
    const wins = SINGLE_ACTIONS.map((k) => `${k} ${own.filter((c) => bestSingle(c) === k).length}`);
    md.push(
      `| ${boss} | ${signed(mean('rally'))} | ${signed(mean('shieldWall'))} | ${signed(mean('purge'))} | ${signed(mean('best'))} | ${wins.join(', ')} | ${kill('rally')} / ${kill('shieldWall')} / ${kill('purge')} / ${kill('best')} | ${saved('rally')} / ${saved('shieldWall')} / ${saved('purge')} |`,
    );
  }
  md.push('');
  return md;
}
