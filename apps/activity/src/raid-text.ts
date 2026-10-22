/** Plain-words text for the raid tab. Boss details come from the shared content pack. */
import type { Zone } from '@creatures/engine';
import { RULES, content, type BossDef, type SweepRow } from '@creatures/game';
import { CHAIN_GLYPH } from './glyphs';
import type { RaidPhaseId } from './raid-api';

export function turnOrderText(turnOrder: string): string {
  switch (turnOrder) {
    case 'left_to_right':
      return 'Creatures act from left to right.';
    case 'right_to_left':
      return 'Creatures act from right to left.';
    case 'speed':
      return 'Creatures act fastest first (highest Speed).';
    case 'serpentine':
      return 'Creatures act row by row, front row first. Each row runs the opposite way to the one before it, and every row flips each round.';
    default:
      return 'Creatures act in a set order.';
  }
}

export function turnOrderShort(turnOrder: string): string {
  switch (turnOrder) {
    case 'left_to_right':
      return 'Left to right';
    case 'right_to_left':
      return 'Right to left';
    case 'speed':
      return 'By Speed';
    case 'serpentine':
      return 'Serpentine';
    default:
      return 'Set order';
  }
}

const PHASE_NAMES: Record<RaidPhaseId, string> = {
  phase1: 'Phase 1',
  phase2: 'Phase 2',
  finale: 'Finale',
};

export function phaseName(phase: RaidPhaseId): string {
  return PHASE_NAMES[phase];
}

/**
 * The phase's place in the week, for the top left of the fight stage: "Phase 1 / 3", "Phase 2 / 3".
 * The finale is a phase too (the third) but goes by its own name, "Finale", as it does everywhere else.
 */
export function phaseLine(phase: RaidPhaseId): string {
  if (phase === 'finale') return phaseName(phase);
  const place = RULES.raid.phases.findIndex((p) => p.id === phase) + 1;
  return `Phase ${String(place)} / ${String(RULES.raid.phases.length)}`;
}

/** The one line under the "Enraged" banner. The engine's own event text says the same. */
export function enrageLine(bossName: string): string {
  return `Out of time: ${bossName} is enraged!`;
}

/**
 * What the boss does when it reaches a phase's floor: its own line from the content, or the shared
 * one. The shared line names where it comes back (Phase 2, or the finale) when the phase is known.
 */
export function retreatLine(
  bossId: string,
  bossName: string,
  phase?: RaidPhaseId,
  retreat?: { phase1: string; phase2: string } | null,
): string {
  const own = retreat ?? content.bosses.find((b) => b.id === bossId)?.retreat;
  if (phase === 'phase1' && own != null) return own.phase1;
  if (phase === 'phase2' && own != null) return own.phase2;
  const back =
    phase === 'phase1'
      ? ' It will be back in Phase 2.'
      : phase === 'phase2'
        ? ' It will be back in the finale.'
        : '';
  return `${bossName} retreats out of reach.${back}`;
}

/** How a stage ended, as far as the retune cares: cleared, and whether the boss retreated or enraged. */
export interface StageOutcome {
  phase: RaidPhaseId;
  cleared: boolean;
  /** The boss reached the phase's floor and retreated. Absent from an older server: read as false. */
  retreated?: boolean;
  /** The finale ran out of rounds and the boss enraged. Absent from an older server: read as false. */
  enraged?: boolean;
}

/**
 * The few words that say why a stage ended the way it did, or null when there is nothing beyond
 * "cleared" or "not cleared": "the boss retreated" (a phase driven to its floor), "the boss fell
 * while enraged", "out of time, the boss enraged".
 */
export function stageOutcomeNote(
  o: Pick<StageOutcome, 'cleared' | 'retreated' | 'enraged'>,
): string | null {
  if (o.enraged === true) {
    return o.cleared ? 'the boss fell while enraged' : 'out of time, the boss enraged';
  }
  if (o.retreated === true && o.cleared) return 'the boss retreated';
  return null;
}

/** "Phase 1 cleared: the boss retreated." or "Phase 1 not cleared." (a note, when there is one, follows a colon). */
export function stageOutcomeText(o: StageOutcome): string {
  const note = stageOutcomeNote(o);
  const base = `${phaseName(o.phase)} ${o.cleared ? 'cleared' : 'not cleared'}`;
  return note === null ? `${base}.` : `${base}: ${note}.`;
}

type Gimmick = BossDef['gimmicks'][number];

function percent(bp: number): string {
  return `${String(Math.round(bp / 100))}%`;
}

