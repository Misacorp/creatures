/**
 * What the gear screens say, worked out in plain functions so it can be tested without a browser:
 * names and line text, the wear rule and why an item cannot go on a creature, job progress, who can
 * take a job, which grants belong to a finale, and the lists of a loot reveal. Names and kinds come
 * from the shared content, costs, durations and the wear rule from the shared rules (never copied
 * here), and every amount that is owned or paid, and every number in a line, comes from the server's
 * view.
 */
import {
  conversionRecipe,
  GLOSSARY_IDS,
  PART_KINDS,
  baseElement,
  content,
  RULES,
  craftCost,
  craftItemLevel,
  dismantleHours,
  entryView,
  expeditionContent,
  gearBase,
  gearSet,
  jobDuration,
  jobHours,
  partsOfSpec,
  setCounts,
  supplyDef,
  supplyJobMs,
  wearBlock,
  type GearSet,
} from '@creatures/game';
import type { Creature } from './api';
import { capitalize, creatureName, getSpecies } from './game';
import { percent } from './progress-math';
import { formatDuration } from './time-format';
import { destinationName, supplyName } from './trip-view';
import type { CountItem } from './ui/CountBadge';
import type {
  ConversionNotice,
  CraftOdds,
  DismantleRange,
  GearItem,
  GearLine,
  GearRarity,
  GearSlot,
  GearState,
  GrantLoot,
  GrantRecord,
  ItemOrigin,
  Job,
  JobKind,
  JobResult,
  PartKind,
  PartsBundle,
  ReachId,
  Range,
  WornGear,
} from './gear-types';

// --- Names ---

/** Rarities from the plainest to the rarest. */
export const RARITY_ORDER: readonly GearRarity[] = ['common', 'rare', 'epic'];

/** True for a Festival piece (a base with a unique line, a narrow roll pool and a look of its own). */
export function isFestivalBase(baseId: string): boolean {
  return gearBase(baseId)?.festival === true;
}

export function rarityName(rarity: GearRarity): string {
  return capitalize(rarity);
}

export function gearName(baseId: string): string {
  return gearBase(baseId)?.name ?? baseId;
}

/** "Hat", "Scarf", "Charm". */
export function slotName(slot: GearSlot): string {
  return capitalize(slot);
}

/** "Kelp Cap, item level 4", for spoken labels. */
export function itemLabel(baseId: string, itemLevel: number): string {
  return `${gearName(baseId)}, item level ${String(itemLevel)}`;
}

/**
 * The worn item as a creature card and the living room's popover draw it: what it is and, when the
 * lines are known (the owner's gear view, or the room's own list), their text.
 */
export interface WornItem {
  baseId: string;
  slot: GearSlot;
  rarity: GearRarity;
  itemLevel: number;
  /** The text of the item's lines ("Attack +6%"); absent while the owner's gear view has not loaded. */
  lines?: readonly string[];
}

/** An item a creature wears (`Creature.gear`), with its lines taken from the gear view's items. */
export function wornItemOf(worn: WornGear, items: readonly GearItem[] | undefined): WornItem {
  const lines = items?.find((i) => i.id === worn.id)?.lines.map((l) => l.text);
  return {
    baseId: worn.baseId,
    slot: worn.slot,
    rarity: worn.rarity,
    itemLevel: worn.itemLevel,
    ...(lines === undefined ? {} : { lines }),
  };
}

/** The worn items of a creature in slot order (hat, scarf, charm). */
export function wornInOrder<T extends { slot: GearSlot }>(worn: readonly T[]): T[] {
  const order: readonly GearSlot[] = ['hat', 'scarf', 'charm'];
  return [...worn].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
}

// --- Gear sets ---

/** The gear set a base belongs to, or undefined (most bases are in none). */
export function itemSet(baseId: string): GearSet | undefined {
  const id = gearBase(baseId)?.set;
  return id === undefined ? undefined : gearSet(id);
}

/** The pieces a set has (a Hat, a Scarf and a Charm). */
export const SET_PIECES = 3;

