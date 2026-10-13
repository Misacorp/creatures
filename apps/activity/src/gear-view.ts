/**
 * What the gear screens say, worked out in plain functions so it can be tested without a browser:
 * names and stat text, what an upgrade costs and why it may be disabled, job progress, who can take
 * a job, which grants belong to a finale, and the lists of a loot reveal. Names, kinds and enchants
 * come from the shared content, costs and durations from the shared rules (never copied here), and
 * every amount that is owned or paid comes from the server's view.
 */
import {
  GLOSSARY_IDS,
  PART_KINDS,
  craftCost,
  expeditionContent,
  partsOfSpec,
  supplyDef,
  supplyJobMs,
  enchantDef,
  entryView,
  gearBase,
  gearContent,
  enchantCost,
  jobDuration,
  jobHours,
  type EnchantCondition,
  type GearJobKind,
} from '@creatures/game';
import type { Creature } from './api';
import { capitalize, creatureName, elementName } from './game';
import { supplyName } from './trip-view';
import type {
  GearItem,
  JobResult,
  GearRarity,
  GearState,
  GearStat,
  GrantLoot,
  GrantRecord,
  Job,
  JobKind,
  PartKind,
  PartsBundle,
} from './gear-types';

// --- Names and numbers ---

/** Rarities from the plainest to the rarest. */
export const RARITY_ORDER: readonly GearRarity[] = ['common', 'rare', 'epic', 'festival'];

export function rarityName(rarity: GearRarity): string {
  return capitalize(rarity);
}

export function gearName(baseId: string): string {
  return gearBase(baseId)?.name ?? baseId;
}

/** The element of an item's tint; null for a neutral item (or an unknown base). */
export function gearTint(baseId: string): string | null {
  return gearBase(baseId)?.tint ?? null;
}

/** "Wave Band +2". */
export function itemLabel(baseId: string, level: number): string {
  return `${gearName(baseId)} +${String(level)}`;
}

const STAT_LABELS: Readonly<Record<GearStat, string>> = {
  atk: 'ATK',
  hp: 'HP',
  spd: 'SPD',
  critChance: 'Crit chance',
  critDamage: 'Crit damage',
};

export function statLabel(stat: GearStat): string {
  return STAT_LABELS[stat];
}

/** The glossary entry that explains a gear stat. */
export function statEntry(stat: GearStat): string {
  return GLOSSARY_IDS.gearStat(stat);
}

/**
 * An amount of a stat for display: Attack, HP and speed are basis points of a percentage ("+5.2%");
 * the crit stats are basis points of crit points ("+2.4 points"). One decimal at most.
 */
export function formatBonus(stat: GearStat, bp: number): string {
  const value = String(Math.round(bp / 10) / 10);
  return stat === 'critChance' || stat === 'critDamage' ? `+${value} points` : `+${value}%`;
}

/** "+5.2% ATK" or "+2.4 points Crit chance". */
export function statText(stat: GearStat, bp: number): string {
  return `${formatBonus(stat, bp)} ${statLabel(stat)}`;
}

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

/** "3 hours" style text for a job length: "4 h" or "3 h 44 min" or "45 min". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${String(minutes)} min`;
  return minutes === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(minutes)} min`;
}

/** Who an enchant works for, in words. */
export function enchantWhen(when: EnchantCondition | undefined): string {
  if (when === undefined) return 'Works for every creature.';
  if ('role' in when) return `Only works for a ${capitalize(when.role)}.`;
  return `Only works for ${elementName(when.element)} creatures.`;
}

export function enchantName(enchantId: string): string {
  return enchantDef(enchantId)?.name ?? enchantId;
}

/** The enchants a player can pick from, with price and who they work for. */
export function enchantChoices(): {
  id: string;
  name: string;
  effect: string;
  when: string;
  cost: PartsBundle;
}[] {
  return gearContent.enchants.flatMap((e) => {
    const cost = enchantCost(e.id);
    return cost === null
      ? []
      : [
          {
            id: e.id,
            name: e.name,
            effect: entryView(GLOSSARY_IDS.enchant(e.id))?.short ?? statText(e.stat, e.bp),
            when: enchantWhen(e.when),
            cost,
          },
        ];
  });
}

export type EnchantChoice = ReturnType<typeof enchantChoices>[number];

/** What the enchant of an item says about the wearer: working, not working, or nobody wears it. */
export function enchantStatus(item: Pick<GearItem, 'enchantId' | 'enchantActive'>): string | null {
  if (item.enchantId === null) return null;
  if (item.enchantActive === true) return 'Active on its wearer.';
  if (item.enchantActive === false) return 'Not active: it does not work for this wearer.';
  return 'It works once a fitting creature wears the item.';
}

// --- Upgrade ---

export interface UpgradeStatus {
  enabled: boolean;
  /** Why not, in words; null when the upgrade can be paid. */
  reason: string | null;
}