/** A standing effect's sentence: bare when it is always on, else with how often it is. */
function standing(g: Gimmick, text: string): string {
  return 'eachRound' in g.trigger
    ? text
    : `${when(g)}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function when(g: Gimmick): string {
  return 'eachRound' in g.trigger ? 'Every round' : `Every ${String(g.trigger.every)} rounds`;
}

/** The creature at each place of the dungeon's row, by the zone that is that one creature. */
const ROW_PLACE: Readonly<Record<Zone, string>> = {
  front: 'left',
  middle: 'middle',
  back: 'right',
};

type Wording = 'zones' | 'row';
type Pattern = Extract<Gimmick, { op: 'charge' }>['then'];

const ROW_WORD: Readonly<Record<'front' | 'middle' | 'back', string>> = {
  front: 'front',
  middle: 'middle',
  back: 'back',
};

/** What a sweep's `payoffs` row is called: the row with the most Payoffs standing in it. */
const PAYOFF_ROW = 'the row with the most Payoffs';

/** One step of a sweep's walk in words: "the middle row", "every row", "the row with the most Payoffs". */
function sweepStep(r: SweepRow): string {
  if (r === 'all') return 'every row';
  if (r === 'payoffs') return PAYOFF_ROW;
  return `the ${ROW_WORD[r]} row`;
}

/** "once", "twice", "3 times": how often a chain jumps on. */
function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${String(n)} times`;
}

/** How many creatures a barrage drops on: "2 to 6 random creatures", "one random creature". */
function shellCount(min: number, max: number): string {
  if (min === max) return max === 1 ? 'one random creature' : `${String(max)} random creatures`;
  return `${String(min)} to ${String(max)} random creatures`;
}

/** The powers of a lance down its lane: "200%, then 160%, then 128%". */
function laneSeries(power: number, falloffBp: number): string {
  const second = Math.round((power * falloffBp) / 10_000);
  const third = Math.round((second * falloffBp) / 10_000);
  return [power, second, third].map(percent).join(', then ');
}

/** The sweep's rows in order: "the middle row, then the back row, then the front row". */
function sweepWalk(rows: readonly SweepRow[]): string {
  return rows.map(sweepStep).join(', then ');
}

/** What an attack pattern does, as a clause that goes after "Every 3 rounds: ". No full stop. */
function patternClause(p: Pattern, wording: Wording): string {
  switch (p.op) {
    case 'sweep': {
      const only = p.rows.length === 1 ? p.rows[0] : undefined;
      if (only === 'payoffs') {
        return `hits every creature in ${PAYOFF_ROW} for ${percent(p.power)} of its attack`;
      }
      if (only !== undefined && only !== 'all') {
        return wording === 'row'
          ? `hits the ${ROW_PLACE[only]} creature for ${percent(p.power)} of its attack`
          : `hits every creature in the ${only} row for ${percent(p.power)} of its attack`;
      }
      if (p.rows.every((r) => r === 'all')) {
        return wording === 'row'
          ? `hits every creature for ${percent(p.power)} of its attack`
          : `hits every creature in every row for ${percent(p.power)} of its attack`;
      }
      return wording === 'row'
        ? `hits one creature, then the next place along, for ${percent(p.power)} of its attack`
        : `sweeps ${sweepWalk(p.rows)}, one each time, hitting every creature in it for ${percent(p.power)} of its attack`;
    }
    case 'barrage':
      return `${p.shells.max === 1 ? 'hits' : 'drops shells on'} ${shellCount(p.shells.min, p.shells.max)} for ${percent(p.power)} of its attack${p.shells.max === 1 ? '' : ' each'}. Never the same creature twice running`;
    case 'slam': {
      const who =
        p.aim === 'strongest'
          ? 'your highest-attack creature'
          : p.aim === 'payoff'
            ? 'your highest-attack Payoff'
            : p.aim === 'random'
              ? 'a random creature'
              : wording === 'row' || p.aim === 'left'
                ? 'the left creature'
                : 'the front-most creature';
      return `hits ${who} for ${percent(p.power)} of its attack. The creatures right beside it take ${percent(p.splashBp)} of the hit`;
    }
    case 'lance':
      return wording === 'row'
        ? `hits ${p.lane === 'strongest' ? 'your highest-attack creature' : 'a random creature'} for ${percent(p.power)} of its attack. A Guard stops it`
        : `${p.lane === 'strongest' ? 'the lane of your highest-attack creature' : 'one random lane'} of creatures, front to back, takes ${laneSeries(p.power, p.falloffBp)} of its attack. A Guard stops it`;
    case 'pincer':
      return wording === 'row' || p.scope === 'row'
        ? `hits the creatures at both ends of the row for ${percent(p.power)} of its attack`
        : `hits the first and last creature of every row for ${percent(p.power)} of its attack`;
  }
}

