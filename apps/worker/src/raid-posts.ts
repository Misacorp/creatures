/**
 * Builds the Discord posts of the raid from stored data and queues them. The text itself comes from
 * `discord-format.ts`; this module only gathers facts. Queuing happens inside the transaction that
 * commits the raid event, keyed per (week, event, party), so a post is queued at most once.
 *
 * A post never blocks the raid: `queue*` catch every error and log its type only.
 */
import { bossAtRank, content } from '@creatures/game';
import type { FightEvent, FightInput, FightResult } from '@creatures/engine';
import {
  describeGimmick,
  formatBossReveal,
  formatPhasePost,
  type FirstPost,
  type KeyMoment,
  type RankPost,
} from './discord-format';
import { announceChannelId, enqueuePost } from './discord-posts';
import { festivalWinners } from './raid-festival';
import { rankChangeOf, readWeekProgression } from './raid-ladder';
import { eligiblePlayerIds } from './raid-roster';
import type { StoredSummary } from './raid-resolve';
import { addWeeks, eventTimes, type RaidPhase } from './raid-schedule';
import { storedTimezone } from './weather';

function playerNames(sql: SqlStorage): Map<string, string> {
  return new Map(
    sql
      .exec<{ user_id: string; display_name: string }>('SELECT user_id, display_name FROM players')
      .toArray()
      .map((r) => [r.user_id, r.display_name]),
  );
}

/** How many parties have players this week (a post names its party only when there are several). */
const partiesInPlay = (sql: SqlStorage, weekId: string): number =>
  sql
    .exec<{
      n: number;
    }>('SELECT COUNT(DISTINCT party) AS n FROM raid_party_members WHERE week_id = ?', weekId)
    .one().n;

/**
 * Monday: the boss reveal. Nobody has joined yet (a player joins by placing a creature), so it names
 * no head count. Skipped when no announcement channel is known or nobody is active on the server.
 */
export function queueBossReveal(
  sql: SqlStorage,
  week: { weekId: string; bossId: string },
  tz: string,
  now: number,
): void {
  try {
    if (announceChannelId(sql) === null) return;
    if (eligiblePlayerIds(sql, now).length === 0) return;
    const found = content.bosses.find((b) => b.id === week.bossId);
    if (found === undefined) return;
    const times = eventTimes(week.weekId, tz);
    const progression = readWeekProgression(sql, week.weekId);
    // The moves the boss will have at the week's rank (a week from before the ladder is rank 1).
    const boss = bossAtRank(found, progression?.effectiveRank ?? progression?.rank ?? 1);
    const festivalSpecies =
      progression?.festivalSpecies === null || progression?.festivalSpecies === undefined
        ? undefined
        : content.creatures.find((c) => c.id === progression.festivalSpecies);
    const post = formatBossReveal({
      bossId: boss.id,
      bossName: boss.name,
      elementId: boss.element,
      elementName: content.elements.find((e) => e.id === boss.element)?.name ?? boss.element,
      gimmicks: boss.gimmicks.map((g) => ({ name: g.name, text: describeGimmick(g) })),
      turnOrder: boss.turnOrder,
      schedule: { phase1: times.phase1, phase2: times.phase2, finale: times.finale },
      timeZone: tz,
      rank: progression?.rank ?? null,
      festivalCreature: progression?.festival === true ? (festivalSpecies?.name ?? null) : null,
    });
    enqueuePost(
      sql,
      { key: `raid:${week.weekId}:weekStart:all`, content: JSON.stringify(post) },
      now,
    );
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

/**
 * Creatures first caught or evolved on the server since `since` by members of this party: catches
 * first, then evolutions, each once. The jackpot record is kept in storage but never listed (the
 * jackpot is hidden from players); a Festival creature has its own line in the post.
 */
function firstsOf(sql: SqlStorage, since: number, members: ReadonlySet<string>): FirstPost[] {
  const rows = sql
    .exec<{ kind: string; species: string; user_id: string }>(
      "SELECT kind, species, user_id FROM server_firsts WHERE at >= ? AND kind IN ('catch', 'evolve') ORDER BY kind, species, rowid",
      since,
    )
    .toArray()
    .filter((r) => members.has(r.user_id));
  const seen = new Set<string>();
  const firsts: FirstPost[] = [];
  for (const r of rows) {
    const key = `${r.kind}:${r.species}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firsts.push({
      species: speciesName(r.species),
      kind: r.kind === 'evolve' ? 'evolve' : 'catch',
    });
  }
  return firsts;
}

/** The server's rank move for the finale post; null until every party has finished. */
function ladderPost(sql: SqlStorage, weekId: string): RankPost | null {
  const change = rankChangeOf(sql, weekId);
  if (change === null) return null;
  const finales = sql
    .exec<{ summary: string }>(
      "SELECT summary FROM raid_results WHERE week_id = ? AND phase = 'finale'",
      weekId,
    )
    .toArray();
  return {
    before: change.before,
    after: change.after,
    festival: change.festival,
    parties: finales.length,
    partiesWon: finales.filter((f) => (JSON.parse(f.summary) as StoredSummary).cleared).length,
  };
}

/** The Festival creature of a Festival week and the members of this party who got it. */
function festivalPost(
  sql: SqlStorage,
  weekId: string,
  summary: StoredSummary,
  names: ReadonlyMap<string, string>,
): { creature: string; winners: string[] } | null {
  const progression = readWeekProgression(sql, weekId);
  if (progression?.festival !== true || progression.festivalSpecies === null) return null;
  const creature = speciesName(progression.festivalSpecies);
  const winners = festivalWinners(
    sql,
    weekId,
    summary.members.map((m) => m.userId),
  ).map((id) => names.get(id) ?? 'Unknown');
  return { creature, winners };
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

    const times = eventTimes(src.weekId, storedTimezone(sql));
    const post = formatPhasePost({
      phase,
      bossId: input.boss.id,
      bossName: input.boss.name,
      party: partiesInPlay(sql, src.weekId) > 1 ? src.party : null,
      cleared: summary.cleared,
      retreated: summary.retreated === true,
      enraged: summary.enraged === true,
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
      counterMove: counter ?? null,
      next:
        phase === 'phase1'
          ? times.phase2
          : phase === 'phase2'
            ? times.finale
            : eventTimes(addWeeks(src.weekId, 1), storedTimezone(sql)).weekStart,
      ...(phase === 'finale'
        ? {
            finale: {
              firsts: firstsOf(
                sql,
                week?.created_at ?? 0,
                new Set(summary.members.map((m) => m.userId)),
              ),
              rank: ladderPost(sql, src.weekId),
              festival: festivalPost(sql, src.weekId, summary, names),
            },
          }
        : {}),
    });
    enqueuePost(
      sql,
      { key: `raid:${src.weekId}:${phase}:${String(src.party)}`, content: JSON.stringify(post) },
      src.now,
    );
  } catch (err) {
    console.error('queueing a phase post failed', err instanceof Error ? err.name : 'unknown');
  }
}