/** "2 / 3": the pieces of a set worn, counted against the whole set (a spaced slash, never "of"). */
export function setCountText(count: number): string {
  return `${String(count)} / ${String(SET_PIECES)}`;
}

/** One bonus row of a set: how many pieces it asks for, what it gives, and whether the wearer has them. */
export interface SetBonusRow {
  pieces: 2 | 3;
  text: string;
  active: boolean;
}

/** The two bonus rows of a set for a wearer who has `count` of its pieces. */
export function setBonusRows(set: GearSet, count: number): SetBonusRow[] {
  return [
    { pieces: 2, text: set.two.text, active: count >= 2 },
    { pieces: 3, text: set.three.text, active: count >= 3 },
  ];
}

/**
 * How many pieces of an item's set a creature would wear with the item on: the pieces it wears in the other
 * slots plus the item itself. `worn` is what the creature wears (`Creature.gear`). 0 for an item in no set.
 */
export function setPiecesWith(
  item: Pick<GearItem, 'baseId' | 'slot'>,
  worn: readonly Pick<GearItem, 'baseId' | 'slot'>[],
): number {
  const set = itemSet(item.baseId);
  if (set === undefined) return 0;
  const others = worn.filter((w) => w.slot !== item.slot && gearBase(w.baseId)?.set === set.id);
  return others.length + 1;
}

/**
 * The set bonuses a creature has now, as one compact line for its page: each set it wears two or more
 * pieces of, with the count and the bonus it gives ("Tidepool Finery 2 / 3: Steam bonus +8%"), separated by
 * dots. Empty when it has none. The server's fold does the real work; this only says what the content says.
 */
export function activeSetLine(worn: readonly Pick<GearItem, 'baseId' | 'slot'>[]): string {
  const parts: string[] = [];
  for (const [id, count] of setCounts(worn)) {
    const set = gearSet(id);
    if (set === undefined || count < 2) continue;
    const bonus = count >= 3 ? `${set.two.text}. ${set.three.text}` : set.two.text;
    parts.push(`${set.name} ${setCountText(count)}: ${bonus}`);
  }
  return parts.join(' · ');
}

// --- Lines ---

/** Tier pips for a line: `filled` of `total`, and how many the item level could ever reach (`reach`). */
export interface LinePips {
  filled: number;
  reach: number;
  total: number;
}

const TIERS = 5;

/** The pips of a rolled line; null for a base line or a line without tiers. */
export function linePips(line: Pick<GearLine, 'tier' | 'bestTier'>): LinePips | null {
  if (line.tier === null) return null;
  return {
    filled: line.tier,
    reach: Math.max(line.tier, line.bestTier ?? line.tier),
    total: TIERS,
  };
}

/** "Tier 3 / 5", spoken. */
export function pipsLabel(pips: LinePips): string {
  return `Tier ${String(pips.filled)} / ${String(pips.total)}`;
}

/** The glossary entry that explains a line. */
export function lineEntry(line: Pick<GearLine, 'id'>): string {
  return GLOSSARY_IDS.gearLine(line.id);
}

/** True for a line that does nothing for the creature wearing the item. */
export function lineIdle(line: Pick<GearLine, 'active'>): boolean {
  return line.active === false;
}

// --- Parts ---

export function partName(kind: PartKind): string {
  return entryView(GLOSSARY_IDS.part(kind))?.title ?? kind;
}

/** The non-zero parts of a bundle, in the fixed order of the part kinds. */
export function partsEntries(parts: PartsBundle): { kind: PartKind; amount: number }[] {
  return PART_KINDS.flatMap((kind) => {
    const amount = parts[kind] ?? 0;
    return amount > 0 ? [{ kind, amount }] : [];
  });
}

/** "6 Scrap, 1 Ember Shard". */
export function partsText(parts: PartsBundle): string {
  const entries = partsEntries(parts);
  return entries.length === 0
    ? 'nothing'
    : entries.map((e) => `${String(e.amount)} ${partName(e.kind)}`).join(', ');
}