/** Whether an item can be upgraded now. The server decides; this only explains a "no" before the tap. */
export function upgradeStatus(
  item: Pick<GearItem, 'upgradeCost' | 'maxLevel'>,
  gear: Pick<GearState, 'balances' | 'parts'>,
): UpgradeStatus {
  const cost = item.upgradeCost;
  if (cost === null) {
    return { enabled: false, reason: `This item is at its top level (+${String(item.maxLevel)}).` };
  }
  const essence = cost.essence - gear.balances.essence;
  const scrap = cost.scrap - gear.parts.scrap;
  if (essence > 0 && scrap > 0) {
    return {
      enabled: false,
      reason: `Needs ${String(essence)} more Essence and ${String(scrap)} more scrap.`,
    };
  }
  if (essence > 0) return { enabled: false, reason: `Needs ${String(essence)} more Essence.` };
  if (scrap > 0) return { enabled: false, reason: `Needs ${String(scrap)} more scrap.` };
  return { enabled: true, reason: null };
}

// --- Creatures, busy states and the picker ---

/** Why a creature cannot take a job or an expedition now; null when it is free. */
export function busyReason(creature: Pick<Creature, 'busy' | 'away'>): string | null {
  if (creature.busy?.kind === 'job') return 'On a job in the Workshop';
  if (creature.busy?.kind === 'expedition' || creature.away) return 'Away on an expedition';
  return null;
}

export function isFree(creature: Pick<Creature, 'busy' | 'away'>): boolean {
  return busyReason(creature) === null;
}

export function skillLevelOf(skills: GearState['skills'], creatureId: string): number {
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

// --- Items ---

/** The inventory as a grid shows it: rarest first, then the higher level, then by name. */
export function sortItems(items: readonly GearItem[]): GearItem[] {
  return [...items].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) ||
      b.level - a.level ||
      gearName(a.baseId).localeCompare(gearName(b.baseId)) ||
      a.id.localeCompare(b.id),
  );
}

/** "12 of 60", with the places held by crafts that are still in the Workshop. */
export function bagText(inventory: GearState['inventory']): string {
  const base = `${String(inventory.used)} of ${String(inventory.cap)}`;
  return inventory.reserved > 0 ? `${base} (${String(inventory.reserved)} held for a craft)` : base;
}

export interface EquipChoice {
  item: GearItem;
  /** The name of another creature that wears it now (it would move); null otherwise. */
  wornBy: string | null;
}

/** The items a creature can wear: all but the one it wears already, with who has each now. */
export function equipChoices(
  items: readonly GearItem[],
  creature: Pick<Creature, 'id'>,
  creatures: readonly Creature[],
): EquipChoice[] {
  return sortItems(items.filter((item) => item.equippedOn !== creature.id)).map((item) => {
    const wearer = creatures.find((c) => c.id === item.equippedOn);
    return { item, wornBy: wearer === undefined ? null : creatureName(wearer) };
  });
}

// --- Jobs ---

export interface JobProgress {
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
  const pct =
    ready || total <= 0
      ? 100
      : Math.min(100, Math.max(0, Math.floor(((serverNow - job.startedAt) * 1000) / total) / 10));
  return { pct, remainingMs, ready };
}

/** The jobs that still hold a workshop slot: running or ready, the soonest to finish first. */
export function openJobs(jobs: readonly Job[]): Job[] {
  return jobs.filter((j) => j.status !== 'claimed').sort((a, b) => a.endsAt - b.endsAt);
}

const JOB_VERB: Readonly<Record<JobKind, string>> = {
  craft: 'Craft',
  improve: 'Improve',
  enchant: 'Enchant',
  supply: 'Craft',
};

export function jobVerb(kind: JobKind): string {
  return JOB_VERB[kind];
}

/** "Craft Wave Band", "Improve Volt Band", "Enchant Phoenix Trinket: Ember Fury". */
export function jobTitle(job: Pick<Job, 'kind' | 'input'>, items: readonly GearItem[]): string {
  if (job.kind === 'supply') return `Craft ${supplyName(job.input.supplyId ?? 'supply')}`;
  if (job.kind === 'craft') {
    return `Craft ${gearName(job.input.baseId ?? 'item')}`;
  }
  const item = items.find((i) => i.id === job.input.gearId);
  const what = item === undefined ? 'an item' : gearName(item.baseId);
  if (job.kind === 'improve') return `Improve ${what}`;
  return job.input.enchantId === undefined
    ? `Enchant ${what}`
    : `Enchant ${what}: ${enchantName(job.input.enchantId)}`;
}

/**
 * Whether a job can start, as far as the screen can tell before asking the server: a free workshop
 * slot, a free creature, room in the bag for a craft, the item not in another job and the parts.
 */
