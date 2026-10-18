/**
 * The shipped glossary and How to play text, validated at module load, plus the pure helpers the
 * Activity uses: entry ids for every kind of content, the popover of an ability, and the coverage
 * check that makes a piece of content without a glossary entry a test failure.
 */
import { content } from './content';
import { dungeonContent, dungeonEvents, dungeonKeepsakes } from './content/dungeon';
import { gearContent } from './content/gear';
import { GOAL_RISKS, SUPPLY_KINDS } from './content/expedition-schema';
import { GEAR_RARITIES, GEAR_SLOTS } from './content/gear-schema';
import glossaryJson from './content/data/glossary.json';
import howToPlayJson from './content/data/how-to-play.json';
import {
  loadGlossary,
  loadHowToPlay,
  type Glossary,
  type GlossaryEntry,
  type GlossarySection,
  type GlossaryVisual,
} from './content/glossary-schema';
import {
  EffectSchema,
  GimmickSchema,
  RoleSchema,
  TurnOrderSchema,
  ZoneSchema,
  type ContentPack,
  type FinaleAbilityDef,
} from './content/schema';
import { JOB_KINDS, PART_KINDS } from './rules/gear';
import { READINESS_BANDS } from './rules/progression';

/** One entry for every gear line, written from the line's own content so the words stay true. */
function gearLineEntries(): unknown[] {
  return gearContent.lines.map((line) => ({
    id: `gear-line-${line.id}`,
    title: line.name,
    short: line.about,
    lines: [],
    section: 'gear',
  }));
}

/** The roles' names for the "only a Guard can wear these" line of a role set. */
const ROLE_NAMES: Readonly<Record<string, string>> = {
  setter: 'Setter',
  payoff: 'Payoff',
  support: 'Support',
  guard: 'Guard',
};

/**
 * One entry for every gear set, written from the set's own content so the numbers stay true: what two
 * and three pieces give, and who can wear it.
 */
function gearSetEntries(): unknown[] {
  return gearContent.sets.map((set) => ({
    id: `gear-set-${set.id}`,
    title: set.name,
    short: 'A Hat, a Scarf and a Charm worn by one creature.',
    lines: [
      `2 pieces: ${set.two.text}.`,
      `3 pieces: ${set.three.text}`,
      set.tag === 'festival'
        ? 'Won by clearing a Festival finale. It cannot be crafted.'
        : ROLE_NAMES[set.tag] !== undefined
          ? `Only a ${ROLE_NAMES[set.tag] as string} can wear these pieces.`
          : 'Any creature can wear these pieces.',
    ],
    section: 'gear',
  }));
}

export const glossary: Glossary = loadGlossary(
  [...(glossaryJson as unknown[]), ...gearLineEntries(), ...gearSetEntries()],
  content,
);
export const howToPlay = loadHowToPlay(howToPlayJson, content);

const BY_ID = new Map<string, GlossaryEntry>(glossary.map((e) => [e.id, e]));

/** One glossary entry by id, or undefined. */
export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

const kebab = (id: string): string => id.replaceAll('_', '-');

/**
 * The glossary id of each kind of content. Elements, roles and so on use the content's own ids, so
 * a new element (or reaction, role, gimmick op, zone, turn order, readiness band) needs one entry
 * with the matching id, which `glossaryGaps` checks.
 */
export const GLOSSARY_IDS = {
  element: (id: string): string => `element-${id}`,
  role: (id: string): string => `role-${id}`,
  mark: (markId: string): string => `mark-${markId}`,
  reaction: (id: string): string => `reaction-${id}`,
  /** `op` is a gimmick op such as `hit_zone`. */
  gimmick: (op: string): string => `gimmick-${kebab(op)}`,
  zone: (zone: string): string => `zone-${zone}`,
  /** `order` is a turn order such as `left_to_right`. */
  turnOrder: (order: string): string => `turn-${kebab(order)}`,
  /** `band` is a readiness band such as `long_shot`. */
  readiness: (band: string): string => `readiness-${kebab(band)}`,
  /** The kind of effect an ability has, such as `shield_wall`. */
  abilityEffect: (op: string): string => `ability-${kebab(op)}`,
  /** A gear slot such as `scarf`. */
  gearSlot: (slot: string): string => `gear-slot-${slot}`,
  /** A gear line such as `tide-attunement`. */
  gearLine: (id: string): string => `gear-line-${id}`,
  /** A gear set such as `tidepool-finery`. */
  gearSet: (id: string): string => `gear-set-${id}`,
  /** What a base's tag means on an item: an element (`ember`: its lines lean Ember), a role or `explorer`. */
  gearTag: (tag: string): string => `gear-tag-${tag}`,
  /** What an element means on a boss or a floor boss (`ember`: who hits it hardest). */
  bossElement: (element: string): string => `boss-element-${element}`,
  /** What an element means on an expedition place (`ember`: who lives there, what is found). */
  placeElement: (element: string): string => `place-element-${element}`,
  /** A gear rarity such as `epic`. */
  gearRarity: (rarity: string): string => `gear-rarity-${rarity}`,
  /** A part kind such as `tide-shard`. */
  part: (kind: string): string => `part-${kind}`,
  /** A workshop job kind such as `craft`. */
  job: (kind: string): string => `job-${kind}`,
  /** A skill; there is one, `crafting`. */
  skill: (skill: string): string => `skill-${skill}`,
  /** A dungeon room modifier such as `flooded`. */
  modifier: (id: string): string => `modifier-${id}`,
  /** A dungeon keepsake such as `wayfarer-charm`. */
  keepsake: (id: string): string => `keepsake-${id}`,
  /** A dungeon mystery-room event such as `glowing-pool`. */
  event: (id: string): string => `event-${id}`,
  /** A kind of supply such as `map-scrap` (its tiers share the entry). */
  supply: (kind: string): string => `supply-${kind}`,
  /** A push-on goal's risk, `safe` or `risky`. */
  goal: (risk: string): string => `goal-${risk}`,
} as const;

