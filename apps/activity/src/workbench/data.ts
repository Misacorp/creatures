/**
 * Fixture data for the workbench pages: lists to pick from (species, elements, parts, icons...)
 * taken from the shipped content, and a sample raid week for the pages that need a whole view.
 * Nothing here calls the API.
 */
import {
  PART_KINDS,
  content,
  expeditionContent,
  gearContent,
  weatherDef,
  weatherLines,
} from '@creatures/game';
import type { CreatureInfo } from '../creature-info';
import type { Resident } from '../room-data';
import raidFestival from '../fixtures/raid-festival.json';
import type { GearRarity, PartKind } from '../gear-types';
import type { WornItem } from '../gear-view';
import { BUNDLED_GLYPHS } from '../glyphs';
import type { IconRef } from '../icon-ref';
import { parseRaidView, type RaidView } from '../raid-api';
import {
  BUNDLED_BANNER_SPRITES,
  BUNDLED_BOSS_SPRITES,
  BUNDLED_CREATURE_SPRITES,
} from '../sprites/creature-sprites';
import type { SpriteDef } from '../sprites/sprite-data';
import type { Forecast, WeatherDay, WeatherEntry } from '../weather-types';

export const SPECIES_IDS: readonly string[] = content.creatures.map((c) => c.id);
export const ELEMENT_IDS: readonly string[] = content.elements.map((e) => e.id);
export const ROLE_IDS: readonly string[] = ['setter', 'payoff', 'support', 'guard'];
export const BOSS_IDS: readonly string[] = content.bosses.map((b) => b.id);
export const DESTINATION_IDS: readonly string[] = expeditionContent.destinations.map((d) => d.id);
export const SUPPLY_IDS: readonly string[] = expeditionContent.supplies.map((s) => s.id);
export const GEAR_BASE_IDS: readonly string[] = gearContent.bases.map((b) => b.id);
export const PARTS: readonly PartKind[] = PART_KINDS;
/** Festival is a base (a look and a line of its own), not a rarity: the Festival presets pick its base. */
export const RARITIES: readonly GearRarity[] = ['common', 'rare', 'epic'];
export const GLYPH_IDS: readonly string[] = Object.keys(BUNDLED_GLYPHS);

/** "None" in a select; the one word every optional select uses. */
export const NONE = 'none';

/** A few glossary entries a tag can open (the ids of the shipped glossary). */
export const GLOSSARY_SAMPLE: readonly string[] = [
  NONE,
  'festival',
  'boss-rank',
  'shiny',
  'blueprint',
  'essence',
  'bait',
  'landmark',
  'streak',
  'push-on',
  'gear',
  'crit',
];

/** The icons a count badge or a game icon can show, by the name the page offers. */
export const ICONS: Readonly<Record<string, IconRef>> = {
  'glyph: bait': { kind: 'glyph', id: 'bait' },
  'glyph: gem': { kind: 'glyph', id: 'gem' },
  'glyph: orb': { kind: 'glyph', id: 'orb' },
  'glyph: flag': { kind: 'glyph', id: 'flag' },
  'glyph: star': { kind: 'glyph', id: 'star' },
  'glyph: clock': { kind: 'glyph', id: 'clock' },
  'glyph: skull': { kind: 'glyph', id: 'skull' },
  'glyph: blueprint': { kind: 'glyph', id: 'blueprint' },
  'glyph: unknown (the fallback)': { kind: 'glyph', id: 'unknown' },
  'supply: lure': { kind: 'supply', id: 'lure' },
  'supply: map-scrap': { kind: 'supply', id: 'map-scrap' },
  'supply: lantern': { kind: 'supply', id: 'lantern' },
  'supply: satchel': { kind: 'supply', id: 'satchel' },
  'part: scrap': { kind: 'part', part: 'scrap' },
  'part: tide-shard': { kind: 'part', part: 'tide-shard' },
  'part: ember-shard': { kind: 'part', part: 'ember-shard' },
  'part: grove-shard': { kind: 'part', part: 'grove-shard' },
  'part: spark-shard': { kind: 'part', part: 'spark-shard' },
  'part: mire-shard': { kind: 'part', part: 'mire-shard' },
  'part: glimmer': { kind: 'part', part: 'glimmer' },
  'gear: trail-charm': { kind: 'gear', baseId: 'trail-charm' },
  'gear: kelp-cap': { kind: 'gear', baseId: 'kelp-cap' },
  'gear: ember-muffler': { kind: 'gear', baseId: 'ember-muffler' },
  'element: tide': { kind: 'element', element: 'tide' },
  'element: ember': { kind: 'element', element: 'ember' },
  'element: grove': { kind: 'element', element: 'grove' },
  'element: spark': { kind: 'element', element: 'spark' },
  'element: mire': { kind: 'element', element: 'mire' },
};
export const ICON_NAMES: readonly string[] = Object.keys(ICONS);
const FALLBACK_ICON: IconRef = { kind: 'glyph', id: 'unknown' };