export function startBlocker(
  gear: Pick<GearState, 'slots' | 'inventory' | 'parts'>,
  creatures: readonly Creature[],
  job: { kind: JobKind; cost: PartsBundle; item?: Pick<GearItem, 'jobId'> },
): string | null {
  if (gear.slots.used >= gear.slots.total) {
    return `All ${String(gear.slots.total)} workshop slots are busy. Claim a finished job or wait.`;
  }
  if (!creatures.some(isFree)) {
    return 'No creature is free. Creatures on an expedition or a job cannot start another one.';
  }
  if (job.item?.jobId !== undefined && job.item.jobId !== null) {
    return 'This item is already in a job.';
  }
  if (job.kind === 'craft' && gear.inventory.used + gear.inventory.reserved >= gear.inventory.cap) {
    return 'The bag is full. Dismantle an item first to make room.';
  }
  const missing = missingParts(gear.parts, job.cost);
  const entries = partsEntries(missing);
  if (entries.length > 0) {
    return `Needs ${entries.map((e) => `${String(e.amount)} more ${partName(e.kind)}`).join(' and ')}.`;
  }
  return null;
}

/**
 * What a gear job of this kind and item rarity takes with a crafter of `level`. A supply craft has its
 * own length (see `supplyCraftViews`), so it is not asked here.
 */
export function durationFor(kind: GearJobKind, rarity: GearRarity, level: number): number {
  return jobDuration(kind, rarity, level);
}

/** The nominal hours of a gear job, before the skill. */
export function nominalHours(kind: GearJobKind, rarity: GearRarity): number {
  return jobHours(kind, rarity);
}

/** What an improve changed, in words: "+2.4 points Crit damage became +2.1 points Crit damage. A little lower." */
export function improveMessage(result: Extract<JobResult, { kind: 'improve' }>): string {
  const { from, to } = result;
  const verdict =
    to.stat !== from.stat
      ? 'A different stat now.'
      : to.bp === from.bp
        ? 'The same roll again.'
        : to.bp > from.bp
          ? 'Better!'
          : 'A little lower this time.';
  return `${statText(from.stat, from.bp)} became ${statText(to.stat, to.bp)}. ${verdict}`;
}

/** The rarity to frame a claimed job's item with: the craft's own, else the item's, else Common. */
export function jobResultRarity(result: JobResult, items: readonly GearItem[]): GearRarity {
  if (result.kind === 'craft') return result.rarity;
  if (result.kind === 'supply') return supplyRarity(result.supplyId);
  return items.find((i) => i.id === result.gearId)?.rarity ?? 'common';
}

/** The frame a supply is shown in: Common for the basic tier, Rare for good, Epic for great. */
export function supplyRarity(supplyId: string): GearRarity {
  const tier = supplyDef(supplyId)?.tier;
  return tier === 'great' ? 'epic' : tier === 'good' ? 'rare' : 'common';
}

// --- Supply crafts ---

export interface SupplyCraftView {
  id: string;
  name: string;
  kind: string;
  tier: string;
  /** The parts one craft costs. */
  cost: PartsBundle;
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
  return `Needs Crafting level ${String(level)} (your best crafter is level ${String(best)}).`;
}

// --- Blueprints ---

export interface BlueprintView {
  baseId: string;
  name: string;
  rarity: GearRarity;
  tint: string | null;
  cost: PartsBundle;
}

/** The blueprints a player knows, plainest first, each with the parts a craft costs. */
export function blueprintViews(blueprints: GearState['blueprints']): BlueprintView[] {
  return blueprints
    .flatMap((bp) => {
      const base = gearBase(bp.baseId);
      return base === undefined
        ? []
        : [
            {
              baseId: bp.baseId,
              name: base.name,
              rarity: bp.rarity,
              tint: base.tint,
              cost: craftCost(bp.baseId),
            },
          ];
    })
    .sort(
      (a, b) =>
        RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
        a.name.localeCompare(b.name),
    );
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

export function lootIsEmpty(loot: GrantLoot): boolean {
  return (
    loot.gear.length === 0 &&
    loot.converted.length === 0 &&
    loot.blueprints.length === 0 &&
    (loot.supplies ?? []).length === 0 &&
    partsEntries(loot.parts).length === 0
  );
}

/** One line per thing a grant gave, for the loot lists; text only. */
export function lootLines(loot: GrantLoot): string[] {
  const lines: string[] = [];
  for (const g of loot.gear) lines.push(`${gearName(g.baseId)} (${rarityName(g.rarity)})`);
  for (const c of loot.converted) {
    lines.push(
      `${gearName(c.baseId)} (${rarityName(c.rarity)}) did not fit in the bag and became parts`,
    );
  }
  for (const b of loot.blueprints) {
    lines.push(
      b.duplicate
        ? `Blueprint: ${gearName(b.baseId)}, already known, so it became scrap`
        : `New blueprint: ${gearName(b.baseId)} (${rarityName(b.rarity)})`,
    );
  }
  for (const p of partsEntries(loot.parts)) lines.push(`${String(p.amount)} ${partName(p.kind)}`);
  for (const id of loot.supplies ?? []) lines.push(`Found a supply: ${supplyName(id)}`);
  return lines;
}