/** What is missing from `have` to pay `need` (only kinds that are short). */
export function missingParts(
  have: Readonly<Record<PartKind, number>>,
  need: PartsBundle,
): PartsBundle {
  const missing: PartsBundle = {};
  for (const kind of PART_KINDS) {
    const short = (need[kind] ?? 0) - have[kind];
    if (short > 0) missing[kind] = short;
  }
  return missing;
}

// --- Creatures, busy states and the picker ---

/** The short reason of a creature that is on a Workshop job, and of one that is away on a trip. */
export const ON_A_JOB_REASON = 'On a job';
export const ON_A_TRIP_REASON = 'Away on a trip';

/**
 * Why a creature is busy, in as few words as fit ("On a job", "Away on a trip"); null when it is free. The one
 * wording of every pick list, button note and refusal that names it.
 */
export function busyReason(creature: Pick<Creature, 'busy' | 'away'>): string | null {
  if (creature.busy?.kind === 'job') return ON_A_JOB_REASON;
  if (creature.busy?.kind === 'expedition' || creature.away) return ON_A_TRIP_REASON;
  return null;
}

/** Which busy status a creature has ("job" or "away"), for the shared status badge; null when it is free. */
export function busyKind(creature: Pick<Creature, 'busy' | 'away'>): 'away' | 'job' | null {
  if (creature.busy?.kind === 'job') return 'job';
  if (creature.busy?.kind === 'expedition' || creature.away) return 'away';
  return null;
}

function isFree(creature: Pick<Creature, 'busy' | 'away'>): boolean {
  return busyReason(creature) === null;
}

function skillLevelOf(skills: GearState['skills'], creatureId: string): number {
  return skills.find((s) => s.creatureId === creatureId)?.level ?? 1;
}

export interface PickerOption {
  creature: Creature;
  /** The Crafting skill level. */
  level: number;
  /** Why it cannot be picked; null when free. */
  busy: string | null;
  /** How long this job would take with this creature. */
  durationMs: number;
}

/** Free creatures first (best crafter first), then the busy ones, each with its reason. */
export function pickerOptions(
  creatures: readonly Creature[],
  skills: GearState['skills'],
  durationAtLevel: (level: number) => number,
): PickerOption[] {
  const options = creatures.map((creature) => {
    const level = skillLevelOf(skills, creature.id);
    return { creature, level, busy: busyReason(creature), durationMs: durationAtLevel(level) };
  });
  const free = options.filter((o) => o.busy === null).sort((a, b) => b.level - a.level);
  return [...free, ...options.filter((o) => o.busy !== null)];
}

/** The creature a picker starts on: the best free crafter, or none. */
export function defaultPick(options: readonly PickerOption[]): string | null {
  return options.find((o) => o.busy === null)?.creature.id ?? null;
}

/** The gear a creature card adds on top of its base stats, for the "+12 ATK" text. */
export function gearShare(
  creature: Pick<Creature, 'stats' | 'statsWithGear'>,
): { stat: 'hp' | 'atk' | 'spd'; amount: number }[] {
  return (['hp', 'atk', 'spd'] as const).flatMap((stat) => {
    const amount = creature.statsWithGear[stat] - creature.stats[stat];
    return amount > 0 ? [{ stat, amount }] : [];
  });
}

/** Creatures that cannot go on an expedition because of a job, with the reason. */
export function expeditionBlocked(
  creatures: readonly Creature[],
): { creature: Creature; reason: string }[] {
  return creatures.flatMap((creature) =>
    creature.busy?.kind === 'job'
      ? [
          {
            creature,
            reason: `${creatureName(creature)} is on a job in the Workshop. Claim it first.`,
          },
        ]
      : [],
  );
}

// --- The wear rule ---

/**
 * Why a creature cannot wear an item, in words; null when it can. The rule itself is the game's
 * (`wearBlock`): a role-locked Charm only goes on its role, a slot opens at a creature level, and an
 * item's level may not be above the creature's.
 */