export function iconOf(name: string): IconRef {
  return ICONS[name] ?? FALLBACK_ICON;
}

/** What the creature popover needs for a species (its element and role come from the content). */
export function creatureInfoFor(species: string, name: string, level: number): CreatureInfo {
  const def = content.creatures.find((c) => c.id === species);
  return {
    name,
    species,
    level,
    element: def?.element ?? 'tide',
    role: def?.role ?? 'setter',
  };
}

/** The display name of a species (its id when it is not in the content). */
export function speciesLabel(species: string): string {
  return content.creatures.find((c) => c.id === species)?.name ?? species;
}

/** Every sprite the Sprite page can draw, by the name the page offers. */
export const SPRITES: Readonly<Record<string, SpriteDef>> = {
  ...Object.fromEntries(
    Object.entries(BUNDLED_CREATURE_SPRITES).map(([id, sprite]) => [`creature: ${id}`, sprite]),
  ),
  ...Object.fromEntries(
    Object.entries(BUNDLED_BOSS_SPRITES).map(([id, sprite]) => [`boss: ${id}`, sprite]),
  ),
  ...Object.fromEntries(
    Object.entries(BUNDLED_BANNER_SPRITES).map(([id, sprite]) => [`banner: ${id}`, sprite]),
  ),
};
export const SPRITE_NAMES: readonly string[] = Object.keys(SPRITES);

/** The sample raid week (a Festival week of the test fixtures), parsed like a server answer. */
export const SAMPLE_RAID: RaidView = parseRaidView(raidFestival);

/** The user id of "you" in the living room fixtures. */
export const ROOM_SELF_ID = '100000000000000001';

const ROOM_NAMES = [
  'You',
  'Aino',
  'Bo',
  'Cass',
  'Dev',
  'Eero',
  'Fay',
  'Gus',
  'Hana',
  'Ilkka',
  'Jun',
  'Kira',
  'Lumi',
  'Milo',
  'Noor',
  'Onni',
  'Pia',
  'Quin',
  'Rae',
  'Sami',
  'Tuuli',
  'Ugo',
  'Vera',
  'Wren',
];

/** How the fixture residents claim spots: nobody, or three on the couch middle and two on the pouf. */
export type RoomClaims = 'none' | 'collide';

/**
 * Sets claims on the fixture residents (by position in the list; absent ones are skipped). With
 * `collide` the older claim wins each spot: of the three on `couch-middle` the second resident
 * (at 1000) keeps it and "You" (at 3000) falls back, and of the two on `fire-pouf` the fifth wins.
 */
export function withClaims(residents: readonly Resident[], claims: RoomClaims): Resident[] {
  if (claims === 'none') return [...residents];
  const table: readonly (readonly [number, string, number])[] = [
    [1, 'couch-middle', 1000],
    [2, 'couch-middle', 2000],
    [0, 'couch-middle', 3000],
    [3, 'fire-pouf', 1500],
    [4, 'fire-pouf', 1200],
  ];
  return residents.map((resident, i) => {
    const claim = table.find(([index]) => index === i);
    return claim === undefined ? resident : { ...resident, spot: { id: claim[1], at: claim[2] } };
  });
}

/** The worn items of fixture resident `i`: most wear a hat, some more, every third nothing. */
function sampleWorn(i: number): WornItem[] {
  if (i % 3 === 1) return [];
  const slots = (['hat', 'scarf', 'charm'] as const).slice(0, 1 + (i % 3));
  return slots.flatMap((slot, k) => {
    const bases = gearContent.bases.filter((b) => b.slot === slot);
    const base = bases[(i + k) % bases.length];
    if (base === undefined) return [];
    return [
      {
        baseId: base.id,
        slot,
        rarity: RARITIES[(i + k) % RARITIES.length] ?? 'common',
        itemLevel: 2 + ((i * 3 + k) % 10),
        lines: ['Attack +3%', 'Tide Hunter +5%'],
      },
    ];
  });
}