/** Entries that are not tied to one piece of content: the game's own words. */
export const FIXED_GLOSSARY_IDS = [
  'auto-fire',
  'creature-ability',
  'basic-ability',
  'boss-rank',
  'festival',
  'season',
  'readiness',
  'adaptation',
  'essence',
  'bait',
  'experience',
  'treat',
  'ribbon',
  'level',
  'crit',
  'fusion',
  'talent',
  'golden-talent',
  'talent-book',
  'duplicate-choice',
  'evolution',
  'rarity',
  'shiny',
  'away',
  'first-on-server',
  'gear',
  'gear-item-level',
  'gear-tier',
  'gear-tag',
  'gear-stat',
  'gear-local',
  'gear-festival',
  'gear-set',
  'gear-position',
  'gear-chance',
  'gear-trigger',
  'workshop',
  'blueprint',
  'dungeon',
  'dungeon-row',
  'dungeon-map',
  'dungeon-camp',
  'dungeon-pack',
  'keepsake',
  'elite',
  'mystery-room',
  'cache',
  'undercroft',
  'carved-door',
  'cracked-floor',
  'epic-fight',
  'depth',
  'room-modifiers',
  'floor-boss',
  'landmark',
  'streak',
  'explorer-rank',
  'familiarity',
  'deep-area',
  'push-on',
  'supplies',
  'journal',
  'journal-set',
  'weekly-special',
  'expedition-slot',
  'milestone',
  'destination',
  'boon',
  'omen',
  'forecast',
] as const;

/** What a popover shows. An entry is one; an ability is built from its content (`abilityView`). */
export interface GlossaryView {
  id: string;
  title: string;
  short: string;
  lines: readonly string[];
  visual?: GlossaryVisual | undefined;
  section: GlossarySection;
}

/** The glossary ids an ability's popover is built from: one for each effect, and its kind. */
export function abilityEntryIds(def: Pick<FinaleAbilityDef, 'kind' | 'effects'>): string[] {
  const ids = def.effects.map((e) => GLOSSARY_IDS.abilityEffect(e.op));
  ids.push(def.kind === 'creature' ? 'creature-ability' : 'basic-ability');
  return [...new Set(ids)];
}

/**
 * The popover of a finale ability: its own name and effect line from the content (so the numbers
 * are always the real ones) and nothing under it (Misa, 2026-10-14: popups show only the
 * description). The picture is the first effect's. The effect and kind entries still have to exist
 * (the coverage check). Undefined if the ability is not in the content or an entry is missing.
 */
export function abilityView(
  abilityId: string,
  pack: ContentPack = content,
  entries: ReadonlyMap<string, GlossaryEntry> = BY_ID,
): GlossaryView | undefined {
  const def = pack.finaleAbilities.find((a) => a.id === abilityId);
  if (def === undefined) return undefined;
  const parts: GlossaryEntry[] = [];
  for (const id of abilityEntryIds(def)) {
    const entry = entries.get(id);
    if (entry === undefined) return undefined;
    parts.push(entry);
  }
  const first = parts[0];
  return {
    id: `ability:${def.id}`,
    title: def.name,
    short: def.description,
    lines: [],
    ...(first?.visual === undefined ? {} : { visual: first.visual }),
    section: def.kind === 'creature' ? 'creatures' : 'finale',
  };
}

/** A glossary entry as a popover view. */
export function entryView(id: string): GlossaryView | undefined {
  return BY_ID.get(id);
}

const GIMMICK_OPS: readonly string[] = GimmickSchema.options.map((o) => o.entries.op.literal);
const EFFECT_OPS: readonly string[] = EffectSchema.options.map((o) => o.entries.op.literal);

