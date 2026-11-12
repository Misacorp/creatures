/**
 * Prices and payments (`docs/design/housing.md` 2.2). A part is paid into in pieces; `applyPayment` is the one place that
 * decides how much of an offer is taken, and never takes more than is owed or held.
 */
import type { Element } from '../content/schema';
import { HOUSING_RULES } from './rules';
import type {
  HousingContent,
  MaterialDef,
  MaterialFamily,
  PartDef,
  PriceLine,
  SetDef,
  SetMaterial,
} from './schema';
import type { HousePay } from './view';

/** What was paid into a part so far, keyed by `lineKey`; a family line holds the materials it took: `{ "family:wood": { heartbark: 2 } }`. */
export type PaidLines = Record<string, number | Record<string, number>>;

/** What a player holds that a part can take. */
export interface Holdings {
  bait: number;
  scrap: number;
  shards: Partial<Record<Element, number>>;
  materials: Readonly<Record<string, number>>;
}

/** What a payment took: the same shape as an offer, with every field present. */
export interface Taken {
  bait: number;
  scrap: number;
  shards: Partial<Record<Element, number>>;
  materials: Record<string, number>;
}

/** The key a price line has in `PaidLines`. */
export function lineKey(line: PriceLine): string {
  switch (line.kind) {
    case 'bait':
    case 'scrap':
      return line.kind;
    case 'shard':
      return `shard:${line.element}`;
    case 'material':
      return `material:${line.id}`;
    case 'family':
      return `family:${line.family}`;
  }
}

function sum(values: Record<string, number>): number {
  return Object.values(values).reduce((a, b) => a + b, 0);
}

function paidNumber(paid: PaidLines, line: PriceLine): number {
  const value = paid[lineKey(line)];
  if (value === undefined) return 0;
  return typeof value === 'number' ? value : sum(value);
}

/** What is still owed on each line (lines that are fully paid drop out). */
export function partRemaining(part: Pick<PartDef, 'price'>, paid: PaidLines): PriceLine[] {
  const out: PriceLine[] = [];
  for (const line of part.price) {
    const left = line.amount - paidNumber(paid, line);
    if (left > 0) out.push({ ...line, amount: left });
  }
  return out;
}

/** What has been paid on each line (lines with nothing paid drop out), as price lines for the views. */
export function partPaidLines(part: Pick<PartDef, 'price'>, paid: PaidLines): PriceLine[] {
  const out: PriceLine[] = [];
  for (const line of part.price) {
    const done = Math.min(line.amount, paidNumber(paid, line));
    if (done > 0) out.push({ ...line, amount: done });
  }
  return out;
}