export function wearReason(
  item: Pick<GearItem, 'slot' | 'tag' | 'itemLevel'>,
  creature: Pick<Creature, 'level' | 'species'>,
): string | null {
  const species = getSpecies(creature.species);
  if (species === undefined) return null;
  const block = wearBlock(item, { level: creature.level, role: species.role });
  if (block === null) return null;
  switch (block.reason) {
    case 'role':
      return `${capitalize(block.role)}s only.`;
    case 'slot_locked':
      return `${slotName(item.slot)}s open at level ${String(block.needs)}.`;
    case 'item_level':
      return `Needs creature level ${String(block.needs)}.`;
  }
}

// --- Items ---

/** The inventory as a grid shows it: rarest first, then the higher item level, then by name. */
export function sortItems(items: readonly GearItem[]): GearItem[] {
  return [...items].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
      b.itemLevel - a.itemLevel ||
      gearName(a.baseId).localeCompare(gearName(b.baseId)) ||
      a.id.localeCompare(b.id),
  );
}

/** "12 / 60", with the places held by crafts that are still in the Workshop. */
export function bagText(inventory: GearState['inventory']): string {
  const base = `${String(inventory.used)} / ${String(inventory.cap)}`;
  return inventory.reserved > 0 ? `${base} (${String(inventory.reserved)} held for a craft)` : base;
}

export interface EquipChoice {
  item: GearItem;
  /** The name of another creature that wears it now; null otherwise. */
  wornBy: string | null;
  /** That creature's species (its small picture marks the item in the picker); null otherwise. */
  wornBySpecies: string | null;
  /** Why this creature cannot wear it; null when it can. */
  blocked: string | null;
}

/**
 * The items of one slot a creature could be given: all but the one it wears already. The free ones it can
 * wear first (best first), then the ones another creature wears (taken: the picker does not move them),
 * then the ones it cannot wear with the reason, and who has each now.
 */
export function equipChoices(
  items: readonly GearItem[],
  creature: Pick<Creature, 'id' | 'level' | 'species'>,
  creatures: readonly Creature[],
  slot: GearSlot,
): EquipChoice[] {
  const choices = sortItems(
    items.filter((item) => item.slot === slot && item.equippedOn !== creature.id),
  ).map((item) => {
    const wearer = creatures.find((c) => c.id === item.equippedOn);
    return {
      item,
      wornBy: wearer === undefined ? null : creatureName(wearer),
      wornBySpecies: wearer === undefined ? null : wearer.species,
      blocked: wearReason(item, creature),
    };
  });
  return [
    ...choices.filter((c) => c.blocked === null && c.wornBy === null),
    ...choices.filter((c) => c.blocked === null && c.wornBy !== null),
    ...choices.filter((c) => c.blocked !== null),
  ];
}

// --- Where an item came from (the details row) ---

function bossName(id: string): string {
  return content.bosses.find((b) => b.id === id)?.name ?? id;
}

/** "Raid finale: Tidal Colossus, rank 3". Empty when nothing is known. */
export function originText(origin: ItemOrigin | null, source: string): string {
  if (origin === null) return SOURCE_TEXT[source] ?? '';
  switch (origin.kind) {
    case 'raid':
      return `Raid finale: ${bossName(origin.boss)}, rank ${String(origin.rank)}`;
    case 'festival':
      return `Festival finale: ${bossName(origin.boss)}, rank ${String(origin.rank)}`;
    case 'dungeon':
      return `Daily dungeon, depth ${String(origin.depth)}`;
    case 'trip':
      return `Expedition to ${destinationName(origin.place)}, explorer rank ${String(origin.rank)}`;
    case 'craft':
      return 'Crafted in the Workshop';
    case 'welcome':
      return 'Welcome gift';
    case 'converted':
      return 'Made from your old gear';
  }
}

const SOURCE_TEXT: Readonly<Record<string, string>> = {
  raid_finale: 'Raid finale',
  raid_phase: 'Raid',
  festival: 'Festival finale',
  expedition: 'Expedition',
  craft: 'Crafted in the Workshop',
  welcome: 'Welcome gift',
  dungeon: 'Daily dungeon',
  rank_gift: 'Explorer rank gift',
};

