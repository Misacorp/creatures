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
      return `${creature(event.creature)} is silenced and misses its turn.`;
    case 'hit':
      return `${
        event.ability === undefined
          ? creature(event.creature)
          : `${creature(event.creature)}'s ${lookup(names.abilities, event.ability)}`
      } hits ${names.boss} for ${event.damage}${event.crit === true ? ' (Critical!)' : ''}${
        event.matchupBp > 10_000
          ? ' (strong matchup)'
          : event.matchupBp < 10_000
            ? ' (weak matchup)'
            : ''
      }; ${event.bossHp} HP left.`;
    case 'mark':
      return event.replaced === null
        ? `${event.creature === null ? player(event.player) : creature(event.creature)} leaves ${names.boss} ${mark(event.element)}.`
        : `${event.creature === null ? player(event.player) : creature(event.creature)} replaces ${mark(event.replaced)} with ${mark(event.element)}.`;
    case 'reaction':
      return event.reflected
        ? `${lookup(names.reactions, event.reaction)}! ${names.boss} reflects ${event.bonus} bonus damage onto ${creature(event.payoff)}.`
        : `${lookup(names.reactions, event.reaction)}! ${creature(event.payoff)} cashes in the mark${
            event.setupCreature === null ? '' : ` set by ${creature(event.setupCreature)}`
          } for ${event.bonus} bonus damage.`;
    case 'gimmick':
      return `${names.boss} uses ${lookup(names.gimmicks, event.gimmick)}.`;
    case 'boss_hit': {
      const what =
        event.source === 'attack'
          ? 'attacks'
          : event.source === 'gimmick'
            ? 'strikes'
            : 'reflects damage onto';
      const crit = event.crit === true ? ' Critical!' : '';
      if (event.shielded === true) {
        return `${names.boss} ${what} ${creature(event.target)}, but a Shield Wall stops it.`;
      }
      if (event.reducedBp !== undefined) {
        return `${names.boss} ${what} ${creature(event.target)} for ${event.damage} (a Shield Wall softens it by ${event.reducedBp / 100}%).${crit}`;
      }
      if (event.from !== undefined) {
        return `${creature(event.target)} takes the hit meant for ${creature(event.from)} (${event.damage}).${crit}`;
      }
      return `${names.boss} ${what} ${creature(event.target)} for ${event.damage}.${crit}`;
    }
    case 'knockout':
      return `${creature(event.creature)} is knocked out.`;
    case 'silence':
      return `${creature(event.creature)} is silenced for ${event.turns} turn${event.turns === 1 ? '' : 's'}.`;
    case 'round_end':
      return `End of round ${event.round}: ${names.boss} has ${event.bossHp} HP.`;
    case 'heal':
      return `${creature(event.supporter)} mends ${creature(event.target)} (+${event.amount} HP).`;
    case 'cleanse':
      return `${creature(event.supporter)} clears ${creature(event.target)}'s silence.`;
    case 'charge':
      return `${names.boss} winds up ${lookup(names.gimmicks, event.gimmick)}: it lands next round.`;
    case 'retreat':
      return `${names.boss} is out of reach and retreats.`;
    case 'enrage':
      return event.first ? `Out of time: ${names.boss} is enraged!` : `${names.boss} is still enraged.`;
    default:
      // A stored fight from a newer engine can carry events this one does not know: skip them.
      return '';
  }
}