/**
 * The ids of glossary entries that `pack` needs, with a reason, for the coverage check. Every
 * element, role, mark, reaction, gimmick op (every op the schema allows, so adding one to the
 * engine needs an entry, and every op a boss uses), zone, turn order, readiness band, ability
 * effect and ability, plus the fixed entries.
 */
export function requiredGlossaryIds(pack: ContentPack): string[] {
  const ids: string[] = [];
  for (const e of pack.elements) ids.push(GLOSSARY_IDS.element(e.id));
  for (const role of RoleSchema.options) ids.push(GLOSSARY_IDS.role(role));
  for (const r of pack.reactions)
    ids.push(GLOSSARY_IDS.mark(r.markId), GLOSSARY_IDS.reaction(r.id));
  const ops = new Set<string>(GIMMICK_OPS);
  for (const boss of pack.bosses) for (const g of boss.gimmicks) ops.add(g.op);
  for (const foe of dungeonContent.foes) for (const g of foe.gimmicks) ops.add(g.op);
  for (const m of dungeonContent.modifiers) {
    for (const e of m.effects) if (e.op === 'foe_gimmick') ops.add(e.gimmick.op);
  }
  for (const op of ops) ids.push(GLOSSARY_IDS.gimmick(op));
  for (const zone of ZoneSchema.options) ids.push(GLOSSARY_IDS.zone(zone));
  for (const order of TurnOrderSchema.options) ids.push(GLOSSARY_IDS.turnOrder(order));
  for (const band of READINESS_BANDS) ids.push(GLOSSARY_IDS.readiness(band));
  const effects = new Set<string>(EFFECT_OPS);
  for (const a of pack.finaleAbilities) for (const e of a.effects) effects.add(e.op);
  for (const op of effects) ids.push(GLOSSARY_IDS.abilityEffect(op));
  for (const a of pack.finaleAbilities) ids.push(...abilityEntryIds(a));
  // Gear: every slot, line, rarity, part kind and job kind the rules know, and the Crafting skill.
  for (const slot of GEAR_SLOTS) ids.push(GLOSSARY_IDS.gearSlot(slot));
  for (const line of gearContent.lines) ids.push(GLOSSARY_IDS.gearLine(line.id));
  for (const set of gearContent.sets) ids.push(GLOSSARY_IDS.gearSet(set.id));
  for (const rarity of GEAR_RARITIES) ids.push(GLOSSARY_IDS.gearRarity(rarity));
  // An element means something else on a creature, an item, a boss and a place: one entry each.
  for (const e of pack.elements) {
    ids.push(
      GLOSSARY_IDS.gearTag(e.id),
      GLOSSARY_IDS.bossElement(e.id),
      GLOSSARY_IDS.placeElement(e.id),
    );
  }
  for (const base of gearContent.bases) {
    if (base.tag !== 'neutral') ids.push(GLOSSARY_IDS.gearTag(base.tag));
  }
  for (const kind of PART_KINDS) ids.push(GLOSSARY_IDS.part(kind));
  for (const kind of JOB_KINDS) ids.push(GLOSSARY_IDS.job(kind));
  ids.push(GLOSSARY_IDS.skill('crafting'));
  // The daily dungeon: one entry for every room modifier, keepsake and event, plus its fixed terms.
  for (const m of dungeonContent.modifiers) ids.push(GLOSSARY_IDS.modifier(m.id));
  // And one for every keepsake and every mystery-room event.
  for (const k of dungeonKeepsakes) ids.push(GLOSSARY_IDS.keepsake(k.id));
  for (const e of dungeonEvents) ids.push(GLOSSARY_IDS.event(e.id));
  // Expeditions: every kind of supply and each risk of a push-on goal.
  for (const kind of SUPPLY_KINDS) ids.push(GLOSSARY_IDS.supply(kind));
  for (const risk of GOAL_RISKS) ids.push(GLOSSARY_IDS.goal(risk));
  ids.push(...FIXED_GLOSSARY_IDS);
  return [...new Set(ids)];
}

/**
 * What is missing: every id `requiredGlossaryIds` lists that has no entry, and every ability whose
 * popover cannot be built. Empty when the glossary covers the content. A test fails on anything
 * here, so content added without an entry cannot ship.
 */
export function glossaryGaps(
  entries: readonly GlossaryEntry[],
  pack: ContentPack = content,
): string[] {
  const have = new Map(entries.map((e) => [e.id, e]));
  const gaps = requiredGlossaryIds(pack).filter((id) => !have.has(id));
  for (const a of pack.finaleAbilities) {
    if (abilityView(a.id, pack, have) === undefined) gaps.push(`ability:${a.id}`);
  }
  return gaps;
}