/** "2027-01-12": the day as the server stored it (UTC), for the details row. */
export function dayText(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The small print of an item: where it came from, who made it and when. */
export function detailLines(
  item: Pick<GearItem, 'origin' | 'source' | 'madeBy' | 'createdAt'>,
): string[] {
  const lines: string[] = [];
  const origin = originText(item.origin, item.source);
  if (origin !== '') lines.push(origin);
  if (item.madeBy !== null) lines.push(`Made by ${item.madeBy.name} on ${dayText(item.madeBy.at)}`);
  else lines.push(`Got it on ${dayText(item.createdAt)}`);
  return lines;
}

// --- The conversion card ---

/** The words of the one-time card about the switch to gear v2, one short line each. */
export function noticeLines(notice: ConversionNotice): string[] {
  const lines: string[] = [];
  if (notice.converted > 0) {
    lines.push(
      notice.converted === 1
        ? 'Your worn item became one of the new items.'
        : `Your ${String(notice.converted)} worn items became new items.`,
    );
  }
  if (notice.refundedItems > 0) {
    lines.push(
      notice.refundedItems === 1
        ? 'One spare item went back as parts.'
        : `${String(notice.refundedItems)} spare items went back as parts.`,
    );
  }
  if (notice.essence > 0) lines.push(`Your upgrade Essence came back: ${String(notice.essence)}.`);
  if (partsEntries(notice.parts).length > 0) {
    lines.push(`You got these parts back: ${partsText(notice.parts)}.`);
  }
  if (notice.blueprints > 0) {
    lines.push(
      notice.blueprints === 1
        ? 'Your blueprint now makes one of the new items.'
        : `Your ${String(notice.blueprints)} blueprints now make the new items.`,
    );
  }
  if (notice.retiredJobs > 0) {
    lines.push(
      'An Improve or Enchant job that was still running will finish and give its parts back.',
    );
  }
  return lines;
}

/** Why a worn item came off in the conversion, in words. */
export function unequippedReason(note: ConversionNotice['unequipped'][number]): string {
  switch (note.reason) {
    case 'item_level':
      return `its creature needs level ${String(note.needs ?? note.itemLevel)} to wear it`;
    case 'slot_locked':
      return `${slotName(note.slot)}s open at creature level ${String(note.needs ?? 0)}`;
    case 'role':
      return 'its creature has the wrong role for it';
  }
}

// --- Jobs ---

interface JobProgress {
  /** 0 to 100 in steps of a tenth, so a bar moves smoothly even on a long job. */
  pct: number;
  remainingMs: number;
  ready: boolean;
}

/** How far a job is at server time `serverNow`. A finished one is ready; the server decides the claim. */
export function jobProgress(
  job: Pick<Job, 'startedAt' | 'endsAt' | 'status'>,
  serverNow: number,
): JobProgress {
  const total = job.endsAt - job.startedAt;
  const remainingMs = Math.max(0, job.endsAt - serverNow);
  const ready = job.status === 'ready' || remainingMs === 0;
  const pct = ready || total <= 0 ? 100 : percent(serverNow - job.startedAt, total);
  return { pct, remainingMs, ready };
}

/** The jobs that still hold a workshop slot: running or ready, the soonest to finish first. */
export function openJobs(jobs: readonly Job[]): Job[] {
  return jobs.filter((j) => j.status !== 'claimed').sort((a, b) => a.endsAt - b.endsAt);
}

export function jobVerb(kind: Job['kind'], input: { recipeId?: string } = {}): string {
  if (kind === 'dismantle') return 'Dismantle';
  if (kind === 'convert') {
    const recipe = input.recipeId === undefined ? undefined : conversionRecipe(input.recipeId);
    return recipe === undefined ? 'Convert' : recipe.kind === 'refine' ? 'Refine' : 'Recycle';
  }
  return kind === 'craft' || kind === 'supply' ? 'Craft' : 'Old job';
}

/**
 * "Craft Kelp Cap", "Craft Kelp Cap (Reach for Rare)", "Craft Basic Lure", "Dismantle Kelp Cap" or
 * "Dismantle 3 items". A job from before gear v2 has no name to show.
 */
export function jobTitle(job: Pick<Job, 'kind' | 'input'>): string {
  if (job.kind === 'supply') return `Craft ${supplyName(job.input.supplyId ?? 'supply')}`;
  if (job.kind === 'craft') {
    const reach =
      job.input.reach === undefined || job.input.reach === 'none'
        ? ''
        : ` (${reachName(job.input.reach)})`;
    return `Craft ${gearName(job.input.baseId ?? 'item')}${reach}`;
  }
  if (job.kind === 'convert') {
    // "Refine Plain Lure", "Recycle Sweet Lure": the verb and the supply it works on.
    const recipe =
      job.input.recipeId === undefined ? undefined : conversionRecipe(job.input.recipeId);
    const from = recipe?.inputs[0];
    return `${jobVerb('convert', job.input)} ${from?.type === 'supply' ? supplyName(from.id) : 'supplies'}`;
  }
  if (job.kind === 'dismantle') {
    const items = job.input.items ?? [];
    const first = items[0];
    return items.length === 1 && first !== undefined
      ? `Dismantle ${gearName(first.baseId)}`
      : `Dismantle ${String(items.length)} items`;
  }
  return 'Old job (its parts come back)';
}

// --- Reach, odds and ranges (the numbers are the server's: this only writes them) ---

/** "Plain craft", "Reach for Rare", "Reach for Epic". */
export function reachName(reach: ReachId): string {
  return reach === 'none' ? 'Plain craft' : `Reach for ${capitalize(reach)}`;
}

/** Basis points as a percentage: 6000 is "60%", 3640 is "36.4%", 405 is "4.05%". */
export function oddsPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = bp % 100;
  if (rest === 0) return `${String(whole)}%`;
  const tail = String(rest).padStart(2, '0').replace(/0$/, '');
  return `${String(whole)}.${tail}%`;
}

