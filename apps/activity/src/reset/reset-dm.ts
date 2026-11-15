/**
 * The goodbye DM's layouts, for judging them in the workbench (docs/design/reset.md, section 5). The worker
 * builds the real message; this previews two layouts with a seeded sample player. Plain Discord markdown, at
 * most 2,000 characters. Inert.
 */
export const DM_LIMIT = 2000;
export const DM_BOT_NAME = 'Leet Creatures';

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

export const DM_LAYOUTS = ['A', 'B'] as const;
export type DmLayout = (typeof DM_LAYOUTS)[number];

function listOf(items: readonly string[]): string {
  const last = items[items.length - 1] ?? '';
  return items.length <= 1 ? last : `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** "Your creatures: Pebbles, Ember, Fizz and 39 more": as many names as fit in `room` characters. */
export function creatureLine(s: SettlerSample, room: number): string {
  for (let shown = s.names.length; shown > 0; shown--) {
    const rest = s.names.length - shown;
    const names = s.names.slice(0, shown);
    const line =
      rest === 0
        ? `Your creatures: ${listOf(names)}`
        : `Your creatures: ${names.join(', ')} and ${String(rest)} more`;
    if (line.length <= room) return line;
  }
  return `Your creatures: ${String(s.names.length)} in all`;
}

const HEAD = '**You were one of the first settlers.**';
const INTRO = 'The valley is starting over, and it will remember you. Here is what it keeps:';

const the = (n: Named): string => `${n.name} the ${n.species}`;

/** Layout A, the plan's draft as it is: the feats on three lines, then the creature names. */
export function dmLayoutA(s: SettlerSample): string {
  const top = [
    HEAD,
    INTRO,
    `First ${listOf(s.firstOn)} on the server · Cleared depth ${String(s.depth)} · ${String(s.blueprints)} blueprints`,
    `${String(s.creatures)} creatures, ${String(s.levels)} levels in all · Highest: ${the(s.highest)}, level ${String(s.highest.level)}`,
    `Best crafter: ${the(s.crafter)}, Crafting ${String(s.crafter.level)} · Best explorer: ${the(s.explorer)}, Explorer ${String(s.explorer.level)}`,
  ].join('\n');
  return `${top}\n${creatureLine(s, DM_LIMIT - top.length - 1)}`;
}

/** Layout B, tighter: one line of headline feats, one of the best three, then the creature list. */
export function dmLayoutB(s: SettlerSample): string {
  const top = [
    HEAD,
    INTRO,
    `${String(s.creatures)} creatures · ${String(s.levels)} levels · Cleared depth ${String(s.depth)} · ${String(s.blueprints)} blueprints · First ${listOf(s.firstOn)} on the server`,
    `Best: ${the(s.highest)} (level ${String(s.highest.level)}), ${the(s.crafter)} (Crafting ${String(s.crafter.level)}), ${the(s.explorer)} (Explorer ${String(s.explorer.level)})`,
  ].join('\n');
  return `${top}\n\n${creatureLine(s, DM_LIMIT - top.length - 2)}`;
}

/** The message of a layout. */
export function dmText(layout: DmLayout, s: SettlerSample = SAMPLE_SETTLER): string {
  return layout === 'A' ? dmLayoutA(s) : dmLayoutB(s);
}
