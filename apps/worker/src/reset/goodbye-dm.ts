/**
 * The goodbye DM (`docs/design/reset.md`, section 5): one message per settler, built from the record, never sent from here.
 * Pure. Every player-typed string (nickname, display name) goes through the repo's `escapeMarkdown`/`safeName`, so markdown, mentions,
 * `@everyone` and channel links stay inert text; the body carries `allowed_mentions: { parse: [] }` so nothing can ping either.
 * It stays within Discord's 2,000 characters: the feats, then creature names until the limit, then "and N more".
 */
import { MAX_MESSAGE_CHARS, safeName, truncateMessage } from '../discord-format';
import type { FeatCreature, Settler } from './record-schema';

export interface DmBody {
  content: string;
  allowed_mentions: { parse: never[] };
}

/** A name in the text is cut to this many code points before it is escaped (nicknames are short already). */
const NAME_POINTS = 24;
/** Longest list of lines a feat line spells out before "and N more". */
const MAX_FIRSTS = 8;

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** "Pebbles the Mossling" for a nicknamed creature, "Mossling" for one without a nickname. */
function creatureTitle(c: FeatCreature): string {
  const species = safeName(c.speciesName, NAME_POINTS);
  const nick = c.nickname?.trim() ?? '';
  return nick === '' ? species : `${safeName(nick, NAME_POINTS)} the ${species}`;
}

/** The nickname, else the species name (the plain list at the end). */
function creatureName(nickname: string | null, speciesName: string): string {
  const nick = nickname?.trim() ?? '';
  return safeName(nick === '' ? speciesName : nick, NAME_POINTS);
}

function listWords(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

function firstsPart(firsts: string[]): string | null {
  if (firsts.length === 0) return null;
  const shown = firsts.slice(0, MAX_FIRSTS).map((n) => safeName(n, NAME_POINTS));
  const more = firsts.length - shown.length;
  const names = more > 0 ? `${shown.join(', ')} and ${String(more)} more` : listWords(shown);
  return `First ${names} on the server`;
}

/** The lines of the feats; a feat with nothing behind it is left out, and so is a line left empty. */
export function featLines(settler: Settler): string[] {
  const f = settler.feats;
  const join = (parts: (string | null)[]): string | null => {
    const kept = parts.filter((p): p is string => p !== null);
    return kept.length === 0 ? null : kept.join(' · ');
  };
  const lines = [
    join([
      firstsPart(f.firsts),
      f.deepestDepth === null ? null : `Cleared depth ${String(f.deepestDepth)}`,
      f.blueprints === 0
        ? null
        : `${String(f.blueprints)} ${plural(f.blueprints, 'blueprint', 'blueprints')}`,
    ]),
    join([
      f.creatures === 0
        ? null
        : `${String(f.creatures)} ${plural(f.creatures, 'creature', 'creatures')}, ${String(f.totalLevels)} ${plural(f.totalLevels, 'level', 'levels')} in all`,
      f.highestLevel === null
        ? null
        : `Highest: ${creatureTitle(f.highestLevel.creature)}, level ${String(f.highestLevel.level)}`,
    ]),
    join([
      f.bestCrafter === null
        ? null
        : `Best crafter: ${creatureTitle(f.bestCrafter.creature)}, Crafting ${String(f.bestCrafter.level)}`,
      f.bestExplorer === null
        ? null
        : `Best explorer: ${creatureTitle(f.bestExplorer.creature)}, Explorer ${String(f.bestExplorer.rank)}`,
    ]),
  ];
  return lines.filter((l): l is string => l !== null);
}

/** "Your creatures: A, B, C and 39 more", as many names as fit in `room` characters. Null when there are no creatures. */
function creatureLine(settler: Settler, room: number): string | null {
  const names = settler.creatures.map((c) => creatureName(c.nickname, c.speciesName));
  if (names.length === 0) return null;
  const prefix = 'Your creatures: ';
  const full = `${prefix}${listWords(names)}`;
  if (full.length <= room) return full;
  // The longest "and N more" this list can need, reserved while names are added.
  const reserve = ` and ${String(names.length)} more`.length;
  let used = prefix.length;
  const shown: string[] = [];
  for (const name of names) {
    const next = used + (shown.length === 0 ? 0 : 2) + name.length;
    if (next + reserve > room) break;
    shown.push(name);
    used = next;
  }
  const more = names.length - shown.length;
  if (shown.length === 0)
    return `${prefix}${String(more)} ${plural(more, 'creature', 'creatures')}`;
  return `${prefix}${shown.join(', ')} and ${String(more)} more`;
}

/** The DM body for one settler. Always at most 2,000 characters. */
export function goodbyeMessage(settler: Settler): DmBody {
  const head = [
    '**You were one of the first settlers.**',
    'The valley is starting over, and it will remember you. Here is what it keeps:',
  ];
  const lines = [...head, ...featLines(settler)];
  const base = lines.join('\n');
  // Room left for the creature line and its line break.
  const last = creatureLine(settler, MAX_MESSAGE_CHARS - base.length - 1);
  const content = last === null ? base : `${base}\n${last}`;
  return {
    // Cut as a last resort only: the lines above are capped, so a real record never reaches it.
    content: truncateMessage(content),
    allowed_mentions: { parse: [] },
  };
}
