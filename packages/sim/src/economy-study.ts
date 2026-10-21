/**
 * The economy study (`pnpm sim:economy`): the exact expected value of every trip length, the ROI of every
 * supply (alone and in pairs) and the rows that break the targets, with the common modifiers on and off.
 * Pure over `trip-ev.ts`; the CLI only prints `economyMarkdown()`.
 */
import { expeditionContent, lengthRules, type ExpeditionLength } from '@creatures/game';
import { ECONOMY_TARGETS } from './economy-targets';
import { gainOf, kitCost, kitHours, tripEv, type TripMods } from './trip-ev';

const HOUR_MS = 3_600_000;

export const LENGTHS = ECONOMY_TARGETS.lengths;

/** The modifier sets the study runs. */
export const SCENARIOS: readonly { id: string; label: string; mods: TripMods }[] = [
  { id: 'base', label: 'No modifiers', mods: {} },
  { id: 'guard', label: 'Guard explorer (+30% parts)', mods: { guard: true } },
  { id: 'keen', label: 'Keen nose, tier 3 (+15% parts)', mods: { keenNoseBp: 1_500 } },
  { id: 'boon', label: 'Parts Boon (Kind Rain, +25% parts)', mods: { weatherPartsBp: 2_500 } },
  {
    id: 'all',
    label: 'Guard, Keen nose and the Boon together (+70% parts)',
    mods: { guard: true, keenNoseBp: 1_500, weatherPartsBp: 2_500 },
  },
];

export function hoursOf(length: ExpeditionLength): number {
  return lengthRules(length).ms / HOUR_MS;
}

/** Every supply id: kind by kind, basic to great. */
export function supplyIds(): string[] {
  return expeditionContent.supplies.map((s) => s.id);
}

function kindOf(id: string): string {
  const def = expeditionContent.supplies.find((s) => s.id === id);
  if (def === undefined) throw new Error(`no supply "${id}"`);
  return def.kind;
}

export interface SingleRow {
  length: ExpeditionLength;
  id: string;
  kind: string;
  tier: string;
  cost: number;
  hours: number;
  gain: number;
  roi: number;
}

export interface PairRow {
  length: ExpeditionLength;
  first: string;
  second: string;
  /** The ROI of the pair over the plain trip. */
  roi: number;
  /** The ROI of the second given the first, and of the first given the second. */
  roiSecond: number;
  roiFirst: number;
}

export interface BaseRow {
  length: ExpeditionLength;
  hours: number;
  total: number;
  perHour: number;
  ev: ReturnType<typeof tripEv>;
}

export function baseRows(mods: TripMods): BaseRow[] {
  return LENGTHS.map((length) => {
    const ev = tripEv(length, [], mods);
    const hours = hoursOf(length);
    return { length, hours, total: ev.total, perHour: ev.total / hours, ev };
  });
}

export function singleRows(mods: TripMods): SingleRow[] {
  const rows: SingleRow[] = [];
  for (const length of LENGTHS) {
    for (const def of expeditionContent.supplies) {
      const cost = kitCost([def.id]);
      const gain = gainOf(length, [], def.id, mods);
      rows.push({
        length,
        id: def.id,
        kind: def.kind,
        tier: def.tier,
        cost,
        hours: kitHours([def.id]),
        gain,
        roi: gain / cost,
      });
    }
  }
  return rows;
}

export function pairRows(mods: TripMods): PairRow[] {
  const ids = supplyIds();
  const rows: PairRow[] = [];
  for (const length of LENGTHS) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i] as string;
        const b = ids[j] as string;
        if (kindOf(a) === kindOf(b)) continue;
        const both = gainOf(length, [], a, mods) + gainOf(length, [a], b, mods);
        rows.push({
          length,
          first: a,
          second: b,
          roi: both / kitCost([a, b]),
          roiSecond: gainOf(length, [a], b, mods) / kitCost([b]),
          roiFirst: gainOf(length, [b], a, mods) / kitCost([a]),
        });
      }
    }
  }
  return rows;
}

/** A row that breaks a target, in words. */
export interface Flag {
  length: ExpeditionLength;
  what: string;
  why: string;
}

/** Every flagged row: ROI out of the flag band, a tier that does not beat the tier below, a trip that pays less per hour than a shorter one. */
export function flags(mods: TripMods): Flag[] {
  const out: Flag[] = [];
  const { min, max } = ECONOMY_TARGETS.flagRoi;
  const singles = singleRows(mods);
  for (const r of singles) {
    if (r.roi < min)
      out.push({ length: r.length, what: r.id, why: `ROI ${r.roi.toFixed(2)} < ${min}` });
    if (r.roi > max)
      out.push({ length: r.length, what: r.id, why: `ROI ${r.roi.toFixed(2)} > ${max}` });
  }
  for (const length of LENGTHS) {
    for (const [lower, upper] of tierSteps()) {
      const a = singles.find((r) => r.length === length && r.id === lower);
      const b = singles.find((r) => r.length === length && r.id === upper);
      if (a !== undefined && b !== undefined && b.gain <= a.gain) {
        out.push({
          length,
          what: upper,
          why: `gain ${b.gain.toFixed(1)} does not beat ${lower} (${a.gain.toFixed(1)})`,
        });
      }
    }
  }
  const base = baseRows(mods);
  for (let i = 1; i < base.length; i++) {
    const row = base[i] as BaseRow;
    for (let j = 0; j < i; j++) {
      const shorter = base[j] as BaseRow;
      if (row.perHour < shorter.perHour) {
        out.push({
          length: row.length,
          what: 'unsupplied trip',
          why: `${row.perHour.toFixed(2)}/h < ${shorter.length} ${shorter.perHour.toFixed(2)}/h`,
        });
      }
    }
  }
  for (const r of pairRows(mods)) {
    for (const [added, given, roi] of [
      [r.second, r.first, r.roiSecond],
      [r.first, r.second, r.roiFirst],
    ] as const) {
      if (roi < min || roi > max) {
        out.push({
          length: r.length,
          what: `${given} + ${added}`,
          why: `ROI of ${added} given ${given} is ${roi.toFixed(2)}`,
        });
      }
    }
  }
  return out;
}

