/**
 * What the raid summary shows (the card after a raid stage and after the Sunday finale), worked out
 * from the data the server already sends: the after-action stats of a stage, the stage's rewards and
 * the boss of the raid view. Pure (no DOM, no network). Everything returned is plain text or plain
 * data (names can be player text: render as text only).
 *
 * Nothing here invents a number. A highlight exists only when the stats hold what it says; the ones
 * that would need new server data are not here (see the "would need" list in decisions.md).
 */
import { sharePercent, whoText } from './after-action';
import { speciesName } from './game';
import type { GrantLoot } from './gear-types';
import type { IconRef } from './icon-ref';
import type {
  AfterActionStats,
  FestivalGrant,
  RaidView,
  RankChange,
  StatsCreature,
  StatsPlayer,
} from './raid-api';
import type { FinaleProgress } from './raid-progress';
import { phaseName } from './raid-text';

/**
 * The boss of a summary, from the raid view (the stats do not carry it). `turnOrder` is null when the
 * view is not of the week the summary is about (the moves would be another boss's): the summary then
 * shows no move icons.
 */
export interface SummaryBoss {
  id: string;
  name: string;
  turnOrder: string | null;
  /** The moves in play at the week's rank, as the raid view lists them. */
  gimmicks: RaidView['boss']['gimmicks'];
  /** The rank the boss fought at, for the "New at rank" mark; null when not known. */
  effectiveRank: number | null;
}

/**
 * The boss of the raid view as a summary's boss, when the view is of the week the summary is about.
 * Otherwise the `fallback` (a live fight knows the boss's id and name), with no moves; or null.
 */
export function summaryBoss(
  view: Pick<RaidView, 'weekId' | 'boss' | 'effectiveRank'> | null,
  week: string,
  fallback: { id: string; name: string } | null = null,
): SummaryBoss | null {
  if (view !== null && view.weekId === week) {
    const { id, name, turnOrder, gimmicks } = view.boss;
    return { id, name, turnOrder, gimmicks, effectiveRank: view.effectiveRank };
  }
  return fallback === null
    ? null
    : { id: fallback.id, name: fallback.name, turnOrder: null, gimmicks: [], effectiveRank: null };
}

/** What a stage paid the caller, and where the server stands after it. */
export interface SummaryRewards {
  essence: number;
  /** The finale's reward slot (a piece, a blueprint, parts); null when there is none. */
  finaleLoot: GrantLoot | null;
  /** A Festival week's piece; null when there is none. */
  festivalLoot: GrantLoot | null;
  festivalGrant: FestivalGrant | null;
  rankChange: RankChange | null;
  /** What the finale did to the Boss Rank and the season pips; null when nothing is known yet. */
  progress: FinaleProgress | null;
}

/**
 * The finale's reward slot and a Festival week's piece as one loot: the gear, blueprints, items that did
 * not fit and parts of both, so the rewards are one list (the two are not told apart on the card). Null when
 * both gave nothing.
 */
export function rewardLoot(
  rewards: Pick<SummaryRewards, 'finaleLoot' | 'festivalLoot'>,
): GrantLoot | null {
  const grants = [rewards.finaleLoot, rewards.festivalLoot].filter((g) => g !== null);
  if (grants.length === 0) return null;
  const parts: Record<string, number> = {};
  for (const g of grants) {
    for (const [kind, amount] of Object.entries(g.parts)) parts[kind] = (parts[kind] ?? 0) + amount;
  }
  return {
    gear: grants.flatMap((g) => g.gear),
    converted: grants.flatMap((g) => g.converted),
    parts,
    blueprints: grants.flatMap((g) => g.blueprints),
  };
}

/** Everything a summary is drawn from: the stage's stats and boss, and what it paid the caller. */
export interface SummaryInput {
  /** Null when the boss is not known (the raid view is of another week): the summary says "The boss". */
  boss: SummaryBoss | null;
  stats: AfterActionStats;
  rewards: SummaryRewards;
}

/** One line of a scoreboard. */
export interface ScoreRow {
  /** 1-based place by damage. */
  rank: number;
  /** "You" for the caller, the display name for others, "Guest" without one. */
  name: string;
  you: boolean;
  /** Damage really dealt to the boss. */
  damage: number;
  /** The score: what sets the Essence share. */
  score: number;
  /** Whole percent of the raid's damage. */
  share: number;
}