/** "Common 40% · Rare 60%": the rarities that can come out, with the server's exact odds. */
export function oddsText(odds: CraftOdds): string {
  return (['common', 'rare', 'epic'] as const)
    .filter((r) => odds[r] > 0)
    .map((r) => `${rarityName(r)} ${oddsPercent(odds[r])}`)
    .join(' · ');
}

/** "4 / 10", the marks of a blueprint (a player reads them as its quality). */
export function marksText(marks: number): string {
  return `${String(marks)} / ${String(RULES.gear.craft.marks.max)}`;
}

/** "Quality 4 / 10": what a player reads of a blueprint's marks. */
export function qualityText(marks: number): string {
  return `Quality ${marksText(marks)}`;
}

/** "6 to 10": one number when both ends are the same. */
export function rangeText(range: Range): string {
  return range.min === range.max
    ? String(range.min)
    : `${String(range.min)} to ${String(range.max)}`;
}

/** The badge text of a yield: "3" for one number, "3–4" for a range, and how a screen reader says it ("3 to 4"). */
export function rangeBadge(range: Range): Pick<CountItem, 'amount' | 'spokenAmount'> {
  return range.min === range.max
    ? { amount: range.max }
    : { amount: `${String(range.min)}\u2013${String(range.max)}`, spokenAmount: rangeText(range) };
}

/**
 * What a dismantle can give, as count badges (an icon and a number or a range), the empty ones left out:
 * scrap, the element's shard (or shards of any kind), glimmer, Essence. Spoken as "Scrap: 3 to 4".
 */
export function dismantleCountItems(range: DismantleRange): CountItem[] {
  const items: CountItem[] = [];
  const part = (kind: PartKind, amount: Range): void => {
    if (amount.max > 0) {
      items.push({
        key: kind,
        icon: { kind: 'part', part: kind },
        label: partName(kind),
        entry: GLOSSARY_IDS.part(kind),
        ...rangeBadge(amount),
      });
    }
  };
  part('scrap', range.scrap);
  if (range.shards.max > 0) {
    const element = range.shards.element;
    const kind = element === null ? undefined : PART_KINDS.find((k) => k === `${element}-shard`);
    if (kind !== undefined) part(kind, range.shards);
    else {
      items.push({
        key: 'shards',
        icon: { kind: 'glyph', id: 'sparkle' },
        label: 'Shards',
        name: 'any kind',
        ...rangeBadge(range.shards),
      });
    }
  }
  part('glimmer', range.glimmer);
  if (range.essence.max > 0) {
    items.push({
      key: 'essence',
      icon: { kind: 'glyph', id: 'gem' },
      label: 'Essence',
      entry: 'essence',
      ...rangeBadge(range.essence),
    });
  }
  return items;
}