/** Each pair of neighbouring tiers of a kind: [lower id, upper id]. */
export function tierSteps(): [string, string][] {
  const out: [string, string][] = [];
  const defs = expeditionContent.supplies;
  for (const d of defs) {
    const up = defs.find((u) => u.kind === d.kind && tierIndex(u.tier) === tierIndex(d.tier) + 1);
    if (up !== undefined) out.push([d.id, up.id]);
  }
  return out;
}

function tierIndex(tier: string): number {
  return ['basic', 'good', 'great'].indexOf(tier);
}

const f1 = (x: number): string => x.toFixed(1);
const f2 = (x: number): string => x.toFixed(2);

/** The whole study as markdown. */
export function economyMarkdown(): string {
  const out: string[] = [];
  out.push('# Expedition economy study (exact expected values)');
  out.push('');
  out.push(
    'Reference trip: rank 3 explorer, no stars, default rarity odds, the Ember Caves deeper area, a player who owns half of what a roll can bring. Worth in Bait (`RULES.expeditions.worth`; a new species 40). A supply costs its blueprint (scrap 2, shard 6, glimmer 25, Bait 1:1); Workshop hours are reported, not priced.',
  );
  for (const s of SCENARIOS) {
    out.push('');
    out.push(`## ${s.label}`);
    out.push('');
    out.push('### Unsupplied trips');
    out.push('');
    out.push(
      '| Length | Ticks | Creatures | New | Scrap | Shards | Glimmer | Gear | P(gear) | Blueprints | Found | XP | Worth | Worth/h |',
    );
    out.push('|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|');
    for (const r of baseRows(s.mods)) {
      const e = r.ev;
      out.push(
        `| ${r.length} (${String(r.hours)} h) | ${f1(e.ticks)} | ${f2(e.creatures)} | ${f2(e.newSpecies)} | ${f2(e.scrap)} | ${f2(e.shards)} | ${f2(e.glimmer)} | ${f2(e.gearTotal)} | ${f2(e.gearAtLeastOne)} | ${f2(e.blueprints)} | ${f2(e.supplies)} | ${f1(e.xp)} | ${f1(r.total)} | ${f2(r.perHour)} |`,
      );
    }
    out.push('');
    out.push('### Supply ROI (gain over crafting cost)');
    out.push('');
    const singles = singleRows(s.mods);
    out.push(
      '| Supply | Cost | Hours | ' + LENGTHS.map((l) => `${l} ROI (gain)`).join(' | ') + ' |',
    );
    out.push('|---|--:|--:|' + LENGTHS.map(() => '--:').join('|') + '|');
    for (const id of supplyIds()) {
      const rows = LENGTHS.map(
        (l) => singles.find((r) => r.length === l && r.id === id) as SingleRow,
      );
      const first = rows[0] as SingleRow;
      out.push(
        `| ${id} | ${f1(first.cost)} | ${String(first.hours)} | ${rows.map((r) => `${f2(r.roi)} (${f1(r.gain)})`).join(' | ')} |`,
      );
    }
    out.push('');
    out.push(
      '### Pairs (ROI of the pair; of the second given the first; of the first given the second)',
    );
    out.push('');
    const pairs = pairRows(s.mods);
    out.push('| Pair | ' + LENGTHS.join(' | ') + ' |');
    out.push('|---|' + LENGTHS.map(() => '--:').join('|') + '|');
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = `${p.first}+${p.second}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cells = LENGTHS.map((l) => {
        const r = pairs.find(
          (x) => x.length === l && x.first === p.first && x.second === p.second,
        ) as PairRow;
        return `${f2(r.roi)} / ${f2(r.roiSecond)} / ${f2(r.roiFirst)}`;
      });
      out.push(`| ${key} | ${cells.join(' | ')} |`);
    }
    out.push('');
    out.push('### Refining (three of a tier against one of the next tier, absolute gain in Bait)');
    out.push('');
    out.push('| Refine | ' + LENGTHS.join(' | ') + ' |');
    out.push('|---|' + LENGTHS.map(() => '--:').join('|') + '|');
    for (const [lower, upper] of tierSteps()) {
      const cells = LENGTHS.map((l) => {
        const a = singles.find((r) => r.length === l && r.id === lower) as SingleRow;
        const b = singles.find((r) => r.length === l && r.id === upper) as SingleRow;
        return `${f1(3 * a.gain)} vs ${f1(b.gain)}`;
      });
      out.push(`| 3 x ${lower} to ${upper} | ${cells.join(' | ')} |`);
    }
    out.push('');
    out.push('### Flagged rows');
    out.push('');
    const flagged = flags(s.mods);
    if (flagged.length === 0) out.push('None.');
    else {
      out.push('| Length | Row | Why |');
      out.push('|---|---|---|');
      for (const fl of flagged) out.push(`| ${fl.length} | ${fl.what} | ${fl.why} |`);
    }
  }
  out.push('');
  return out.join('\n');
}