function whole(n: number | undefined): number {
  return n !== undefined && Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Takes the smaller of what was offered, what is held and what is still owed, line by line. A `family` line is paid with
 * materials of that family, the offer naming which ones (`offer.materials`); a specific `material` line takes its own
 * material first. `content` supplies each material's family. Returns what to take, the new paid record and whether
 * nothing remains. Pure: it never mutates its inputs.
 */
export function applyPayment(
  part: Pick<PartDef, 'price'>,
  paid: PaidLines,
  offer: HousePay,
  held: Holdings,
  content: Pick<HousingContent, 'materials'>,
): { take: Taken; paid: PaidLines; complete: boolean } {
  const take: Taken = { bait: 0, scrap: 0, shards: {}, materials: {} };
  const next: PaidLines = {};
  for (const [k, value] of Object.entries(paid)) {
    next[k] = typeof value === 'number' ? value : { ...value };
  }
  const familyOf = new Map<string, MaterialFamily>(
    content.materials.map((m: Pick<MaterialDef, 'id' | 'family'>) => [m.id, m.family]),
  );
  // What may still be taken per material id: the smaller of offered and held, less what earlier lines used.
  const available = new Map<string, number>();
  for (const [id, amount] of Object.entries(offer.materials ?? {})) {
    available.set(id, Math.min(whole(amount), whole(held.materials[id])));
  }
  const addPaid = (key: string, amount: number): void => {
    const prev = next[key];
    next[key] = (typeof prev === 'number' ? prev : 0) + amount;
  };
  for (const line of part.price) {
    const owed = line.amount - paidNumber(next, line);
    if (owed <= 0) continue;
    if (line.kind === 'bait' || line.kind === 'scrap') {
      const n = Math.min(owed, whole(offer[line.kind]), whole(held[line.kind]));
      if (n > 0) {
        take[line.kind] += n;
        addPaid(lineKey(line), n);
      }
    } else if (line.kind === 'shard') {
      const n = Math.min(
        owed,
        whole(offer.shards?.[line.element]),
        whole(held.shards[line.element]),
      );
      if (n > 0) {
        take.shards[line.element] = (take.shards[line.element] ?? 0) + n;
        addPaid(lineKey(line), n);
      }
    }
  }
  for (const line of part.price) {
    if (line.kind !== 'material') continue;
    const owed = line.amount - paidNumber(next, line);
    const n = Math.min(owed, available.get(line.id) ?? 0);
    if (n > 0) {
      available.set(line.id, (available.get(line.id) ?? 0) - n);
      take.materials[line.id] = (take.materials[line.id] ?? 0) + n;
      addPaid(lineKey(line), n);
    }
  }
  for (const line of part.price) {
    if (line.kind !== 'family') continue;
    let owed = line.amount - paidNumber(next, line);
    const key = lineKey(line);
    for (const id of [...available.keys()].sort()) {
      if (owed <= 0) break;
      if (familyOf.get(id) !== line.family) continue;
      const n = Math.min(owed, available.get(id) ?? 0);
      if (n <= 0) continue;
      available.set(id, (available.get(id) ?? 0) - n);
      take.materials[id] = (take.materials[id] ?? 0) + n;
      const prev = next[key];
      const by: Record<string, number> = typeof prev === 'object' ? prev : {};
      by[id] = (by[id] ?? 0) + n;
      next[key] = by;
      owed -= n;
    }
  }
  return { take, paid: next, complete: partRemaining(part, next).length === 0 };
}

/** Folds equal lines into one, keeping first-seen order. */
function merge(lines: PriceLine[]): PriceLine[] {
  const out: PriceLine[] = [];
  for (const line of lines) {
    const i = out.findIndex((o) => lineKey(o) === lineKey(line));
    const found = out[i];
    if (found === undefined) out.push({ ...line });
    else found.amount += line.amount;
  }
  return out;
}

function materialLine(m: SetMaterial, amount: number): PriceLine {
  return 'material' in m
    ? { kind: 'material', id: m.material, amount }
    : { kind: 'family', family: m.family, amount };
}

function scaled(set: SetDef | undefined, amount: number): number {
  const bp = HOUSING_RULES.price.tierBp[set?.tier ?? 0];
  return Math.floor((amount * bp) / 10_000);
}

/**
 * A piece's price: its own override, else its form's size price (Acorns, scrap, the set's primary and accent material),
 * with Acorns and scrap scaled by the set's tier and a tier 2 set taking one more accent. A wild piece or a tier 0 piece
 * takes Acorns and scrap only. Throws on an unknown piece.
 */
export function piecePrice(content: HousingContent, pieceId: string): PriceLine[] {
  const piece = content.pieces.find((p) => p.id === pieceId);
  if (piece === undefined) throw new Error(`piecePrice: unknown piece "${pieceId}"`);
  if (piece.price !== undefined) return piece.price.map((l) => ({ ...l }));
  const form = content.forms.find((f) => f.id === piece.form);
  if (form === undefined) throw new Error(`piecePrice: unknown form "${piece.form}"`);
  const set = piece.set === null ? undefined : content.sets.find((s) => s.id === piece.set);
  const base = HOUSING_RULES.price[form.size];
  const lines: PriceLine[] = [
    { kind: 'bait', amount: scaled(set, base.bait) },
    { kind: 'scrap', amount: scaled(set, base.scrap) },
  ];
  if (set?.primary) lines.push(materialLine(set.primary, base.primary));
  if (set?.accent) {
    const extra = set.tier === 2 ? HOUSING_RULES.price.tier2AccentExtra : 0;
    lines.push(materialLine(set.accent, base.accent + extra));
  }
  return merge(lines);
}

/**
 * A skin's price: its own override, else by kind. A generated pattern takes its tier's price (`price.pattern`; a starter is free). Wallpapers and floors take Acorns, scrap and the set's primary material;
 * roofs and wall skins take more and `skinExterior.first` of the first material of the part that teaches them. Ground
 * skins are never made (no price). Tier 2 sets scale Acorns and scrap like their pieces. Throws on an unknown skin.
 */
export function skinPrice(content: HousingContent, skinId: string): PriceLine[] {
  const skin = content.skins.find((s) => s.id === skinId);
  if (skin === undefined) throw new Error(`skinPrice: unknown skin "${skinId}"`);
  if (skin.price !== undefined) return skin.price.map((l) => ({ ...l }));
  if (skin.kind === 'ground') return [];
  if (skin.gen !== undefined) {
    if (skin.unlock.kind === 'starter') return [];
    const p = HOUSING_RULES.price.pattern[skin.gen.tier];
    const lines: PriceLine[] = [
      { kind: 'bait', amount: p.bait },
      { kind: 'scrap', amount: p.scrap },
    ];
    if (p.family > 0 && skin.gen.family !== undefined) {
      lines.push({ kind: 'family', family: skin.gen.family, amount: p.family });
    }
    return lines;
  }
  const set = skin.set === null ? undefined : content.sets.find((s) => s.id === skin.set);
  if (skin.kind === 'wall' || skin.kind === 'floor') {
    const p = HOUSING_RULES.price.skinSurface;
    const lines: PriceLine[] = [
      { kind: 'bait', amount: scaled(set, p.bait) },
      { kind: 'scrap', amount: scaled(set, p.scrap) },
    ];
    if (set?.primary) lines.push(materialLine(set.primary, p.primary));
    return lines;
  }
  const p = HOUSING_RULES.price.skinExterior;
  const lines: PriceLine[] = [
    { kind: 'bait', amount: p.bait },
    { kind: 'scrap', amount: p.scrap },
  ];
  const teacher = content.parts.find((part) => part.unlocks.includes(skinId));
  const first = teacher?.price.find((l) => l.kind === 'material' || l.kind === 'family');
  if (first?.kind === 'material') lines.push({ kind: 'material', id: first.id, amount: p.first });
  if (first?.kind === 'family')
    lines.push({ kind: 'family', family: first.family, amount: p.first });
  return lines;
}