/** A job's time as one badge: a clock and "51 min" (spoken "Takes: 51 min"). */
export function durationCountItem(durationMs: number): CountItem {
  return {
    key: 'duration',
    icon: { kind: 'glyph', id: 'clock' },
    label: 'Takes',
    amount: formatDuration(durationMs),
  };
}

/**
 * A job's time before the skill's speed-up, as the same clock badge ("Takes about: 3 h" spoken): what a
 * blueprint or a supply says before anyone is picked.
 */
export function nominalDurationCountItem(durationMs: number): CountItem {
  return { ...durationCountItem(durationMs), label: 'Takes about' };
}

/** The time a dismantle job of these items takes a creature of this Crafting level (the preview gives the server's). */
export function dismantleDurationFor(rarity: GearRarity, level: number): number {
  return jobDuration(level, 0, dismantleHours(rarity));
}

/**
 * Whether a job can start, as far as the screen can tell before asking the server: a free workshop
 * slot, a free creature, room in the bag for a craft and the parts.
 */
export function startBlocker(
  gear: Pick<GearState, 'slots' | 'inventory' | 'parts' | 'balances'>,
  creatures: readonly Creature[],
  job: { kind: JobKind; cost: PartsBundle; essence?: number; bait?: number },
): string | null {
  if (gear.slots.used >= gear.slots.total) {
    return `All ${String(gear.slots.total)} slots are busy.`;
  }
  if (!creatures.some(isFree)) {
    return 'No creature is free.';
  }
  if (job.kind === 'craft' && gear.inventory.used + gear.inventory.reserved >= gear.inventory.cap) {
    return 'The bag is full.';
  }
  const missing = missingParts(gear.parts, job.cost);
  const entries = partsEntries(missing);
  const lackingEssence = Math.max(0, (job.essence ?? 0) - gear.balances.essence);
  const lacks = [
    ...entries.map((e) => `${String(e.amount)} more ${partName(e.kind)}`),
    ...(lackingEssence > 0 ? [`${String(lackingEssence)} more Essence`] : []),
  ];
  if (lacks.length > 0) return `Needs ${lacks.join(' and ')}.`;
  // A lure costs Bait as well as parts.
  const bait = job.bait ?? 0;
  if (gear.balances.bait < bait) {
    return `Needs ${String(bait - gear.balances.bait)} more Bait.`;
  }
  return null;
}

/** What a craft takes with a crafter of Crafting `level`. A supply craft has its own length (see `supplyDurationFor`). */
export function durationFor(level: number): number {
  return jobDuration(level);
}

/** The nominal hours of a craft, before the skill. */
export function nominalHours(): number {
  return jobHours();
}

/** The rarity to frame a claimed job's item with: the craft's own, else Common. */
export function jobResultRarity(result: JobResult): GearRarity {
  if (result.kind === 'craft') return result.rarity;
  if (result.kind === 'dismantle') return result.items[0]?.rarity ?? 'common';
  if (result.kind === 'supply') return supplyRarity(result.supplyId);
  return 'common';
}

/** The frame a supply is shown in: Common for the basic tier, Rare for good, Epic for great. */
function supplyRarity(supplyId: string): GearRarity {
  const tier = supplyDef(supplyId)?.tier;
  return tier === 'great' ? 'epic' : tier === 'good' ? 'rare' : 'common';
}

// --- Supply crafts ---

interface SupplyCraftView {
  id: string;
  name: string;
  kind: string;
  tier: string;
  /** The parts one craft costs. */
  cost: PartsBundle;
  /** The Bait one craft costs (only a lure costs Bait); 0 for the others. */
  bait: number;
  /** How many supplies one job makes. */
  yieldCount: number;
  /** The Crafting level a creature needs. */
  level: number;
  /** Hours before the skill shortens them. */
  hours: number;
  /** How many are in stock. */
  owned: number;
}

