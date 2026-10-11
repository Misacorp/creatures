/**
 * Builds the Discord posts of the raid from stored data and queues them. The text itself comes from
 * `discord-format.ts`; this module only gathers facts. Queuing happens inside the transaction that
 * commits the raid event, keyed per (week, event, party), so a post is queued at most once.
 *
 * A post never blocks the raid: `queue*` catch every error and log its type only.
 */
import { RULES, content } from '@creatures/game';
import type { FightEvent, FightInput, FightResult } from '@creatures/engine';
import {
  describeGimmick,
  formatBossReveal,
  formatPhasePost,
  type KeyMoment,
} from './discord-format';
import { announceChannelId, enqueuePost } from './discord-posts';
import type { StoredSummary } from './raid-resolve';
import { eventTimes, type RaidPhase } from './raid-schedule';

function playerNames(sql: SqlStorage): Map<string, string> {
  return new Map(
    sql
      .exec<{ user_id: string; display_name: string }>('SELECT user_id, display_name FROM players')
      .toArray()
      .map((r) => [r.user_id, r.display_name]),
  );
}

const count = (sql: SqlStorage, table: 'raid_party_members' | 'raid_parties', weekId: string) =>
  sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE week_id = ?`, weekId).one().n;

/** Monday: the boss reveal. Skipped when no announcement channel is known or nobody is in. */
export function queueBossReveal(
  sql: SqlStorage,
  week: { weekId: string; bossId: string },
  tz: string,
  now: number,
): void {
  try {
    if (announceChannelId(sql) === null) return;
    const players = count(sql, 'raid_party_members', week.weekId);
    if (players === 0) return;
    const boss = content.bosses.find((b) => b.id === week.bossId);
    if (boss === undefined) return;
    const times = eventTimes(week.weekId, tz);
    const text = formatBossReveal({
      bossName: boss.name,
      elementName: content.elements.find((e) => e.id === boss.element)?.name ?? boss.element,
      gimmicks: boss.gimmicks.map((g) => ({ name: g.name, text: describeGimmick(g) })),
      turnOrder: boss.turnOrder,
      schedule: { phase1: times.phase1, phase2: times.phase2, finale: times.finale },
      players,
      parties: count(sql, 'raid_parties', week.weekId),
    });
    enqueuePost(sql, { key: `raid:${week.weekId}:weekStart:all`, content: text }, now);
  } catch (err) {
    console.error('queueing the boss reveal failed', err instanceof Error ? err.name : 'unknown');
  }
}

/**
 * The biggest single moment of a fight: the hardest hit or the biggest reaction bonus that was
 * dealt to the boss (reflected reactions hurt our side and do not count). The earliest wins a tie.
 * Names are returned raw; the formatter escapes them.
 */
export function findKeyMoment(
  events: readonly FightEvent[],
  creatureName: (creatureId: string) => string,
  ownerName: (creatureId: string) => string | null,
  reactionName: (reactionId: string) => string,
): KeyMoment | null {
  let best: KeyMoment | null = null;
  let bestAmount = 0;
  for (const e of events) {
    if (e.t === 'hit' && e.damage > bestAmount) {
      bestAmount = e.damage;
      best = {
        kind: 'hit',
        round: e.round,
        creature: creatureName(e.creature),
        owner: ownerName(e.creature),
        damage: e.damage,
      };
    } else if (e.t === 'reaction' && !e.reflected && e.bonus > bestAmount) {
      bestAmount = e.bonus;
      best = {
        kind: 'reaction',
        round: e.round,
        creature: creatureName(e.payoff),
        owner: ownerName(e.payoff),
        reaction: reactionName(e.reaction),
        bonus: e.bonus,
      };
    }
  }
  return best;
}

/** The most used reaction of a fight (ties: the smaller id), or null if there were none. */
export function mostUsedReaction(
  byType: Readonly<Record<string, number>>,
): { id: string; count: number } | null {
  let best: { id: string; count: number } | null = null;
  for (const id of Object.keys(byType).sort()) {
    const n = byType[id] ?? 0;
    if (n > 0 && (best === null || n > best.count)) best = { id, count: n };
  }
  return best;
}

const speciesName = (id: string): string => content.creatures.find((c) => c.id === id)?.name ?? id;

/** "First on server" records made since `since` by members of this party, grouped by record. */
function firstsOf(
  sql: SqlStorage,
  since: number,
  members: ReadonlySet<string>,
  names: ReadonlyMap<string, string>,
): { label: string; names: string[] }[] {
  const rows = sql
    .exec<{ kind: string; species: string; user_id: string }>(
      'SELECT kind, species, user_id FROM server_firsts WHERE at >= ? ORDER BY kind, species, rowid',
      since,
    )
    .toArray()
    .filter((r) => members.has(r.user_id));
  const groups = new Map<string, { label: string; names: string[] }>();
  for (const r of rows) {
    const key = `${r.kind}:${r.species}`;
    let group = groups.get(key);
    if (group === undefined) {
      const label =
        r.kind === 'jackpot'
          ? 'First jackpot'
          : `${speciesName(r.species)} ${r.kind === 'evolve' ? 'evolved' : 'caught'}`;
      group = { label, names: [] };
      groups.set(key, group);
    }
    group.names.push(names.get(r.user_id) ?? 'Unknown');
  }
  return [...groups.values()];
}

export interface PhasePostSource {
  weekId: string;
  party: number;
  phase: RaidPhase;
  now: number;
  input: FightInput;
  result: FightResult;
  summary: StoredSummary;
}

/** Friday, Saturday and Sunday: one party's result. */
export function queuePhasePost(sql: SqlStorage, src: PhasePostSource): void {
  try {
    if (announceChannelId(sql) === null) return;
    const { input, result, summary, phase } = src;
    const names = playerNames(sql);
    const nameOfAlias = new Map(
      summary.members.map((m) => [m.alias, names.get(m.userId) ?? 'Unknown']),
    );
    const slotById = new Map(input.row.map((s) => [s.id, s]));
    const reactionName = (id: string) => content.reactions.find((r) => r.id === id)?.name ?? id;
    const reaction = mostUsedReaction(result.reactions.byType);

    const week = sql
      .exec<{ created_at: number }>(
        'SELECT created_at FROM raid_weeks WHERE week_id = ?',
        src.weekId,
      )
      .toArray()[0];
    const counter =
      phase === 'phase1'
        ? sql
            .exec<{ adaptation_description: string | null }>(
              'SELECT adaptation_description FROM raid_parties WHERE week_id = ? AND party = ?',
              src.weekId,
              src.party,
            )
            .toArray()[0]?.adaptation_description
        : null;

    const text = formatPhasePost({
      phase,
      bossName: input.boss.name,
      party: count(sql, 'raid_parties', src.weekId) > 1 ? src.party : null,
      cleared: summary.cleared,
      hpLeftPercent:
        summary.bossHpMax <= 0
          ? 0
          : Math.min(100, Math.ceil((summary.bossHpEnd * 100) / summary.bossHpMax)),
      top: summary.contributors.slice(0, 3).map((c) => ({
        name: names.get(c.userId) ?? 'Unknown',
        contribution: c.contribution,
      })),
      reaction:
        reaction === null ? null : { name: reactionName(reaction.id), count: reaction.count },
      keyMoment: findKeyMoment(
        result.events,
        (id) => slotById.get(id)?.name ?? 'A creature',
        (id) => {
          const owner = slotById.get(id)?.ownerId;
          return owner === null || owner === undefined ? null : (nameOfAlias.get(owner) ?? null);
        },
        reactionName,
      ),
      essenceFlat: summary.cleared ? RULES.raid.essence.flat[phase] : null,
      counterMove: counter ?? null,
      ...(phase === 'finale'
        ? {
            finale: {
              jackpot: summary.jackpot.map((id) => names.get(id) ?? 'Unknown'),
              firsts: firstsOf(
                sql,
                week?.created_at ?? 0,
                new Set(summary.members.map((m) => m.userId)),
                names,
              ),
            },
          }
        : {}),
    });
    enqueuePost(
      sql,
      { key: `raid:${src.weekId}:${phase}:${String(src.party)}`, content: text },
      src.now,
    );
  } catch (err) {
    console.error('queueing a phase post failed', err instanceof Error ? err.name : 'unknown');
  }
}
