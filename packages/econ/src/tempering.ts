import { topCount, type Worn } from './lines';
import { note } from './journey';
import type { Rules } from './rules';
import type { Player, Server } from './types';
import { HOURS_PER_WEEK, R } from './types';
import { rerollPrice, wanted } from './visitor';
import { debit } from './world';

/**
 * Tempering at the Forge (`rules.tempering`): a worn piece whose item level has fallen behind the fire is raised to the fire, its rolled
 * lines (and the visitor's rerolls) kept, for scrap and a few Acorns. The price grows with the gap and with the level the piece rises to.
 * It is a candidate scrap sink for the late season, when a daily player's scouts bring more scrap than pieces, gifts and the visitor take.
 */

/** The price of raising a piece of this rarity from item level `from` to `to`: [Acorns, scrap], or null when this rarity is never tempered. */
export function temperPrice(
  rules: Rules,
  rarity: number,
  from: number,
  to: number,
): [number, number] | null {
  const t = rules.tempering;
  const factor = t.rarityFactor[rarity] ?? 0;
  if (factor <= 0 || to <= from) return null;
  const scrap = Math.round(t.scrapPerLevel * factor * (to - from) * (to / t.baseLevel));
  return [Math.round(scrap * t.acornShare), scrap];
}

/**
 * The scrap a player keeps back from tempering: a base, plus `reserveForgeWeeks` weeks of the anvils' own use (an anvil makes a piece
 * every `pieceHours`), plus one reroll of the best piece the visitor would reroll (the visitor is the older sink and comes first; the
 * gifts to projects, made later in the same visit, take what is above their own small reserve, so a lean pile can still lose to them).
 */
export const scrapReserve = (p: Player, server: Server): number => {
  const rules = p.rules;
  const t = rules.tempering;
  const week = (HOURS_PER_WEEK / rules.forge.pieceHours) * rules.forge.scrap * p.anvils.length;
  let reroll = 0;
  if (server.config.visitor !== false) {
    // The piece he would reroll next (a set-and-forget player: the best epic that is not good yet), if there is one.
    const next = p.policy === 'optimiser' ? wanted(p)[0] : wanted(p).find((w) => w.rarity === 2);
    if (next) reroll = rerollPrice(rules, next.ilvl, 0)[1];
  }
  return t.reserveScrap + t.reserveForgeWeeks * week + reroll;
};

/** Whether tempering exists on this server (the server's switch, else the rules' default). */
export const temperingOn = (server: Server, rules: Rules): boolean =>
  server.config.tempering ?? rules.tempering.on;

/**
 * The pieces a player would temper, best first: epics before rares, a piece the visitor rerolled before one not rerolled (it
 * protects the Acorns and scrap already paid), then the better lines, then the bigger gap. Only pieces `minGap` behind the fire. (A plain
 * loop over the slots: this runs at every visit of every player, and almost always finds nothing.)
 */
function candidates(p: Player, fire: number): Worn[] {
  const rules = p.rules;
  const t = rules.tempering;
  const minGap = p.policy === 'optimiser' ? t.minGap.optimiser : t.minGap.setAndForget;
  const found: (Worn & { rerolled: number })[] = [];
  p.creatures.forEach((c, creature) => {
    for (let slot = 0; slot < c.gear.length; slot++) {
      const ilvl = c.gear[slot] ?? 0;
      const rarity = c.gearRarity[slot] ?? 0;
      if (ilvl <= 0 || fire - ilvl < minGap || (t.rarityFactor[rarity] ?? 0) <= 0) continue;
      found.push({
        creature,
        slot,
        ilvl,
        rarity,
        lines: c.gearLines[slot] ?? [],
        rerolled: Math.min(1, c.gearRerolls[slot] ?? 0),
      });
    }
  });
  return found.sort(
    (a, b) =>
      b.rarity - a.rarity ||
      b.rerolled - a.rerolled ||
      topCount(rules, b.ilvl, b.lines) - topCount(rules, a.ilvl, a.lines) ||
      fire - b.ilvl - (fire - a.ilvl),
  );
}

/**
 * A visit's tempering, done before the Forge floor comes home (so a piece worth keeping is raised before a crafted replacement can take
 * its slot). A set-and-forget player tempers up to `perVisit` of its best pieces that are `minGap` behind the fire, an optimiser more and
 * sooner; both keep a scrap and Acorn reserve and skip a piece whose price is over what a replacement with those lines is worth.
 * Returns how many pieces were tempered.
 */
export function temperAtVisit(p: Player, server: Server): number {
  const rules = p.rules;
  if (!temperingOn(server, rules)) return 0;
  const t = rules.tempering;
  let left = p.policy === 'optimiser' ? t.perVisit.optimiser : t.perVisit.setAndForget;
  let done = 0;
  const found = candidates(p, server.fire);
  // The reserve is worked out once something is worth tempering, and again after an epic was (it may have been the reroll's piece).
  let reserve: number | null = null;
  for (const w of found) {
    if (left <= 0) break;
    const price = temperPrice(rules, w.rarity, w.ilvl, server.fire);
    if (!price) continue;
    const [acorns, scrap] = price;
    if (scrap > (t.worthInCrafts[w.rarity] ?? 0) * rules.forge.scrap) continue;
    reserve ??= scrapReserve(p, server);
    if ((p.stock[R.scrap] ?? 0) - scrap < reserve) continue;
    if ((p.stock[R.acorns] ?? 0) - acorns < t.reserveAcorns) continue;
    const c = p.creatures[w.creature]!;
    const rerolled = (c.gearRerolls[w.slot] ?? 0) > 0;
    debit(p, R.scrap, scrap, 'tempering');
    debit(p, R.acorns, acorns, 'tempering');
    c.gear[w.slot] = server.fire;
    p.wk.tempered += 1;
    if (rerolled) p.wk.temperedRerolled += 1;
    p.wk.temperScrap += scrap;
    p.wk.temperAcorns += acorns;
    p.wk.temperLevels += server.fire - w.ilvl;
    note(
      p,
      `forge: tempered a ${['common', 'rare', 'epic'][w.rarity]} piece from item level ${w.ilvl} to ${server.fire} for ${acorns} Acorns and ${scrap} scrap${rerolled ? ' (its lines were rerolled at the visitor: kept)' : ' (its lines kept)'}`,
    );
    if (w.rarity === 2) reserve = null;
    left -= 1;
    done += 1;
  }
  return done;
}