/**
 * What a move's rider says, for example "puts Mired x1 on each creature it hits": the effect's name
 * and the stacks its power gives (100% is one stack; 140% is one, and sometimes a second; below 100% is
 * a chance of one). A move without a rider has none.
 */
export function appliesClause(g: Gimmick): string | null {
  const applies = 'applies' in g ? g.applies : undefined;
  if (applies === undefined) return null;
  const name = content.statusEffects.find((e) => e.id === applies.effect)?.name ?? applies.effect;
  const sure = Math.floor(applies.powerBp / 10_000);
  const chance = applies.powerBp % 10_000 > 0;
  const stacks =
    sure === 0
      ? `sometimes ${name} ×1`
      : chance
        ? `${name} ×${String(sure)}, sometimes one more`
        : `${name} ×${String(sure)}`;
  const turns =
    applies.durationTurns === undefined ? '' : `, ${String(applies.durationTurns)} turns longer`;
  return `puts ${stacks}${turns} on each creature it hits`;
}

/**
 * One gimmick in plain words, for example "Every 3 rounds: hits every creature in the front zone for
 * 80% of its attack." `row` (the dungeon, where the team is one row of three and each zone is the
 * one creature at that place) says "hits the left creature" instead of naming a zone. A move with a
 * status effect rider ends with it: "..., and puts Mired ×1 on each creature it hits."
 */
export function gimmickText(g: Gimmick, wording: Wording = 'zones'): string {
  const base = gimmickBaseText(g, wording);
  const rider = appliesClause(g);
  if (rider === null || !base.endsWith('.')) return base;
  return `${base.slice(0, -1)}, and ${rider}.`;
}

function gimmickBaseText(g: Gimmick, wording: Wording): string {
  switch (g.op) {
    case 'hit_zone':
      return wording === 'row'
        ? `${when(g)}: hits the ${ROW_PLACE[g.zone]} creature for ${percent(g.power)} of its attack.`
        : `${when(g)}: hits every creature in the ${g.zone} zone for ${percent(g.power)} of its attack.`;
    case 'silence_ends':
      return `${when(g)}: silences the creatures at both ends of ${g.scope === 'rows' && wording !== 'row' ? 'each row' : 'the row'} for ${String(g.turns)} turn${g.turns === 1 ? '' : 's'}.`;
    case 'reflect_first_reaction':
      return `${when(g)}: turns the first reaction of the round back on the creature that set it off.`;
    case 'backlash':
      return standing(
        g,
        `Each reaction has a ${percent(g.chanceBp)} chance to burn the creature that set it off for ${percent(g.shareBp)} of its bonus.`,
      );
    case 'spikes':
      return standing(
        g,
        `Every hit on the foe pricks the hitter for ${percent(g.bp)} of its plain damage. A reaction's bonus does not count.`,
      );
    case 'strike_highest_atk': {
      const jumps = g.jumps ?? 0;
      const strike = `${when(g)}: strikes your highest-attack creature for ${percent(g.power)} of its attack`;
      if (jumps === 0) return `${strike}.`;
      const decay = g.decayBp ?? 5_500;
      const hits = Array.from({ length: jumps }, (_, k) =>
        percent(Math.round(g.power * (decay / 10_000) ** (k + 1))),
      );
      return `${strike}, then jumps to the next strongest ${times(jumps)} (${hits.join(', ')}).`;
    }
    case 'sweep':
    case 'barrage':
    case 'slam':
    case 'lance':
    case 'pincer':
      return `${when(g)}: ${patternClause(g, wording)}.`;
    case 'charge':
      return `${when(g)}, announced a round ahead: ${patternClause(g.then, wording)}. Its victims are marked first.`;
    case 'purge':
      return `${when(g)}: shakes every debuff off itself.`;
  }
}

/**
 * A few words for a gimmick's icon label, for example "Hits the front zone every 3 rounds". `row`
 * (the dungeon) names a place instead of a zone ("Hits the left creature every 3 rounds"). A charged
 * move says what it hits, after "Charged:" ("Charged: slams your strongest creature and the ones
 * beside it every 4 rounds"); that it is announced a round ahead is what "charged" means.
 */
