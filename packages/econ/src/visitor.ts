import { rollLines, topCount, wornPieces, type Worn } from './lines';
import type { Rules } from './rules';
import type { Player, Server } from './types';
import { HOURS_PER_WEEK, R } from './types';
import { debit } from './world';

/**
 * The weekly visitor (docs/design/valley/systems/visitor.md, V-VIS-1..5). He is here from Thursday 00:00 until the raid's finale on
 * Sunday evening; a player meets him only on a visit that falls in that window. His service rerolls every modifier line of a worn
 * piece, for Acorns and scrap that scale with the piece's item level and rise with each reroll that week (reset weekly). His stock
 * also holds one rotating rare blueprint. Stock is the same for everyone, so nothing here depends on other players.
 */

/** Whether he is in the valley at this hour (V-VIS-1). */
export function visitorHere(rules: Rules, hour: number): boolean {
  const inWeek = hour % HOURS_PER_WEEK;
  return inWeek >= rules.visitor.arriveDay * 24 && inWeek < rules.visitor.leaveHour;
}

/** The price of the player's next reroll of a piece of this item level: [Acorns, scrap]. */
export function rerollPrice(rules: Rules, ilvl: number, rerollsSoFar: number): [number, number] {
  const v = rules.visitor;
  const factor = (Math.max(1, ilvl) / v.baseLevel) * v.growth ** rerollsSoFar;
  return [Math.round(v.acorns * factor), Math.round(v.scrap * factor)];
}

const affordable = (p: Player, acorns: number, scrap: number): boolean =>
  (p.stock[R.acorns] ?? 0) - acorns >= p.rules.visitor.reserveAcorns &&
  (p.stock[R.scrap] ?? 0) - scrap >= p.rules.visitor.reserveScrap;

/** Rerolls one worn piece: pays, then draws its lines again (never keeping the old ones: the gamble is the point, V-VIS-2). */
function reroll(p: Player, w: Worn): void {
  const [acorns, scrap] = rerollPrice(p.rules, w.ilvl, p.rerollsThisWeek);
  debit(p, R.acorns, acorns, 'visitor');
  debit(p, R.scrap, scrap, 'visitor');
  const c = p.creatures[w.creature]!;
  c.gearLines[w.slot] = rollLines(p.lineRng, p.rules, w.rarity, w.ilvl);
  p.rerollsThisWeek += 1;
  p.wk.rerolls += 1;
  p.wk.visitorAcorns += acorns;
  p.wk.visitorScrap += scrap;
}

/**
 * The pieces a player would reroll, best first: epics before rares, then the higher item level, skipping the ones whose lines are
 * already good (`goodTop`); commons are never worth his price.
 */
function wanted(p: Player): Worn[] {
  const rules = p.rules;
  return wornPieces(p)
    .filter(
      (w) =>
        w.rarity >= 1 && topCount(rules, w.ilvl, w.lines) < (rules.visitor.goodTop[w.rarity] ?? 1),
    )
    .sort((a, b) => b.rarity - a.rarity || b.ilvl - a.ilvl);
}

/**
 * A visit that meets the visitor. A set-and-forget player rerolls once a week, on the best epic it wears, when it can afford the price
 * above its reserves. An optimiser rerolls (epics first, then rares) for as long as it can afford the next one above the reserves.
 * Either buys the week's rare blueprint first when it can.
 */
export function visitVisitor(p: Player, server: Server, hour: number): void {
  const rules = p.rules;
  if (server.config.visitor === false || !visitorHere(rules, hour)) return;
  const week = Math.floor(hour / HOURS_PER_WEEK);
  if (p.visitorWeek !== week) {
    p.visitorWeek = week;
    p.rerollsThisWeek = 0;
    p.blueprintBought = false;
    p.wk.visitorMet += 1;
  }
  const v = rules.visitor;
  if (
    !p.blueprintBought &&
    p.blueprints < rules.scouts.blueprintPool &&
    affordable(p, v.blueprintAcorns, v.blueprintScrap)
  ) {
    debit(p, R.acorns, v.blueprintAcorns, 'visitor');
    debit(p, R.scrap, v.blueprintScrap, 'visitor');
    p.blueprints += 1;
    p.wk.blueprints += 1;
    p.wk.visitorBlueprints += 1;
    p.blueprintBought = true;
    p.wk.visitorAcorns += v.blueprintAcorns;
    p.wk.visitorScrap += v.blueprintScrap;
  }
  if (p.policy === 'setAndForget') {
    if (p.rerollsThisWeek >= 1) return;
    const best = wanted(p).find((w) => w.rarity === 2);
    if (!best) return;
    const [acorns, scrap] = rerollPrice(rules, best.ilvl, p.rerollsThisWeek);
    if (affordable(p, acorns, scrap)) reroll(p, best);
    return;
  }
  while (p.rerollsThisWeek < v.maxRerolls) {
    const next = wanted(p)[0];
    if (!next) return;
    const [acorns, scrap] = rerollPrice(rules, next.ilvl, p.rerollsThisWeek);
    if (!affordable(p, acorns, scrap)) return;
    reroll(p, next);
  }
}
