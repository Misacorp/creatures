/**
 * The goodbye DM (`docs/design/reset.md`, section 5): one Discord embed per settler, built from the record, never sent from here.
 * Pure. Every player-typed string (nickname, display name) goes through the repo's `escapeMarkdown`/`safeName`, so markdown, mentions,
 * `@everyone` and channel links stay inert text; the body carries `allowed_mentions: { parse: [] }` so nothing can ping either.
 * It stays within Discord's embed limits: a field per feat, then a last field of creature names until its limit, then "and N more".
 * The body has the shape of a stored post (`PostMessage` in `discord-format.ts`: `embeds` and `components`), so the sender takes
 * `JSON.stringify(body)` as it is. No `content` text: the embed is the whole message.
 */
import {
  POST_COLOURS,
  safeName,
  truncateMessage,
  type EmbedField,
  type PostEmbed,
} from '../discord-format';
import type { FeatCreature, Settler } from './record-schema';

export interface DmBody {
  embeds: [PostEmbed];
  components: [];
  allowed_mentions: { parse: never[] };
}

export const EMBED_TITLE_LIMIT = 256;
export const EMBED_DESCRIPTION_LIMIT = 4096;
export const EMBED_FIELD_NAME_LIMIT = 256;
export const EMBED_FIELD_VALUE_LIMIT = 1024;
export const EMBED_MAX_FIELDS = 25;
/** The whole embed: title, description, field names and values. */
export const EMBED_TOTAL_LIMIT = 6000;

const TITLE = 'You were one of the first settlers';
const DESCRIPTION = 'The valley is starting over, and it will remember you. Here is what it keeps:';
/** The game's gold (`POST_COLOURS.won`). */
const COLOUR = POST_COLOURS.won;
/** A feat value up to this long sits beside others in a row. */
const INLINE_MAX = 48;

/** A name in the text is cut to this many code points before it is escaped (nicknames are short already). */
const NAME_POINTS = 24;
/** Longest list of lines the first feat spells out before "and N more". */
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

function firstsValue(firsts: string[]): string | null {
  if (firsts.length === 0) return null;
  const shown = firsts.slice(0, MAX_FIRSTS).map((n) => safeName(n, NAME_POINTS));
  const more = firsts.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${String(more)} more` : listWords(shown);
}

/** The feat fields, in order; a feat with nothing behind it is left out. */
export function featFields(settler: Settler): EmbedField[] {
  const f = settler.feats;
  const out: EmbedField[] = [];
  const add = (name: string, value: string | null): void => {
    if (value === null) return;
    out.push({
      name,
      value: truncateMessage(value, EMBED_FIELD_VALUE_LIMIT),
      inline: value.length <= INLINE_MAX,
    });
  };
  add('First on the server', firstsValue(f.firsts));
  add(
    'Deepest dungeon',
    f.deepestDepth === null ? null : `Cleared depth ${String(f.deepestDepth)}`,
  );
  const collection = [
    f.creatures === 0
      ? null
      : `${String(f.creatures)} ${plural(f.creatures, 'creature', 'creatures')}`,
    f.totalLevels === 0
      ? null
      : `${String(f.totalLevels)} ${plural(f.totalLevels, 'level', 'levels')}`,
    f.blueprints === 0
      ? null
      : `${String(f.blueprints)} ${plural(f.blueprints, 'blueprint', 'blueprints')}`,
  ].filter((p): p is string => p !== null);
  add('Collection', collection.length === 0 ? null : collection.join(' · '));
  add(
    'Highest level',
    f.highestLevel === null
      ? null
      : `${creatureTitle(f.highestLevel.creature)}, level ${String(f.highestLevel.level)}`,
  );
  add(
    'Best crafter',
    f.bestCrafter === null
      ? null
      : `${creatureTitle(f.bestCrafter.creature)}, Crafting ${String(f.bestCrafter.level)}`,
  );
  add(
    'Best explorer',
    f.bestExplorer === null
      ? null
      : `${creatureTitle(f.bestExplorer.creature)}, Explorer ${String(f.bestExplorer.rank)}`,
  );
  return out;
}

/** "A, B, C and 39 more", as many names as fit in `room` characters. Null when there are no creatures. */
function creatureValue(settler: Settler, room: number): string | null {
  const names = settler.creatures.map((c) => creatureName(c.nickname, c.speciesName));
  if (names.length === 0) return null;
  const full = listWords(names);
  if (full.length <= room) return full;
  // The longest "and N more" this list can need, reserved while names are added.
  const reserve = ` and ${String(names.length)} more`.length;
  let used = 0;
  const shown: string[] = [];
  for (const name of names) {
    const next = used + (shown.length === 0 ? 0 : 2) + name.length;
    if (next + reserve > room) break;
    shown.push(name);
    used = next;
  }
  const more = names.length - shown.length;
  if (shown.length === 0) return `${String(more)} ${plural(more, 'creature', 'creatures')}`;
  return `${shown.join(', ')} and ${String(more)} more`;
}

/** The characters Discord counts against the 6,000 of an embed. */
export function embedChars(embed: PostEmbed): number {
  return (
    embed.title.length +
    (embed.description?.length ?? 0) +
    embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) +
    (embed.footer?.text.length ?? 0) +
    (embed.author?.name.length ?? 0)
  );
}

/** The embed as plain text (title, description, "name: value" lines), for the dry run's preview. */
export function embedText(embed: PostEmbed): string {
  return [
    embed.title,
    ...(embed.description === undefined ? [] : [embed.description]),
    ...embed.fields.map((f) => `${f.name}: ${f.value}`),
  ].join('\n');
}

const CREATURES_NAME = 'Your creatures';

/** The DM body for one settler. Always within Discord's embed limits. */
export function goodbyeMessage(settler: Settler): DmBody {
  const fields = featFields(settler).slice(0, EMBED_MAX_FIELDS - 1);
  const embed: PostEmbed = {
    title: truncateMessage(TITLE, EMBED_TITLE_LIMIT),
    description: truncateMessage(DESCRIPTION, EMBED_DESCRIPTION_LIMIT),
    color: COLOUR,
    fields,
  };
  // Room the creature field may use: its own limit, and what is left of the whole embed.
  const roomOf = (): number =>
    Math.min(
      EMBED_FIELD_VALUE_LIMIT,
      EMBED_TOTAL_LIMIT - embedChars(embed) - CREATURES_NAME.length,
    );
  // Last resort: a real record never reaches it, but the whole embed must fit.
  while (fields.length > 0 && roomOf() < 1) fields.pop();
  const last = creatureValue(settler, roomOf());
  if (last !== null) {
    fields.push({
      name: truncateMessage(CREATURES_NAME, EMBED_FIELD_NAME_LIMIT),
      value: truncateMessage(last, roomOf()),
      inline: false,
    });
  }
  return { embeds: [embed], components: [], allowed_mentions: { parse: [] } };
}