export function gimmickShort(g: Gimmick, wording: Wording = 'zones'): string {
  if (g.op === 'backlash' || g.op === 'spikes') {
    // Standing effects: due every round today, so no frequency unless content says otherwise.
    const what = g.op === 'backlash' ? 'Reactions may burn back' : 'Pricks whoever hits it';
    return 'eachRound' in g.trigger ? what : `${what} ${every(g)}`;
  }
  if (g.op === 'charge') {
    const inner = shortWhat(g.then, wording);
    return `Charged: ${inner.charAt(0).toLowerCase()}${inner.slice(1)} ${every(g)}`;
  }
  return `${shortWhat(g, wording)} ${every(g)}`;
}

function every(g: Gimmick): string {
  return 'eachRound' in g.trigger ? 'every round' : `every ${String(g.trigger.every)} rounds`;
}

const SLAM_WHO: Record<Extract<Pattern, { op: 'slam' }>['aim'], string> = {
  strongest: 'your strongest creature',
  payoff: 'your best Payoff',
  random: 'a random creature',
  left: 'the left creature',
  front: 'the front creature',
};

/** What a move does, in a few words, without how often (`gimmickShort` adds that). */
function shortWhat(g: Gimmick | Pattern, wording: Wording): string {
  const row = wording === 'row';
  switch (g.op) {
    case 'hit_zone':
      return row ? `Hits the ${ROW_PLACE[g.zone]} creature` : `Hits the ${g.zone} zone`;
    case 'silence_ends':
      return g.scope === 'rows' && !row
        ? 'Silences the ends of each row'
        : "Silences the row's ends";
    case 'reflect_first_reaction':
      return 'Reflects a reaction';
    case 'backlash':
      return 'Reactions may burn back';
    case 'spikes':
      return 'Pricks whoever hits it';
    case 'strike_highest_atk':
      return (g.jumps ?? 0) > 0
        ? 'Strikes your top attacker and jumps on'
        : 'Strikes your top attacker';
    case 'sweep': {
      const only = g.rows.length === 1 ? g.rows[0] : undefined;
      if (only === 'payoffs') return `Sweeps ${PAYOFF_ROW}`;
      if (g.rows.every((r) => r === 'all')) return row ? 'Hits every creature' : 'Sweeps every row';
      if (only !== undefined && only !== 'all') {
        return row ? `Hits the ${ROW_PLACE[only]} creature` : `Sweeps the ${only} row`;
      }
      return row ? 'Hits one place, then the next' : 'Sweeps row by row';
    }
    case 'barrage':
      return g.shells.max === 1
        ? 'Hits one random creature'
        : `Drops shells on ${shellCount(g.shells.min, g.shells.max)}`;
    case 'slam': {
      // On one row the front-most creature is the left one, and it has one neighbour, not two.
      const end = row && (g.aim === 'front' || g.aim === 'left');
      return end
        ? 'Slams the left creature and the one beside it'
        : `Slams ${SLAM_WHO[g.aim]} and the ones beside it`;
    }
    case 'lance':
      return row ? 'Hits one creature' : 'Cuts one lane through every row';
    case 'pincer':
      return row ? 'Closes on both ends' : 'Closes on the ends of each row';
    case 'charge':
      return `Charged: ${shortWhat(g.then, wording).toLowerCase()}`;
    case 'purge':
      return 'Shakes off its debuffs';
  }
}

/**
 * The glyph key of a gimmick: its `op`, except that a strike that jumps on is drawn as a bolt (the
 * same op, a different picture, so the boss card tells the two apart).
 */
export function gimmickGlyphKey(g: Gimmick): string {
  return g.op === 'strike_highest_atk' && (g.jumps ?? 0) > 0 ? CHAIN_GLYPH : g.op;
}

/**
 * Plain-words gimmick lines for a boss id: the server's name, the gimmick's `op` (it picks the icon),
 * a short label and the full sentence. Falls back to the names the server sent, with no op.
 */
export function gimmickLines(
  bossId: string,
  fallback: readonly { id: string; name: string }[],
): {
  id: string;
  name: string;
  op: string | null;
  /** The key of the picture: the op, or the chain's bolt; null when the op is not known. */
  glyph: string | null;
  short: string;
  text: string;
}[] {
  const boss = content.bosses.find((b) => b.id === bossId);
  return fallback.map((g) => {
    const def = boss?.gimmicks.find((d) => d.id === g.id);
    return {
      id: g.id,
      name: g.name,
      op: def?.op ?? null,
      glyph: def === undefined ? null : gimmickGlyphKey(def),
      short: def === undefined ? '' : gimmickShort(def),
      text: def === undefined ? '' : gimmickText(def),
    };
  });
}