/**
 * Fixture residents of the living room: "You" first, then others, each with a different species, now
 * and then shiny or nicknamed, most wearing some gear (tap one for the popover's worn-item lines). With `oneBusy`, the second resident has all creatures out working (no creature).
 */
export function sampleResidents(count: number, oneBusy: boolean): Resident[] {
  return Array.from({ length: count }, (_, i) => {
    const species = SPECIES_IDS[(i * 5) % SPECIES_IDS.length] ?? 'cindle';
    return {
      userId: String(100000000000000001n + BigInt(i)),
      name: ROOM_NAMES[i % ROOM_NAMES.length] ?? `Player ${String(i + 1)}`,
      spot: null,
      creature:
        oneBusy && i === 1
          ? null
          : {
              id: `room-creature-${String(i)}`,
              species,
              shiny: i % 7 === 3,
              level: 3 + ((i * 7) % 25),
              nickname: i % 4 === 2 ? `${speciesLabel(species)} Jr` : null,
              quirk: null,
              craftingLevel: 1 + (i % 4),
              explorerRank: 1 + (i % 3),
              gear: sampleWorn(i),
            },
    };
  });
}

// --- The valley's sky ---

/** The states of the sky the weather pages can show; "loading" is the blank calendar page. */
export const SKY_STATES = [
  'loading',
  'boon only',
  'boon and omen',
  'wild omen tomorrow',
  'rank 14 (strong)',
  'kind rain and morning haze',
  'bramble season (rank 6)',
] as const;
export type SkyState = (typeof SKY_STATES)[number];

const SKY_START = 1_800_000_000_000;
const DAY_MS = 86_400_000;

/** A Boon or Omen as the server writes it, from the shipped content, at a strength (10000 is x1). */
function skyEntry(id: string, strengthBp: number): WeatherEntry {
  const def = weatherDef(id);
  if (def === undefined) throw new Error(`the workbench sky names unknown "${id}"`);
  const lines = weatherLines(id, strengthBp);
  return {
    id,
    name: def.name,
    flavor: def.flavor,
    bubbles: [...def.bubbles],
    fight: lines.fight,
    trips: lines.trips,
  };
}

function skyDay(
  index: number,
  boon: [string, number],
  omen: [string, number] | null,
  wild = false,
): WeatherDay {
  return {
    day: `2027-01-${String(13 + index)}`,
    startsAt: SKY_START + index * DAY_MS,
    endsAt: SKY_START + (index + 1) * DAY_MS,
    boon: skyEntry(...boon),
    omen: omen === null ? null : skyEntry(...omen),
    wild,
  };
}

/** The forecast of a state of the sky; null is "no forecast yet". Built from the real content and numbers. */
export function sampleForecast(state: string): Forecast | null {
  switch (state) {
    case 'boon only':
      return {
        today: skyDay(0, ['fair-winds', 10_000], null),
        tomorrow: skyDay(1, ['market-day', 10_000], null),
      };
    case 'boon and omen':
      return {
        today: skyDay(0, ['fair-winds', 12_500], ['static-sky', 15_000]),
        tomorrow: skyDay(1, ['market-day', 12_500], ['cold-snap', 15_000]),
      };
    case 'wild omen tomorrow':
      return {
        today: skyDay(0, ['quiet-night', 15_000], ['heatwave', 20_000]),
        tomorrow: skyDay(1, ['hearty-breakfast', 15_000], ['stormfront', 20_000], true),
      };
    case 'rank 14 (strong)':
      return {
        today: skyDay(0, ['high-water', 15_000], ['long-shadows', 25_000]),
        tomorrow: skyDay(1, ['bonfire-night', 15_000], ['muddy-roads', 25_000]),
      };
    case 'kind rain and morning haze':
      return {
        today: skyDay(0, ['kind-rain', 12_500], ['morning-haze', 15_000]),
        tomorrow: skyDay(1, ['clear-skies', 12_500], ['static-sky', 15_000]),
      };
    case 'bramble season (rank 6)':
      return {
        today: skyDay(0, ['lantern-light', 12_500], ['bramble-season', 15_000]),
        tomorrow: skyDay(1, ['kind-rain', 12_500], ['morning-haze', 15_000]),
      };
    default:
      return null;
  }
}