/** Every supply that can be crafted, in the order of the content, with its cost and the level it needs. */
export function supplyCraftViews(stock: Readonly<Record<string, number>>): SupplyCraftView[] {
  return expeditionContent.supplies.map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.kind,
    tier: def.tier,
    cost: partsOfSpec(def.blueprint.parts),
    bait: def.blueprint.bait ?? 0,
    yieldCount: def.blueprint.yield,
    level: def.blueprint.craftingLevel,
    hours: def.blueprint.hours,
    owned: stock[def.id] ?? 0,
  }));
}

/** What crafting this supply takes with a creature of this Crafting level, in milliseconds. */
export function supplyDurationFor(supplyId: string, level: number): number {
  const def = supplyDef(supplyId);
  return def === undefined ? 0 : supplyJobMs(def, level);
}

/**
 * Why no creature can craft a supply yet: the best Crafting level among the free creatures is below what
 * it needs. Null when at least one creature has the level (or there is no creature at all: another
 * reason covers that).
 */
export function supplyLevelBlocker(
  level: number,
  skills: GearState['skills'],
  creatures: readonly Creature[],
): string | null {
  const levels = creatures.map((c) => skillLevelOf(skills, c.id));
  const best = levels.length === 0 ? 1 : Math.max(...levels);
  if (best >= level) return null;
  return `Needs Crafting level ${String(level)}.`;
}

// --- Blueprints ---

interface BlueprintView {
  baseId: string;
  name: string;
  slot: GearSlot;
  element: string | null;
  cost: PartsBundle;
  /** Marks, shown as blueprint quality (finds of it the player already knew), 0 to the most. */
  marks: number;
  /** The Crafting level a craft of it asks for (a better base unlocks at a higher item level); 1 for the plain ones. */
  needsCraftingLevel: number;
}

/** The blueprints a player knows, by slot and then name, each with the parts a craft costs. */
export function blueprintViews(
  blueprints: GearState['blueprints'],
  skills: GearState['skills'],
): BlueprintView[] {
  // The price of a plain craft grows with the item level, which follows the crafter's level: the card shows
  // the price for the best crafter (the craft panel shows the exact price for the one you pick).
  const itemLevel = craftItemLevel(Math.max(1, ...skills.map((s) => s.level)));
  const order: readonly GearSlot[] = ['hat', 'scarf', 'charm'];
  return blueprints
    .flatMap((bp) => {
      const base = gearBase(bp.baseId);
      return base === undefined
        ? []
        : [
            {
              baseId: bp.baseId,
              name: base.name,
              slot: base.slot,
              element: baseElement(base),
              cost: craftCost(bp.baseId, itemLevel),
              marks: bp.marks,
              needsCraftingLevel: bp.needsCraftingLevel,
            },
          ];
    })
    .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || a.name.localeCompare(b.name));
}

// --- Grants and loot ---

/** The grants of a raid week: the finale's roll and the Festival piece, when each exists. */
export function grantsForWeek(
  grants: readonly GrantRecord[],
  week: string,
): { finale: GrantRecord | null; festival: GrantRecord | null } {
  return {
    finale: grants.find((g) => g.key === `raid:${week}:finale`) ?? null,
    festival: grants.find((g) => g.key === `festival:${week}`) ?? null,
  };
}

/** A dropped item's name, with its item level when known ("Kelp Cap, item level 4"). */
export function lootItemName(item: { baseId: string; itemLevel?: number }): string {
  return item.itemLevel === undefined
    ? gearName(item.baseId)
    : itemLabel(item.baseId, item.itemLevel);
}

export function lootIsEmpty(loot: GrantLoot): boolean {
  return (
    loot.gear.length === 0 &&
    loot.converted.length === 0 &&
    loot.blueprints.length === 0 &&
    (loot.supplies ?? []).length === 0 &&
    partsEntries(loot.parts).length === 0
  );
}