/** The players by damage (then score), each with a place and a share of the raid's damage. */
export function scoreboard(stats: Pick<AfterActionStats, 'players'>): ScoreRow[] {
  const total = stats.players.reduce((sum, p) => sum + p.damage, 0);
  return [...stats.players]
    .map((p, order) => ({ p, order }))
    .sort((a, b) => b.p.damage - a.p.damage || b.p.score - a.p.score || a.order - b.order)
    .map(({ p }, index) => ({
      rank: index + 1,
      name: whoText(p.displayName, p.you),
      you: p.you,
      damage: p.damage,
      score: p.score,
      share: sharePercent(p.damage, total),
    }));
}

/** The caller's line of the scoreboard and how many played; null when the caller is not in it. */
export function yourPlace(stats: Pick<AfterActionStats, 'players'>): {
  row: ScoreRow;
  of: number;
} | null {
  const rows = scoreboard(stats);
  const row = rows.find((r) => r.you);
  return row === undefined ? null : { row, of: rows.length };
}

/** A whole number with thousands grouped by a comma: "12,480". Fixed locale, so it reads the same everywhere. */
export function grouped(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The title of the summary card: "Finale result", "Phase 2 result". */
export function summaryTitle(stats: Pick<AfterActionStats, 'phase'>): string {
  return `${phaseName(stats.phase)} result`;
}

// --- Creatures ---

/** A creature's label: its name, with its species when the name is a nickname. */
export function creatureLabel(c: Pick<StatsCreature, 'name' | 'species'>): string {
  const kind = speciesName(c.species);
  return c.name === kind ? c.name : `${c.name} (${kind})`;
}

// --- Highlights ---

/** What a highlight's picture is: a game icon, or a creature's sprite. */
export type HighlightIcon = { kind: 'icon'; icon: IconRef } | { kind: 'creature'; species: string };

export interface Highlight {
  id:
    | 'hardest-hitter'
    | 'star-creature'
    | 'backbone'
    | 'favourite-reaction'
    | 'quick-hands'
    | 'nobody-fell'
    | 'final-push'
    | 'counter-move';
  /** The small title of the card ("Hardest hitter"). */
  label: string;
  /** Who or what it is about: a name, in bold on the card. */
  who: string;
  /** One short line of the fact behind it. */
  line: string;
  /** Whether the caller is the one it is about. */
  you: boolean;
  icon: HighlightIcon;
}

const glyph = (id: string): HighlightIcon => ({ kind: 'icon', icon: { kind: 'glyph', id } });

const ability = (a: { creature: string | null; ability: string }): string =>
  a.creature === null ? a.ability : `${a.creature}'s ${a.ability}`;

/** The player with the most of something, or undefined when nobody has any (ties go to the first listed). */
function most(
  players: readonly StatsPlayer[],
  by: (p: StatsPlayer) => number,
): StatsPlayer | undefined {
  let best: StatsPlayer | undefined;
  for (const p of players) {
    if (by(p) > 0 && (best === undefined || by(p) > by(best))) best = p;
  }
  return best;
}

/**
 * Every highlight the stats can back, in the order a card row should prefer them. A caller picks the
 * first two or three; a small raid has fewer (a highlight about "the rest of the raid" needs a rest).
 */
export function highlights(stats: AfterActionStats): Highlight[] {
  const out: Highlight[] = [];
  const total = stats.players.reduce((sum, p) => sum + p.damage, 0);

  const hitter = most(stats.players, (p) => p.damage);
  if (hitter !== undefined) {
    out.push({
      id: 'hardest-hitter',
      label: 'Hardest hitter',
      who: whoText(hitter.displayName, hitter.you),
      line: `${grouped(hitter.damage)} damage, ${String(sharePercent(hitter.damage, total))}% of the raid`,
      you: hitter.you,
      icon: glyph('blade'),
    });
  }

  const star = [...stats.creatures].sort((a, b) => a.rank - b.rank)[0];
  if (star !== undefined) {
    out.push({
      id: 'star-creature',
      label: 'Star creature',
      who: creatureLabel(star),
      line: `${whoText(star.owner, star.you)}: ${grouped(star.damage)} damage`,
      you: star.you,
      icon: { kind: 'creature', species: star.species },
    });
  }

  // The backbone: the most score that is not from its own hits (setting up, supporting, guarding).
  const backbone = most(stats.players, (p) => p.assist);
  if (backbone !== undefined) {
    out.push({
      id: 'backbone',
      label: 'The backbone',
      who: whoText(backbone.displayName, backbone.you),
      line: `${grouped(backbone.assist)} score from setting up, supporting and guarding`,
      you: backbone.you,
      icon: glyph('shield'),
    });
  }

  const reaction = [...stats.reactions].sort((a, b) => b.count - a.count)[0];
  if (reaction !== undefined && reaction.count > 0) {
    out.push({
      id: 'favourite-reaction',
      label: 'Favourite reaction',
      who: reaction.name,
      line: `Triggered ${String(reaction.count)} times`,
      you: false,
      icon: glyph('sparkle'),
    });
  }

  // Quick hands: the player who fired the most abilities by hand (at least two).
  const byHand = new Map<string, { player: string; you: boolean; count: number }>();
  for (const use of stats.abilities.used) {
    if (use.byDefault) continue;
    const key = `${use.you ? '1' : '0'}:${use.player}`;
    const entry = byHand.get(key) ?? { player: use.player, you: use.you, count: 0 };
    entry.count += 1;
    byHand.set(key, entry);
  }
  const quick = [...byHand.values()].sort((a, b) => b.count - a.count)[0];
  if (quick !== undefined && quick.count >= 2) {
    out.push({
      id: 'quick-hands',
      label: 'Quick hands',
      who: whoText(quick.player, quick.you),
      line: `${String(quick.count)} abilities fired by hand`,
      you: quick.you,
      icon: glyph('hand'),
    });
  }

  if (stats.knockouts.length === 0) {
    out.push({
      id: 'nobody-fell',
      label: 'Nobody fell',
      who: 'Every creature stood',
      line: `Not one knocked out in ${String(stats.rounds)} rounds`,
      you: false,
      icon: glyph('check'),
    });
  }

  // Final push: the last ability fired in the round the boss fell (a cleared stage only).
  if (stats.outcome === 'cleared') {
    const last = [...stats.abilities.used]
      .filter((a) => a.round >= stats.rounds)
      .sort((a, b) => b.round - a.round)[0];
    if (last !== undefined) {
      out.push({
        id: 'final-push',
        label: 'Final push',
        who: whoText(last.player, last.you),
        line: `${ability(last)} in round ${String(last.round)}, the round the boss fell`,
        you: last.you,
        icon: glyph('flag'),
      });
    }
  }

  const adapt = stats.adaptation;
  if (adapt?.purged === true && adapt.purgedRound !== null) {
    const purge = stats.abilities.used.find(
      (a) => a.round === adapt.purgedRound && /purge/i.test(a.ability),
    );
    out.push({
      id: 'counter-move',
      label: 'Counter-move broken',
      who: purge === undefined ? adapt.name : whoText(purge.player, purge.you),
      line: `${adapt.name} purged in round ${String(adapt.purgedRound)}`,
      you: purge?.you ?? false,
      icon: glyph('mark'),
    });
  }

  return out;
}

/** The first `count` highlights, keeping each kind of fact once and preferring the given ids first. */
export function pickHighlights(
  stats: AfterActionStats,
  count: number,
  prefer: readonly Highlight['id'][] = [],
): Highlight[] {
  const all = highlights(stats);
  const first = prefer.flatMap((id) => all.filter((h) => h.id === id));
  const rest = all.filter((h) => !prefer.includes(h.id));
  return [...first, ...rest].slice(0, count);
}

// --- The one big moment ---

/** The headline of the summary: "Tidal Colossus falls!", "Cinder Wyrm holds.", and "The boss falls!" when the boss is not known. */
export function heroHeadline(input: Pick<SummaryInput, 'boss' | 'stats'>): string {
  const { stats } = input;
  const name = input.boss?.name ?? 'The boss';
  if (stats.outcome === 'cleared') {
    return stats.retreated === true && stats.phase !== 'finale'
      ? `${name} retreats!`
      : `${name} falls!`;
  }
  return stats.enraged === true ? `${name} enrages.` : `${name} holds.`;
}

/**
 * The line under the hero headline: when it ended, in plain words. A cleared stage says the round the
 * boss fell in; a failed one says how it ended and how much boss was left.
 */
export function heroLine(stats: AfterActionStats): string {
  const left = `${grouped(stats.boss.hpEnd)} HP left`;
  switch (stats.outcome) {
    case 'cleared':
      if (stats.retreated === true && stats.phase !== 'finale') {
        return `It retreated after ${String(stats.rounds)} / ${String(stats.maxRounds)} rounds.`;
      }
      return stats.enraged === true
        ? `Down after ${String(stats.maxRounds)} rounds, even enraged.`
        : `Down after ${String(stats.rounds)} / ${String(stats.maxRounds)} rounds.`;
    case 'wiped': {
      const last = stats.knockouts.reduce((max, k) => Math.max(max, k.round), 0);
      return last > 0
        ? `Every creature was knocked out by round ${String(last)}. ${left}.`
        : `Every creature was knocked out. ${left}.`;
    }
    default:
      return stats.enraged === true
        ? `Out of time, it enraged. ${left}.`
        : `Out of rounds. ${left}.`;
  }
}
