import { content, type ContentPack } from '@creatures/game';
import type { FightEvent, FightInput } from './types';

/** Display names used when turning events into text. Missing entries fall back to the id. */
export interface EventNames {
  boss: string;
  creatures: Readonly<Record<string, string>>;
  players?: Readonly<Record<string, string>>;
  reactions?: Readonly<Record<string, string>>;
  gimmicks?: Readonly<Record<string, string>>;
  abilities?: Readonly<Record<string, string>>;
  /** Mark names by element, for example tide: "Soaked". */
  marks?: Readonly<Record<string, string>>;
  elements?: Readonly<Record<string, string>>;
  adaptations?: Readonly<Record<string, string>>;
}

/** Names for a fight input, taken from the row and the content pack. */
export function buildNames(
  input: Pick<FightInput, 'boss' | 'row'>,
  playerNames: Readonly<Record<string, string>> = {},
  pack: ContentPack = content,
): EventNames {
  return {
    boss: input.boss.name,
    creatures: Object.fromEntries(input.row.map((s) => [s.id, s.name])),
    players: playerNames,
    reactions: Object.fromEntries(pack.reactions.map((r) => [r.id, r.name])),
    gimmicks: Object.fromEntries(input.boss.gimmicks.map((g) => [g.id, g.name])),
    abilities: Object.fromEntries(pack.finaleAbilities.map((a) => [a.id, a.name])),
    marks: Object.fromEntries(pack.reactions.map((r) => [r.markElement, r.markName])),
    elements: Object.fromEntries(pack.elements.map((e) => [e.id, e.name])),
    adaptations: Object.fromEntries(pack.adaptations.map((a) => [a.id, a.name])),
  };
}

