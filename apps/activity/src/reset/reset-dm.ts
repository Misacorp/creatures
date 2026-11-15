/**
 * The goodbye DM as an embed, for judging it in the workbench (docs/design/reset.md, section 5). The worker builds the real
 * message (`apps/worker/src/reset/goodbye-dm.ts`); this previews it with a seeded sample player, with the same fields and
 * Discord's field limit. Inert.
 */
export const DM_FIELD_LIMIT = 1024;
export const DM_BOT_NAME = 'Leet Creatures';
export const DM_TITLE = 'You were one of the first settlers';
export const DM_DESCRIPTION =
  'The valley is starting over, and it will remember you. Here is what it keeps:';
/** The game's gold, as the worker sends it (`POST_COLOURS.won`). */
export const DM_COLOUR = '#f2b33d';
/** A feat value up to this long sits beside others in a row. */
const INLINE_MAX = 48;

interface Named {
  name: string;
  species: string;
  level: number;
}

export interface SettlerSample {
  firstOn: readonly string[];
  depth: number;
  blueprints: number;
  creatures: number;
  levels: number;
  highest: Named;
  crafter: Named;
  explorer: Named;
  /** Every creature's name, best first. */
  names: readonly string[];
}

/** The plan's example player: 42 creatures, 612 levels in all. Fixed, so the preview never changes. */
export const SAMPLE_SETTLER: SettlerSample = {
  firstOn: ['Mossling', 'Lanternfin'],
  depth: 18,
  blueprints: 31,
  creatures: 42,
  levels: 612,
  highest: { name: 'Pebbles', species: 'Mossling', level: 31 },
  crafter: { name: 'Ember', species: 'Ashmole', level: 9 },
  explorer: { name: 'Fizz', species: 'Lanternfin', level: 7 },
  names: [
    'Pebbles',
    'Ember',
    'Fizz',
    ...Array.from({ length: 39 }, (_, i) => `Settler ${String(i + 1)}`),
  ],
};

export interface DmField {
  name: string;
  value: string;
  inline: boolean;
}

function listOf(items: readonly string[]): string {
  const last = items[items.length - 1] ?? '';
  return items.length <= 1 ? last : `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** "Pebbles, Ember, Fizz and 39 more": as many names as fit in `room` characters. */
export function creatureValue(s: SettlerSample, room: number): string {
  for (let shown = s.names.length; shown > 0; shown--) {
    const rest = s.names.length - shown;
    const names = s.names.slice(0, shown);
    const value = rest === 0 ? listOf(names) : `${names.join(', ')} and ${String(rest)} more`;
    if (value.length <= room) return value;
  }
  return `${String(s.names.length)} in all`;
}

const the = (n: Named): string => `${n.name} the ${n.species}`;

/** The embed's fields: a short-named field per feat, then the creature names. */
export function dmFields(s: SettlerSample): DmField[] {
  const feat = (name: string, value: string): DmField => ({
    name,
    value,
    inline: value.length <= INLINE_MAX,
  });
  return [
    feat('First on the server', listOf(s.firstOn)),
    feat('Deepest dungeon', `Cleared depth ${String(s.depth)}`),
    feat(
      'Collection',
      `${String(s.creatures)} creatures · ${String(s.levels)} levels · ${String(s.blueprints)} blueprints`,
    ),
    feat('Highest level', `${the(s.highest)}, level ${String(s.highest.level)}`),
    feat('Best crafter', `${the(s.crafter)}, Crafting ${String(s.crafter.level)}`),
    feat('Best explorer', `${the(s.explorer)}, Explorer ${String(s.explorer.level)}`),
    { name: 'Your creatures', value: creatureValue(s, DM_FIELD_LIMIT), inline: false },
  ];
}