/** "A", "A and B", "A, B and C", and past `max` names "A, B, C and 4 more". */
function list(names: readonly string[], max = 4): string {
  if (names.length === 0) return 'nobody';
  if (names.length === 1) return names[0] as string;
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** " (front row)", " (front and middle rows)"; empty for no rows. */
function rowsText(rows: readonly string[] | undefined): string {
  if (rows === undefined || rows.length === 0) return '';
  return ` (${rows.join(' and ')} ${rows.length === 1 ? 'row' : 'rows'})`;
}

/** "+12%", "-5%", "+1.5%": basis points as a signed percentage. */
const signedPct = (bp: number): string => `${bp < 0 ? '-' : '+'}${Math.abs(bp) / 100}%`;

const lookup = (table: Readonly<Record<string, string>> | undefined, id: string): string =>
  table?.[id] ?? id;

/**
 * One plain-English line for an event, for the replay log and reports. Returns text only; callers
 * must render it as text (names can come from players).
 */
export function describeEvent(event: FightEvent, names: EventNames): string {
  const creature = (id: string) => lookup(names.creatures, id);
  const player = (id: string | null) => (id === null ? 'someone' : lookup(names.players, id));
  const mark = (element: string) => lookup(names.marks, element);
  const element = (e: string) => lookup(names.elements, e);
  switch (event.t) {
    case 'round_start':
      return `Round ${event.round}: ${names.boss} has ${event.bossHp} HP${
        event.mark === null ? '' : ` and is ${mark(event.mark)}`
      }.`;
    case 'support_buff':
      return `${creature(event.supporter)} powers up ${creature(event.target)} (+${event.bp / 100}% damage on its next hit).`;
    case 'ability': {
      const when = event.byDefault ? ' at its default time' : '';
      const ability = lookup(names.abilities, event.ability);
      const what =
        event.creature === undefined ? ability : `${creature(event.creature)}'s ${ability}`;
      const detail = [
        event.zone === undefined ? '' : ` on the ${event.zone} zone`,
        event.element === undefined ? '' : ` for ${element(event.element)}`,
      ].join('');
      return `${player(event.player)} uses ${what}${detail}${when}.`;
    }
    case 'adaptation':
      if (event.status === 'purged') {
        return `${names.boss}'s adaptation is purged.`;
      }
      if (event.status === 'restored') {
        return `${names.boss}'s adaptation returns.`;
      }
      if (event.target === null) return `${names.boss} has nothing to adapt to.`;
      return `${names.boss} ${
        event.status === 'active' ? 'resists' : 'will adapt to resist'
      } ${lookup(names.reactions, event.target) === event.target ? element(event.target) : lookup(names.reactions, event.target)} (${lookup(names.adaptations, event.rule)}).`;
    case 'turn':
      return `${creature(event.creature)} acts.`;
    case 'skip':
      return event.reason === 'haze'
        ? `${creature(event.creature)} is lost in the Morning Haze and misses its first turn.`
        : `${creature(event.creature)} is silenced and misses its turn.`;
    case 'hit':
      return `${
        event.ability === undefined
          ? creature(event.creature)
          : `${creature(event.creature)}'s ${lookup(names.abilities, event.ability)}`
      } hits ${names.boss} for ${event.damage}${event.crit === true ? ' (Critical!)' : ''}${
        event.setCrit === true ? ' (its gear set makes it a crit)' : ''
      }${event.warm === true ? ' (its gear set adds crit damage)' : ''}${
        event.matchupBp > 10_000
          ? ' (strong matchup)'
          : event.matchupBp < 10_000
            ? ' (weak matchup)'
            : ''
      }${event.sheetBp === undefined ? '' : ` (${signedPct(event.sheetBp)} from modifiers)`}; ${event.bossHp} HP left.`;
    case 'mark': {
      const sealed =
        event.sealed === true ? ' Its gear set seals the mark: no hit can replace it.' : '';
      return event.replaced === null
        ? `${event.creature === null ? player(event.player) : creature(event.creature)} leaves ${names.boss} ${mark(event.element)}.${sealed}`
        : `${event.creature === null ? player(event.player) : creature(event.creature)} replaces ${mark(event.replaced)} with ${mark(event.element)}.${sealed}`;
    }
    case 'reaction': {
      const mods =
        event.sheetBp === undefined ? '' : ` (${signedPct(event.sheetBp)} from modifiers)`;
      if (event.reflected) {
        return `${lookup(names.reactions, event.reaction)}! ${names.boss} reflects ${event.bonus} bonus damage onto ${creature(event.payoff)}${mods}.`;
      }
      const sets = `${event.proof === true ? ` Its gear set turns ${names.boss}'s reflection aside.` : ''}${
        event.chain === true ? ' Its gear set keeps the mark standing, so a chain can follow.' : ''
      }`;
      const brambles =
        event.bramble === undefined
          ? ''
          : ` Bramble Season throws ${event.bramble.amount} of it (${event.bramble.bp / 100}%) back at ${creature(event.payoff)}.`;
      return `${lookup(names.reactions, event.reaction)}! ${creature(event.payoff)} cashes in the mark${
        event.setupCreature === null ? '' : ` set by ${creature(event.setupCreature)}`
      } for ${event.bonus} bonus damage${mods}.${sets}${brambles}`;
    }
    case 'gimmick': {
      const name = lookup(names.gimmicks, event.gimmick);
      if (event.targets === undefined) return `${names.boss} uses ${name}.`;
      const who = list(event.targets.map(creature));
      // A charge's landing: the marks the announcement named that are still standing.
      return event.op === 'charge'
        ? `${name} lands${rowsText(event.rows)}: ${who} ${event.targets.length > 1 ? 'are' : 'is'} hit.`
        : `${names.boss} uses ${name}${rowsText(event.rows)} on ${who}.`;
    }
    case 'boss_hit': {
      const what =
        event.source === 'attack'
          ? 'attacks'
          : event.source === 'gimmick'
            ? 'strikes'
            : event.source === 'enrage'
              ? 'rages at'
              : 'reflects damage onto';
      const crit = event.crit === true ? ' Critical!' : '';
      const capped = event.capped === true ? ' The hit is capped.' : '';
      const cover =
        event.covered === undefined
          ? ''
          : ` ${creature(event.covered.guard)} covers ${event.covered.prevented} of it.`;
      const warded =
        event.warded === undefined || event.warded === 0
          ? ''
          : event.warded > 0
            ? ` Its modifiers take off ${event.warded}.`
            : ` Its modifiers add ${-event.warded}.`;
      const stubborn =
        event.stubborn === true
          ? ` Stubborn: ${creature(event.target)} refuses to fall and stays at 1 HP.`
          : '';
      const extra = `${cover}${warded}${crit}${capped}${stubborn}`;
      if (event.sidestep === true) {
        return `${creature(event.target)} sidesteps ${event.splash === true ? 'the splash' : `${names.boss}'s hit`} and takes nothing.`;
      }
      if (event.shielded === true) {
        return `${names.boss} ${what} ${creature(event.target)}, but a Shield Wall stops it.`;
      }
      if (event.splash === true) {
        return `${creature(event.target)} is caught in the splash for ${event.damage}.${extra}`;
      }
      if (event.reducedBp !== undefined) {
        return `${names.boss} ${what} ${creature(event.target)} for ${event.damage} (a Shield Wall softens it by ${event.reducedBp / 100}%).${extra}`;
      }
      if (event.from !== undefined) {
        return `${creature(event.target)} takes the hit meant for ${creature(event.from)} (${event.damage}).${extra}`;
      }
      return `${names.boss} ${what} ${creature(event.target)} for ${event.damage}.${extra}`;
    }
    case 'knockout':
      return `${creature(event.creature)} is knocked out.`;
    case 'silence':
      return `${creature(event.creature)} is silenced for ${event.turns} turn${event.turns === 1 ? '' : 's'}.`;
    case 'round_end':
      return `End of round ${event.round}: ${names.boss} has ${event.bossHp} HP.`;
    case 'heal':
      if (event.cause === 'second_wind') {
        return `${creature(event.target)} catches a second wind and recovers ${event.amount} HP.`;
      }
      if (event.cause === 'second_breath') {
        return `${creature(event.target)} takes a second breath and recovers ${event.amount} HP.`;
      }
      // A creature that heals itself (the Hollow Weave set) recovers; a Support mends a neighbour.
      return event.supporter === event.target
        ? `${creature(event.target)} recovers ${event.amount} HP from its gear set.`
        : `${creature(event.supporter)} mends ${creature(event.target)} (+${event.amount} HP).`;
    case 'sky_heal':
      return `Kind Rain mends ${list(
        event.heals.map((h) => `${creature(h.creature)} (+${h.amount} HP)`),
        6,
      )}.`;
    case 'proc': {
      const who = creature(event.creature);
      const other = event.target === undefined ? '' : creature(event.target);
      const pct = event.amount === undefined ? '' : `${event.amount / 100}%`;
      switch (event.kind) {
        case 'echo':
          return `Echo! ${who}'s hit lands again for ${event.amount ?? 0}; ${names.boss} has ${event.bossHp ?? 0} HP left.`;
        case 'steady_paws':
          return `Steady paws: ${who} shrugs off the silence.`;
        case 'warm_heart':
          return `Warm heart: ${who} gives ${other} a ${pct} boost on its next hit.`;
        case 'quick_remark':
          return `Quick re-mark: ${who} swaps the mark as a Setter would.`;
        case 'spill_over':
          return `Spill-over: ${who}'s reaction leaves its own mark behind.`;
        case 'payback':
          return `Payback: ${who} took the hit for a neighbour, so its next hit deals ${pct} more.`;
        case 'kindling':
          return `Kindling: ${who} starts ${other} with a ${pct} boost on its first hit.`;
        case 'opening_mark':
          return `Opening mark: ${who} marks ${names.boss} before the first blow.`;
        case 'rally_cry':
          return `Rally cry: ${other} has fallen, so ${who}'s hits deal ${pct} more from now on.`;
        case 'ember_tail':
          return `Ember tail: ${who}'s crit makes its next hit deal ${pct} more.`;
        case 'storm_warning':
          return `Storm warning: ${who} sees the charge coming and will take ${pct} less from it.`;
        case 'stubborn':
          return `Stubborn: ${who} stays on its feet at 1 HP.`;
        case 'last_stand':
          return `Last stand: ${who} is down to a quarter of its HP and takes ${pct} less from now on.`;
        case 'overflow':
          return `Overflow: ${who}'s reaction gives ${other} a ${pct} boost on its next hit.`;
        case 'patient':
          return `Patient: ${who} bides its time, so its next hit deals ${pct} more.`;
        case 'shared_warmth':
          return `Shared warmth: ${other}'s next boost is ${pct} bigger for healing ${who}.`;
        default:
          return '';
      }
    }
    case 'cleanse':
      return `${creature(event.supporter)} clears ${creature(event.target)}'s silence.`;
    case 'charge':
      return `${names.boss} gathers ${lookup(names.gimmicks, event.gimmick)}${rowsText(event.rows)}, aimed at ${list(event.marks.map(creature))}. It lands in round ${event.landing}.`;
    case 'retreat':
      return `${names.boss} reaches its limit at ${event.bossHp} HP and retreats, out of reach. The phase is over.`;
    case 'enrage':
      return event.first
        ? `Out of time: ${names.boss} is enraged!`
        : `${names.boss} is still enraged.`;
    default:
      // A stored fight from a newer engine can carry events this one does not know: skip them.
      return '';
  }
}
